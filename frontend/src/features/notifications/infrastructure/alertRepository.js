import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeUnreadAlerts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'alerts'), where('businessId', '==', businessId), where('read', '==', false)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const acknowledgeAlert = id => updateDoc(doc(db, 'alerts', id), { read: true });
export const createAlert = data => addDoc(collection(db, 'alerts'), data);
export const upsertAlert = (id, data) => setDoc(doc(db, 'alerts', id), data, { merge: true });
