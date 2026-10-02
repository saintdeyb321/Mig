import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeBranches = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'branches'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const createBranch = data => addDoc(collection(db, 'branches'), data);
export const updateBranch = (id, data) => updateDoc(doc(db, 'branches', id), data);
