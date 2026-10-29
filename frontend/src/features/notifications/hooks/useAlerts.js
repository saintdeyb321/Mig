import { useCallback, useState } from 'react';
import { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../infrastructure/notificationRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors';
import toast from 'react-hot-toast';
import { isBusinessSession } from '../../../core/session/context.js';

export function useAlerts(user) {
  const [operationError, setOperationError] = useState(null);
  const businessId = user?.businessId;
  const uid = user?.uid;
  const enabled = isBusinessSession(user);
  const identityKey = enabled ? getIdentityKey(user) : null;
  const isAdmin = enabled && String(user?.role).toLowerCase() === 'dueño';
  const subscribe = useCallback((onData, onError) => subscribeUnreadNotifications(businessId, uid,
    (alerts, metadata) => onData(alerts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt)), metadata),
    error => {
      onError(error);
    }, { owner: isAdmin }), [businessId, uid, isAdmin]);
  const { data: alerts, error, retry } = useScopedSubscription(identityKey, subscribe);
  const markAsRead = async id => {
    if (!enabled) return;
    try { const notice = alerts.find(row=>row.id===id); if (notice) await markNotificationRead(notice); }
    catch (error) { setOperationError({ identityKey, error }); toast.error(firebaseErrorMessage(error)); }
  };
  const markAllAsRead = async () => {
    if (!enabled) return;
    setOperationError(null);
    try { await markAllNotificationsRead(businessId, user.uid, alerts); }
    catch (error) { setOperationError({ identityKey, error }); toast.error(firebaseErrorMessage(error)); }
  };
  return { alerts, notificationError: (operationError?.identityKey === identityKey ? operationError.error : null) || error, isAdmin, canViewNotifications: enabled, markAsRead, markAllAsRead,
    retryNotifications: () => { setOperationError(null); retry(); } };
}
