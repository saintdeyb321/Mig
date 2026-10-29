import * as firestore from 'firebase/firestore';
import { cashLockId } from '../../cash-register/infrastructure/sparkCashRepository.js';
import { canonicalSale, SaleError } from '../domain/saleModel.js';

export function createPosVoidRepository(database, { sdk = firestore, currentUser } = {}) {
  const { doc, runTransaction, serverTimestamp, getDocFromServer } = sdk;
  return { async void({ saleId, reason }) {
    const uid = currentUser()?.uid;
    if (!uid || typeof saleId !== 'string' || !saleId || saleId.includes('/')) throw new SaleError('invalid-sale', 'Identidad o ticket inválido.');
    reason = typeof reason === 'string' ? reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) throw new SaleError('invalid-sale', 'Explica el motivo con 5 a 1000 caracteres.');
    const ref = doc(database, 'pos_voids', saleId);
    let created = false;
    const verified = async () => {
      const saved = await getDocFromServer(ref);
      if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
      if (!saved.exists()) throw new SaleError('receipt-not-found', 'Compensación no confirmada.');
      const data = saved.data();
      if (data.saleId !== saleId || data.userId !== uid || data.reason !== reason) throw new SaleError('sale-conflict', 'Este ticket ya tiene otra anulación.');
      return { ...data, id: saleId };
    };
    try { await runTransaction(database, async tx => {
      created = false;
      const [existing, source, profile] = await Promise.all([tx.get(ref), tx.get(doc(database, 'sales', saleId)), tx.get(doc(database, 'users', uid))]);
      if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
      if (existing.exists()) {
        if (existing.data().userId !== uid || existing.data().reason !== reason) throw new SaleError('sale-conflict', 'Este ticket ya tiene otra anulación.');
        return;
      }
      const actor = profile.data(), original = source.data();
      if (!['dueño', 'cajero'].includes(actor?.role) || (actor.status ?? 'activo') !== 'activo' || actor.businessId !== original?.businessId
        || (actor.role === 'cajero' && actor.branchId !== original?.branchId)) throw new SaleError('permission-denied', 'No puedes anular tickets de este negocio o sucursal.');
      if (original?.atomicProtocol !== 2 || original.status !== 'confirmed') throw new SaleError('legacy-review-required', 'Ticket histórico: lectura conservada; requiere revisión administrativa.');
      const sale = canonicalSale(original);
      const lock = (await tx.get(doc(database, 'active_cash_sessions', await cashLockId(sale.businessId, sale.branchId)))).data();
      if (lock?.userId !== uid || lock.status !== 'open' || lock.runtime !== 'spark') throw new SaleError('invalid-session', 'Abre tu propia caja en la sede de origen para registrar la devolución.');
      const products = await Promise.all(sale.items.map(item => tx.get(doc(database, 'products', item.id))));
      const versions = {}, changes = products.map((snapshot, index) => {
        const product = snapshot.data(), item = sale.items[index], version = product?.posStockVersion?.[sale.branchId] ?? 0;
        const stock = product?.stock?.[sale.branchId];
        if (product?.businessId !== sale.businessId || !Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(stock + item.qty)
          || !Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw new SaleError('invalid-stock', 'Stock histórico no verificable; no se modifica.');
        versions[item.id] = version + 1;
        return { stock: { ...product.stock, [sale.branchId]: stock + item.qty }, posStockVersion: { ...product.posStockVersion, [sale.branchId]: version + 1 },
          posLastVoidSaleId: saleId, posVoidLineIndex: index };
      });
      const cash = sale.payment === 'efectivo' ? sale.total : sale.payment === 'mixto' ? sale.splitPayments.efectivo : 0;
      created = true;
      tx.set(ref, { businessId: sale.businessId, branchId: sale.branchId, userId: uid, sessionId: lock.sessionId, saleId, reason,
        amount: -sale.total, cashAmount: -cash, digitalAmount: -(Math.round(sale.total * 100) - Math.round(cash * 100)) / 100,
        items: sale.items, stockVersions: versions, protocol: 1, authority: 'pos-compensation', occurredAt: serverTimestamp() });
      changes.forEach((change, index) => tx.update(products[index].ref, change));
      for (let index = 0; index < Math.ceil(sale.items.length / 4); index++) tx.set(doc(database, 'pos_void_groups', `${saleId}_${index}`), {
        businessId: sale.businessId, branchId: sale.branchId, userId: uid, saleId, index, createdAt: serverTimestamp(),
      });
    }); } catch (error) {
      try { return { ...await verified(), status: 'ALREADY_APPLIED' }; }
      catch (verificationError) { if (verificationError.code === 'receipt-not-found') throw error; throw verificationError; }
    }
    try { return { ...await verified(), status: created ? 'APPLIED' : 'ALREADY_APPLIED' }; }
    catch (error) { if (error.code === 'sale-conflict') throw error; throw new SaleError('void-unverified', 'Anulación pendiente de comprobar. Conserva el ID y el motivo; no repitas la devolución física.'); }
  } };
}
