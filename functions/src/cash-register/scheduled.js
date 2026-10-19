import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { OFFLINE_WINDOW_MS, milliseconds } from '../sales/sessionWindow.js';
import { readCashTotals, closingProjection } from './sessionTotals.js';
import { cashLockId } from './handlers.js';
import { writeAuditEvent } from '../audit/events.js';
import { readLegacyPaymentPage } from '../contracts/legacyReader.js';

export function createCashAutoCloser(database, { now = Date.now } = {}) {
  return async () => {
    const cutoff = now(), seen = new Set();
    const summary = { closed: 0, expiredReservations: 0, skipped: 0, errors: 0 };
    const queries = [
      database.collection('cash_sessions').where('status', 'in', ['open', 'reserved'])
        .where('financialWindow.expiresAt', '<=', Timestamp.fromMillis(cutoff)).orderBy('financialWindow.expiresAt').orderBy(FieldPath.documentId()),
      database.collection('cash_sessions').where('status', '==', 'open')
        .where('openedAt', '<=', new Date(cutoff - OFFLINE_WINDOW_MS).toISOString()).orderBy('openedAt').orderBy(FieldPath.documentId()),
    ];
    for (const base of queries) {
      let cursor;
      do {
        const page = await (cursor ? base.startAfter(cursor) : base).limit(50).get();
        for (const doc of page.docs) {
          if (seen.has(doc.id)) continue;
          seen.add(doc.id);
          try {
            const original = doc.data();
            const legacy = [];
            let legacyCursor = null, manualReview = false;
            if (original.status === 'open') do {
              const result = await readLegacyPaymentPage(database, { businessId: original.businessId, branchId: original.branchId, sessionId: doc.id, cursor: legacyCursor });
              legacy.push(...result.payments); manualReview ||= result.manualReview > 0; legacyCursor = result.nextCursor;
            } while (legacyCursor);
            const result = await database.runTransaction(async transaction => {
              const session = (await transaction.get(doc.ref)).data();
              if (!session || !['open', 'reserved'].includes(session.status)) return 'skipped';
              const expiry = session.financialWindow?.expiresAt ? milliseconds(session.financialWindow.expiresAt)
                : milliseconds(session.openedAt) + OFFLINE_WINDOW_MS;
              if (expiry > cutoff) return 'skipped';
              const lockRef = database.doc('active_cash_sessions/' + cashLockId(session.businessId, session.branchId));
              const lock = (await transaction.get(lockRef)).data();
              const totals = session.status === 'open' ? await readCashTotals(transaction, database, doc.id, session, { legacy }) : null;
              const timestamp = Timestamp.fromMillis(cutoff);
              if (totals) {
                transaction.update(doc.ref, { ...closingProjection(totals, null), closedAt: new Date(cutoff).toISOString(),
                  autoClosed: true, closedByUid: 'system', requiresFinancialReview: manualReview, reconciliationPending: false,
                  ...(manualReview ? { expectedCash: null, expectedAmount: null } : {}),
                  financialWindow: { ...session.financialWindow, openedAt: session.financialWindow?.openedAt ?? Timestamp.fromMillis(milliseconds(session.openedAt)),
                    expiresAt: session.financialWindow?.expiresAt ?? Timestamp.fromMillis(expiry), closedAt: timestamp }, syncedAt: timestamp });
              } else transaction.update(doc.ref, { status: 'expired', syncedAt: timestamp });
              if (lock?.sessionId === doc.id) transaction.delete(lockRef);
              writeAuditEvent(transaction, database, { businessId: session.businessId, branchId: session.branchId,
                type: totals ? 'REGISTER_AUTO_CLOSED' : 'OFFLINE_RESERVATION_EXPIRED', sourceType: 'cash_session', sourceId: doc.id,
                actorId: 'system', actorName: 'Sistema', occurredAt: timestamp,
                metadata: { sessionUserId: session.userId, expectedCash: manualReview ? null : totals?.expectedCash ?? null, manualReview } });
              return totals ? 'closed' : 'expiredReservations';
            });
            summary[result]++;
          } catch { summary.errors++; }
        }
        cursor = page.size === 50 ? page.docs.at(-1) : null;
      } while (cursor);
    }
    return summary;
  };
}
