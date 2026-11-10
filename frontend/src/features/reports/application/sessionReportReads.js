import { reportTTL } from './reportResource.js';

export function createSessionReportReads({ getSalesInPeriod, getContractsInPeriod, getPaymentsInPeriod, getContractAuditDocuments, readVoidsInPeriod, getSessionsInPeriod }) {
  return function sessionReportReads(resources, businessId, branchId, period) {
    const key = JSON.stringify([businessId, branchId, period.start, period.end]);
    const ttl = reportTTL(period), signal = resources.signal;
    const sales = async () => {
      const result = await resources.read(`report:sales:${key}`, async () => {
        try { return { rows: await getSalesInPeriod(businessId, period.startDate, period.endDate, { branchId, maxRows: 10000, signal }) }; }
        catch (error) {
          if (error.code !== 'report-limit') throw error;
          // Repeating a known oversized scan in another format cannot produce a complete report.
          return { error };
        }
      }, ttl);
      if (result.error) throw result.error;
      return result.rows;
    };
    const contracts = () => resources.read(`report:contracts:${key}`, () => getContractsInPeriod(businessId, period.startDate, period.endDate, branchId, 10000, { signal }), ttl);
    const payments = () => resources.read(`report:payments:${key}`, () => getPaymentsInPeriod(businessId, period.startDate, period.endDate, branchId, { requireMigrated: true, maxRows: 10000, signal }), ttl);
    const voids = () => resources.read(`report:voids:${key}`, () => readVoidsInPeriod(businessId, period.startDate, period.endDate, branchId, { signal }), ttl);
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
    return { sales, contracts, payments, voids, sessions, withContractAudit,
      discardSnapshot: () => resources.invalidateWhere(candidate => candidate.startsWith('report:') && candidate.endsWith(key)),
      async exportContracts(isCurrent) {
        const [rows, created] = await Promise.all([payments(), contracts()]);
        return withContractAudit({ payments: rows, contracts: created }, isCurrent);
      },
      async exportSnapshot(isCurrent = () => true) {
        const tickets = await sales(); // Refuse an oversized period before starting supplemental reads.
        if (!isCurrent()) throw new DOMException('El alcance del informe cambió.', 'AbortError');
        const [ledger, orders, adjustments, cash] = await Promise.all([payments(), contracts(), voids(), sessions()]);
        signal.throwIfAborted();
        if (tickets.length + ledger.length + adjustments.length > 10000) {
          throw new Error('Demasiados movimientos para exportar. Selecciona un período menor.');
        }
        const loadedAt = Math.min(Date.now(), ...['sales', 'payments', 'contracts', 'voids', 'cash']
          .map(kind => resources.readLoadedAt(`report:${kind}:${key}`) ?? 0));
        return { sales: tickets, payments: ledger, contracts: orders, voids: adjustments, sessions: cash, loadedAt };
      },
    };
  };
}
