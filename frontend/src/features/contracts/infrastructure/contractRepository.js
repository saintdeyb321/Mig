import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, runTransaction, getDocs, and, or } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeContracts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'contracts'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const createContractDocument = data => addDoc(collection(db, 'contracts'), data);
export const updateContractDocument = (id, data) => updateDoc(doc(db, 'contracts', id), data);

// The caller calculates the patch; the adapter owns the transactional read/write.
export function transformContract(id, buildPatch) {
  const reference = doc(db, 'contracts', id);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    transaction.update(reference, await buildPatch(snapshot.data()));
  });
}

export const getBranchContracts = async (businessId, branchId) => mapDocuments(await getDocs(query(
  collection(db, 'contracts'), and(where('businessId', '==', businessId),
    or(where('branchId', '==', branchId), where('deliveryType', '==', branchId))),
)));

export const getContractsForReport = async (businessId, branchId) => branchId === 'global'
  ? mapDocuments(await getDocs(query(collection(db, 'contracts'), where('businessId', '==', businessId))))
  : getBranchContracts(businessId, branchId);

export const getContractsUpdatedInPeriod = async (businessId, startDate, endDate) => mapDocuments(await getDocs(query(
  collection(db, 'contracts'), where('businessId', '==', businessId),
  where('updatedAt', '>=', startDate), where('updatedAt', '<=', endDate),
)));
