import { reportTTL } from './reportResource.js';

export function createSessionReportReads({ getSalesInPeriod, getContractsInPeriod, getPaymentsInPeriod, getContractAuditDocuments, readVoidsInPeriod }) {
  return function sessionReportReads(resources, businessId, branchId, period) {
    const key = JSON.stringify([businessId, branchId, period.start, period.end]);
    const ttl = reportTTL(period), signal = resources.signal;
    const sales = () => resources.read(`report:sales:${key}`, () => getSalesInPeriod(businessId, period.startDate, period.endDate, { branchId, maxRows: 10000, signal }), ttl);
    const contracts = () => resources.read(`report:contracts:${key}`, () => getContractsInPeriod(businessId, period.startDate, period.endDate, branchId, 10000, { signal }), ttl);
    const payments = () => resources.read(`report:payments:${key}`, () => getPaymentsInPeriod(businessId, period.startDate, period.endDate, branchId, { requireMigrated: true, maxRows: 10000, signal }), ttl);
    const voids = () => resources.read(`report:voids:${key}`, () => readVoidsInPeriod(businessId, period.startDate, period.endDate, branchId, { signal }), ttl);
    return { sales, contracts, payments, voids,
      async exportContracts() {
        const rows = await payments(); signal.throwIfAborted();
        const [audit, created] = await Promise.all([rows.length ? resources.read(`report:audit:${key}`, () => getContractAuditDocuments(businessId, rows.map(row => row.sourceId), { signal }), ttl) : [], contracts()]);
        return { payments: rows, contracts: [...new Map([...audit, ...created].map(row => [row.id, row])).values()] };
      },
    };
  };
}
