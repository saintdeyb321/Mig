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
export async function verifyPendingSaleTransaction(sale, user) {
  if (!navigator.onLine) throw new Error('Conéctate para consultar el receipt remoto.');
  const record = await offlineDB.sales.get(sale.localId);
  if (!record || record.userId !== user.uid || record.businessId !== user.businessId || auth.currentUser?.uid !== user.uid) {
    throw new Error('El pendiente no pertenece a esta identidad.');
  }
  const frozen = JSON.parse(await decrypt(record.data, user.uid));
  const receipt = await sparkSales.verify(frozen);
  if (auth.currentUser?.uid !== user.uid) throw new Error('La sesión cambió.');
  await offlineDB.sales.update(record.localId, { status: 'synced', sync: true, financialAck: true,
    stockVersions: receipt.stockVersions, syncedAt: receipt.syncedAt, lastError: null, syncStartedAt: null });
  return receipt;
}

export const voidSaleTransaction = confirmedWrite(async ({ id, voidReason }) => {
  if (!navigator.onLine) throw new Error('Debes tener conexión a internet para anular una venta.');
  requireCapability('saleVoid', 'Anulación POS');
  return sparkVoids.void({ saleId: id, reason: voidReason });
});
