import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';

export function createCashStateReader(database, { sdk = firestoreSDK } = {}) {
  const { getDocs, query, collection, where, limit } = sdk;
  return async (businessId, branchId, userId = null) => {
    const open = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
      where('branchId', '==', branchId), ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
    return mapDocuments(open)[0] ?? null;
  };
}
