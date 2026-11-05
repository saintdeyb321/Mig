export class SaleError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fail = message => { throw new SaleError('invalid-sale', message); };
export const SALE_VERSION = 1;
// Historical normalization: keep this stable for receipts, reports and encrypted queues.
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Payload de venta inválido.');
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
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Producto inválido.');
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
  const queuedValue = input.queuedAt?.toDate ? input.queuedAt.toDate() : input.queuedAt ?? date;
  const queuedAt = new Date(queuedValue);
  const origin = input.origin ?? 'online';
  if (!Number.isFinite(queuedAt.getTime()) || !['online', 'offline'].includes(origin)) fail('Origen o fecha de cola inválidos.');
  const totalCost = money(items.reduce((sum, item) => sum + money(item.cost * item.qty), 0));
  return { saleId, localId: saleId, idempotencyKey: saleId, version: SALE_VERSION,
    businessId, branchId, userId, sessionId, items, total, payment: input.payment, amountPaid, change,
    createdAt: date.toISOString(), queuedAt: queuedAt.toISOString(), origin, cashierName: String(input.cashierName ?? ''),
    ...(splitPayments ? { splitPayments } : {}), totalCost, grossProfit: money(total - totalCost) };
}

export function sameSaleOperation(left, right) {
  try { return JSON.stringify(canonicalSale(left)) === JSON.stringify(canonicalSale(right)); }
  catch { return false; }
}

// New retail sales only. Historical reading/comparison above must not acquire these limits.
// S/50,000 bounds both a ticket and the cash handled; 1,000 units bounds each retail line.
export const SALE_LIMITS = Object.freeze({ maxTotal: 50000, maxReceived: 50000, maxChange: 50000, maxQuantity: 1000, maxDistinctProducts: 8 });

export function saleAmountCents(value, label = 'El importe', maximum = SALE_LIMITS.maxTotal) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`${label} debe ser un importe válido, sin negativos.`);
  if (value > maximum) fail(maximum === 50000 ? `${label} no puede superar S/ 50 000.` : `${label} supera el límite técnico permitido.`);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || value !== cents / 100) fail(`${label} admite como máximo dos decimales, sin redondear.`);
  return cents;
}

// Inspect the original input before Number can erase excessive decimal places or exponent notation.
export function parsePaymentCents(text, label = 'El importe') {
  if (typeof text !== 'string' || !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    fail(`${label}: ingresa soles con máximo dos decimales, sin redondear.`);
  }
  const [soles, fraction = ''] = text.split('.');
  const cents = Number(soles || '0') * 100 + Number(fraction.padEnd(2, '0'));
  saleAmountCents(cents / 100, label);
  return cents;
}

function newPayment(input) {
  const total = saleAmountCents(input.total, 'El total');
  const received = saleAmountCents(input.amountPaid, 'El monto recibido', SALE_LIMITS.maxReceived);
  const change = saleAmountCents(input.change, 'El vuelto', SALE_LIMITS.maxChange);
  if (total <= 0) fail('El total debe ser mayor que cero.');
  if (input.payment === 'mixto') {
    const cash = saleAmountCents(input.splitPayments?.efectivo, 'El efectivo');
    const yape = saleAmountCents(input.splitPayments?.yape, 'El Yape / Plin');
    if (cash + yape !== total) fail('Efectivo y Yape / Plin deben sumar exactamente el total.');
  }
  if (input.payment === 'efectivo') {
    if (received < total || change !== received - total) fail('El monto recibido y el vuelto no coinciden con el total.');
  } else if (!['yape', 'mixto'].includes(input.payment) || received !== total || change !== 0) fail('El pago debe coincidir exactamente con el total, sin vuelto.');
}

export function validatePOSPayment({ payment, total, amountPaid, splitEfectivo, splitYape }) {
  const errors = {};
  const check = (field, work) => { try { return work(); } catch (error) { errors[field] = error.message; return 0; } };
  const totalCents = check('total', () => saleAmountCents(total, 'El total'));
  const cash = payment === 'efectivo' ? check('amountPaid', () => parsePaymentCents(amountPaid, 'El monto recibido')) : totalCents;
  const parts = payment === 'mixto' ? {
    efectivo: check('splitEfectivo', () => parsePaymentCents(splitEfectivo, 'El efectivo')) / 100,
    yape: check('splitYape', () => parsePaymentCents(splitYape, 'El Yape / Plin')) / 100,
  } : undefined;
  const values = { payment, total, amountPaid: cash / 100, change: payment === 'efectivo' ? (cash - totalCents) / 100 : 0,
    ...(parts ? { splitPayments: parts } : {}) };
  if (!Object.keys(errors).length) check('payment', () => newPayment(values));
  const error = Object.values(errors)[0] ?? null;
  return { ...values, errors, error, valid: !error };
}

export function canonicalNewSale(input, products = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Payload de venta inválido.');
  newPayment(input);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > SALE_LIMITS.maxDistinctProducts) fail('El ticket debe tener de 1 a 8 productos distintos; el carrito se conserva sin cobrar.');
  let totalCents = 0;
  for (const item of input.items) {
    if (!Number.isSafeInteger(item?.qty) || item.qty <= 0 || item.qty > SALE_LIMITS.maxQuantity) fail('Máximo 1 000 unidades enteras por producto; revisa la cantidad.');
    totalCents += saleAmountCents(item.price, 'El precio') * item.qty;
    const product = products.find(row => row.id === item.id);
    // Preserve catalog cost selection and the existing technical cost ceiling.
    saleAmountCents(input.version === SALE_VERSION ? item.cost : (product?.cost ?? item.cost ?? 0), 'El costo', 1000000000);
  }
  if (totalCents !== saleAmountCents(input.total, 'El total')) fail('El total no coincide con los productos.');
  const sale = canonicalSale(input, products);
  if (sale.totalCost > 1000000000) fail('El costo del ticket supera el límite técnico permitido.');
  return sale;
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
