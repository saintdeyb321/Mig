import { getSalesInPeriod } from '../../sales/infrastructure/salesRepository.js';
import { salesToDailyStats } from '../domain/sparkReport.js';
export async function getDailyStats(businessId, branchId, start, end) {
  return salesToDailyStats(await getSalesInPeriod(businessId,
    new Date(`${start}T00:00:00-05:00`), new Date(`${end}T23:59:59.999-05:00`), { branchId, maxRows: 10000 }));
}
