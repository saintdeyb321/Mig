import { collection, query, where, getDocs, orderBy, limit, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const findOpenSession = async (businessId, branchId, userId = null) => {
  const snapshot = await getDocs(query(collection(db, 'cash_sessions'),
    where('businessId', '==', businessId), where('branchId', '==', branchId),
    ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
  return mapDocuments(snapshot)[0] || null;
};
export const findLastClosedSession = async (businessId, branchId) => {
  const snapshot = await getDocs(query(collection(db, 'cash_sessions'),
    where('businessId', '==', businessId), where('branchId', '==', branchId),
    where('status', '==', 'closed'), orderBy('closedAt', 'desc'), limit(1)));
  return mapDocuments(snapshot)[0] || null;
};
export const createSession = data => addDoc(collection(db, 'cash_sessions'), data);
export const updateSession = (id, data) => updateDoc(doc(db, 'cash_sessions', id), data);

export const getSessionsOpenedInPeriod = async (businessId, startDate, endDate) => mapDocuments(await getDocs(query(
  collection(db, 'cash_sessions'), where('businessId', '==', businessId),
  where('openedAt', '>=', startDate), where('openedAt', '<=', endDate),
)));
