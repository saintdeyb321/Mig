import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export function subscribeRecentSales(businessId, branchId, onData, onError) {
  return onSnapshot(query(collection(db, 'sales'), where('businessId', '==', businessId),
    ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]),
    orderBy('createdAt', 'desc'), limit(50)), { includeMetadataChanges: true },
  snapshot => onData(snapshot.docs.map(document => ({
    ...document.data(), id: document.id, isOffline: document.metadata.hasPendingWrites,
  }))), onError);
}
export const getSessionSales = async session => mapDocuments(await getDocs(query(
  collection(db, 'sales'), where('businessId', '==', session.businessId),
  where('branchId', '==', session.branchId), where('sessionId', '==', session.id),
)));

export const getSalesInPeriod = async (businessId, startDate, endDate) => mapDocuments(await getDocs(query(
  collection(db, 'sales'), where('businessId', '==', businessId),
  where('createdAt', '>=', startDate), where('createdAt', '<=', endDate),
)));
