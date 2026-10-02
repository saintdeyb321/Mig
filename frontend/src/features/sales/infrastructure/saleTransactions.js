import { db, auth } from '../../../core/firebase/client';
import { doc, setDoc } from 'firebase/firestore';
import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';
import { canonicalSale, SaleError } from '../domain/saleModel.js';
import { applySaleOnce, voidSaleOnce } from '../application/saleEngine.js';
import { createSaleQueue } from '../application/saleQueue.js';
import { firestoreSalePort } from './firestoreSalePort.js';
import { dexieSaleStore, createQueueLock } from './saleQueueStore.js';

const port = firestoreSalePort(db);
async function syncCashSessions(identity) {
  const pending = await offlineDB.cash_sessions.filter(record => record.sync === false).toArray();
  const blockedSessions = new Set();
  for (const record of pending) {
    if (auth.currentUser?.uid !== identity.uid) break;
    let session;
    try { session = JSON.parse(await decrypt(record.data, identity.uid)); }
    catch { continue; }
    if (session.userId !== identity.uid || session.businessId !== identity.businessId) continue;
    // Preserve cash-session merge semantics and ordering until Phase 6.
    try {
      await setDoc(doc(db, 'cash_sessions', record.localId), { ...session, syncedAt: new Date().toISOString() }, { merge: true });
      await offlineDB.cash_sessions.update(record.localId, { sync: true });
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
  apply: (sale, identity) => {
    if (auth.currentUser?.uid !== identity.uid) throw new SaleError('session-changed', 'La sesión cambió; la venta queda pendiente.');
    return applySaleOnce(sale, identity, port);
  },
});

export const saveSaleTransaction = (sale, cartItems, products, user) =>
  saleQueue.submit(canonicalSale({ ...sale, items: cartItems }, products), user);

export async function voidSaleTransaction(sale) {
  if (!navigator.onLine) throw new Error('Debes tener conexión a internet para anular una venta.');
  return voidSaleOnce(sale.id, {
    voidReason: sale.voidReason || 'Sin justificación registrada',
    voidedByName: sale.voidedByName || 'Cajero', voidedByRole: sale.voidedByRole,
  }, port);
}
