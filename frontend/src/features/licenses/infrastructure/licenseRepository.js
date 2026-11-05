import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';

export const subscribeLicense = (businessId, onData, onError) => onSnapshot(
  doc(db, 'licenses', businessId), { includeMetadataChanges: true },
  snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);
export const subscribeTenant = (businessId, onData, onError) => onSnapshot(
  doc(db, 'tenants', businessId), { includeMetadataChanges: true },
  snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);
