import { cashExpiryWindow, materializedCashExpiry, MIN_CASH_DURATION_HOURS } from '../../cash-register/domain/cashExpiry.js';
import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

export const NOTIFICATION_LIMIT = 30;
// Each IN member expands to four filters, plus the query's implicit document order.
const MARKER_BATCH_SIZE = 24;
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
      const sources = owner ? [
        ['pos-void', 'pos_voids', 'occurredAt', NOTIFICATION_LIMIT],
        ['cash-close', 'cash_sessions', 'closedAt', NOTIFICATION_LIMIT],
        ['cash-expiry', 'cash_sessions', 'recoveredAt', 10],
        ['contract-cancel', 'contracts', 'voidedAt', NOTIFICATION_LIMIT],
      ] : [];
      const evidence = new Map(sources.map(([type]) => [type, { current: false, rows: [], markers: new Map() }]));
      const stops = [];
      let closed = false, legacy = [], legacyCurrent = false, verified = [];
      const active = () => !closed && (!currentUser || currentUser()?.uid === userId);
      const confirmed = metadata => metadata.fromCache === false && metadata.hasPendingWrites === false;
      const stop = () => {
        if (closed) return;
        closed = true;
        stops.forEach(unsubscribe => unsubscribe());
        evidence.forEach(source => source.markers.forEach(batch => batch.stop?.()));
      };
      const fail = (error, area = 'notifications-evidence') => {
        if (!active()) return;
        stop();
        onError(withQueryContext(error, area));
      };
      const publish = () => {
        if (!active()) return;
        const current = legacyCurrent && [...evidence.values()].every(source => source.current
          && [...source.markers.values()].every(batch => batch.current));
        if (current) {
          const unreadEvidence = [...evidence.values()].flatMap(source => {
            const read = new Set([...source.markers.values()].flatMap(batch => [...batch.read]));
            return source.rows.filter(notice => !read.has(notice.id));
          });
          verified = [...unreadEvidence, ...legacy].sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt)).slice(0, NOTIFICATION_LIMIT);
        }
        onData(verified, { fromCache: !current });
      };
      const listen = (ref, next, onFailure) => {
        const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, next, onFailure);
        if (closed) unsubscribe();
        return unsubscribe;
      };
      stops.push(listen(query(collection(database, 'notifications'), ...unread(businessId, userId),
        orderBy('createdAt', 'desc'), limit(NOTIFICATION_LIMIT)), snapshot => {
        if (!active()) return;
        legacyCurrent = confirmed(snapshot.metadata) && snapshot.docs.every(row => confirmed(row.metadata));
        if (legacyCurrent) legacy = mapDocuments(snapshot).filter(row => !owner || row.authority !== 'informational');
        publish();
      }, error => fail(error, 'notifications-unread')));
      for (const [type, name, field, size] of sources) {
        if (closed) break;
        const source = evidence.get(type);
        const updateMarkers = () => {
          const remaining = new Set(source.rows.map(notice => notice.sourceId));
          // Preserve an unchanged batch when the sliding window of recent evidence moves.
          const groups = [...source.markers.values()].map(batch => batch.ids.filter(id => remaining.delete(id)));
          for (const id of remaining) {
            let group = groups.find(ids => ids.length < MARKER_BATCH_SIZE);
            if (!group) { group = []; groups.push(group); }
            group.push(id);
          }
          const previous = source.markers;
          source.markers = new Map(groups.filter(ids => ids.length).map(ids => {
            const key = JSON.stringify(ids.sort());
            return [key, previous.get(key) ?? { ids, current: false, read: new Set() }];
          }));
          previous.forEach((batch, key) => { if (!source.markers.has(key)) batch.stop?.(); });
          for (const [key, batch] of source.markers) {
            if (closed) break;
            if (batch.stop) continue;
            // Missing acknowledgements stay absent from this query; no document get is needed.
            batch.stop = listen(query(collection(database, 'notifications'), where('businessId', '==', businessId),
              where('userId', '==', userId), where('sourceType', '==', type), where('sourceId', 'in', batch.ids)), snapshot => {
              if (!active() || source.markers.get(key) !== batch) return;
              batch.current = confirmed(snapshot.metadata) && snapshot.docs.every(row => confirmed(row.metadata));
              if (batch.current) {
                batch.read = new Set(snapshot.docs.filter(row => row.data().readAt != null).map(row => row.id));
              }
              publish();
            }, error => { if (source.markers.get(key) === batch) fail(error); });
          }
        };
        stops.push(listen(query(collection(database, name), where('businessId', '==', businessId),
          ...(type === 'contract-cancel' ? [where('status', '==', 'cancelado')] : []),
          orderBy(field, 'desc'), limit(size)), snapshot => {
          if (!active()) return;
          source.current = confirmed(snapshot.metadata) && snapshot.docs.every(row => confirmed(row.metadata));
          if (source.current) {
            source.rows = mapDocuments(snapshot).map(row => projectFinancialNotice(type, row, businessId, userId)).filter(Boolean);
            updateMarkers();
          }
          publish();
        }, fail));
      }
      return stop;
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
  if (source.businessId !== businessId || !source.id || !source.branchId || (type !== 'contract-cancel' && !source.userId)) return null;
  let title, message, createdAt, metadata;
  if (type === 'contract-cancel') {
    if (source.sparkContractVersion !== 1 || source.status !== 'cancelado' || !toMillisSafe(source.voidedAt)
      || ![source.id, source.branchId, source.voidedBy, source.cancelOperationId].every(value => typeof value === 'string' && value.trim())) return null;
    title = 'Pedido cancelado'; createdAt = source.voidedAt;
    message = 'Pedido anulado. Revisa los reembolsos registrados; el registro no confirma que el cliente haya recibido el dinero.';
    metadata = { contractNumber: typeof source.contractNumber === 'string' ? source.contractNumber.trim() : '',
      reason: typeof source.voidReason === 'string' ? source.voidReason : '', actorId: source.voidedBy };
  } else if (type === 'pos-void') {
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
    const reconciled = source.reconciliationPending === false && source.requiresFinancialReview !== true;
    const estimated = (source.reconciliationPending === true || source.requiresFinancialReview === true)
      && source.closeEstimate?.authority === 'client-estimate';
    const reference = reconciled ? (source.expectedCash ?? source.expectedAmount) : estimated ? source.closeEstimate.expectedCash : null;
    const difference = reconciled ? source.difference : estimated ? source.closeEstimate.difference : null;
    const valid = Number.isFinite(reference) && reference >= 0 && Number.isFinite(source.declaredAmount) && source.declaredAmount >= 0
      && Number.isFinite(difference) && (difference !== 0 || source.declaredAmount === reference);
    if (valid && difference === 0 && source.status === 'closed') return null;
    const discrepant = valid && difference !== 0;
    title = discrepant ? (difference < 0 ? 'Cierre con faltante' : 'Cierre con sobrante') : 'Referencia de caja por verificar';
    message = discrepant ? (estimated ? 'Diferencia estimada del conteo. La conciliación sigue pendiente.' : 'Diferencia registrada en el cierre de caja.')
      : valid ? 'El estado del cierre indica una diferencia, pero el importe registrado es cero. Revisa la auditoría.'
        : 'El cierre no tiene una referencia calculable. Revisa los importes en la auditoría de caja.';
    createdAt = source.closedAt;
    metadata = { ...(discrepant ? { difference, estimated } : {}), responsibleId: source.userId, actorId: source.closedBy, closeId: source.id };
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
