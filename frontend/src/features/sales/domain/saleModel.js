export class SaleError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fail = message => { throw new SaleError('invalid-sale', message); };
export const SALE_VERSION = 1;
// Amounts are rounded at entry; comparisons allow less than half a cent of float noise.
export const MONEY_TOLERANCE = 0.005;
export function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) {
    fail('Importe inválido.');
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function nonnegative(value) {
  if (value < 0) fail('El importe no puede ser negativo.');
  return money(value);
}
export function documentId(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value === '.' || value === '..'
    || /^__.*__$/.test(value) || new TextEncoder().encode(value).length > 1500) fail('Identificador inválido.');
  return value;
}
export function assertSaleIdentity(sale, identity) {
  if (!identity?.uid || !identity.businessId || sale.userId !== identity.uid || sale.businessId !== identity.businessId
    || (identity.role === 'cajero' && sale.branchId !== identity.branchId)) {
    throw new SaleError('identity-mismatch', 'La venta no pertenece al usuario, negocio o sede de esta sesión.');
  }
}
export function paymentBreakdown(sale) {
  if (sale.payment === 'mixto') return { efectivo: sale.splitPayments.efectivo, yape: sale.splitPayments.yape };
  return { [sale.payment]: sale.total };
}
export function canonicalSale(input, products = []) {
  const saleId = documentId(input.saleId ?? input.localId);
  if ((input.localId !== undefined && input.localId !== saleId)
    || (input.idempotencyKey !== undefined && input.idempotencyKey !== saleId)
    || (input.version !== undefined && input.version !== SALE_VERSION)) fail('Identidad o versión de operación inválida.');
  const businessId = documentId(input.businessId);
  const branchId = documentId(input.branchId);
  if (branchId === 'global') fail('Selecciona una sede física.');
  const userId = documentId(input.userId);
  const sessionId = documentId(input.sessionId);
  if (!Array.isArray(input.items) || !input.items.length) fail('La venta debe tener productos.');
  const seen = new Set();
  const items = input.items.map(item => {
    const id = documentId(item.id);
    if (seen.has(id)) fail('Producto duplicado en la venta.');
    seen.add(id);
    if (!Number.isSafeInteger(item.qty) || item.qty <= 0) fail('Cantidad inválida.');
    const product = products.find(p => p.id === id);
    // Freeze the catalog cost when the operation is created, before it enters the queue.
    const cost = nonnegative(input.version === SALE_VERSION ? item.cost : (product?.cost ?? item.cost ?? 0));
    return { id, name: String(item.name ?? product?.name ?? ''), category: String(item.category ?? product?.category ?? ''),
      qty: item.qty, price: nonnegative(item.price), cost };
  });
  const total = nonnegative(input.total);
  if (total <= 0 || Math.abs(total - money(items.reduce((sum, item) => sum + money(item.price * item.qty), 0))) >= MONEY_TOLERANCE) {
    fail('El total no coincide con los productos.');
  }
  if (!['efectivo', 'yape', 'mixto'].includes(input.payment)) fail('Método de pago inválido.');
  const amountPaid = nonnegative(input.amountPaid);
  const change = nonnegative(input.change);
  let splitPayments;
  if (input.payment === 'mixto') {
    if (!input.splitPayments || Object.keys(input.splitPayments).some(key => !['efectivo', 'yape'].includes(key))) fail('Desglose de pago inválido.');
    splitPayments = { efectivo: nonnegative(input.splitPayments.efectivo), yape: nonnegative(input.splitPayments.yape) };
    if (Math.abs(money(splitPayments.efectivo + splitPayments.yape) - total) >= MONEY_TOLERANCE) fail('El pago mixto no coincide con el total.');
  }
  if (input.payment === 'efectivo') {
    if (amountPaid < total || Math.abs(change - money(amountPaid - total)) >= MONEY_TOLERANCE) fail('Pago o vuelto incorrecto.');
  } else if (Math.abs(amountPaid - total) >= MONEY_TOLERANCE || change !== 0) fail('Pago o vuelto incorrecto.');
  const createdAt = input.createdAt ?? (input.version === undefined ? input.date : undefined);
  const dateValue = createdAt?.toDate ? createdAt.toDate() : createdAt;
  const date = new Date(dateValue);
  if (dateValue == null || !Number.isFinite(date.getTime())) fail('Fecha inválida.');
  const totalCost = money(items.reduce((sum, item) => sum + money(item.cost * item.qty), 0));
  return { saleId, localId: saleId, idempotencyKey: saleId, version: SALE_VERSION,
    businessId, branchId, userId, sessionId, items, total, payment: input.payment, amountPaid, change,
    createdAt: date.toISOString(), cashierName: String(input.cashierName ?? ''),
    ...(splitPayments ? { splitPayments } : {}), totalCost, grossProfit: money(total - totalCost) };
}

export function sameSaleOperation(left, right) {
  try { return JSON.stringify(canonicalSale(left)) === JSON.stringify(canonicalSale(right)); }
  catch { return false; }
}

// Retain the existing business calendar (Peru), independent of the browser's time zone.
export function saleDay(sale) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(sale.createdAt?.toDate ? sale.createdAt.toDate() : sale.createdAt));
  const calendar = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${calendar.year}-${calendar.month}-${calendar.day}`;
}

export function statsDelta(sale, direction = 1) {
  const delta = { totalRevenue: direction * sale.total, totalCost: direction * sale.totalCost,
    grossProfit: direction * sale.grossProfit, totalOrders: direction, voidedOrders: direction === -1 ? 1 : 0 };
  for (const [method, amount] of Object.entries(paymentBreakdown(sale))) delta[`paymentMethods.${method}`] = direction * amount;
  for (const item of sale.items) {
    const subtotal = money(item.price * item.qty);
    if (item.category) delta[`categorySales.${item.category}`] = money((delta[`categorySales.${item.category}`] ?? 0) + direction * subtotal);
    if (direction === 1) delta[`productSales.${item.id}.name`] = item.name;
    delta[`productSales.${item.id}.qty`] = direction * item.qty;
    delta[`productSales.${item.id}.revenue`] = direction * subtotal;
  }
  return delta;
}
