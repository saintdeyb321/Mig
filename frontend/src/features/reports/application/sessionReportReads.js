import { reportTTL } from './reportResource.js';

export function createSessionReportReads({ getSalesInPeriod, getContractsInPeriod, getPaymentsInPeriod, getContractAuditDocuments, readVoidsInPeriod, getSessionsInPeriod }) {
  return function sessionReportReads(resources, businessId, branchId, period) {
    const key = JSON.stringify([businessId, branchId, period.start, period.end]);
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
      discardSnapshot: () => resources.invalidateWhere(candidate => candidate.startsWith('report:') && candidate.endsWith(key)),
      async exportContracts(isCurrent) {
        const [{ rows }, created] = await Promise.all([payments(), contracts()]);
        return withContractAudit({ payments: rows, contracts: created }, isCurrent);
      },
      async exportSnapshot(isCurrent = () => true) {
        const { rows: tickets, startedAt: salesStart } = await sales(); // Refuse an oversized period before starting supplemental reads.
        if (!isCurrent()) throw new DOMException('El alcance del informe cambió.', 'AbortError');
        const [{ rows: ledger, startedAt: paymentsStart }, orders, { rows: adjustments, startedAt: voidsStart }, cash] = await Promise.all([payments(), contracts(), voids(), sessions()]);
        signal.throwIfAborted();
        if (tickets.length + ledger.length + adjustments.length > 10000) {
          throw new Error('Demasiados movimientos para exportar. Selecciona un período menor.');
        }
        const loadedAt = Math.min(Date.now(), ...['sales', 'payments', 'contracts', 'voids', 'cash']
          .map(kind => resources.readLoadedAt(`report:${kind}:${key}`) ?? 0));
        return { sales: tickets, payments: ledger, contracts: orders, voids: adjustments, sessions: cash, loadedAt, cashReferenceAsOf: Math.min(salesStart, paymentsStart, voidsStart) };
      },
    };
  };
}
