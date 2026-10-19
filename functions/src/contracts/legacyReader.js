import { FieldPath } from 'firebase-admin/firestore';
import { actorFor } from '../core/authorization.js';
import { documentId, SaleError } from '../sales/domain/saleModel.js';
import { ensureLegacyPaymentsMigrated } from './legacyLedger.js';

export const MIGRATION_PROOF_VERSION = 2;
export function verifiedMigration(marker, businessId) {
  return marker?.businessId === businessId && marker.proofVersion === MIGRATION_PROOF_VERSION
    && marker.complete === true && marker.verified === true && marker.needsReview === false;
}

// The caller's transaction observes legacy arrays and ledger at the same snapshot.
export async function readLegacyPaymentPage(database, input, { transaction } = {}) {
  const businessId = documentId(input.businessId), branchId = input.branchId ?? 'global';
  const read = reference => transaction ? transaction.get(reference) : reference.get();
  const marker = (await read(database.doc('contract_migrations/' + businessId))).data();
  if (verifiedMigration(marker, businessId)) return { payments: [], manualReview: 0, partialMigrations: 0, nextCursor: null };
  if (branchId !== 'global') documentId(branchId);
  const start = input.startDate == null ? null : new Date(input.startDate).getTime();
  const end = input.endDate == null ? null : new Date(input.endDate).getTime();
  if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) || (start !== null && end !== null && end < start)) {
    throw new SaleError('invalid-payment', 'Período inválido.');
  }
  if (input.sessionId) documentId(input.sessionId);
  let query = database.collection('contracts').where('businessId', '==', businessId).orderBy(FieldPath.documentId()).limit(50);
  if (input.cursor) query = query.startAfter(documentId(input.cursor));
  const documents = input.contractId ? [await read(database.doc(`contracts/${documentId(input.contractId)}`))] : (await read(query)).docs;
  const payments = [];
  let manualReview = 0, partialMigrations = 0;
  for (const document of documents) {
    const original = document.data();
    if (!original || original.businessId !== businessId || original.payments === undefined) continue;
    try {
      const prepare = async tx => {
        const current = transaction ? original : (await tx.get(document.ref)).data();
        if (!current || current.businessId !== businessId || current.payments === undefined) return null;
        return ensureLegacyPaymentsMigrated(tx, database, document.ref, current, { maxNewPayments: 10000 });
      };
      const planned = transaction ? await prepare(transaction) : await database.runTransaction(prepare);
      if (!planned) continue;
      if (planned.missing.length && planned.payments.length > planned.missing.length) partialMigrations++;
      payments.push(...planned.missing.filter(payment => (branchId === 'global' || payment.branchId === branchId)
        && (!input.sessionId || payment.sessionId === input.sessionId)
        && (start === null || payment.occurredAt.toMillis() >= start) && (end === null || payment.occurredAt.toMillis() <= end))
        .map(payment => ({ ...payment, occurredAt: payment.occurredAt.toDate().toISOString(), createdAt: payment.createdAt.toDate().toISOString() })));
    } catch (error) {
      if (['migration-required', 'invalid-ledger'].includes(error.code)) manualReview++;
      else throw error;
    }
  }
  return { payments, manualReview, partialMigrations, nextCursor: !input.contractId && documents.length === 50 ? documents.at(-1).id : null };
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
