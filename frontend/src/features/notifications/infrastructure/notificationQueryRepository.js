import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

export const NOTIFICATION_LIMIT = 30;
export function createNotificationRepository(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, setDoc, serverTimestamp, writeBatch } = sdk;
  const unread = (businessId, userId) => [where('businessId', '==', businessId), where('userId', '==', userId), where('readAt', '==', null)];
  return {
    subscribeUnreadNotifications: (businessId, userId, onData, onError, { owner = false } = {}) => {
      let closed = false, failure = false, legacy = [];
      const evidence = new Map(), markers = new Map(), markerStops = new Map(), metadata = new Map();
      const stops = [];
      const fail = error => { if (!closed) { failure = true; onError(withQueryContext(error, 'notifications-evidence')); } };
      const publish = () => {
        if (closed || failure) return;
        const projected = [...evidence.values()].flat().filter(notice => !markers.get(notice.id));
        onData([...projected, ...legacy].sort((a,b)=>toMillisSafe(b.createdAt)-toMillisSafe(a.createdAt)).slice(0, NOTIFICATION_LIMIT),
          { fromCache: [...metadata.values()].some(meta=>meta.fromCache||meta.hasPendingWrites) });
      };
      const refreshMarkers = () => {
        const rows = new Map([...evidence.values()].flat().map(notice => [notice.id, notice]));
        for (const [id, stop] of markerStops) if (!rows.has(id)) { stop(); markerStops.delete(id); markers.delete(id); metadata.delete(id); }
        for (const [id] of rows) if (!markerStops.has(id)) {
          metadata.set(id, { fromCache: true });
          markerStops.set(id, onSnapshot(doc(database, 'notifications', id), { includeMetadataChanges: true }, snapshot => {
            if (closed || failure || !markerStops.has(id)) return;
            markers.set(id, snapshot.exists() && snapshot.data().readAt != null && !snapshot.metadata.hasPendingWrites);
            metadata.set(id, snapshot.metadata); publish();
          }, fail));
        }
      };
      metadata.set('legacy', { fromCache: true });
      stops.push(onSnapshot(query(collection(database, 'notifications'), ...unread(businessId, userId), orderBy('createdAt', 'desc'), limit(NOTIFICATION_LIMIT)),
        { includeMetadataChanges: true }, snapshot => {
          if (closed || failure) return;
          legacy = mapDocuments({ docs: snapshot.docs.filter(row=>row.metadata.hasPendingWrites===false) }).filter(row=>!owner||row.authority!=='informational');
          metadata.set('legacy', snapshot.metadata); publish();
        }, error => { if (!closed) { failure = true; onError(withQueryContext(error, 'notifications-unread')); } }));
      if (owner) for (const [type, name, field] of [['pos-void','pos_voids','occurredAt'], ['cash-close','cash_sessions','closedAt']]) {
        metadata.set(type, { fromCache: true });
        stops.push(onSnapshot(query(collection(database, name), where('businessId','==',businessId), orderBy(field,'desc'), limit(NOTIFICATION_LIMIT)),
          { includeMetadataChanges: true }, snapshot => {
            if (closed || failure) return;
            evidence.set(type, snapshot.docs.filter(row=>row.metadata.hasPendingWrites===false).map(row=>projectFinancialNotice(type, { ...row.data(), id: row.id }, businessId, userId)).filter(Boolean));
            metadata.set(type, snapshot.metadata); refreshMarkers(); publish();
          }, fail));
      }
      return () => { closed = true; stops.forEach(stop=>stop()); markerStops.forEach(stop=>stop()); };
    },
    markNotificationRead: notice => notice?.readMarker
      ? setDoc(doc(database, 'notifications', notice.id), { ...notice.readMarker, authority: 'read-marker', readAt: serverTimestamp() })
      : updateDoc(doc(database, 'notifications', typeof notice === 'string' ? notice : notice.id), { readAt: serverTimestamp() }),
    markAllNotificationsRead: async (businessId, userId, visible = []) => {
      if (visible.length > NOTIFICATION_LIMIT || visible.some(row=>row.businessId!==businessId||row.userId!==userId)) throw new Error('Avisos fuera de la vista autorizada.');
      // At most ten distinct evidence reads + shared actor/license/tenant checks per batch (<20).
      for (let offset=0;offset<visible.length;offset+=10) {
        const batch = writeBatch(database);
        for (const notice of visible.slice(offset,offset+10)) {
          const reference = doc(database,'notifications',notice.id);
          if (notice.readMarker) batch.set(reference,{...notice.readMarker,authority:'read-marker',readAt:serverTimestamp()});
          else batch.update(reference,{readAt:serverTimestamp()});
        }
        await batch.commit();
      }
    },
  };
}

// Evidence stays immutable. These are bounded read-only views, never client-created financial alerts.
export function projectFinancialNotice(type, source, businessId, userId) {
  if (source.businessId !== businessId || !source.id || !source.userId || !source.branchId) return null;
  let title, message, createdAt, metadata;
  if (type === 'pos-void') {
    if (source.authority !== 'pos-compensation' || source.protocol !== 1 || source.saleId !== source.id || !(source.amount < 0) || !Number.isFinite(source.amount) || !toMillisSafe(source.occurredAt)) return null;
    title = 'Ticket anulado'; createdAt = source.occurredAt;
    message = `Devolución registrada de S/ ${(-source.amount).toFixed(2)}. La entrega del dinero debe verificarse personalmente.`;
    metadata = { reason:source.reason, amount:-source.amount, ticketId:source.saleId, actorId:source.userId };
  } else {
    if (type !== 'cash-close' || source.runtime !== 'spark' || !['closed','closed_with_discrepancy'].includes(source.status) || !source.closedBy || !toMillisSafe(source.closedAt)) return null;
    const difference = source.closeEstimate?.difference;
    const valid = source.closeEstimate?.authority === 'client-estimate' && source.reconciliationPending === true && Number.isFinite(difference);
    if (valid && difference === 0 && source.userId === userId && source.closedBy === userId) return null;
    title = valid && difference < 0 ? 'Faltante declarado en caja' : valid && difference > 0 ? 'Sobrante declarado en caja' : 'Cierre de caja registrado';
    message = 'Estimación operativa del cierre; conciliación pendiente. No certifica el saldo de caja.';
    createdAt = source.closedAt; metadata = { ...(valid ? { difference } : {}), responsibleId:source.userId, actorId:source.closedBy, closeId:source.id };
  }
  return { id:`read_${type}_${source.id}_${userId}`, businessId, branchId:source.branchId, userId, sourceType:type, sourceId:source.id,
    title, message, createdAt, actorName:metadata.actorId, metadata, authority:'evidence-projection',
    readMarker:{ businessId, userId, sourceType:type, sourceId:source.id } };
}
