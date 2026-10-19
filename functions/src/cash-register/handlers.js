import { Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { actorFor, authorizeBranch } from '../core/authorization.js';
import { documentId, SaleError, money, saleDay } from '../sales/domain/saleModel.js';
import { OFFLINE_WINDOW_MS, milliseconds } from '../sales/sessionWindow.js';
import { readCashTotals, closingProjection } from './sessionTotals.js';
import { writeAuditEvent } from '../audit/events.js';
import { createLegacyPaymentReader } from '../contracts/legacyReader.js';

export const cashLockId = (businessId, branchId) => createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex');
const fail = (code, message) => { throw new SaleError(code, message); };
function amount(value) {
  if (typeof value !== 'number' || value < 0) fail('invalid-session', 'Importe de caja inválido.');
  return money(value);
}
function note(value = '') {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 2000) fail('invalid-session', 'Nota de caja inválida.');
  return value.trim();
}
async function openingDifference(transaction, database, businessId, branchId, openedAt, openingAmount) {
  const last = await transaction.get(database.collection('cash_sessions').where('businessId', '==', businessId)
    .where('branchId', '==', branchId).where('status', 'in', ['closed', 'closed_with_discrepancy'])
    .where('closedAt', '<=', new Date(openedAt).toISOString()).orderBy('closedAt', 'desc').limit(1));
  const previous = last.docs[0]?.data();
  return previous?.declaredAmount != null && saleDay({ createdAt: previous.closedAt }) === saleDay({ createdAt: new Date(openedAt) })
    ? money(openingAmount - previous.declaredAmount) : 0;
}
export function sessionDTO(id, data) {
  return { ...data, id, syncedAt: data.syncedAt?.toDate?.().toISOString() ?? null,
    ...(data.financialWindow ? { financialWindow: Object.fromEntries(Object.entries(data.financialWindow)
      .map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value])) } : {}) };
}

export function createCashSessionHandlers(database, { now = Date.now } = {}) {
  const readLegacy = createLegacyPaymentReader(database);
  async function legacyForSession(request, sessionId) {
    const actor = await database.runTransaction(tx => actorFor(tx, database, request.auth?.uid));
    const session = (await database.doc('cash_sessions/' + sessionId).get()).data();
    if (!session || session.businessId !== actor.businessId || (actor.role === 'cajero' && session.userId !== actor.uid)) {
      fail('permission-denied', 'Caja fuera de tus permisos.');
    }
    let cursor = null;
    const payments = [];
    do {
      const page = await readLegacy({ auth: request.auth, data: { sessionId, branchId: session.branchId, cursor } });
      if (page.manualReview) fail('migration-required', 'Pagos históricos pendientes de revisión administrativa.');
      payments.push(...page.payments); cursor = page.nextCursor;
    } while (cursor);
    return payments;
  }
  async function handle(request, action) {
    const raw = request.data ?? {}, sessionId = documentId(raw.sessionId);
    const offline = raw.offline === true;
    const legacy = ['close', 'force', 'preview', 'reconcile'].includes(action) ? await legacyForSession(request, sessionId) : [];
    return database.runTransaction(async transaction => {
      const actor = await actorFor(transaction, database, request.auth?.uid);
      const reference = database.doc('cash_sessions/' + sessionId);
      const previous = (await transaction.get(reference)).data();
      const branchId = ['open', 'reserve'].includes(action) ? documentId(raw.branchId) : previous?.branchId;
      if (!branchId) fail('invalid-session', 'Caja inexistente.');
      await authorizeBranch(transaction, database, actor, branchId, actor.businessId, { requireActive: ['open', 'reserve'].includes(action) });
      if (previous && (previous.businessId !== actor.businessId || previous.branchId !== branchId)) fail('permission-denied', 'Caja fuera del negocio.');
      if (action === 'force' && !['dueño', 'superadmin'].includes(actor.role)) fail('permission-denied', 'El cierre forzado requiere administración.');
      if (previous && previous.userId !== actor.uid && !['force', 'preview'].includes(action)) fail('permission-denied', 'La caja pertenece a otro usuario.');
      if (action === 'preview' && previous.userId !== actor.uid && !['dueño', 'superadmin'].includes(actor.role)) fail('permission-denied', 'Conteo no autorizado.');
      const time = now(), timestamp = Timestamp.fromMillis(time);
      const lockReference = database.doc('active_cash_sessions/' + cashLockId(actor.businessId, branchId));
      const lock = (await transaction.get(lockReference)).data();
      const audit = (type, metadata = {}, operationId = '') => writeAuditEvent(transaction, database, {
        businessId: actor.businessId, branchId, type, sourceType: 'cash_session', sourceId: sessionId,
        actorId: actor.uid, actorName: actor.name, occurredAt: timestamp,
        metadata: { sessionUserId: previous?.userId ?? actor.uid, ...metadata }, operationId,
      });
      if (action === 'reserve' || action === 'open') {
        if (previous && previous.userId !== actor.uid) fail('permission-denied', 'Reserva de otra identidad.');
        if (action === 'reserve' && previous && previous.status === 'reserved' && milliseconds(previous.financialWindow.expiresAt) > time) {
          return sessionDTO(sessionId, previous);
        }
        const openingAmount = action === 'open' ? amount(raw.openingAmount) : null;
        const openingNote = note(raw.notes);
        const fingerprint = JSON.stringify([actor.uid, branchId, openingAmount, openingNote, offline ? raw.openedAt : null]);
        if (action === 'open' && previous && !['reserved', 'expired'].includes(previous.status)) {
          if (previous.status === 'open' || (offline && raw.openedAt === previous.openedAt)) {
            if (previous.openingFingerprint && previous.openingFingerprint !== fingerprint) fail('session-conflict', 'El ID de apertura tiene otro payload.');
            return sessionDTO(sessionId, previous);
          }
          fail('closed-session', 'Una caja cerrada no se puede reabrir.');
        }
        if (action === 'reserve' && previous) return sessionDTO(sessionId, previous);
        if (action === 'open' && offline && previous?.financialWindow && milliseconds(previous.financialWindow.expiresAt) <= time) {
          const opened = milliseconds(raw.openedAt), end = milliseconds(previous.financialWindow.expiresAt);
          if (opened < milliseconds(previous.financialWindow.start) || opened > end || opened > time) fail('invalid-session', 'Apertura offline inválida.');
          const historical = { ...previous, openingAmount, openingNote, openingFingerprint: fingerprint, openedAt: new Date(opened).toISOString(),
            financialWindow: { ...previous.financialWindow, openedAt: Timestamp.fromMillis(opened), closedAt: Timestamp.fromMillis(end) } };
          const totals = await readCashTotals(transaction, database, sessionId, historical);
          const data = { ...historical, ...closingProjection(totals, null), closedAt: new Date(end).toISOString(),
            autoClosed: true, reconciliationPending: true, syncedAt: timestamp };
          transaction.set(reference, data);
          if (lock?.sessionId === sessionId) transaction.delete(lockReference);
          audit('CASH_OPENED', { openingAmount }); audit('REGISTER_AUTO_CLOSED', { expectedCash: totals.expectedCash });
          return sessionDTO(sessionId, data);
        }
        const active = await transaction.get(database.collection('cash_sessions').where('businessId', '==', actor.businessId)
          .where('branchId', '==', branchId).where('status', '==', 'open').limit(2));
        if (active.docs.some(doc => doc.id !== sessionId)) fail('active-session', 'Ya existe una caja activa en esta sede.');
        if (lock && lock.sessionId !== sessionId && (lock.status === 'open' || milliseconds(lock.expiresAt) > time)) {
          if (action === 'reserve' && lock.userId === actor.uid && lock.status === 'reserved') {
            const existing = (await transaction.get(database.doc('cash_sessions/' + lock.sessionId))).data();
            if (existing?.status === 'reserved') return sessionDTO(lock.sessionId, existing);
          }
          fail('active-session', 'La sede ya tiene un turno o reserva offline activos.');
        }
        let opened = time;
        if (offline) {
          if (!previous?.financialWindow) fail('unverified-session', 'La apertura offline requiere autorización previa.');
          opened = milliseconds(raw.openedAt);
          if (opened < milliseconds(previous.financialWindow.start) || opened > milliseconds(previous.financialWindow.expiresAt) || opened > time) {
            fail('invalid-session', 'Apertura fuera de la autorización offline.');
          }
        }
        const expiresAt = offline ? previous.financialWindow.expiresAt : Timestamp.fromMillis(time + OFFLINE_WINDOW_MS);
        if (offline && milliseconds(expiresAt) <= time) fail('expired-session', 'Sincroniza el cierre offline para conservar el turno histórico.');
        let openingDiscrepancy = 0;
        if (action === 'open') {
          openingDiscrepancy = await openingDifference(transaction, database, actor.businessId, branchId, opened, openingAmount);
        }
        const data = { businessId: actor.businessId, branchId, userId: actor.uid, cashierName: actor.name,
          status: action === 'reserve' ? 'reserved' : 'open', syncedAt: timestamp,
          financialWindow: { start: previous?.financialWindow?.start ?? timestamp, expiresAt,
            ...(action === 'open' ? { openedAt: Timestamp.fromMillis(opened) } : {}) },
          ...(action === 'open' ? { openedAt: new Date(opened).toISOString(), openingAmount, openingNote, openingFingerprint: fingerprint,
            openingDiscrepancy, mismatchOnOpening: openingDiscrepancy !== 0 } : {}) };
        transaction.set(reference, data);
        transaction.set(lockReference, { businessId: actor.businessId, branchId, userId: actor.uid, sessionId, status: data.status, expiresAt });
        if (action === 'open') {
          audit('CASH_OPENED', { openingAmount });
          if (openingDiscrepancy !== 0) audit('SHIFT_MISMATCH', { difference: openingDiscrepancy });
        }
        return sessionDTO(sessionId, data);
      }
      if (!previous) fail('invalid-session', 'Caja inexistente.');
      const closed = ['closed', 'closed_with_discrepancy'].includes(previous.status);
      const lateOfflineClose = action === 'close' && offline && closed && previous.autoClosed
        && previous.declaredAmount == null && !previous.offlineCloseSynced;
      if (action !== 'preview' && action !== 'reconcile' && closed && !lateOfflineClose) return sessionDTO(sessionId, previous);
      if (action === 'reconcile' && !closed) fail('invalid-session', 'La caja todavía no está cerrada.');
      let session = previous, closedTime = time;
      const materializedOpening = offline && ['reserved', 'expired'].includes(previous.status);
      if (offline && ['reserved', 'expired'].includes(previous.status)) {
        const opened = milliseconds(raw.openedAt), end = milliseconds(previous.financialWindow.expiresAt);
        if (opened < milliseconds(previous.financialWindow.start) || opened > end || opened > time) fail('invalid-session', 'Apertura offline inválida.');
        session = { ...previous, openingAmount: amount(raw.openingAmount), openedAt: new Date(opened).toISOString(),
          financialWindow: { ...previous.financialWindow, openedAt: Timestamp.fromMillis(opened) } };
        session.openingDiscrepancy = await openingDifference(transaction, database, actor.businessId, branchId, opened, session.openingAmount);
        session.mismatchOnOpening = session.openingDiscrepancy !== 0;
      } else if (!closed && previous.status !== 'open') fail('invalid-session', 'Caja no abierta.');
      if (offline) {
        const reported = milliseconds(raw.closedAt);
        const start = milliseconds(session.financialWindow?.openedAt ?? session.openedAt);
        if (reported < start || reported > time) fail('invalid-session', 'Fecha de cierre offline inválida.');
        closedTime = Math.min(reported, milliseconds(session.financialWindow.expiresAt));
      }
      const totals = await readCashTotals(transaction, database, sessionId, session, { legacy });
      const declaredAmount = action === 'reconcile' ? previous.declaredAmount ?? null : amount(raw.declaredAmount);
      const projection = closingProjection(totals, declaredAmount);
      if (action === 'preview') return { ...projection, id: sessionId };
      const notes = action === 'reconcile' ? previous.closingNote ?? '' : note(raw.notes);
      const changed = JSON.stringify([previous.expectedCash, previous.difference]) !== JSON.stringify([projection.expectedCash, projection.difference]);
      const data = { ...session, ...projection, closedAt: previous.closedAt ?? new Date(closedTime).toISOString(),
        closedByUid: previous.closedByUid ?? actor.uid, closingNote: notes, syncedAt: timestamp,
        reconciliationPending: action === 'reconcile' ? false : offline,
        requiresFinancialReview: false,
        ...(offline && action === 'close' ? { offlineCloseSynced: true } : {}),
        financialWindow: { ...session.financialWindow, closedAt: lateOfflineClose
          ? Timestamp.fromMillis(Math.min(closedTime, milliseconds(session.financialWindow.closedAt)))
          : session.financialWindow?.closedAt ?? Timestamp.fromMillis(closedTime) } };
      if (action === 'reconcile') {
        if (previous.reconciliationPending || previous.requiresFinancialReview || changed) {
          data.financialRevision = (previous.financialRevision ?? 0) + 1;
          transaction.update(reference, data); audit('CASH_RECONCILED', { expectedCash: totals.expectedCash, difference: projection.difference },
            'final-' + data.financialRevision);
        }
      } else {
        transaction.set(reference, data);
        if (lock?.sessionId === sessionId) transaction.delete(lockReference);
        if (materializedOpening) {
          audit('CASH_OPENED', { openingAmount: session.openingAmount, offline: true });
          if (session.openingDiscrepancy !== 0) audit('SHIFT_MISMATCH', { difference: session.openingDiscrepancy });
        }
        audit(action === 'force' ? 'CASH_FORCE_CLOSED' : 'CASH_CLOSED', { expectedCash: totals.expectedCash, declaredAmount, difference: projection.difference });
      }
      if (projection.difference !== null && projection.difference !== 0 && !data.reconciliationPending && (action !== 'reconcile' || previous.reconciliationPending || changed)) {
        audit('CASH_DISCREPANCY', { expectedCash: totals.expectedCash, declaredAmount, difference: projection.difference },
          action === 'reconcile' ? 'final-' + data.financialRevision : 'close');
      }
      return sessionDTO(sessionId, data);
    });
  }
  return {
    openCashSession: request => handle(request, 'open'),
    reserveOfflineCashSession: request => handle(request, 'reserve'),
    closeCashSession: request => handle(request, 'close'),
    forceCloseCashSession: request => handle(request, 'force'),
    previewCashSessionClose: request => handle(request, 'preview'),
    reconcileCashSession: request => handle(request, 'reconcile'),
    saveCashSession: request => {
      const { action, session = {}, ...raw } = request.data ?? {};
      if (!['reserve', 'open', 'close'].includes(action)) fail('invalid-session', 'Operación de caja inválida.');
      return handle({ ...request, data: { ...raw, openingAmount: session.openingAmount, notes: session.openingNote ?? session.closingNote,
        openedAt: session.openedAt, closedAt: session.closedAt, declaredAmount: session.declaredAmount } }, action);
    },
  };
}
export const createCashSessionHandler = (database, options) => createCashSessionHandlers(database, options).saveCashSession;
