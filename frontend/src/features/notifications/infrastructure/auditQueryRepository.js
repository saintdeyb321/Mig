import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
export function createAuditRepository(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, orderBy, documentId, startAfter, limit, getDocs, Timestamp } = sdk;
  return {
    getAuditEventsPage: async (businessId, start, end, { branchId = 'global', cursor = null } = {}) => {
      const snapshot = await getDocs(query(collection(database, 'audit_events'), where('businessId', '==', businessId),
        ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]),
        where('occurredAt', '>=', Timestamp.fromDate(start)), where('occurredAt', '<=', Timestamp.fromDate(end)),
        orderBy('occurredAt', 'desc'), orderBy(documentId(), 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(30)));
      return { events: mapDocuments(snapshot), cursor: snapshot.docs.at(-1) ?? null, hasMore: snapshot.size === 30 };
    },
  };
}
