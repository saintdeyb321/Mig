import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';

export const subscribeSettings = (businessId, onData, onError) => onSnapshot(
  doc(db, 'settings', businessId), { includeMetadataChanges: true }, snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);
export const saveSettings = confirmedWrite((businessId, data) => setDoc(
  doc(db, 'settings', businessId), { ...data, businessId }, { merge: true },
));
