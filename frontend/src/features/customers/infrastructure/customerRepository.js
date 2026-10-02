import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeCustomers = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'customers'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const saveCustomer = (id, data) => setDoc(doc(db, 'customers', id), data, { merge: true });
export const deleteCustomer = id => deleteDoc(doc(db, 'customers', id));
