import { calculateCashTotals } from './domain/cashTotals.js';
import { money } from '../sales/domain/saleModel.js';
import { writeAuditEvent } from '../audit/events.js';
import { Timestamp } from 'firebase-admin/firestore';
import { readLegacyPaymentPage } from '../contracts/legacyReader.js';

export async function readCashTotals(transaction, database, sessionId, session, { saleOverride } = {}) {
  const legacy = [];
  let cursor = null, manualReview = 0, partialMigrations = 0;
  do {
    const page = await readLegacyPaymentPage(database, { businessId: session.businessId, branchId: session.branchId, sessionId, cursor }, { transaction });
    legacy.push(...page.payments); manualReview += page.manualReview; partialMigrations += page.partialMigrations; cursor = page.nextCursor;
  } while (cursor);
  const scoped = collection => database.collection(collection).where('businessId', '==', session.businessId)
    .where('branchId', '==', session.branchId).where('sessionId', '==', sessionId);
  const [salesDocs, paymentDocs] = await Promise.all([transaction.get(scoped('sales')), transaction.get(scoped('payments'))]);
  const sales = new Map(salesDocs.docs.map(doc => [doc.id, doc.data()]));
  if (saleOverride) sales.set(saleOverride.id, saleOverride.data);
  const payments = paymentDocs.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const merged = [...new Map([...legacy, ...payments].map(payment => [payment.id, payment])).values()];
  try {
    return { ...calculateCashTotals(session, [...sales.values()], merged), totalsComplete: manualReview === 0,
      requiresFinancialReview: manualReview > 0, legacyPartialMigrations: partialMigrations };
  } catch (error) {
    if (error.code !== 'invalid-ledger') throw error;
    return { totalsComplete: false, requiresFinancialReview: true, legacyPartialMigrations: partialMigrations };
  }
}
export function incompleteCashProjection(session) {
  const projection = { totalsComplete: false, requiresFinancialReview: true, reconciliationPending: true, status: 'closed_with_discrepancy' };
  for (const key of ['openingAmount', 'posCash', 'contractCash', 'totalCash', 'digitalTotal', 'totalYape', 'expectedCash',
    'totalSales', 'validTransactionCount', 'declaredAmount', 'difference', 'discrepancy', 'expectedAmount']) projection[key] = session[key] ?? null;
  return projection;
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
  const projection = totals.totalsComplete ? closingProjection(totals, session.declaredAmount ?? null) : incompleteCashProjection(session);
  return () => {
    transaction.update(reference, { ...projection, reconciledAt: Timestamp.fromMillis(now),
      financialRevision: (session.financialRevision ?? 0) + 1 });
    writeAuditEvent(transaction, database, { businessId: session.businessId, branchId: session.branchId,
      type: 'CASH_RECONCILED', sourceType: 'cash_session', sourceId: sessionId, actorId: actor.uid, actorName: actor.name,
      operationId, occurredAt: Timestamp.fromMillis(now), metadata: { expectedCash: projection.expectedCash,
        difference: projection.difference, sessionUserId: session.userId, requiresFinancialReview: projection.requiresFinancialReview === true } });
  };
}
