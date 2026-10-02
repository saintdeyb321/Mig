import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

function periodQuery(businessId, branchId, startDate, endDate) {
  return query(collection(db, 'daily_stats'), where('businessId', '==', businessId),
    where('date', '>=', startDate), where('date', '<=', endDate),
    ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]));
}
export const getDailyStats = async (businessId, branchId, startDate, endDate) => mapDocuments(
  await getDocs(periodQuery(businessId, branchId, startDate, endDate)),
);
export const subscribeDailyStats = (businessId, branchId, startDate, endDate, onData, onError) => onSnapshot(
  periodQuery(businessId, branchId, startDate, endDate), snapshot => onData(mapDocuments(snapshot)), onError,
);
