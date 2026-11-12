import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';

export const SALES_PAGE_SIZE = 200;
const reportLimit = maxRows => Object.assign(new Error(`Demasiados tickets (máximo ${maxRows}). Selecciona un período menor.`), { code: 'report-limit' });
export function createSalesPeriodReader(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, orderBy, documentId, startAfter, limit, getDocsFromServer, Timestamp } = sdk;
  return async (businessId, startDate, endDate, { branchId = 'global', maxRows = 10000, signal } = {}) => {
    if (!businessId || !Number.isSafeInteger(maxRows) || maxRows < 1 || !Number.isFinite(+startDate) || !Number.isFinite(+endDate) || endDate < startDate) throw new Error('Consulta de ventas inválida.');
    const readPage = checkedRead(getDocsFromServer, 'sales-period', signal);
    const rows = new Map();
    const ranges = [
      ['confirmedAt', Timestamp.fromDate(startDate), Timestamp.fromDate(endDate), true],
      ['createdAt', Timestamp.fromDate(startDate), Timestamp.fromDate(endDate), false],
      ['createdAt', startDate.toISOString(), endDate.toISOString(), false],
    ];
    for (const [field, from, to, spark] of ranges) {
      let cursor, scanned = 0;
      do {
        const pageSize = Math.min(SALES_PAGE_SIZE, maxRows - scanned + 1);
        const page = await readPage(query(collection(database, 'sales'), where('businessId', '==', businessId),
          ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]),
          where(field, '>=', from), where(field, '<=', to), orderBy(field), orderBy(documentId()),
          ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)));
        scanned += page.size;
        if (scanned > maxRows) throw reportLimit(maxRows);
        for (const row of mapDocuments(page)) {
          if (spark ? row.status !== 'confirmed' : row.confirmedAt != null) continue;
          rows.set(row.id, { ...row, createdAt: row.confirmedAt ?? row.createdAt, isOffline: false });
        }
        if (rows.size > maxRows) throw reportLimit(maxRows);
        cursor = page.size === pageSize ? page.docs.at(-1) : null;
      } while (cursor);
    }
    return [...rows.values()];
  };
}

export function createSalesSessionReader(database, { sdk = firestoreSDK } = {}) {
  const { getDocsFromServer, query, collection, where, orderBy, documentId, startAfter, limit } = sdk;
  return async (session, { maxRows = 10000, signal } = {}) => {
    const rows = [], readPage = checkedRead(getDocsFromServer, 'sales-session', signal);
    let cursor;
    do {
      const size = Math.min(SALES_PAGE_SIZE, maxRows - rows.length + 1);
      const page = await readPage(query(collection(database, 'sales'), where('businessId', '==', session.businessId),
        where('branchId', '==', session.branchId), where('sessionId', '==', session.id), orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []), limit(size)));
      if (page.metadata?.fromCache || page.metadata?.hasPendingWrites) throw new Error('Los tickets del turno no están confirmados por el servidor.');
      rows.push(...mapDocuments(page));
      if (rows.length > maxRows) throw new Error(`La caja supera ${maxRows} tickets; requiere revisión.`);
      cursor = page.size === size ? page.docs.at(-1) : null;
    } while (cursor);
    return rows;
  };
}
