import { toMillisSafe } from '../../../core/dates/dateValues.js';

// Cached server receipts are read-only presentation; locally uncommitted writes never become tickets.
export function recentSaleRows(snapshot, field) {
  return snapshot.docs.filter(row => row.metadata?.hasPendingWrites === false).map(row => ({ ...row.data(), id: row.id, isOffline: false }))
    .filter(row => field === 'confirmedAt' ? row.status === 'confirmed' : row.confirmedAt == null);
}

export function mergeRecentSales(pending, remote, limit = 50) {
  const byId = new Map();
  for (const sale of [...pending, ...remote]) byId.set(sale.id ?? sale.localId, sale);
  return [...byId.values()].sort((a, b) => toMillisSafe(b.createdAt || b.date) - toMillisSafe(a.createdAt || a.date)).slice(0, limit);
}

// Local attempts have their own bounded view; they never displace confirmed receipts.
export function salesHistoryPresentation(pending, remote, pendingOnly = false) {
  const confirmedIds = new Set(remote.map(sale => sale.id ?? sale.localId));
  const local = mergeRecentSales(pending, []).filter(sale => !confirmedIds.has(sale.id ?? sale.localId));
  return { rows: pendingOnly ? local : mergeRecentSales([], remote), localCount: local.length,
    rejectedCount: local.filter(sale => sale.queueStatus === 'failed').length,
    uncertainCount: local.filter(sale => sale.queueStatus !== 'failed').length };
}
