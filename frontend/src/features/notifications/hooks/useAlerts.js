import { useCallback, useState, useRef, useSyncExternalStore } from 'react';
import { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../infrastructure/notificationRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors';
import toast from 'react-hot-toast';
import { isBusinessSession } from '../../../core/session/context.js';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { subscribeUsers } from '../../users/infrastructure/userRepository';

const EMPTY_PROFILES = { data: [] };
const NO_PROFILES = { get: () => EMPTY_PROFILES, subscribe: () => () => {} };

export function useAlerts(user) {
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
  const profileResource = isAdmin && resources ? resources.watch(`personnel:users:${identityKey}`, watchProfiles, undefined, { preserveOnError: true }) : NO_PROFILES;
  const profiles = useSyncExternalStore(profileResource.subscribe, profileResource.get);
  const subscribe = useCallback((onData, onError) => subscribeUnreadNotifications(businessId, uid,
    (alerts, metadata) => onData(alerts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt)), metadata),
    error => {
      onError(error);
    }, { owner: isAdmin }), [businessId, uid, isAdmin]);
  const { data: alerts, error, retry, isStale } = useScopedSubscription(identityKey, subscribe, undefined, { preserveOnError: true });
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
  return { alerts: namedAlerts, isMarkingRead, notificationsStale: isStale, notificationError: (operationError?.identityKey === identityKey ? operationError.error : null) || error, isAdmin, canViewNotifications: enabled, markAsRead, markAllAsRead,
    retryNotifications: () => { setOperationError(null); retry(); } };
}
