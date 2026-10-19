import { useCallback } from 'react';
import { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../infrastructure/notificationRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { isPermissionDenied } from '../../../core/errors/firebaseErrors';

export function useAlerts(user) {
  const businessId = user?.businessId;
  const uid = user?.uid;
  const isAdmin = ['dueño', 'superadmin', 'admin'].includes(String(user?.role).toLowerCase());
  const subscribe = useCallback((onData, onError) => subscribeUnreadNotifications(businessId, uid,
    alerts => onData(alerts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))),
    error => {
      if (!isPermissionDenied(error)) console.error('Error en notificaciones:', error);
      onError(error);
    }), [businessId, uid]);
  const { data: alerts } = useScopedSubscription(businessId && user?.uid ? getIdentityKey(user) : null, subscribe);
  const markAsRead = async id => {
    try { await markNotificationRead(id); }
    catch (error) { console.error('Error al marcar como leída:', error); }
  };
  const markAllAsRead = async () => {
    try { await markAllNotificationsRead(businessId, user.uid); }
    catch (error) { console.error('No se pudieron marcar las notificaciones:', error); }
  };
  return { alerts, isAdmin, canViewNotifications: !!user?.uid, markAsRead, markAllAsRead };
}
