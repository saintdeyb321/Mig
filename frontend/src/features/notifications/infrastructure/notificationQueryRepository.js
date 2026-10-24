import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';

export const NOTIFICATION_LIMIT = 30;
export function createNotificationRepository(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, serverTimestamp, getDocs, writeBatch, Timestamp } = sdk;
  const unread = (businessId, userId) => [where('businessId', '==', businessId), where('userId', '==', userId), where('readAt', '==', null)];
  return {
    subscribeUnreadNotifications: (businessId, userId, onData, onError) => onSnapshot(query(collection(database, 'notifications'),
      ...unread(businessId, userId), orderBy('createdAt', 'desc'), limit(NOTIFICATION_LIMIT)), snapshot => onData(mapDocuments(snapshot)), error => onError(withQueryContext(error, 'notifications-unread'))),
    markNotificationRead: id => updateDoc(doc(database, 'notifications', id), { readAt: serverTimestamp() }),
    markAllNotificationsRead: async (businessId, userId) => {
      const cutoff = Timestamp.now();
      while (true) {
        const page = await checkedRead(getDocs, 'notifications-mark-all')(query(collection(database, 'notifications'), ...unread(businessId, userId),
          where('createdAt', '<=', cutoff), orderBy('createdAt', 'desc'), limit(100)));
        if (page.empty) return;
        const batch = writeBatch(database);
        for (const item of page.docs) batch.update(item.ref, { readAt: serverTimestamp() });
        await batch.commit();
        if (page.size < 100) return;
      }
    },
  };
}
