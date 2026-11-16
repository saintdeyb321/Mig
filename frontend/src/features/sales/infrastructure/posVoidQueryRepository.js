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
      const scope = scoped(businessId, branchId);
      const batches = [null, null];
      let closed = false;
      const stop = () => {
        if (closed) return;
        closed = true;
        batches.forEach(batch => batch?.stop?.());
      };
      const fail = error => {
        if (closed) return;
        stop();
        onError(withQueryContext(error, 'pos-voids-ids'));
      };
      const publish = (observedDocumentCount = 0) => {
        if (closed) return;
        const active = batches.filter(Boolean);
        onData(active.flatMap(batch => batch.rows), {
          fromCache: active.some(batch => !batch.confirmed), observedDocumentCount,
        });
      };
      const update = ids => {
        if (closed) return;
        const next = new Set(ids);
        if (next.size > 50) throw new Error('Hasta 50 tickets por consulta de compensaciones.');
        if ([...next].some(id => typeof id !== 'string' || !id || id.includes('/'))) throw new Error('ID de ticket inválido.');
        // Leave retained IDs in their existing batch so a new ticket only restarts the affected query.
        const remaining = new Set(next);
        const grouped = batches.map(batch => (batch?.ids ?? []).filter(id => remaining.delete(id)));
        for (const id of remaining) grouped.find(group => group.length < 30).push(id);
        const replaced = [];
        grouped.forEach((ids, index) => {
          const key = JSON.stringify(ids.sort()), previous = batches[index];
          if (!ids.length && !previous || previous?.key === key) return;
          previous?.stop?.();
          batches[index] = ids.length ? { ids, key, confirmed: false, rows: [] } : null;
          if (ids.length) replaced.push(index);
        });
        for (const index of replaced) {
          if (closed) break;
          const batch = batches[index];
          const unsubscribe = onSnapshot(query(collection(database, 'pos_voids'), ...scope, where('saleId', 'in', batch.ids)),
            { includeMetadataChanges: true }, snapshot => {
              if (closed || batches[index] !== batch) return;
              const rows = snapshot.docs.filter(row => row.metadata.hasPendingWrites === false);
              const receipts = rows.map(row => ({ ...row.data(), id: row.id }));
              if (receipts.some(row => row.businessId !== businessId || (branchId !== 'global' && row.branchId !== branchId)
                || !batch.ids.includes(row.saleId))) {
                fail(Object.assign(new Error('La compensación no pertenece al negocio o sede consultados.'), { code: 'permission-denied' }));
                return;
              }
              batch.confirmed = snapshot.metadata.fromCache === false && snapshot.metadata.hasPendingWrites === false
                && rows.length === snapshot.docs.length;
              batch.rows = receipts.filter(row => row.saleId === row.id).map(row => ({ ...row, serverConfirmed: batch.confirmed }));
              publish(snapshot.size);
            }, error => { if (batches[index] === batch) fail(error); });
          batch.stop = unsubscribe;
          if (closed) unsubscribe();
        }
        publish();
      };
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
