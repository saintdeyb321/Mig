import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { createBranchWriter } from './branchWrites.js';
import { db, auth } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeBranches = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'branches'), where('businessId', '==', businessId)), { includeMetadataChanges: true },
  snapshot => onData(mapDocuments(snapshot), snapshot.metadata), onError,
);
const save = createBranchWriter(db, { currentUser: () => auth.currentUser });
export const createBranch = (data, id = doc(collection(db, 'branches')).id) => save(id, data, { create: true });
export const updateBranch = (id, data) => save(id, data);
