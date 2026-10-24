import { getSalesInPeriod } from '../../sales/infrastructure/salesRepository.js';
import { getContractsInPeriod } from '../../contracts/infrastructure/contractRepository.js';
import { getPaymentsInPeriod, getContractAuditDocuments } from '../../payments/infrastructure/paymentRepository.js';
import { salesToDailyStats } from '../domain/sparkReport.js';
import { reportTTL } from '../application/reportResource.js';

export function sessionReportReads(resources, businessId, branchId, period) {
  const key = JSON.stringify([businessId, branchId, period.start, period.end]);
  const ttl = reportTTL(period), signal = resources.signal;
  const sales = () => resources.read(`report:sales:${key}`, () => getSalesInPeriod(businessId, period.startDate, period.endDate, { branchId, maxRows: 10000, signal }), ttl);
  const contracts = () => resources.read(`report:contracts:${key}`, () => getContractsInPeriod(businessId, period.startDate, period.endDate, branchId, 10000, { signal }), ttl);
  const payments = () => resources.read(`report:payments:${key}`, () => getPaymentsInPeriod(businessId, period.startDate, period.endDate, branchId, { requireMigrated: true, maxRows: 10000, signal }), ttl);
  return { sales, contracts, payments, stats: async () => salesToDailyStats(await sales()),
    async exportContracts() {
      const rows = await payments(); signal.throwIfAborted();
      const [audit, created] = await Promise.all([rows.length ? resources.read(`report:audit:${key}`, () => getContractAuditDocuments(businessId, rows.map(row => row.sourceId), { signal }), ttl) : [], contracts()]);
      return { payments: rows, contracts: [...new Map([...audit, ...created].map(row => [row.id, row])).values()] };
    },
  };
}
