import { liveQuery } from 'dexie';
import offlineDB from '../../../offlineDB';
import { decrypt } from '../../../crypto';
import { canonicalSale } from '../domain/saleModel.js';
import { decodeQueuedSale, migrateSaleRecord, pendingStockDeltas } from '../domain/queueState.js';

export async function readPendingSales(identity, branchId = 'global', projection = false) {
  const source = projection ? offlineDB.sales.where('projectionState').equals('pending')
    : offlineDB.sales.where('status').anyOf('pending', 'syncing', 'failed');
  const records = await source.filter(record => {
    const status = migrateSaleRecord(record).status;
    return (projection || ['pending', 'syncing', 'failed'].includes(status))
      && (!record.businessId || record.businessId === identity.businessId)
      && (!record.userId || record.userId === identity.uid);
  }).toArray();
  const sales = await Promise.all(records.map(async record => {
    try {
      const sale = canonicalSale(await decodeQueuedSale(record, identity, decrypt));
      return { ...sale, id: record.localId, isOffline: true, queueStatus: migrateSaleRecord(record).status,
        lastError: record.lastError, attempted: record.attempted, projectionBase: record.projectionBase,
        financialAck: record.financialAck, stockVersions: record.stockVersions };
    } catch { return null; }
  }));
  return sales.filter(sale => sale && (branchId === 'global' || sale.branchId === branchId));
}

export async function getPendingStockDeltas(identity) {
  const sales = await readPendingSales(identity);
  return pendingStockDeltas(sales.filter(sale => sale.queueStatus !== 'failed'), identity.businessId);
}

export function subscribePendingSales(identity, branchId, onData, onError) {
  const subscription = liveQuery(() => readPendingSales(identity, branchId)).subscribe({ next: onData, error: onError });
  return () => subscription.unsubscribe();
}

export function subscribeStockQueue(identity, onData, onError) {
  const subscription = liveQuery(() => readPendingSales(identity, 'global', true)).subscribe({ next: onData, error: onError });
  return () => subscription.unsubscribe();
}

export const retireStockProjections = ids => offlineDB.sales.where('localId').anyOf(ids).modify({ projectionState: null });
