import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';

export const subscribeLicense = (businessId, onData, onError) => onSnapshot(
  doc(db, 'licenses', businessId), snapshot => onData(snapshot.exists() ? snapshot.data() : null), onError,
);
