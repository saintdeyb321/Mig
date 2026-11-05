import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import { collection, query, where, onSnapshot, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { brand } from '../../../config/brand';
import { acceptInvitation } from './acceptInvitation.js';

// Tenant equality is sufficient under owner Rules; avoid the unnecessary role inequality
// (which excludes historical documents without role and requires an extra index).
export const subscribeUsers = (businessId, _role, onData, onError) => onSnapshot(
  query(collection(db, 'users'), where('businessId', '==', businessId)), { includeMetadataChanges: true },
  snapshot => onData(mapDocuments(snapshot), snapshot.metadata), error => onError(withQueryContext(error, 'personnel')),
);
export const subscribeInvites = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'invites'), where('businessId', '==', businessId)), { includeMetadataChanges: true },
  snapshot => onData(mapDocuments(snapshot).map(invite => ({ ...invite, isInvite: true })), snapshot.metadata), error => onError(withQueryContext(error, 'personnel')),
);
export const getProfileFromServer = async uid => {
  const snapshot = await getDocFromServer(doc(db, 'users', uid));
  return { data: snapshot.exists() ? snapshot.data() : null, metadata: snapshot.metadata };
};
export const updateUser = confirmedWrite((uid, data) => updateDoc(doc(db, 'users', uid), data));
export const createInvite = confirmedWrite((email, data) => setDoc(doc(db, 'invites', email), data));
export const deleteInvite = confirmedWrite(email => deleteDoc(doc(db, 'invites', email)));
export const getUser = async uid => {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
};
export const getInvite = async email => {
  const snapshot = await getDoc(doc(db, 'invites', email));
  return snapshot.exists() ? snapshot.data() : null;
};
export const createInvitedProfile = confirmedWrite((uid, data) => setDoc(doc(db, 'users', uid), data));
export const getInviteFromServer = async email => {
  const snapshot = await getDocFromServer(doc(db, 'invites', email));
  return snapshot.exists() ? snapshot.data() : null;
};
export const acceptInvitedProfile = user => acceptInvitation(db, user);
export const subscribeProfile = (uid, onData, onError) => onSnapshot(
  doc(db, 'users', uid), { includeMetadataChanges: true },
  snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata), onError,
);
export const acceptTerms = confirmedWrite(uid => updateDoc(doc(db, 'users', uid), {
  hasAcceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: brand.termsVersion,
}), { profileOnly: true });
