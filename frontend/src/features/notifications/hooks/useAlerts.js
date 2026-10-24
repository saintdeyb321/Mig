import { useCallback } from 'react';
import { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../infrastructure/notificationRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors';
import toast from 'react-hot-toast';
import { isBusinessSession } from '../../../core/session/context.js';

export function useAlerts(user) {
  const businessId = user?.businessId;
  const uid = user?.uid;
  const enabled = isBusinessSession(user);
  const isAdmin = enabled && String(user?.role).toLowerCase() === 'dueño';
  const subscribe = useCallback((onData, onError) => subscribeUnreadNotifications(businessId, uid,
    alerts => onData(alerts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))),
    error => {
      onError(error);
    }), [businessId, uid]);
  const { data: alerts, error } = useScopedSubscription(enabled ? getIdentityKey(user) : null, subscribe);
  const markAsRead = async id => {
    if (!enabled) return;
    try { await markNotificationRead(id); }
    catch (error) { toast.error(firebaseErrorMessage(error)); }
  };
  const markAllAsRead = async () => {
    if (!enabled) return;
    try { await markAllNotificationsRead(businessId, user.uid); }
    catch (error) { toast.error(firebaseErrorMessage(error)); }
  };
  return { alerts, notificationError: error ? firebaseErrorMessage(error) : null, isAdmin, canViewNotifications: enabled, markAsRead, markAllAsRead };
}
