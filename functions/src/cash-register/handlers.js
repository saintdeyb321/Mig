import { Timestamp } from 'firebase-admin/firestore';
import { actorFor, authorizeBranch } from '../core/authorization.js';
import { documentId, SaleError, money } from '../sales/domain/saleModel.js';
import { OFFLINE_WINDOW_MS, milliseconds } from '../sales/sessionWindow.js';

const closingFields = ['declaredAmount', 'expectedCash', 'discrepancy', 'totalSales', 'totalCash', 'totalYape', 'closingNote', 'autoClosed'];
const openingFields = ['openingAmount', 'expectedCash', 'mismatchOnOpening', 'openingDiscrepancy', 'openingNote'];
function selected(data, keys) {
  return Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => {
    const value = data[key];
    if (['openingNote', 'closingNote'].includes(key)) {
      if (value !== null && (typeof value !== 'string' || value.length > 2000)) throw new SaleError('invalid-session', 'Nota de caja inválida.');
    } else if (['autoClosed', 'mismatchOnOpening'].includes(key)) {
      if (typeof value !== 'boolean') throw new SaleError('invalid-session', 'Estado de caja inválido.');
    } else money(value);
    return [key, value];
  }));
}

export function createCashSessionHandler(database, { now = Date.now } = {}) {
  return async request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const { sessionId, branchId, action, offline = false, session = {} } = request.data ?? {};
    documentId(sessionId);
    if (!['reserve', 'open', 'close'].includes(action) || typeof offline !== 'boolean') throw new SaleError('invalid-session', 'Operación de caja inválida.');
    await authorizeBranch(transaction, database, actor, branchId);
    const reference = database.doc(`cash_sessions/${sessionId}`);
    const previous = (await transaction.get(reference)).data();
    if (previous && (previous.businessId !== actor.businessId || previous.branchId !== branchId
      || (action !== 'close' && previous.userId !== actor.uid))) {
      throw new SaleError('permission-denied', 'Caja de otra identidad.');
    }
    const time = now();
    const serverTime = Timestamp.fromMillis(time);
    let data;
    if (action === 'reserve') {
      if (previous) return sessionDTO(sessionId, previous);
      data = { businessId: actor.businessId, branchId, userId: actor.uid, cashierName: actor.name, status: 'reserved',
        financialWindow: { start: serverTime, expiresAt: Timestamp.fromMillis(time + OFFLINE_WINDOW_MS) } };
    } else if (action === 'open') {
      if (previous && previous.status !== 'reserved') {
        if (previous.status === 'open' || (offline && session.openedAt === previous.openedAt)) return sessionDTO(sessionId, previous);
        throw new SaleError('closed-session', 'Una caja cerrada no se puede reabrir.');
      }
      let opened = time;
      if (offline) {
        if (!previous?.financialWindow) throw new SaleError('unverified-session', 'La apertura offline requiere autorización previa de servidor.');
        opened = milliseconds(session.openedAt);
        if (opened < milliseconds(previous.financialWindow.start) || opened > milliseconds(previous.financialWindow.expiresAt) || opened > time) {
          throw new SaleError('invalid-session', 'Apertura fuera de la autorización offline.');
        }
      }
      const fields = selected(session, openingFields);
      if (typeof fields.openingAmount !== 'number' || fields.openingAmount < 0) throw new SaleError('invalid-session', 'Monto de apertura inválido.');
      data = { ...fields, businessId: actor.businessId, branchId, userId: actor.uid, cashierName: actor.name,
        status: 'open', openedAt: new Date(opened).toISOString(),
        financialWindow: { start: previous?.financialWindow?.start ?? serverTime,
          openedAt: Timestamp.fromMillis(opened), expiresAt: previous?.financialWindow?.expiresAt ?? Timestamp.fromMillis(time + OFFLINE_WINDOW_MS) } };
    } else {
      if (!previous) throw new SaleError('invalid-session', 'Caja inexistente.');
      if (['closed', 'closed_with_discrepancy'].includes(previous.status)) return sessionDTO(sessionId, previous);
      if (previous.status !== 'open') throw new SaleError('invalid-session', 'La caja no está abierta.');
      if (!['closed', 'closed_with_discrepancy'].includes(session.status)) throw new SaleError('invalid-session', 'Cierre de caja inválido.');
      const closed = offline ? milliseconds(session.closedAt) : time;
      const start = milliseconds(previous.financialWindow?.openedAt ?? previous.openedAt);
      if (closed < start || closed > time) throw new SaleError('invalid-session', 'Fecha de cierre inválida.');
      data = { ...previous, ...selected(session, closingFields), status: session.status,
        closedAt: new Date(closed).toISOString(), closedByUid: actor.uid,
        ...(previous.financialWindow ? { financialWindow: { ...previous.financialWindow, closedAt: Timestamp.fromMillis(closed) } } : {}) };
    }
    data.syncedAt = serverTime;
    transaction.set(reference, data);
    return sessionDTO(sessionId, data);
  });
}

function sessionDTO(id, data) {
  return { ...data, id, syncedAt: data.syncedAt?.toDate?.().toISOString() ?? null,
    ...(data.financialWindow ? { financialWindow: Object.fromEntries(Object.entries(data.financialWindow).map(([key, value]) => [key, value.toDate().toISOString()])) } : {}) };
}
