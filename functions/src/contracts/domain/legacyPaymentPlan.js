import { SaleError, money, MONEY_TOLERANCE, documentId } from '../../sales/domain/saleModel.js';
const migrationError = message => { throw new SaleError('migration-required', message); };
export function stableLegacyValue(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableLegacyValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableLegacyValue(value[key])]));
  return value;
}
function historicalDate(value) {
  const raw = value?.toDate ? value.toDate() : value;
  if (raw == null || !(typeof raw === 'string' || raw instanceof Date)) migrationError('Pago antiguo sin fecha verificable; requiere revisión.');
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) migrationError('Fecha de pago antiguo inválida; requiere revisión.');
  return date;
}
export function planLegacyPayments(contractId, contract, { digest, timestampFromDate }) {
  if (contract.payments === undefined) return [];
  if (!Array.isArray(contract.payments)) migrationError('El historial antiguo de pagos es inválido.');
  const plan = [];
  for (const [index, payment] of contract.payments.entries()) {
    if (!payment || typeof payment !== 'object' || Array.isArray(payment)) migrationError('Movimiento antiguo inválido.');
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount === 0) migrationError('Importe antiguo inválido; requiere revisión.');
    const type = payment.type === 'reembolso' || payment.type === 'refund' || amount < 0 ? 'refund'
      : payment.type === 'adelanto' || payment.type === 'advance' ? 'advance' : 'payment';
    const signed = type === 'refund' ? -Math.abs(money(amount)) : money(amount);
    if (signed === 0) migrationError('Importe antiguo menor a la unidad monetaria.');
    const occurredAt = timestampFromDate(historicalDate(payment.occurredAt ?? payment.date));
    const legacyHash = digest(stableLegacyValue(payment));
    const base = { businessId: documentId(contract.businessId), sourceId: contractId, sourceType: 'contract',
      contractNumber: contract.contractNumber ?? contract.contractId ?? contractId, clientName: contract.clientName ?? '',
      type, occurredAt, userId: payment.userId ?? payment.cashierId ?? contract.createdBy ?? 'legacy-unknown',
      cashierName: payment.cashierName ?? contract.creatorName ?? 'Registro anterior',
      sessionId: payment.sessionId ?? null, branchId: payment.branchId ?? null,
      legacyIndex: index, legacyContentHash: legacyHash, legacy: true, legacyMethod: String(payment.method ?? ''),
      ...(payment.reason ? { reason: String(payment.reason) } : {}) };
    const method = String(payment.method ?? '').trim().toLowerCase().replace(/_taller$/, '');
    const parts = method === 'mixto' ? Object.entries(payment.splitPayments ?? {}) : [[method === 'yape/plin' ? 'yape' : method, Math.abs(signed)]];
    if (!parts.length || parts.some(([key, value]) => !['efectivo', 'yape', 'plin'].includes(key)
      || typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      || Math.abs(money(parts.reduce((sum, [, value]) => sum + value, 0)) - Math.abs(signed)) >= MONEY_TOLERANCE) {
      migrationError('Pago mixto/método antiguo sin desglose verificable; requiere revisión.');
    }
    for (const [component, value] of parts) {
      if (money(value) === 0) continue;
      const id = `legacy_${digest([contract.businessId, contractId, index, legacyHash, component])}`;
      plan.push({ ...base, id, operationId: id, method: component, amount: type === 'refund' ? -money(value) : money(value) });
    }
  }
  return plan;
}

