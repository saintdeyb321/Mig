import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';

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
  const { getDocs: readDocs, query, collection, where, limit } = sdk;
  const getDocs = checkedRead(readDocs, 'cash-open');
  return async (businessId, branchId, userId = null) => {
    const open = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
      where('branchId', '==', branchId), ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
    return mapDocuments(open)[0] ?? null;
  };
}
