import { toMillisSafe } from '../../../core/dates/dateValues.js';

export function mergeRecentSales(pending, remote, limit = 50) {
  const byId = new Map();
  for (const sale of [...pending, ...remote]) byId.set(sale.id ?? sale.localId, sale);
  return [...byId.values()].sort((a, b) => toMillisSafe(b.createdAt || b.date) - toMillisSafe(a.createdAt || a.date)).slice(0, limit);
}
