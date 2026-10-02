import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { actorFor, authorizeBranch } from '../core/authorization.js';
import { canonicalSale, documentId, sameSaleOperation, SaleError, money, MONEY_TOLERANCE } from './domain/saleModel.js';
import { statsReference, writeStats, assertStatsScope } from './stats.js';
import { validateSaleSession } from './sessionWindow.js';

function checkedProduct(snapshot, sale) {
  const product = snapshot.data();
  if (!product || product.businessId !== sale.businessId) throw new SaleError('product-tenant-mismatch', 'Producto fuera del negocio.');
  const stock = product.stock?.[sale.branchId];
  const version = product.posStockVersion?.[sale.branchId] ?? 0;
  if (!product.stock || typeof product.stock !== 'object' || Array.isArray(product.stock)
    || !Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) {
    throw new SaleError('invalid-stock', 'Stock inválido en la sede.');
  }
  return { ...product, stockValue: stock, nextVersion: version + 1 };
}
function moveStock(transaction, snapshots, products, sale, direction) {
  sale.items.forEach((item, index) => transaction.update(snapshots[index].ref, {
    stock: { ...products[index].stock, [sale.branchId]: products[index].stockValue + direction * item.qty },
    posStockVersion: { ...products[index].posStockVersion, [sale.branchId]: products[index].nextVersion },
  }));
}

export function createSalesHandlers(database, { now = Date.now } = {}) {
  const submitSale = async request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const input = canonicalSale(request.data);
    if (input.userId !== actor.uid || input.businessId !== actor.businessId) {
      throw new SaleError('identity-mismatch', 'Identidad de venta falsificada.');
    }
    await authorizeBranch(transaction, database, actor, input.branchId, input.businessId);
    const reference = database.doc(`sales/${input.saleId}`);
    const existing = (await transaction.get(reference)).data();
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (existing) {
      if (existing.businessId !== actor.businessId || existing.userId !== actor.uid
        || (existing.requestHash ? existing.requestHash !== requestHash : !sameSaleOperation(existing, input))) {
        throw new SaleError('sale-conflict', 'El ID ya identifica una venta diferente.');
      }
      return { status: 'ALREADY_APPLIED', stockVersions: existing.stockVersions ?? {}, syncedAt: existing.syncedAt?.toDate?.().toISOString() ?? null };
    }
    if (request.data.receiptOnly === true) throw new SaleError('pending-session', 'Receipt aún no confirmado; la caja sigue pendiente.');
    const session = (await transaction.get(database.doc(`cash_sessions/${input.sessionId}`))).data();
    validateSaleSession(session, input, actor, now());
    const snapshots = await transaction.getAll(...input.items.map(item => database.doc(`products/${item.id}`)));
    const products = snapshots.map(snapshot => checkedProduct(snapshot, input));
    input.items.forEach((item, index) => {
      const product = products[index];
      if (product.status !== undefined && product.status !== 'activo') {
        throw new SaleError('inactive-product', `Producto inactivo: ${product.name}. Revisa el ticket.`);
      }
      if (product.price < 0 || Math.abs(item.price - money(product.price)) >= MONEY_TOLERANCE) {
        throw new SaleError('price-changed', `El precio de ${product.name} cambió. Revisa el ticket.`);
      }
      if (product.stockValue < item.qty) throw new SaleError('insufficient-stock', `Stock insuficiente: ${product.name}.`);
    });
    const sale = canonicalSale({ ...input, cashierName: actor.name, items: input.items.map((item, index) => ({ ...item,
      id: snapshots[index].id, cost: products[index].cost ?? 0, name: products[index].name ?? '', category: products[index].category ?? '' })) });
    const stats = statsReference(database, sale);
    const previous = (await transaction.get(stats.reference)).data();
    assertStatsScope(stats.metadata, previous);
    const stockVersions = Object.fromEntries(sale.items.map((item, index) => [item.id, products[index].nextVersion]));
    const syncedAt = Timestamp.fromMillis(now());
    transaction.create(reference, { ...sale, requestHash, createdAt: Timestamp.fromDate(new Date(sale.createdAt)),
      queuedAt: Timestamp.fromDate(new Date(sale.queuedAt)), syncedAt, stockVersions, sync: true, voided: false });
    moveStock(transaction, snapshots, products, sale, -1);
    writeStats(transaction, stats.reference, stats.metadata, sale, 1, previous);
    return { status: 'APPLIED', stockVersions, syncedAt: syncedAt.toDate().toISOString() };
  });

  const voidSale = async request => {
    const data = request.data;
    if (!data || Object.keys(data).some(key => !['saleId', 'reason'].includes(key))
      || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000) {
      throw new SaleError('invalid-sale', 'Envía únicamente el ID de venta y el motivo.');
    }
    const saleId = documentId(data.saleId);
    return database.runTransaction(async transaction => {
      const actor = await actorFor(transaction, database, request.auth?.uid);
      const reference = database.doc(`sales/${saleId}`);
      const remote = (await transaction.get(reference)).data();
      if (!remote) throw new SaleError('missing-sale', 'Venta no encontrada.');
      await authorizeBranch(transaction, database, actor, remote.branchId, remote.businessId, { requireActive: false });
      if (remote.voided === true) return { status: 'ALREADY_VOIDED' };
      const sale = { ...remote, totalCost: remote.totalCost ?? 0, grossProfit: remote.grossProfit ?? money(remote.total - (remote.totalCost ?? 0)) };
      if (!Array.isArray(sale.items) || !sale.items.length || new Set(sale.items.map(item => item.id)).size !== sale.items.length) {
        throw new SaleError('invalid-sale', 'Receipt remoto inválido.');
      }
      const snapshots = await transaction.getAll(...sale.items.map(item => database.doc(`products/${documentId(item.id)}`)));
      const products = snapshots.map(snapshot => checkedProduct(snapshot, sale));
      sale.items.forEach((item, index) => {
        if (!Number.isSafeInteger(item.qty) || item.qty <= 0 || !Number.isSafeInteger(products[index].stockValue + item.qty)) {
          throw new SaleError('invalid-stock', 'Cantidad remota inválida.');
        }
      });
      const stats = statsReference(database, sale);
      const previous = (await transaction.get(stats.reference)).data();
      assertStatsScope(stats.metadata, previous);
      const voidedAt = Timestamp.fromMillis(now());
      transaction.update(reference, { voided: true, voidedAt, voidReason: data.reason.trim(),
        voidedByName: actor.name, voidedByRole: actor.role, voidedByUid: actor.uid });
      moveStock(transaction, snapshots, products, sale, 1);
      writeStats(transaction, stats.reference, stats.metadata, sale, -1, previous);
      transaction.create(database.doc(`alerts/VOIDED_SALE_${saleId}`), {
        type: 'VOIDED_SALE', title: `❌ Ticket Anulado (S/ ${Number(sale.total).toFixed(2)})`,
        businessId: sale.businessId, branchId: sale.branchId, saleId, cashierName: actor.name, userId: actor.uid,
        notes: `Motivo: ${data.reason.trim()}`, createdAt: voidedAt.toDate().toISOString(), read: false,
      });
      return { status: 'VOIDED' };
    });
  };
  return { submitSale, voidSale };
}
