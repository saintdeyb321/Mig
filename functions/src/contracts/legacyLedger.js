import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { SaleError, money, MONEY_TOLERANCE, documentId } from '../sales/domain/saleModel.js';
import { financialProjection } from './domain/contractModel.js';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const migrationError = message => { throw new SaleError('migration-required', message); };
function stable(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function historicalDate(value) {
  const raw = value?.toDate ? value.toDate() : value;
  if (raw == null || !(typeof raw === 'string' || raw instanceof Date)) migrationError('Pago antiguo sin fecha verificable; requiere revisión.');
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) migrationError('Fecha de pago antiguo inválida; requiere revisión.');
  return date;
}
export function legacyPaymentPlan(contractId, contract) {
  if (contract.paymentsMigrated === true || contract.payments === undefined) return [];
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
    const occurredAt = Timestamp.fromDate(historicalDate(payment.occurredAt ?? payment.date));
    const legacyHash = digest(stable(payment));
    const base = { businessId: documentId(contract.businessId), sourceId: contractId, sourceType: 'contract',
      contractNumber: contract.contractNumber ?? contract.contractId ?? contractId, clientName: contract.clientName ?? '',
      type, occurredAt, userId: payment.userId ?? payment.cashierId ?? contract.createdBy ?? 'legacy-unknown',
      cashierName: payment.cashierName ?? contract.creatorName ?? 'Registro anterior',
      sessionId: payment.sessionId ?? null, branchId: payment.branchId ?? null,
      legacyIndex: index, legacyContentHash: legacyHash, legacy: true, ...(payment.reason ? { reason: String(payment.reason) } : {}) };
    const method = String(payment.method ?? '').toLowerCase();
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

export function remainingIncomePayments(payments) {
  const income = payments.filter(payment => payment.amount > 0).map(payment => ({ ...payment, remaining: money(payment.amount) }))
    .sort((a, b) => (a.occurredAt?.toMillis?.() ?? 0) - (b.occurredAt?.toMillis?.() ?? 0) || a.id.localeCompare(b.id));
  for (const refund of payments.filter(payment => payment.amount < 0)) {
    let amount = money(-refund.amount);
    const candidates = refund.reversesPaymentId ? income.filter(payment => payment.id === refund.reversesPaymentId)
      : income.filter(payment => payment.method === refund.method);
    for (const payment of candidates) {
      const applied = Math.min(payment.remaining, amount);
      payment.remaining = money(payment.remaining - applied); amount = money(amount - applied);
      if (amount === 0) break;
    }
    if (amount >= MONEY_TOLERANCE) throw new SaleError('invalid-ledger', 'Reembolso sin ingreso original suficiente; requiere revisión.');
  }
  return income.filter(payment => payment.remaining > 0);
}

// Prepares all reads before any caller writes, preserving transaction atomicity.
export async function ensureLegacyPaymentsMigrated(transaction, database, reference, contract, { now = Date.now, maxNewPayments = 400 } = {}) {
  const snapshot = await transaction.get(database.collection('payments')
    .where('businessId', '==', contract.businessId).where('sourceId', '==', reference.id));
  const payments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const plan = legacyPaymentPlan(reference.id, contract);
  const ids = new Set(payments.map(payment => payment.id));
  const missing = plan.filter(payment => !ids.has(payment.id));
  if (missing.length > maxNewPayments) migrationError('Historial extenso: ejecuta primero la migración administrativa reanudable.');
  const sessionIds = [...new Set(missing.map(payment => payment.sessionId).filter(Boolean))];
  const sessionDocs = sessionIds.length ? await transaction.getAll(...sessionIds.map(id => database.doc(`cash_sessions/${documentId(id)}`))) : [];
  const sessions = new Map(sessionDocs.map(doc => [doc.id, doc.data()]));
  for (const payment of missing) {
    const session = payment.sessionId ? sessions.get(payment.sessionId) : null;
    if (payment.sessionId && (!session || session.businessId !== contract.businessId)) migrationError('Caja histórica ausente o fuera del tenant; requiere revisión.');
    payment.branchId = payment.branchId ?? session?.branchId ?? contract.branchId;
    if (!payment.branchId || payment.branchId === 'global') migrationError('Pago antiguo sin sede física verificable; requiere revisión.');
    documentId(payment.branchId);
    if (session && session.branchId !== payment.branchId) migrationError('Sede histórica y caja no coinciden; requiere revisión.');
    payment.legacyBranchSource = payment.branchId === (plan.find(row => row.id === payment.id)?.branchId)
      ? 'payment' : session ? 'session' : 'contract';
    // Preserve historical digital session linkage if it existed; new digital entries always use null.
    payment.createdAt = Timestamp.fromMillis(now());
  }
  // Detect occupied deterministic IDs even when a corrupt document was hidden by tenant query filters.
  if (missing.length) {
    const occupied = await transaction.getAll(...missing.map(payment => database.doc(`payments/${payment.id}`)));
    if (occupied.some(doc => doc.exists)) migrationError('Conflicto en identificadores de migración.');
  }
  for (const original of plan) {
    const existing = payments.find(payment => payment.id === original.id);
    if (existing && (existing.legacyContentHash !== original.legacyContentHash || existing.amount !== original.amount
      || existing.method !== original.method || existing.sourceType !== 'contract')) migrationError('Un movimiento migrado no coincide con su origen.');
  }
  const all = [...payments, ...missing];
  financialProjection(contract.total, all, contract.status);
  remainingIncomePayments(all);
  const migration = contract.paymentsMigrated !== true ? { paymentsMigrated: true, paymentsMigratedAt: Timestamp.fromMillis(now()),
    ...(contract.payments !== undefined ? { payments: FieldValue.delete() } : {}) } : {};
  return { payments: all, missing, migration,
    write: () => { for (const { id, ...payment } of missing) transaction.create(database.doc(`payments/${id}`), payment); } };
}
