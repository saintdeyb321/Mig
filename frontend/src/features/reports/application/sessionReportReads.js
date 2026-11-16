import { reportTTL } from './reportResource.js';

export function createSessionReportReads({ getSalesInPeriod, getContractsInPeriod, getPaymentsInPeriod, getContractAuditDocuments, readVoidsInPeriod, getSessionsInPeriod }) {
  return function sessionReportReads(resources, businessId, branchId, period, { identityKey, revision } = {}) {
    const key = JSON.stringify([businessId, branchId, period.start, period.end]);
    const exportKey = JSON.stringify([key, period.key, identityKey, revision]);
    const pendingExports = () => resources.value('report:pending-exports', () => new Map());
    const ttl = reportTTL(period), signal = resources.signal;
    const readFinancial = (kind, load) => resources.read(`report:${kind}:${key}`, async () => {
      const startedAt = Date.now();
      return { startedAt, rows: await load() };
    }, ttl);
    const sales = async () => {
      const result = await resources.read(`report:sales:${key}`, async () => {
        try { const startedAt = Date.now(); return { startedAt, rows: await getSalesInPeriod(businessId, period.startDate, period.endDate, { branchId, maxRows: 10000, signal }) }; }
        catch (error) {
          if (error.code !== 'report-limit') throw error;
          // Repeating a known oversized scan in another format cannot produce a complete report.
          return { error };
        }
      }, ttl);
      if (result.error) throw result.error;
      return result;
    };
    const contracts = () => resources.read(`report:contracts:${key}`, () => getContractsInPeriod(businessId, period.startDate, period.endDate, branchId, 10000, { signal }), ttl);
    const payments = () => readFinancial('payments', () => getPaymentsInPeriod(businessId, period.startDate, period.endDate, branchId, { requireMigrated: true, maxRows: 10000, signal }));
    const voids = () => readFinancial('voids', () => readVoidsInPeriod(businessId, period.startDate, period.endDate, branchId, { signal }));
    const sessions = () => resources.read(`report:cash:${key}`, () => getSessionsInPeriod(businessId, period.startDate, period.endDate, branchId, { signal }), ttl);
    const loadSnapshot = async assertAuthorized => {
      const supplementary = () => [payments(), contracts(), voids(), sessions()];
      const parallel = ['hoy', 'semana'].includes(period.filter);
      const results = parallel ? await Promise.all([sales(), ...supplementary()]) : [await sales()];
      assertAuthorized();
      // Reject an oversized month or year before querying the other collections.
      if (!parallel) results.push(...await Promise.all(supplementary()));
      assertAuthorized();
      const [{ rows: tickets, startedAt: salesStart }, { rows: ledger, startedAt: paymentsStart }, orders,
        { rows: adjustments, startedAt: voidsStart }, cash] = results;
      if (tickets.length + ledger.length + adjustments.length > 10000) {
        throw new Error('Demasiados movimientos para exportar. Selecciona un período menor.');
      }
      const loadedAt = Math.min(Date.now(), ...['sales', 'payments', 'contracts', 'voids', 'cash']
        .map(kind => resources.readLoadedAt(`report:${kind}:${key}`) ?? 0));
      return { sales: tickets, payments: ledger, contracts: orders, voids: adjustments, sessions: cash, loadedAt, cashReferenceAsOf: Math.min(salesStart, paymentsStart, voidsStart) };
    };
    const withContractAudit = async ({ payments: rows, contracts: created, loadedAt }, isCurrent = () => true) => {
      signal.throwIfAborted();
      const known = new Set(created.map(row => row.id));
      const missing = [...new Set(rows.map(row => row.sourceId).filter(id => !known.has(id)))];
      if (!isCurrent()) throw new DOMException('El alcance del informe cambió.', 'AbortError');
      if (missing.length > 500) throw new Error('Demasiadas referencias históricas. Selecciona un período menor.');
      const auditKey = JSON.stringify([businessId, branchId, period.start, period.end, loadedAt ?? null]);
      const audit = missing.length ? await resources.read(`report:audit:${auditKey}`, () => getContractAuditDocuments(businessId, missing, { signal }), ttl) : [];
      return { payments: rows, contracts: [...audit, ...created] };
    };
    return { sales: async () => (await sales()).rows, contracts, payments: async () => (await payments()).rows,
      voids: async () => (await voids()).rows, sessions, withContractAudit,
      discardSnapshot() {
        if (!pendingExports().has(exportKey)) resources.invalidateWhere(candidate => candidate.startsWith('report:') && candidate.endsWith(key));
      },
      async exportContracts(isCurrent) {
        const [{ rows }, created] = await Promise.all([payments(), contracts()]);
        return withContractAudit({ payments: rows, contracts: created }, isCurrent);
      },
      async exportSnapshot(isAuthorized = () => true) {
        const assertAuthorized = check => {
          signal.throwIfAborted();
          if (!check()) throw new DOMException('El alcance del informe cambió.', 'AbortError');
        };
        assertAuthorized(isAuthorized);
        const pending = pendingExports();
        let entry = pending.get(exportKey);
        if (!entry) {
          const waiters = new Set();
          const snapshot = loadSnapshot(() => assertAuthorized(() => [...waiters].some(check => check())));
          entry = { waiters, snapshot: snapshot.finally(() => pending.delete(exportKey)) };
          pending.set(exportKey, entry);
        }
        entry.waiters.add(isAuthorized);
        try {
          const snapshot = await entry.snapshot;
          assertAuthorized(isAuthorized);
          return snapshot;
        } finally { entry.waiters.delete(isAuthorized); }
      },
    };
  };
}
