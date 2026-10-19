import { calculateCashTotals } from './domain/cashTotals.js';
import { money } from '../sales/domain/saleModel.js';
import { writeAuditEvent } from '../audit/events.js';
import { Timestamp } from 'firebase-admin/firestore';

export async function readCashTotals(transaction, database, sessionId, session, { legacy = [], saleOverride } = {}) {
  const scoped = collection => database.collection(collection).where('businessId', '==', session.businessId)
    .where('branchId', '==', session.branchId).where('sessionId', '==', sessionId);
  const [salesDocs, paymentDocs] = await Promise.all([transaction.get(scoped('sales')), transaction.get(scoped('payments'))]);
  const sales = new Map(salesDocs.docs.map(doc => [doc.id, doc.data()]));
  if (saleOverride) sales.set(saleOverride.id, saleOverride.data);
  const payments = paymentDocs.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const sources = new Set(payments.map(payment => payment.sourceId));
  return calculateCashTotals(session, [...sales.values()], [...payments, ...legacy.filter(payment => !sources.has(payment.sourceId))]);
}
export function closingProjection(totals, declaredAmount) {
  const difference = declaredAmount == null ? null : money(declaredAmount - totals.expectedCash);
  return { ...totals, declaredAmount, difference, discrepancy: difference, expectedAmount: totals.expectedCash,
    status: difference === 0 ? 'closed' : 'closed_with_discrepancy' };
}
// Late authorized offline tickets and historical voids must update the trusted closed-session projection.
export async function prepareClosedSessionReconciliation(transaction, database, sessionId, actor, saleOverride, operationId, now) {
  const reference = database.doc('cash_sessions/' + sessionId);
  const session = (await transaction.get(reference)).data();
  if (!session || session.businessId !== actor.businessId || !['closed', 'closed_with_discrepancy'].includes(session.status)) return () => {};
  const totals = await readCashTotals(transaction, database, sessionId, session, { saleOverride });
  const projection = closingProjection(totals, session.declaredAmount ?? null);
  if (session.requiresFinancialReview) {
    projection.expectedCash = null; projection.expectedAmount = null;
    projection.difference = null; projection.discrepancy = null; projection.status = 'closed_with_discrepancy';
  }
  return () => {
    transaction.update(reference, { ...projection, reconciledAt: Timestamp.fromMillis(now),
      financialRevision: (session.financialRevision ?? 0) + 1 });
    writeAuditEvent(transaction, database, { businessId: session.businessId, branchId: session.branchId,
      type: 'CASH_RECONCILED', sourceType: 'cash_session', sourceId: sessionId, actorId: actor.uid, actorName: actor.name,
      operationId, occurredAt: Timestamp.fromMillis(now), metadata: { expectedCash: projection.expectedCash,
        difference: projection.difference, sessionUserId: session.userId, requiresFinancialReview: !!session.requiresFinancialReview } });
  };
}
