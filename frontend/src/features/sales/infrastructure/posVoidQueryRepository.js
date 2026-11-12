import * as firestore from 'firebase/firestore';
import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';

export function createPosVoidReader(database, { sdk = firestore } = {}) {
  const { collection, doc, query, where, orderBy, documentId, limit, startAfter, Timestamp, getDocsFromServer, onSnapshot } = sdk;
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
      if (result.metadata?.fromCache || result.metadata?.hasPendingWrites) throw new Error('Hay compensaciones sin confirmación del servidor.');
      rows.push(...mapDocuments(result));
      if (rows.length > maxRows) throw new Error('Compensaciones por encima del límite: reduce el período. No se exporta un resultado parcial.');
      cursor = result.size === size ? result.docs.at(-1) : null;
    } while (cursor);
    return rows;
  }
  return {
    bySession: (session, options) => read(session.businessId, session.branchId, [where('sessionId', '==', session.id)], options),
    inPeriod: (businessId, start, end, branchId = 'global', options) => {
      start = toDateSafe(start); end = toDateSafe(end);
      if (!start || !end || end < start) throw new Error('Período de compensaciones inválido.');
      return read(businessId, branchId, [where('occurredAt', '>=', Timestamp.fromDate(start)), where('occurredAt', '<=', Timestamp.fromDate(end))], options);
    },
    subscribeIds(businessId, branchId, ids, onData, onError) {
      scoped(businessId, branchId);
      const values = new Map(), metadata = new Map(), stops = new Map();
      let wanted = new Set();
      let closed = false, failed = false;
      const fail = error => { if (!closed && !failed) { failed = true; onError(withQueryContext(error, 'pos-voids-ids')); } };
      const publish = (observedDocumentCount = 0) => {
        if (closed || failed) return;
        onData([...values.values()].flat(), { fromCache: metadata.size < wanted.size || [...metadata.values()].some(value => value.fromCache || value.hasPendingWrites), observedDocumentCount });
      };
      // An ID-in list evaluates missing documents as null resources. Individual gets use the
      // existing absent-receipt permission while every existing document remains tenant/branch scoped.
      const update = next => {
        if (closed) return;
        next = [...new Set(next)];
        if (next.length > 50) throw new Error('Hasta 50 tickets por consulta de compensaciones.');
        if (next.some(id => typeof id !== 'string' || !id || id.includes('/'))) throw new Error('ID de ticket inválido.');
        wanted = new Set(next);
        for (const [id, stop] of stops) if (!wanted.has(id)) { stop(); stops.delete(id); values.delete(id); metadata.delete(id); }
        for (const id of next) if (!stops.has(id)) {
          stops.set(id, onSnapshot(doc(database, 'pos_voids', id), { includeMetadataChanges: true }, snapshot => {
            if (closed || failed || !wanted.has(id)) return;
            const row = snapshot.exists() ? snapshot.data() : null;
            if (row && (row.businessId !== businessId || (branchId !== 'global' && row.branchId !== branchId))) {
              fail(Object.assign(new Error('La compensación no pertenece al negocio o sede consultados.'), { code: 'permission-denied' })); return;
            }
            values.set(id, row && snapshot.metadata.hasPendingWrites === false ? [{ ...row, id: snapshot.id,
              serverConfirmed: snapshot.metadata.fromCache === false }] : []); metadata.set(id, snapshot.metadata);
            publish(row ? 1 : 0);
          }, fail));
        }
        publish();
      };
      const stop = () => { closed = true; stops.forEach(stop => stop()); stops.clear(); };
      stop.update = update;
      update(ids);
      return stop;
    },
  };
}

// A read-only projection for the cash calculator; the immutable compensation is its authority.
export const voidCashPayments = rows => rows.flatMap(row => [['efectivo', row.cashAmount], ['yape', row.digitalAmount]]
  .filter(([, amount]) => amount < 0).map(([method, amount]) => ({ ...row, id: `pos-void:${row.id}:${method}`, sourceId: row.saleId,
    sourceType: 'sale', type: 'refund', method, amount, runtime: 'spark', physicalDisbursementVerified: false })));
