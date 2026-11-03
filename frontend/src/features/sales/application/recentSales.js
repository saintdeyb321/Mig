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

// Keep both bounded sources visible; local records never participate in financial totals.
export function salesHistoryPresentation(pending, remote) {
  const confirmedIds = new Set(remote.map(sale => sale.id ?? sale.localId));
  const local = mergeRecentSales(pending, []).filter(sale => !confirmedIds.has(sale.id ?? sale.localId));
  const rejected = local.filter(sale => sale.queueStatus === 'failed' || sale.financialState === 'rejected');
  const active = local.filter(sale => !rejected.includes(sale));
  return { rows: mergeRecentSales(active, remote, 100), rejected, localCount: active.length,
    rejectedCount: rejected.length, draftCount: active.filter(sale => sale.financialState === 'draft_offline').length,
    uncertainCount: active.filter(sale => sale.financialState !== 'draft_offline').length };
}
