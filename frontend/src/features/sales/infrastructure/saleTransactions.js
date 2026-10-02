import { auth } from '../../../core/firebase/client';
import { callBackend } from '../../../core/firebase/callable.js';
import { syncLocalSession } from '../../cash-register/infrastructure/cashRegisterRepository.js';
import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';
import { canonicalSale, SaleError } from '../domain/saleModel.js';
import { createSaleQueue } from '../application/saleQueue.js';
import { dexieSaleStore, createQueueLock } from './saleQueueStore.js';

async function syncCashSessions(identity) {
  const pending = await offlineDB.cash_sessions.filter(record => record.sync === false).toArray();
  const blockedSessions = new Set();
  for (const record of pending) {
    if (auth.currentUser?.uid !== identity.uid) break;
    let session;
    try { session = JSON.parse(await decrypt(record.data, identity.uid)); }
    catch { continue; }
    if (session.userId !== identity.uid || session.businessId !== identity.businessId) continue;
    try {
      await syncLocalSession(record.localId, session);
    } catch (error) {
      blockedSessions.add(record.localId);
      console.warn(`Caja pendiente ${record.localId}:`, error);
    }
  }
  return blockedSessions;
}
export const saleQueue = createSaleQueue({
  store: dexieSaleStore(offlineDB), encrypt, decrypt, withLock: createQueueLock(offlineDB),
  online: () => navigator.onLine, syncSessions: syncCashSessions,
  currentIdentity: identity => auth.currentUser?.uid === identity.uid,
  verifyReceipt: (sale, identity) => {
    if (auth.currentUser?.uid !== identity.uid) throw new SaleError('session-changed', 'La sesión cambió.');
    return callBackend('submitSale', { ...sale, receiptOnly: true });
  },
  captureProjection: async sale => Object.fromEntries((await offlineDB.products.bulkGet(sale.items.map(item => item.id)))
    .flatMap((product, index) => product?.businessId === sale.businessId ? [[sale.items[index].id, {
      stock: product.stock?.[sale.branchId], version: product.posStockVersion?.[sale.branchId] ?? 0,
    }]] : [])),
  apply: (sale, identity) => {
    if (auth.currentUser?.uid !== identity.uid) throw new SaleError('session-changed', 'La sesión cambió; la venta queda pendiente.');
    return callBackend('submitSale', sale);
  },
});

export const saveSaleTransaction = (sale, cartItems, products, user) =>
  saleQueue.submit(canonicalSale({ ...sale, items: cartItems, queuedAt: new Date().toISOString(),
    origin: navigator.onLine ? 'online' : 'offline' }, products), user);

export async function voidSaleTransaction(sale) {
  if (!navigator.onLine) throw new Error('Debes tener conexión a internet para anular una venta.');
  return callBackend('voidSale', { saleId: sale.id, reason: sale.voidReason || 'Sin justificación registrada' });
}
