import { canonicalSale, assertSaleIdentity, sameSaleOperation, SaleError, saleDay, statsDelta, money } from '../domain/saleModel.js';

function checkedProduct(product, sale) {
  if (!product || product.businessId !== sale.businessId) throw new SaleError('product-tenant-mismatch', 'Producto fuera del negocio.');
  if (!product.stock || typeof product.stock !== 'object' || Array.isArray(product.stock)) throw new SaleError('invalid-stock', 'Stock sin mapa de sucursales.');
  const stock = product.stock[sale.branchId];
  if (!Number.isSafeInteger(stock) || stock < 0) throw new SaleError('invalid-stock', 'Stock inválido en la sede.');
  return stock;
}

function statsIdentity(sale) {
  const date = saleDay(sale);
  return { id: `${sale.businessId}_${date}_${sale.branchId}`, businessId: sale.businessId, branchId: sale.branchId, date };
}

async function receiptTransaction(port, saleId, operation, completed, already) {
  try { return await port.transaction(operation); }
  catch (error) {
    const code = String(error.code).replace(/^firestore\//, '');
    if (!['permission-denied', 'aborted'].includes(code)) throw error;
    // Rules can evaluate a stale concurrent void before Firestore reports its read conflict.
    // Confirm the committed receipt through an authorized read before treating that race as a no-op.
    return port.transaction(async tx => {
      const receipt = await tx.get('sales', saleId);
      if (receipt && completed(receipt)) return already;
      throw error;
    });
  }
}

export async function applySaleOnce(input, identity, port) {
  const sale = canonicalSale(input);
  assertSaleIdentity(sale, identity);
  return receiptTransaction(port, sale.saleId, async tx => {
    const existing = await tx.get('sales', sale.saleId);
    if (existing) {
      if (!sameSaleOperation(existing, sale)) throw new SaleError('sale-conflict', 'El ID ya identifica una venta diferente.');
      return { status: 'ALREADY_APPLIED', sale };
    }
    const products = await Promise.all(sale.items.map(item => tx.get('products', item.id)));
    const stocks = products.map(product => checkedProduct(product, sale));
    sale.items.forEach((item, index) => {
      if (stocks[index] < item.qty) throw new SaleError('insufficient-stock', `Stock insuficiente: ${item.name}.`);
    });
    const stats = statsIdentity(sale);
    const previousStats = await tx.get('daily_stats', stats.id);
    // All transaction reads precede every write.
    tx.set('sales', sale.saleId, { ...sale, createdAt: port.timestamp(sale.createdAt), sync: true, voided: false });
    sale.items.forEach((item, index) => tx.update('products', item.id,
      { stock: { ...products[index].stock, [sale.branchId]: stocks[index] - item.qty } }));
    tx.stats(stats, statsDelta(sale), previousStats);
    return { status: 'APPLIED', sale };
  }, receipt => sameSaleOperation(receipt, sale), { status: 'ALREADY_APPLIED', sale });
}

export async function voidSaleOnce(saleId, audit, port) {
  return receiptTransaction(port, saleId, async tx => {
    const remote = await tx.get('sales', saleId);
    if (!remote) throw new SaleError('missing-sale', 'Venta no encontrada.');
    if (remote.voided === true) return { status: 'ALREADY_VOIDED' };
    // Legacy receipts remain readable; financial values always come from the remote document.
    const sale = { ...remote, totalCost: remote.totalCost ?? 0,
      grossProfit: remote.grossProfit ?? money(remote.total - (remote.totalCost ?? 0)) };
    if (!Array.isArray(sale.items) || !sale.items.length || sale.branchId === 'global') throw new SaleError('invalid-sale', 'Venta remota inválida.');
    const products = await Promise.all(sale.items.map(item => tx.get('products', item.id)));
    const stocks = products.map(product => checkedProduct(product, sale));
    sale.items.forEach(item => {
      if (!Number.isSafeInteger(item.qty) || item.qty <= 0) throw new SaleError('invalid-sale', 'Cantidad remota inválida.');
    });
    if (new Set(sale.items.map(item => item.id)).size !== sale.items.length) throw new SaleError('invalid-sale', 'Venta remota con productos duplicados.');
    sale.items.forEach((item, index) => {
      if (!Number.isSafeInteger(stocks[index] + item.qty)) throw new SaleError('invalid-stock', 'Stock fuera del rango seguro.');
    });
    const stats = statsIdentity(sale);
    const previousStats = await tx.get('daily_stats', stats.id);
    const voidedAt = port.timestamp(new Date().toISOString());
    tx.update('sales', saleId, { voided: true, voidedAt, voidReason: audit.voidReason,
      voidedByName: audit.voidedByName, voidedByRole: audit.voidedByRole });
    sale.items.forEach((item, index) => tx.update('products', item.id,
      { stock: { ...products[index].stock, [sale.branchId]: stocks[index] + item.qty } }));
    tx.stats(stats, statsDelta(sale, -1), previousStats);
    tx.set('alerts', `VOIDED_SALE_${saleId}`, {
      type: 'VOIDED_SALE', title: `❌ Ticket Anulado (S/ ${Number(sale.total).toFixed(2)})`,
      businessId: sale.businessId, branchId: sale.branchId, saleId,
      cashierName: audit.voidedByName, notes: `Motivo: ${audit.voidReason}`,
      createdAt: new Date().toISOString(), read: false,
    });
    return { status: 'VOIDED' };
  }, receipt => receipt.voided === true, { status: 'ALREADY_VOIDED' });
}
