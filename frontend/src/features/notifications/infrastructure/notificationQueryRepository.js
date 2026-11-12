import { cashExpiryWindow, materializedCashExpiry, MIN_CASH_DURATION_HOURS } from '../../cash-register/domain/cashExpiry.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

export const NOTIFICATION_LIMIT = 30;
export function createNotificationRepository(database, { sdk = firestoreSDK, currentUser } = {}) {
  const { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, serverTimestamp, writeBatch, getDocFromServer, Timestamp } = sdk;
  const unread = (businessId, userId) => [where('businessId', '==', businessId), where('userId', '==', userId), where('readAt', '==', null)];
  const assertIdentity = uid => { if (currentUser && currentUser()?.uid !== uid) throw Object.assign(new Error('La sesión cambió; los avisos se conservan.'), { code: 'session-changed' }); };
  async function markNotices(businessId, userId, visible) {
    if (visible.length > NOTIFICATION_LIMIT || visible.some(row => row.businessId !== businessId || row.userId !== userId)
      || new Set(visible.map(row => row.id)).size !== visible.length) throw new Error('Avisos fuera de la vista autorizada.');
    const confirmedIds = [];
    // Ten evidence checks plus common owner/tenant/license checks fit the Rules budget.
    for (let offset = 0; offset < visible.length; offset += 10) {
      assertIdentity(userId);
      const rows = visible.slice(offset, offset + 10), batch = writeBatch(database);
      for (const notice of rows) {
        const reference = doc(database, 'notifications', notice.id);
        if (notice.readMarker) batch.set(reference, { ...notice.readMarker, authority: 'read-marker', readAt: serverTimestamp() });
        else batch.update(reference, { readAt: serverTimestamp() });
      }
      try { await batch.commit(); }
      catch (error) {
        // A lost commit response is resolved by server authority, never latency-compensated snapshots.
        const checks = await Promise.all(rows.map(async notice => {
          try {
            assertIdentity(userId);
            const saved = await getDocFromServer(doc(database, 'notifications', notice.id));
            assertIdentity(userId);
            const data = saved.exists() ? saved.data() : null;
            return !saved.metadata?.fromCache && !saved.metadata?.hasPendingWrites && data?.businessId === businessId
              && data.userId === userId && data.readAt?.toDate ? notice.id : null;
          } catch { return null; }
        }));
        confirmedIds.push(...checks.filter(Boolean));
        if (checks.some(id => !id)) {
          throw Object.assign(new Error(`${confirmedIds.length} avisos confirmados; otros siguen pendientes de verificar. Reintenta sin duplicar operaciones.`),
            { code: error.code ?? 'unavailable', confirmedIds, pendingIds: visible.filter(row => !confirmedIds.includes(row.id)).map(row => row.id) });
        }
        continue;
      }
      assertIdentity(userId);
      confirmedIds.push(...rows.map(row => row.id));
    }
    return { confirmedIds };
  }
  return {
    subscribeUnreadNotifications: (businessId, userId, onData, onError, { owner = false } = {}) => {
      let closed = false, failure = false, legacy = [], legacyConfirmed = false;
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
            if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) markers.set(id, snapshot.exists() && snapshot.data().readAt != null);
            metadata.set(id, snapshot.metadata); publish();
          }, fail));
        }
      };
      metadata.set('legacy', { fromCache: true });
      stops.push(onSnapshot(query(collection(database, 'notifications'), ...unread(businessId, userId), orderBy('createdAt', 'desc'), limit(NOTIFICATION_LIMIT)),
        { includeMetadataChanges: true }, snapshot => {
          if (closed || failure) return;
          const confirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
          if (confirmed || !legacyConfirmed) {
            legacy = mapDocuments({ docs: snapshot.docs.filter(row=>row.metadata.hasPendingWrites===false) }).filter(row=>!owner||row.authority!=='informational');
          }
          if (confirmed) legacyConfirmed = true;
          metadata.set('legacy', snapshot.metadata); publish();
        }, error => { if (!closed) { failure = true; onError(withQueryContext(error, 'notifications-unread')); } }));
      if (owner) for (const [type, name, field, size] of [
        ['pos-void','pos_voids','occurredAt', NOTIFICATION_LIMIT], ['cash-close','cash_sessions','closedAt', NOTIFICATION_LIMIT],
        ['cash-expiry','cash_sessions','recoveredAt', 10],
      ]) {
        metadata.set(type, { fromCache: true });
        stops.push(onSnapshot(query(collection(database, name), where('businessId','==',businessId), orderBy(field,'desc'), limit(size)),
          { includeMetadataChanges: true }, snapshot => {
            if (closed || failure) return;
            evidence.set(type, snapshot.docs.filter(row=>row.metadata.hasPendingWrites===false).map(row=>projectFinancialNotice(type, { ...row.data(), id: row.id }, businessId, userId)).filter(Boolean));
            metadata.set(type, snapshot.metadata); refreshMarkers(); publish();
          }, fail));
      }
      return () => { closed = true; stops.forEach(stop=>stop()); markerStops.forEach(stop=>stop()); };
    },
    subscribeLogicalCashExpiry(businessId, userId, onData, onError) {
      assertIdentity(userId);
      // Only while the owner is viewing the bell. This bounded query is observational.
      const cutoff = Timestamp.fromMillis(Date.now() - MIN_CASH_DURATION_HOURS * 3600000);
      return onSnapshot(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId),
        where('status', '==', 'open'), where('openedAt', '<=', cutoff), orderBy('openedAt', 'desc'), limit(10)),
      { includeMetadataChanges: true }, snapshot => {
        if (currentUser && currentUser()?.uid !== userId) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) { onData([], { stale: true }); return; }
        const rows = mapDocuments(snapshot).map(source => projectLogicalCashExpiry(source, businessId, userId)).filter(Boolean);
        onData(rows, { limited: snapshot.size === 10 });
      }, error => onError(withQueryContext(error, 'notifications-logical-expiry')));
    },
    markNotificationRead: notice => typeof notice === 'string'
      ? updateDoc(doc(database, 'notifications', notice), { readAt: serverTimestamp() }) : markNotices(notice.businessId, notice.userId, [notice]),
    markAllNotificationsRead: (businessId, userId, visible = []) => markNotices(businessId, userId, visible),
  };
}

// Evidence stays immutable. These are bounded read-only views, never client-created financial alerts.
export function projectFinancialNotice(type, source, businessId, userId) {
  if (source.businessId !== businessId || !source.id || !source.userId || !source.branchId) return null;
  let title, message, createdAt, metadata;
  if (type === 'pos-void') {
    if (source.authority !== 'pos-compensation' || source.protocol !== 1 || source.saleId !== source.id || !(source.amount < 0) || !Number.isFinite(source.amount) || !toMillisSafe(source.occurredAt)) return null;
    title = 'Ticket anulado'; createdAt = source.occurredAt;
    message = `Compensación contable de S/ ${(-source.amount).toFixed(2)}. No acredita entrega física de dinero; requiere revisión.`;
    metadata = { reason:source.reason, amount:-source.amount, ticketId:source.saleId, actorId:source.userId };
  } else if (type === 'cash-expiry') {
    if (!materializedCashExpiry(source)) return null;
    title = 'Caja finalizada por vencimiento'; createdAt = source.recoveredAt;
    message = 'El efectivo contado no fue declarado. Diferencia: no calculable.';
    metadata = { actorId: source.recoveredBy, responsibleId: source.userId, openedAt: source.openedAt, expiredAt: source.expiredAt,
      openingAmount: Number.isFinite(source.openingAmount) ? source.openingAmount : null };
  } else {
    if (type !== 'cash-close' || source.runtime !== 'spark' || !['closed','closed_with_discrepancy'].includes(source.status) || !source.closedBy || !toMillisSafe(source.closedAt)) return null;
    const difference = source.closeEstimate?.difference;
    const valid = source.closeEstimate?.authority === 'client-estimate' && source.reconciliationPending === true && Number.isFinite(difference);
    if (valid && difference === 0 && source.userId === userId && source.closedBy === userId) return null;
    const uncertainCash = source.closeEstimate?.hasUnverifiedDisbursements || source.closeEstimate?.expectedCash < 0;
    title = uncertainCash ? 'Cierre con compensaciones por revisar' : valid && difference < 0 ? 'Diferencia negativa estimada en caja' : valid && difference > 0 ? 'Diferencia positiva estimada en caja' : 'Cierre de caja registrado';
    message = 'Estimación operativa del cierre; conciliación pendiente. No certifica el saldo de caja.';
    createdAt = source.closedAt; metadata = { ...(valid ? { difference } : {}), responsibleId:source.userId, actorId:source.closedBy, closeId:source.id };
  }
  return { id:`read_${type}_${source.id}_${userId}`, businessId, branchId:source.branchId, userId, sourceType:type, sourceId:source.id,
    title, message, createdAt, actorName:metadata.actorId, metadata, authority:'evidence-projection',
    readMarker:{ businessId, userId, sourceType:type, sourceId:source.id } };
}

export function projectLogicalCashExpiry(source, businessId, userId, now = Date.now()) {
  const window = cashExpiryWindow(source);
  if (source.businessId !== businessId || !source.id || !source.branchId || !source.userId || source.status !== 'open'
    || !window || now < +window.expiresAt) return null;
  return {
    id: `read_cash-expiry_${source.id}_${userId}`, sourceId: source.id, businessId, branchId: source.branchId,
    userId, sourceType: 'cash-expiry', authority: 'logical-expiry', createdAt: window.expiresAt,
    title: 'Caja vencida · finalización pendiente', message: 'Efectivo contado: no declarado. Diferencia: no calculable.',
    metadata: { openedAt: window.openedAt, expiredAt: window.expiresAt,
      openingAmount: Number.isFinite(source.openingAmount) ? source.openingAmount : null },
    responsibleDisplayName: source.cashierName && source.cashierName !== source.userId ? source.cashierName : undefined,
  };
}
