import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';

export const subscribeSettings = (businessId, onData, onError) => onSnapshot(
  doc(db, 'settings', businessId), snapshot => onData(snapshot.exists() ? snapshot.data() : null), onError,
);
export const saveSettings = (businessId, data) => setDoc(
  doc(db, 'settings', businessId), { ...data, businessId }, { merge: true },
);
