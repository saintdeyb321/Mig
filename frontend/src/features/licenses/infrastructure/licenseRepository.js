import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';

export const subscribeLicense = (businessId, onData, onError) => onSnapshot(
  doc(db, 'licenses', businessId), { includeMetadataChanges: true },
  snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);
export const subscribeTenant = (businessId, onData, onError) => onSnapshot(
  doc(db, 'tenants', businessId), { includeMetadataChanges: true },
  snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);

const readServer = async (name, businessId) => {
  const snapshot = await getDocFromServer(doc(db, name, businessId));
  return { data: snapshot.exists() ? snapshot.data() : null, metadata: snapshot.metadata };
};
export const getLicenseFromServer = businessId => readServer('licenses', businessId);
export const getTenantFromServer = businessId => readServer('tenants', businessId);
