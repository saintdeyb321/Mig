import * as firestore from 'firebase/firestore';
import { cashLockId } from '../../cash-register/infrastructure/sparkCashRepository.js';
import { canonicalSale, SaleError } from '../domain/saleModel.js';
import { matchesPosVoidReceipt } from '../domain/posVoidReceipt.js';

export function createPosVoidRepository(database, { sdk = firestore, currentUser } = {}) {
  const { doc, runTransaction, serverTimestamp, getDocFromServer } = sdk;
  async function verify({ saleId, reason, businessId, branchId }) {
    const uid = currentUser()?.uid;
    if (!uid || !saleId || saleId.includes('/')) throw new SaleError('invalid-sale', 'Identidad o ticket inválido.');
    const saved = await getDocFromServer(doc(database, 'pos_voids', saleId));
    if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
    if (!saved.exists()) throw new SaleError('receipt-not-found', 'El servidor no confirma aún esta anulación. Conserva el ID y el motivo; requiere revisión.');
    const data = saved.data();
    if (data.saleId !== saleId || data.userId !== uid || data.reason !== reason
      || (businessId && data.businessId !== businessId) || (branchId && data.branchId !== branchId)) throw new SaleError('sale-conflict', 'Este ticket ya tiene otra anulación o pertenece a otra sede.');
    const source = await getDocFromServer(doc(database, 'sales', saleId));
    if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
    const original = source.exists() ? source.data() : null;
    if (saved.metadata?.fromCache || saved.metadata?.hasPendingWrites || source.metadata?.fromCache || source.metadata?.hasPendingWrites
      || !matchesPosVoidReceipt(data, original, { userId: uid, reason })) throw new SaleError('void-unverified', 'No se pudo comprobar esta anulación. Conserva el ticket para revisión.');
    return { ...data, id: saleId, status: 'ALREADY_APPLIED' };
  }
  return { verify, async void({ saleId, reason, businessId, branchId }) {
    const uid = currentUser()?.uid;
    if (!uid || typeof saleId !== 'string' || !saleId || saleId.includes('/')) throw new SaleError('invalid-sale', 'Identidad o ticket inválido.');
    reason = typeof reason === 'string' ? reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) throw new SaleError('invalid-sale', 'Explica el motivo con 5 a 1000 caracteres.');
    const ref = doc(database, 'pos_voids', saleId);
    let created = false, committedData;
    const verified = () => verify({ saleId, reason, businessId, branchId });
    try { await runTransaction(database, async tx => {
      created = false;
      const [existing, source, profile] = await Promise.all([tx.get(ref), tx.get(doc(database, 'sales', saleId)), tx.get(doc(database, 'users', uid))]);
      if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
      if (existing.exists()) {
        if (existing.data().userId !== uid || existing.data().reason !== reason) throw new SaleError('sale-conflict', 'Este ticket ya tiene otra anulación.');
        if (!matchesPosVoidReceipt(existing.data(), source.data(), { userId: uid, reason })
          || (businessId && existing.data().businessId !== businessId) || (branchId && existing.data().branchId !== branchId)) {
          throw new SaleError('void-unverified', 'El comprobante de anulación necesita revisión.');
        }
        committedData = existing.data();
        return;
      }
      const actor = profile.data(), original = source.data();
      if ((businessId && original?.businessId !== businessId) || (branchId && original?.branchId !== branchId)) throw new SaleError('permission-denied', 'El ticket no pertenece a la sede activa.');
      if (!['dueño', 'cajero'].includes(actor?.role) || (actor.status ?? 'activo') !== 'activo' || actor.businessId !== original?.businessId
        || (actor.role === 'cajero' && actor.branchId !== original?.branchId)) throw new SaleError('permission-denied', 'No puedes anular tickets de este negocio o sucursal.');
      if (original?.atomicProtocol !== 2 || original.status !== 'confirmed') throw new SaleError('legacy-review-required', 'Ticket histórico: lectura conservada; requiere revisión administrativa.');
      const sale = canonicalSale(original);
      const lock = (await tx.get(doc(database, 'active_cash_sessions', await cashLockId(sale.businessId, sale.branchId)))).data();
      if (lock?.userId !== uid || lock.status !== 'open' || lock.runtime !== 'spark') throw new SaleError('invalid-session', 'Abre tu propia caja en la sede de origen para registrar la compensación.');
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
      committedData = { businessId: sale.businessId, branchId: sale.branchId, userId: uid, sessionId: lock.sessionId, saleId, reason,
        amount: -sale.total, cashAmount: -cash, digitalAmount: -(Math.round(sale.total * 100) - Math.round(cash * 100)) / 100,
        items: sale.items, stockVersions: versions, protocol: 1, authority: 'pos-compensation', occurredAt: serverTimestamp() };
      tx.set(ref, committedData);
      changes.forEach((change, index) => tx.update(products[index].ref, change));
      for (let index = 0; index < Math.ceil(sale.items.length / 4); index++) tx.set(doc(database, 'pos_void_groups', `${saleId}_${index}`), {
        businessId: sale.businessId, branchId: sale.branchId, userId: uid, saleId, index, createdAt: serverTimestamp(),
      });
    }); } catch (error) {
      if (error instanceof SaleError && ['sale-conflict', 'permission-denied', 'invalid-session', 'legacy-review-required', 'invalid-stock', 'invalid-sale'].includes(error.code)) throw error;
      try { return { ...await verified(), status: 'ALREADY_APPLIED' }; }
      catch (verificationError) {
        if (verificationError.code === 'sale-conflict' || verificationError.code === 'session-changed') throw verificationError;
        if (verificationError.code === 'receipt-not-found' && !['unavailable', 'deadline-exceeded', 'aborted'].includes(error.code)) throw error;
        throw new SaleError('void-unverified', 'Resultado incierto. Verifica la anulación por su ID; no repitas la compensación ni la entrega de dinero.');
      }
    }
    if (currentUser()?.uid !== uid) throw new SaleError('session-changed', 'La sesión cambió.');
    // A resolved SDK transaction is a server acknowledgement, including Rules validation.
    // Do not downgrade that acknowledgement because a redundant follow-up read failed.
    const result = { ...committedData, id: saleId, status: created ? 'APPLIED' : 'ALREADY_APPLIED', confirmation: 'server-commit' };
    if (created) delete result.occurredAt; // Never present a serverTimestamp sentinel as a resolved date.
    return result;
  } };
}
