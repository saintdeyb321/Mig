import { SaleError, money, MONEY_TOLERANCE, documentId } from '../../sales/domain/saleModel.js';

export const COMMERCIAL_FIELDS = ['clientName', 'clientPhone', 'deliveryDate', 'details', 'deliveryType',
  'deliveryAddress', 'deliveryCost', 'subtotal', 'total', 'referenceImages'];
const fail = (code, message) => { throw new SaleError(code, message); };
export function operationId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail('invalid-contract', 'La operación requiere un UUID válido.');
  }
  return value.toLowerCase();
}
export function contractAmount(value, { positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('invalid-payment', 'Importe inválido.');
  let amount;
  try { amount = money(value); } catch { fail('invalid-payment', 'Importe inválido.'); }
  if (positive && amount <= 0) fail('invalid-payment', 'El importe debe ser mayor que cero.');
  return amount;
}
export function paymentMethod(value) {
  if (!['efectivo', 'yape', 'plin'].includes(value)) fail('invalid-payment', 'Método de pago inválido.');
  return value;
}
function text(value, max, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) fail('invalid-contract', 'Texto del pedido inválido.');
  return value.trim();
}
export function commercialFields(input, { businessId, contractId, allowLegacyImages = false }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid-contract', 'Pedido inválido.');
  const subtotal = contractAmount(input.subtotal ?? 0);
  const deliveryCost = contractAmount(input.deliveryCost ?? 0);
  const total = contractAmount(input.total);
  if (Math.abs(total - money(subtotal + deliveryCost)) >= MONEY_TOLERANCE) fail('invalid-contract', 'El total no coincide con subtotal y delivery.');
  let deliveryDate = null;
  if (input.deliveryDate != null && input.deliveryDate !== '') {
    const raw = input.deliveryDate?.toDate ? input.deliveryDate.toDate() : input.deliveryDate;
    if (!(typeof raw === 'string' || raw instanceof Date)) fail('invalid-contract', 'Fecha de entrega inválida.');
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) fail('invalid-contract', 'Fecha de entrega inválida.');
    deliveryDate = date.toISOString();
  }
  const result = { clientName: text(input.clientName, 200, 'Cliente'), clientPhone: text(input.clientPhone, 60),
    deliveryDate, details: text(input.details, 10000), deliveryType: text(input.deliveryType, 150, 'recojo_local'),
    deliveryAddress: text(input.deliveryAddress, 1000), subtotal, deliveryCost, total };
  if (!result.clientName || !result.deliveryType) fail('invalid-contract', 'Cliente y tipo de entrega son obligatorios.');
  if (input.referenceImages !== undefined && !allowLegacyImages) {
    if (!Array.isArray(input.referenceImages) || input.referenceImages.length > 20) fail('invalid-contract', 'Máximo 20 imágenes de referencia.');
    const base = `contracts/${documentId(businessId)}/${documentId(contractId)}/`;
    const validPath = (path, thumbnail) => typeof path === 'string' && path.startsWith(base)
      && new RegExp(`^${thumbnail ? 'thumbs/' : ''}[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`).test(path.slice(base.length));
    const seen = new Set();
    result.referenceImages = input.referenceImages.map(image => {
      if (!image || typeof image !== 'object' || Array.isArray(image) || !validPath(image.storagePath, false)
        || (image.thumbnailPath != null && !validPath(image.thumbnailPath, true))
        || !['image/jpeg', 'image/png', 'image/webp'].includes(image.contentType) || seen.has(image.storagePath)) {
        fail('invalid-contract', 'Metadata de imagen inválida o fuera del negocio/pedido.');
      }
      seen.add(image.storagePath);
      return { storagePath: image.storagePath, ...(image.thumbnailPath ? { thumbnailPath: image.thumbnailPath } : {}), contentType: image.contentType };
    });
  }
  return result;
}
export function financialProjection(total, payments, currentStatus = 'pendiente') {
  const paidTotal = money(payments.reduce((sum, payment) => {
    if (typeof payment.amount !== 'number' || !Number.isFinite(payment.amount)
      || !['advance', 'payment', 'refund'].includes(payment.type)
      || (payment.type === 'refund' ? payment.amount >= 0 : payment.amount <= 0)) fail('invalid-ledger', 'El ledger contiene un movimiento inválido.');
    return sum + payment.amount;
  }, 0));
  if (paidTotal < -MONEY_TOLERANCE) fail('invalid-ledger', 'Los reembolsos superan los ingresos.');
  const balance = Math.max(0, money(total - paidTotal));
  const delivered = ['entregado', 'entregado_con_deuda'].includes(currentStatus);
  const status = currentStatus === 'cancelado' ? 'cancelado' : delivered
    ? (balance > 0 ? 'entregado_con_deuda' : 'entregado')
    : balance === 0 ? 'listo_para_entrega' : currentStatus === 'en_produccion' ? 'en_produccion' : 'pendiente';
  return { paidTotal: Math.max(0, paidTotal), balance, status };
}
export function assertPaymentWithinBalance(amount, balance) {
  if (amount - balance >= MONEY_TOLERANCE) fail('overpayment', 'El pago supera el saldo pendiente.');
}
