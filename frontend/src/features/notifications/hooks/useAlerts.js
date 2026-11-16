import { useCallback, useState, useRef, useSyncExternalStore } from 'react';
import { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../infrastructure/notificationRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors';
import toast from 'react-hot-toast';
import { isBusinessSession } from '../../../core/session/context.js';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { subscribeUsers } from '../../users/infrastructure/userRepository';

const EMPTY_PROFILES = { data: [] };
const NO_PROFILES = { get: () => EMPTY_PROFILES, subscribe: () => () => {} };
const UNKNOWN_INBOX = { alerts: [], confirmedUnreadCount: null };

export function useAlerts(user, detailOpen = false) {
  const [operationError, setOperationError] = useState(null);
  const resources = useSessionResources();
  const businessId = user?.businessId;
  const uid = user?.uid;
  const enabled = isBusinessSession(user);
  const identityKey = enabled ? getIdentityKey(user) : null;
  const isAdmin = enabled && String(user?.role).toLowerCase() === 'dueño';
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const marking = useRef(false);
  const watchProfiles = useCallback((onData, onError) => {
    if (!isAdmin) { onData([], { fromCache: false }); return () => {}; }
    return subscribeUsers(businessId, 'dueño', onData, onError);
  }, [businessId, isAdmin]);
  const profileResource = detailOpen && isAdmin && resources ? resources.watch(`personnel:users:${identityKey}`, watchProfiles,
    undefined, { preserveOnError: true }) : NO_PROFILES;
  const subscribeProfiles = useCallback(next => profileResource.subscribe(next, { retain: false }), [profileResource]);
  const profiles = useSyncExternalStore(subscribeProfiles, profileResource.get);
  const lastVerified = useRef(null);
  const subscribe = useCallback((onData, onError) => {
    let active = true;
    const stop = subscribeUnreadNotifications(businessId, uid, (alerts, metadata) => {
      if (!active) return;
      if (metadata.fromCache === false && !metadata.hasPendingWrites) {
        lastVerified.current = { identityKey, data: { alerts, confirmedUnreadCount: alerts.length } };
      }
      onData(lastVerified.current?.identityKey === identityKey ? lastVerified.current.data : UNKNOWN_INBOX, metadata);
    }, onError, { owner: isAdmin });
    return () => { active = false; stop(); };
  }, [businessId, uid, isAdmin, identityKey]);
  const { data: { alerts, confirmedUnreadCount }, error, retry, isStale } = useScopedSubscription(identityKey, subscribe, UNKNOWN_INBOX, { preserveOnError: true });
  const markAsRead = async id => {
    if (!enabled || marking.current) return;
    marking.current = true; setIsMarkingRead(true); setOperationError(null);
    try { const notice = alerts.find(row=>row.id===id); if (notice) await markNotificationRead(notice); }
    catch (error) { setOperationError({ identityKey, error }); toast.error(firebaseErrorMessage(error)); }
    finally { marking.current = false; setIsMarkingRead(false); }
  };
  const markAllAsRead = async () => {
    if (!enabled || marking.current) return;
    marking.current = true; setIsMarkingRead(true);
    setOperationError(null);
    try { await markAllNotificationsRead(businessId, user.uid, alerts); }
    catch (error) { setOperationError({ identityKey, error }); toast.error(firebaseErrorMessage(error)); }
    finally { marking.current = false; setIsMarkingRead(false); }
  };
  const names = new Map((profiles.data ?? []).filter(profile => profile.businessId === businessId).map(profile => [profile.id,
    `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Responsable del negocio']));
  const namedAlerts = alerts.map(notice => ({ ...notice, actorDisplayName: names.get(notice.metadata?.actorId ?? notice.userId) ?? 'Responsable del negocio',
    responsibleDisplayName: names.get(notice.metadata?.responsibleId) ?? 'Responsable del turno' }));
  return { alerts: namedAlerts, confirmedUnreadCount, isMarkingRead, notificationsStale: isStale, notificationError: (operationError?.identityKey === identityKey ? operationError.error : null) || error, isAdmin, canViewNotifications: enabled, markAsRead, markAllAsRead,
    retryNotifications: () => { setOperationError(null); retry(); } };
}
