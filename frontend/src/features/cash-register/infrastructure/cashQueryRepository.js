import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';

export function createCashPeriodReader(database, { sdk = firestoreSDK, project = value => value } = {}) {
  const { getDocs, query, collection, where, limit, Timestamp } = sdk;
  return async (field, businessId, startDate, endDate, branchId = 'global') => {
    // Historical ISO strings and server Timestamps are different Firestore query types.
    const start = toDateSafe(startDate), end = toDateSafe(endDate);
    if (!start || !end || start > end) throw new Error('Período de cajas inválido.');
    const pages = await Promise.all([[start.toISOString(), end.toISOString()], [Timestamp.fromDate(start), Timestamp.fromDate(end)]].map(([first, last]) =>
      getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
        ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]), where(field, '>=', first), where(field, '<=', last), limit(10001)))));
    const rows = [...new Map(pages.flatMap(mapDocuments).map(session => [session.id, project(session)])).values()];
    if (rows.length > 10000) throw new Error('Demasiadas cajas. Selecciona un período menor.');
    return rows;
  };
}

export function createCashStateReader(database, { sdk = firestoreSDK } = {}) {
  const { getDocs, query, collection, where, limit } = sdk;
  return async (businessId, branchId, userId = null) => {
    const open = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
      where('branchId', '==', branchId), ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
    return mapDocuments(open)[0] ?? null;
  };
}
