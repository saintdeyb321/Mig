import * as firestore from 'firebase/firestore';
import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';

export function createPosVoidReader(database, { sdk = firestore } = {}) {
  const { collection, query, where, orderBy, documentId, limit, startAfter, Timestamp, getDocsFromServer, onSnapshot } = sdk;
  const scoped = (businessId, branchId) => {
    if (!businessId || businessId === 'platform-admin' || !branchId) throw new Error('Negocio y sede requeridos para leer compensaciones.');
    return [where('businessId', '==', businessId), ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)])];
  };
  async function read(businessId, branchId, filters, { maxRows = 10000, signal } = {}) {
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error('Límite de compensaciones inválido.');
    const base = scoped(businessId, branchId), rows = [], page = checkedRead(getDocsFromServer, 'pos-voids', signal);
    let cursor;
    do {
      const size = Math.min(200, maxRows - rows.length + 1);
      const result = await page(query(collection(database, 'pos_voids'), ...base, ...filters, orderBy('occurredAt'), orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []), limit(size)));
      rows.push(...mapDocuments(result));
      if (rows.length > maxRows) throw new Error('Compensaciones por encima del límite: reduce el período. No se exporta un resultado parcial.');
      cursor = result.size === size ? result.docs.at(-1) : null;
    } while (cursor);
    return rows;
  }
  return {
    bySession: session => read(session.businessId, session.branchId, [where('sessionId', '==', session.id)]),
    inPeriod: (businessId, start, end, branchId = 'global', options) => {
      start = toDateSafe(start); end = toDateSafe(end);
      if (!start || !end || end < start) throw new Error('Período de compensaciones inválido.');
      return read(businessId, branchId, [where('occurredAt', '>=', Timestamp.fromDate(start)), where('occurredAt', '<=', Timestamp.fromDate(end))], options);
    },
    subscribeIds(businessId, branchId, ids, onData, onError) {
      ids = [...new Set(ids)];
      if (ids.length > 50) throw new Error('Hasta 50 tickets por consulta de compensaciones.');
      if (!ids.length) { onData([], { fromCache: false }); return () => {}; }
      const values = new Map(), metadata = new Map(), base = scoped(businessId, branchId);
      const total = Math.ceil(ids.length / 10);
      const stops = Array.from({ length: total }, (_, index) => onSnapshot(query(collection(database, 'pos_voids'), ...base,
        where(documentId(), 'in', ids.slice(index * 10, index * 10 + 10)), limit(10)), { includeMetadataChanges: true }, snapshot => {
        values.set(index, mapDocuments({ docs: snapshot.docs.filter(row => !row.metadata?.hasPendingWrites) })); metadata.set(index, snapshot.metadata);
        onData([...values.values()].flat(), { fromCache: metadata.size < total || [...metadata.values()].some(value => value.fromCache || value.hasPendingWrites),
          observedDocumentCount: snapshot.size });
      }, error => onError(withQueryContext(error, 'pos-voids-ids'))));
      return () => stops.forEach(stop => stop());
    },
  };
}

// A read-only projection for the cash calculator; the immutable compensation is its authority.
export const voidCashPayments = rows => rows.flatMap(row => [['efectivo', row.cashAmount], ['yape', row.digitalAmount]]
  .filter(([, amount]) => amount < 0).map(([method, amount]) => ({ ...row, id: `pos-void:${row.id}:${method}`, sourceId: row.saleId,
    sourceType: 'sale', type: 'refund', method, amount, runtime: 'spark' })));
