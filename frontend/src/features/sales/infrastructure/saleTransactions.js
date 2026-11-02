import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { db, auth } from '../../../core/firebase/client';
import { createSparkSalesRepository } from './sparkSalesRepository.js';
import { createPosVoidRepository } from './posVoidRepository.js';
import { requireCapability } from '../../../config/runtimeCapabilities.js';
const sparkSales = createSparkSalesRepository(db, { currentUser: () => auth.currentUser });
const sparkVoids = createPosVoidRepository(db, { currentUser: () => auth.currentUser });
import { syncLocalSession, reconcilePendingSessions } from '../../cash-register/infrastructure/cashRegisterRepository.js';
import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';
import { SaleError } from '../domain/saleModel.js';
import { createSaleQueue } from '../application/saleQueue.js';
import { dexieSaleStore, createQueueLock } from './saleQueueStore.js';
import { liveQuery } from 'dexie';
import { createVoidRecovery } from '../application/voidRecovery.js';

async function syncCashSessions(identity) {
  const pending = await offlineDB.cash_sessions.filter(record => record.sync === false).toArray();
  const blockedSessions = new Map();
  for (const record of pending) {
    if (auth.currentUser?.uid !== identity.uid) break;
    let session;
    try { session = JSON.parse(await decrypt(record.data, identity.uid)); }
    catch { continue; }
    if (session.userId !== identity.uid || session.businessId !== identity.businessId) continue;
    if (record.requiresFinancialReview) {
      blockedSessions.set(record.localId, new SaleError('tenant-restricted', record.lastError || 'Caja pendiente de revisión administrativa.'));
      continue;
    }
    try {
      await syncLocalSession(record.localId, session, record.data);
    } catch (error) {
      blockedSessions.set(record.localId, error);
      await offlineDB.cash_sessions.update(record.localId, { lastError: error.message,
        requiresFinancialReview: error.code === 'tenant-restricted' });
      console.warn('Caja pendiente de sincronización o revisión administrativa.');
    }
  }
  return blockedSessions;
}
export const saleQueue = createSaleQueue({
  store: dexieSaleStore(offlineDB), encrypt, decrypt, withLock: createQueueLock(offlineDB),
  online: () => navigator.onLine, syncSessions: syncCashSessions,
  afterFlush: reconcilePendingSessions,
  currentIdentity: identity => auth.currentUser?.uid === identity.uid,
  verifyReceipt: (sale, identity) => {
    if (auth.currentUser?.uid !== identity.uid) throw new SaleError('session-changed', 'La sesión cambió.');
    return sparkSales.verify(sale);
  },
  captureProjection: async sale => Object.fromEntries((await offlineDB.products.bulkGet(sale.items.map(item => item.id)))
    .flatMap((product, index) => product?.businessId === sale.businessId ? [[sale.items[index].id, {
      stock: product.stock?.[sale.branchId], version: product.posStockVersion?.[sale.branchId] ?? 0,
    }]] : [])),
  apply: (sale, identity) => {
    if (auth.currentUser?.uid !== identity.uid) throw new SaleError('session-changed', 'La sesión cambió; la venta queda pendiente.');
    return sparkSales.submit(sale);
  },
});

export const saveSaleTransaction = confirmedWrite((sale, cartItems, products, user) =>
  saleQueue.submit({ ...sale, items: cartItems, queuedAt: new Date().toISOString(),
    origin: navigator.onLine ? 'online' : 'offline' }, user, { isolated: true, products }));

// Read-only remote verification can recover a lost local acknowledgment; it never submits a sale.
export async function verifyPendingSaleTransaction(sale, user, isCurrent = () => true) {
  const identity = { ...user, branchId: sale.branchId };
  const results = await saleQueue.reconcile(identity, { onlyId: sale.saleId ?? sale.localId ?? sale.id, isCurrent });
  const result = results[0];
  if (result?.state !== 'confirmed') throw result?.error ?? new SaleError('receipt-unverified', 'El ticket sigue sin confirmar. Conserva su ID y solicita revisión.');
  return result.receipt;
}

export const voidRecovery = createVoidRecovery({ store: {
  get: id => offlineDB.settings.get(id), insert: row => offlineDB.settings.add(row), update: (id, changes) => offlineDB.settings.update(id, changes),
  list: prefix => offlineDB.settings.where('id').startsWith(prefix).toArray(),
}, encrypt, decrypt, repository: sparkVoids, currentIdentity: identity => auth.currentUser?.uid === identity.uid });

export const subscribeSaleAcknowledgement = (saleId, onData, onError) => {
  const subscription = liveQuery(() => offlineDB.sales.get(saleId)).subscribe({ next: onData, error: onError });
  return () => subscription.unsubscribe();
};
export const subscribeVoidAttempts = (identity, onData, onError) => {
  const subscription = liveQuery(() => voidRecovery.list(identity)).subscribe({ next: onData, error: onError });
  return () => subscription.unsubscribe();
};
export async function recoverFinancialReceipts(identity, isCurrent) {
  await saleQueue.reconcile(identity, { isCurrent });
  if (!isCurrent()) return;
  const attempts = (await voidRecovery.list(identity)).filter(row => row.localState === 'pending').slice(0, 10);
  for (const command of attempts) {
    if (!isCurrent()) break;
    try { await voidRecovery.verify(command, identity, isCurrent); }
    catch { /* Retain the encrypted intent and offer a manual server check. */ }
  }
}

export const voidSaleTransaction = confirmedWrite(async ({ id, voidReason, identity }) => {
  if (!navigator.onLine) throw new Error('Debes tener conexión a internet para anular una venta.');
  requireCapability('saleVoid', 'Anulación POS');
  return voidRecovery.submit({ saleId: id, reason: voidReason }, identity);
});
