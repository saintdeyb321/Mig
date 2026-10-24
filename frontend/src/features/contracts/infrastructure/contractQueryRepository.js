import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';

export const ACTIVE_CONTRACT_STATUSES = ['pendiente', 'en_produccion', 'listo_para_entrega', 'entregado_con_deuda'];
export const CLOSED_CONTRACT_STATUSES = ['entregado', 'cancelado'];
export const ACTIVE_CONTRACT_LIMIT = 100;
export const CONTRACT_HISTORY_PAGE_SIZE = 25;

export function createContractQueryRepository(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, onSnapshot, getDocsFromServer, orderBy, limit, startAfter, documentId } = sdk;
  return {
    subscribeActiveContracts: (businessId, onData, onError, { branchId = 'global' } = {}) => onSnapshot(
      query(collection(database, 'contracts'), where('businessId', '==', businessId),
        ...(branchId && branchId !== 'global' ? [where('branchId', '==', branchId)] : []), where('status', 'in', ACTIVE_CONTRACT_STATUSES), orderBy('deliveryDate', 'asc'),
        orderBy(documentId(), 'asc'), limit(ACTIVE_CONTRACT_LIMIT)), { includeMetadataChanges: true }, snapshot => onData(mapDocuments(snapshot), { ...snapshot.metadata, observedDocumentCount: snapshot.size }), error => onError(withQueryContext(error, 'contracts-active'))),
    getContractHistoryPage: async (businessId, cursor = null, { branchId = 'global' } = {}) => {
      const snapshot = await checkedRead(getDocsFromServer, 'contracts-history')(query(collection(database, 'contracts'), where('businessId', '==', businessId),
        ...(branchId && branchId !== 'global' ? [where('branchId', '==', branchId)] : []), ...(branchId && branchId !== 'global' ? [where('branchId', '==', branchId)] : []), where('status', 'in', CLOSED_CONTRACT_STATUSES), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'),
        ...(cursor ? [startAfter(cursor)] : []), limit(CONTRACT_HISTORY_PAGE_SIZE)));
      return { contracts: mapDocuments(snapshot), cursor: snapshot.docs.at(-1) ?? null,
        hasMore: snapshot.size === CONTRACT_HISTORY_PAGE_SIZE };
    },
  };
}
