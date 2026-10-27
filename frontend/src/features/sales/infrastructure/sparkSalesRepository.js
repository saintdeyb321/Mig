import { writeOperationNotice } from '../../notifications/infrastructure/sparkOperationNotice.js';
import * as firestoreSDK from 'firebase/firestore';
import { canonicalSale, sameSaleOperation, SaleError } from '../domain/saleModel.js';
import { VERIFIED_ATOMIC_LINE_LIMIT, checkoutBlockReason } from '../domain/checkoutPolicy.js';

export const SPARK_TICKET_LIMIT = VERIFIED_ATOMIC_LINE_LIMIT;
export function createSparkSalesRepository(database, { currentUser, sdk = firestoreSDK, protocolVersion = 2 } = {}) {
  const { doc, runTransaction, serverTimestamp, getDocFromServer } = sdk;
  const identity = sale => {
    if (currentUser()?.uid !== sale.userId) throw new SaleError('session-changed', 'La sesión cambió; conserva el pendiente para revisión.');
  };
  const receipt = data => ({ status: 'ALREADY_APPLIED', saleId: data.saleId,
    stockVersions: data.stockVersions, syncedAt: data.confirmedAt.toDate().toISOString() });
  async function verify(input) {
    const sale = canonicalSale(input); identity(sale);
    const saved = await getDocFromServer(doc(database, 'sales', sale.saleId));
    identity(sale);
    if (!saved.exists()) throw new SaleError('receipt-not-found', 'Venta pendiente: no existe confirmación remota.');
    if (!sameSaleOperation(sale, saved.data())) throw new SaleError('sale-conflict', 'El ID ya pertenece a otro ticket.');
    return receipt(saved.data());
  }
  return { verify, async submit(input) {
    const sale = canonicalSale(input); identity(sale);
    if (sale.origin !== 'online') throw new SaleError('offline-review-required', 'Pendiente offline: requiere revisión; la hora local no autoriza su aceptación.');
    if (sale.items.some(item => item.qty > 1000000) || Math.max(sale.total, sale.totalCost, sale.amountPaid) > 1000000000) {
      throw new SaleError('invalid-sale', 'Límite Spark: 1000000 unidades por producto y S/ 1000000000 por importe/costo/recibido. El ticket completo permanece sin confirmar.');
    }
    if (sale.items.length > (protocolVersion === 2 ? SPARK_TICKET_LIMIT : 2)) throw new SaleError('invalid-sale', checkoutBlockReason(sale.items) || 'Este protocolo histórico admite dos líneas.');
    try { await runTransaction(database, async tx => {
      identity(sale);
      const reference = doc(database, 'sales', sale.saleId), existing = await tx.get(reference);
      if (existing.exists()) {
        if (!sameSaleOperation(sale, existing.data())) throw new SaleError('sale-conflict', 'El ID ya pertenece a otro ticket.');
        return;
      }
      const rows = await Promise.all(sale.items.map(item => tx.get(doc(database, 'products', item.id))));
      const stockVersions = {};
      const changes = rows.map((row, index) => {
        const item = sale.items[index], product = row.data();
        if (!product || product.businessId !== sale.businessId || product.price !== item.price
          || (product.cost ?? 0) !== item.cost || product.name !== item.name || (product.category ?? '') !== item.category) {
          throw new SaleError('price-changed', 'Cambió el catálogo. Revisa el ticket pendiente antes de volver a cobrar.');
        }
        if (!Number.isSafeInteger(product.stock?.[sale.branchId]) || product.stock[sale.branchId] < item.qty) throw new SaleError('insufficient-stock', 'Stock insuficiente.');
        const versions = product.posStockVersion ?? {};
        if (typeof versions !== 'object' || Array.isArray(versions)) throw new SaleError('invalid-stock', 'Versión histórica de stock incompatible; requiere revisión.');
        const previousVersion = versions[sale.branchId] ?? 0;
        if (!Number.isSafeInteger(previousVersion) || previousVersion < 0 || previousVersion >= Number.MAX_SAFE_INTEGER) throw new SaleError('invalid-stock', 'Versión de stock fuera del contador seguro; requiere revisión, sin sobrescribirla.');
        stockVersions[item.id] = previousVersion + 1;
        return { ...(protocolVersion === 2 ? { posSaleLineIndex: index } : {}), stock: { ...product.stock, [sale.branchId]: product.stock[sale.branchId] - item.qty },
          posStockVersion: { ...versions, [sale.branchId]: stockVersions[item.id] }, posLastSaleId: sale.saleId };
      });
      identity(sale);
      tx.set(reference, { ...sale, ...(protocolVersion === 2 ? { atomicProtocol: 2 } : {}), productIds: sale.items.map(item => item.id), stockVersions, status: 'confirmed', confirmedAt: serverTimestamp() });
      changes.forEach((change, index) => tx.update(rows[index].ref, change));
      if (protocolVersion === 2) for (let offset = 0; offset < sale.items.length; offset += 4) {
        const items = sale.items.slice(offset, offset + 4), index = offset / 4;
        tx.set(doc(database, 'pos_sale_groups', `${sale.saleId}_${index}`), {
          businessId: sale.businessId, branchId: sale.branchId, userId: sale.userId, saleId: sale.saleId, index,
          totalCents: items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.qty, 0),
          costCents: items.reduce((sum, item) => sum + Math.round(item.cost * 100) * item.qty, 0), createdAt: serverTimestamp(),
        });
      }
      writeOperationNotice(tx, database, sdk, 'sale', sale.saleId, sale);
    }); } catch (error) {
      // Concurrent attempts can be denied as an immutable receipt/notice already exists.
      // Only an identical server receipt can turn that race into a confirmation.
      try { return await verify(sale); }
      catch (verificationError) {
        if (verificationError.code === 'sale-conflict') throw verificationError;
        if (verificationError.code === 'receipt-not-found') throw error;
        throw new SaleError('receipt-unverified', 'Resultado incierto. Conserva el ID original y consulta su recibo antes de volver a cobrar.');
      }
    }
    try { return await verify(sale); }
    catch (error) {
      if (error.code === 'sale-conflict') throw error;
      throw new SaleError('receipt-unverified', 'El commit terminó, pero no se pudo verificar su recibo remoto. Conserva el ID original.');
    }
  } };
}
