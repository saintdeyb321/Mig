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

export function createCashStateReader(database, { sdk = firestoreSDK } = {}) {
  const { query, collection, where, limit } = sdk;
  const readDocs = sdk.getDocsFromServer ?? sdk.getDocs;
  const getDocs = checkedRead(readDocs, 'cash-open');
  return async (businessId, branchId, userId = null) => {
    const open = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
      where('branchId', '==', branchId), ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
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
