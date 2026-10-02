import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeUsers = (businessId, role, onData, onError) => onSnapshot(
  query(collection(db, 'users'), where('businessId', '==', businessId),
    ...(role === 'superadmin' ? [] : [where('role', '!=', 'superadmin')])),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const subscribeInvites = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'invites'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot).map(invite => ({ ...invite, isInvite: true }))), onError,
);
export const updateUser = (uid, data) => updateDoc(doc(db, 'users', uid), data);
export const createInvite = (email, data) => setDoc(doc(db, 'invites', email), data);
export const deleteInvite = email => deleteDoc(doc(db, 'invites', email));
export const getUser = async uid => {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
};
export const getInvite = async email => {
  const snapshot = await getDoc(doc(db, 'invites', email));
  return snapshot.exists() ? snapshot.data() : null;
};
export const createInvitedProfile = (uid, data) => setDoc(doc(db, 'users', uid), data);
export const subscribeProfile = (uid, onData, onError) => onSnapshot(
  doc(db, 'users', uid), snapshot => onData(snapshot.exists() ? snapshot.data() : null), onError,
);
export const acceptTerms = uid => updateUser(uid, {
  hasAcceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: '1.1',
});
