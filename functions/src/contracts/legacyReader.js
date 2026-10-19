import { FieldPath } from 'firebase-admin/firestore';
import { actorFor } from '../core/authorization.js';
import { documentId, SaleError } from '../sales/domain/saleModel.js';
import { ensureLegacyPaymentsMigrated } from './legacyLedger.js';

// Temporary bounded compatibility reader; ledger documents always take precedence.
export async function readLegacyPaymentPage(database, input) {
    const businessId = documentId(input.businessId);
    const branchId = input.branchId ?? 'global';
    if ((await database.doc('contract_migrations/' + businessId).get()).data()?.complete === true) {
      return { payments: [], manualReview: 0, nextCursor: null };
    }
    if (branchId !== 'global') documentId(branchId);
    const start = input.startDate == null ? null : new Date(input.startDate).getTime();
    const end = input.endDate == null ? null : new Date(input.endDate).getTime();
    if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end))) throw new SaleError('invalid-payment', 'Período inválido.');
    if (input.sessionId) documentId(input.sessionId);
    let query = database.collection('contracts').where('businessId', '==', businessId).orderBy(FieldPath.documentId()).limit(50);
    if (input.cursor) query = query.startAfter(documentId(input.cursor));
    const documents = input.contractId ? [await database.doc(`contracts/${documentId(input.contractId)}`).get()] : (await query.get()).docs;
    const payments = [];
    let manualReview = 0;
    for (const document of documents) {
      const original = document.data();
      if (!original || original.businessId !== businessId || original.paymentsMigrated === true || !original.payments?.length) continue;
      try {
        const fallback = await database.runTransaction(async transaction => {
          const current = (await transaction.get(document.ref)).data();
          if (!current || current.businessId !== businessId || current.paymentsMigrated === true) return [];
          const existing = await transaction.get(database.collection('payments').where('businessId', '==', businessId)
            .where('sourceId', '==', document.id).limit(1));
          if (!existing.empty) return [];
          return (await ensureLegacyPaymentsMigrated(transaction, database, document.ref, current, { maxNewPayments: 10000 })).payments;
        });
        payments.push(...fallback.filter(payment => (branchId === 'global' || payment.branchId === branchId)
          && (!input.sessionId || payment.sessionId === input.sessionId)
          && (start === null || payment.occurredAt.toMillis() >= start) && (end === null || payment.occurredAt.toMillis() <= end))
          .map(payment => ({ ...payment, occurredAt: payment.occurredAt.toDate().toISOString(), createdAt: payment.createdAt.toDate().toISOString() })));
      } catch (error) {
        if (['migration-required', 'invalid-ledger'].includes(error.code)) manualReview++;
        else throw error;
      }
    }
    return { payments, manualReview, nextCursor: !input.contractId && documents.length === 50 ? documents.at(-1).id : null };
}
export function createLegacyPaymentReader(database) {
  return async request => {
    const actor = await database.runTransaction(tx => actorFor(tx, database, request.auth?.uid));
    const input = request.data ?? {};
    const branchId = input.branchId ?? (actor.role === 'cajero' ? actor.branchId : 'global');
    if (actor.role === 'cajero' && branchId !== actor.branchId) throw new SaleError('permission-denied', 'Sede no autorizada.');
    return readLegacyPaymentPage(database, { ...input, businessId: actor.businessId, branchId });
  };
}
