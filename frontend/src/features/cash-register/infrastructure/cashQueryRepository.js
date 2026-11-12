import { NEW_CASH_DURATION_HOURS, cashExpiryWindow } from '../domain/cashExpiry.js';
import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { cashLockId } from './sparkCashRepository.js';

export const CASH_PAGE_SIZE = 200;
export function createCashPeriodReader(database, { sdk = firestoreSDK, project = value => value } = {}) {
  const { getDocsFromServer, query, collection, where, orderBy, documentId, startAfter, limit, Timestamp } = sdk;
  return async (field, businessId, startDate, endDate, branchId = 'global', { maxRows = 10000, pageSize = CASH_PAGE_SIZE, signal } = {}) => {
    const start = toDateSafe(startDate), end = toDateSafe(endDate);
    if (!businessId || !['openedAt', 'closedAt'].includes(field) || !start || !end || start > end
      || !Number.isSafeInteger(maxRows) || maxRows < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > CASH_PAGE_SIZE) throw new Error('Período o límite de cajas inválido.');
    const readPage = checkedRead(getDocsFromServer, 'cash-period', signal), rows = new Map();
    for (const [first, last] of [[start.toISOString(), end.toISOString()], [Timestamp.fromDate(start), Timestamp.fromDate(end)]]) {
      let cursor, scanned = 0;
      while (true) {
        const size = Math.min(pageSize, maxRows - scanned + 1);
        const page = await readPage(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
          ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]), where(field, '>=', first), where(field, '<=', last),
          orderBy(field), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(size)));
        if (page.metadata?.fromCache || page.metadata?.hasPendingWrites) throw new Error('La auditoría de caja requiere datos confirmados por el servidor.');
        scanned += page.size;
        for (const session of mapDocuments(page)) rows.set(session.id, project(session));
        if (scanned > maxRows || rows.size > maxRows) throw new Error('Demasiadas cajas (máximo ' + maxRows + '). Selecciona un período menor; no se exportó un informe parcial.');
        if (page.size < size) break;
        const next = page.docs.at(-1);
        if (!next || next.id === cursor?.id) throw new Error('La paginación de cajas no avanzó.');
        cursor = next;
      }
    }
    return [...rows.values()];
  };
}

export function createCashAuditPeriodReader(database, options) {
  const read = createCashPeriodReader(database, options);
  return async (businessId, start, end, branchId, readOptions) => {
    const startDate = toDateSafe(start);
    if (!startDate) throw new Error('Período de cajas inválido.');
    // The longest shift may have started on the preceding day. Reuse the opening index.
    const [opened, closed] = await Promise.all([read('openedAt', businessId, +startDate - NEW_CASH_DURATION_HOURS * 3600000, end, branchId, readOptions),
      read('closedAt', businessId, start, end, branchId, readOptions)]);
    const sessions = [...new Map([...opened.filter(session => session.status === 'expired_unreconciled'
      || (session.status === 'open' && cashExpiryWindow(session)?.expiresAt >= startDate)
      || +toDateSafe(session.openedAt) >= +startDate), ...closed].map(session => [session.id, session])).values()];
    if (sessions.length > 10000) throw new Error('Demasiadas cajas. Selecciona un período menor.');
    return sessions;
  };
}

export function createCashStateReader(database, { sdk = firestoreSDK } = {}) {
  const { query, collection, where, limit } = sdk;
  const readDocs = sdk.getDocsFromServer ?? sdk.getDocs;
  const getDocs = checkedRead(readDocs, 'cash-open');
  const getDoc = checkedRead(sdk.getDocFromServer, 'cash-lock');
  return async (businessId, branchId, userId = null, { forOpening = false } = {}) => {
    if (!userId) {
      const lock = await getDoc(sdk.doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId)));
      if (lock.metadata?.hasPendingWrites || lock.metadata?.fromCache) throw new Error('El candado de caja está pendiente de confirmar.');
      if (lock.exists() && lock.data().runtime === 'spark') {
        const active = lock.data();
        if (active.businessId !== businessId || active.branchId !== branchId || active.status !== 'open'
          || typeof active.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(active.sessionId)) throw new Error('El candado de caja requiere revisión administrativa.');
        // During opening the transaction checks the authoritative lock and prior session together.
        // The preflight is only needed to catch historical open sessions without a Spark lock.
        if (forOpening) return null;
        const snapshot = await getDoc(sdk.doc(database, 'cash_sessions', active.sessionId));
        const session = snapshot.data();
        if (snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache || session?.status !== 'open'
          || session.businessId !== businessId || session.branchId !== branchId || session.userId !== active.userId || session.runtime !== 'spark') {
          throw new Error('La caja no coincide con el candado verificado. Comprueba su estado.');
        }
        return { ...session, id: snapshot.id };
      }
    }
    const open = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
      where('branchId', '==', branchId), ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
    if (open.metadata?.hasPendingWrites || open.metadata?.fromCache) throw new Error('El estado de la caja está pendiente de confirmar en el servidor.');
    return mapDocuments(open)[0] ?? null;
  };
}

export function createCashAvailabilityWatcher(database, { sdk = firestoreSDK } = {}) {
  const scopes = new Map();
  return (businessId, branchId, sessionId, onReleased, onError) => {
    const key = JSON.stringify([businessId, branchId]);
    let entry = scopes.get(key);
    if (!entry) {
      entry = { observers: new Set(), stop: () => {}, closed: false, fingerprint: undefined };
      scopes.set(key, entry);
      const scope = entry;
      void cashLockId(businessId, branchId).then(id => {
        if (scope.closed) return;
        scope.stop = sdk.onSnapshot(sdk.doc(database, 'active_cash_sessions', id), { includeMetadataChanges: true }, snapshot => {
          if (scope.closed || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          const data = snapshot.exists() ? snapshot.data() : null;
          const fingerprint = data ? JSON.stringify([data.sessionId, data.userId, data.status, data.runtime]) : 'empty';
          const first = scope.fingerprint === undefined;
          if (!first && scope.fingerprint === fingerprint) return;
          scope.fingerprint = fingerprint;
          for (const observer of scope.observers) {
            if (!first || (data?.sessionId ?? null) !== (observer.sessionId ?? null)) observer.onReleased();
          }
        }, error => { if (!scope.closed) for (const observer of scope.observers) observer.onError(error); });
      }).catch(error => { if (!scope.closed) for (const observer of scope.observers) observer.onError(error); });
    }
    const observer = { sessionId, onReleased, onError };
    entry.observers.add(observer);
    return () => {
      entry.observers.delete(observer);
      if (!entry.observers.size) { entry.closed = true; entry.stop(); scopes.delete(key); }
    };
  };
}
