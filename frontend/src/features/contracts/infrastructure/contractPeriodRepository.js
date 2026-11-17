import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';

export function createContractPeriodReader(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, orderBy, documentId, startAfter, limit, getDocsFromServer, Timestamp } = sdk;
  return async (businessId, start, end, branchId = 'global', maxRows = 10000, { signal } = {}) => {
    if (!businessId || !Number.isFinite(+start) || !Number.isFinite(+end) || end < start || !Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error('Período de contratos inválido.');
    const readPage = checkedRead(getDocsFromServer, 'contracts-period', signal);
    const rows = new Map();
    for (const [from, to] of [[Timestamp.fromDate(start), Timestamp.fromDate(end)], [start.toISOString(), end.toISOString()]]) {
      let cursor;
      do {
        const page = await readPage(query(collection(database, 'contracts'), where('businessId', '==', businessId),
          ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]), where('createdAt', '>=', from), where('createdAt', '<=', to),
          orderBy('createdAt'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
        for (const row of page.docs) rows.set(row.id, { ...row.data(), id: row.id });
        if (rows.size > maxRows) throw new Error('Demasiados contratos. Selecciona un período menor.');
        cursor = page.size === 200 ? page.docs.at(-1) : null;
      } while (cursor);
    }
    return [...rows.values()];
  };
}

export function createContractCancellationCountReader(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, orderBy, getCountFromServer, Timestamp } = sdk;
  return async (businessId, { startDate, endDate } = {}, { signal } = {}) => {
    if (typeof businessId !== 'string' || !businessId.trim() || !(startDate instanceof Date) || !(endDate instanceof Date)
      || !Number.isFinite(+startDate) || !Number.isFinite(+endDate) || endDate < startDate) throw new Error('Período de anulaciones de pedidos inválido.');
    signal?.throwIfAborted();
    let snapshot;
    try {
      snapshot = await getCountFromServer(query(collection(database, 'contracts'), where('businessId', '==', businessId),
        where('status', '==', 'cancelado'), where('voidedAt', '>=', Timestamp.fromDate(startDate)),
        where('voidedAt', '<=', Timestamp.fromDate(endDate)), orderBy('voidedAt', 'desc')));
    } catch (error) { throw withQueryContext(error, 'reports'); }
    signal?.throwIfAborted();
    const { count } = snapshot.data();
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('El total de pedidos anulados no es verificable.');
    return count;
  };
}
