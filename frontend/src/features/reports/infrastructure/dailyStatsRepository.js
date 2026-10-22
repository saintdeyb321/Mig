import { collection, query, where, onSnapshot, getDocs, orderBy, documentId, startAfter, limit } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

function periodQuery(businessId, branchId, startDate, endDate) {
  return query(collection(db, 'daily_stats'), where('businessId', '==', businessId),
    where('date', '>=', startDate), where('date', '<=', endDate),
    ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]));
}
export const getDailyStats = async (businessId, branchId, startDate, endDate) => {
  const rows = [];
  let cursor;
  do {
    const page = await getDocs(query(periodQuery(businessId, branchId, startDate, endDate), orderBy('date'), orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []), limit(Math.min(200, 10001 - rows.length))));
    rows.push(...mapDocuments(page));
    if (rows.length > 10000) throw new Error('Demasiados agregados. Selecciona una sede o período menor.');
    if (page.size < 200) return rows;
    cursor = page.docs.at(-1);
  } while (cursor);
  return rows;
};
export const subscribeDailyStats = (businessId, branchId, startDate, endDate, onData, onError) => onSnapshot(
  periodQuery(businessId, branchId, startDate, endDate), snapshot => onData(mapDocuments(snapshot)), onError,
);
