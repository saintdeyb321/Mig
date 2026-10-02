import {
  collection, query, where, onSnapshot, getDocs, orderBy, limit, startAfter, documentId, and, or,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { callBackend } from '../../../core/firebase/callable';

export const ACTIVE_CONTRACT_STATUSES = ['pendiente', 'en_produccion', 'listo_para_entrega', 'entregado_con_deuda'];
export const CLOSED_CONTRACT_STATUSES = ['entregado', 'cancelado'];
export const ACTIVE_CONTRACT_LIMIT = 100;
export const CONTRACT_HISTORY_PAGE_SIZE = 25;

export const subscribeActiveContracts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'contracts'), where('businessId', '==', businessId),
    where('status', 'in', ACTIVE_CONTRACT_STATUSES), orderBy('deliveryDate', 'asc'),
    orderBy(documentId(), 'asc'), limit(ACTIVE_CONTRACT_LIMIT)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);

export async function getContractHistoryPage(businessId, cursor = null) {
  const constraints = [where('businessId', '==', businessId),
    where('status', 'in', CLOSED_CONTRACT_STATUSES), orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(CONTRACT_HISTORY_PAGE_SIZE));
  const snapshot = await getDocs(query(collection(db, 'contracts'), ...constraints));
  return {
    contracts: mapDocuments(snapshot),
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.size === CONTRACT_HISTORY_PAGE_SIZE,
  };
}

export const createContractDocument = payload => callBackend('createContract', payload);
export const updateContractDocument = (contractId, changes) => callBackend('updateContract', { contractId, changes });
export const addContractPayment = payload => callBackend('addContractPayment', payload);
export const cancelContractDocument = payload => callBackend('cancelContract', payload);
export const markContractDelivered = contractId => callBackend('markContractDelivered', { contractId });

// Commercial reports retain their existing reader until the report DTO phase.
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
