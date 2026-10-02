import { liveQuery } from 'dexie';
import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import offlineDB from '../../../offlineDB';
import { decrypt } from '../../../crypto';
import { canonicalSale, sameSaleOperation } from '../domain/saleModel.js';
import { decodeQueuedSale, migrateSaleRecord, pendingStockDeltas } from '../domain/queueState.js';
import { selectUnappliedSales } from '../application/recentSales.js';

export async function readPendingSales(identity, branchId = 'global') {
  const records = await offlineDB.sales.where('status').anyOf('pending', 'syncing', 'failed').filter(record => {
    const status = migrateSaleRecord(record).status;
    return ['pending', 'syncing', 'failed'].includes(status)
      && (!record.businessId || record.businessId === identity.businessId)
      && (!record.userId || record.userId === identity.uid);
  }).toArray();
  const sales = await Promise.all(records.map(async record => {
    try {
      const sale = canonicalSale(await decodeQueuedSale(record, identity, decrypt));
      return { ...sale, id: record.localId, isOffline: true, queueStatus: migrateSaleRecord(record).status,
        lastError: record.lastError };
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

export const readUnappliedSales = sales => selectUnappliedSales(sales, async (id, sale) => {
  const reference = doc(db, 'sales', id);
  try {
    const cached = await getDocFromCache(reference);
    if (cached.exists() && sameSaleOperation(cached.data(), sale)) return true;
  } catch { /* A newly queued receipt may not be in the Firebase cache yet. */ }
  if (!navigator.onLine) return false;
  try {
    const receipt = await getDoc(reference);
    return receipt.exists() && sameSaleOperation(receipt.data(), sale);
  }
  catch { return false; }
});
