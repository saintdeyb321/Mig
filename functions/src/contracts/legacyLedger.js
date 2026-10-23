import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { SaleError, money, MONEY_TOLERANCE, documentId } from '../sales/domain/saleModel.js';
import { planLegacyPayments } from './domain/legacyPaymentPlan.js';
import { financialProjection } from './domain/contractModel.js';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const migrationError = message => { throw new SaleError('migration-required', message); };
export const legacyPaymentPlan = (contractId, contract) => planLegacyPayments(contractId, contract, {
  digest, timestampFromDate: value => Timestamp.fromDate(value),
});

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
  const validId = id => { try { return id !== 'global' && !!documentId(id); } catch { return false; } };
  const branchIds = [...new Set([contract.branchId, ...missing.map(payment => payment.branchId),
    ...sessionDocs.map(doc => doc.data()?.branchId)].filter(validId))];
  const branchDocs = branchIds.length ? await transaction.getAll(...branchIds.map(id => database.doc(`branches/${documentId(id)}`))) : [];
  const validBranches = new Set(branchDocs.filter(doc => doc.data()?.businessId === contract.businessId).map(doc => doc.id));
  for (const payment of missing) {
    const session = payment.sessionId ? sessions.get(payment.sessionId) : null;
    if (session && session.businessId !== contract.businessId) migrationError('Caja histórica fuera del tenant; requiere revisión.');
    if (validBranches.has(payment.branchId)) payment.branchResolution = 'verified-payment';
    else if (session && validBranches.has(session.branchId)) {
      payment.branchId = session.branchId; payment.branchResolution = 'verified-session';
    } else if (validBranches.has(contract.branchId)) {
      payment.branchId = contract.branchId; payment.branchResolution = 'inferred-contract';
    } else migrationError('Pago antiguo sin sede física verificable; requiere revisión.');
    if (session && validBranches.has(session.branchId) && session.branchId !== payment.branchId) {
      migrationError('Sede histórica y caja no coinciden; requiere revisión.');
    }
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
  const migration = contract.paymentsMigrated !== true || contract.payments !== undefined ? { paymentsMigrated: true, paymentsMigratedAt: Timestamp.fromMillis(now()),
    ...(contract.payments !== undefined ? { payments: FieldValue.delete() } : {}) } : {};
  return { payments: all, missing, migration,
    write: (limit = missing.length) => { for (const { id, ...payment } of missing.slice(0, limit)) transaction.create(database.doc(`payments/${id}`), payment); } };
}
