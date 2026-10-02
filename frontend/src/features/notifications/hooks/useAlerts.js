import { useCallback } from 'react';
import { subscribeUnreadAlerts, acknowledgeAlert } from '../infrastructure/alertRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { isPermissionDenied } from '../../../core/errors/firebaseErrors';

export function useAlerts(user) {
  const businessId = user?.businessId;
  const isAdmin = ['dueño', 'superadmin', 'admin'].includes(String(user?.role).toLowerCase());
  const subscribe = useCallback((onData, onError) => subscribeUnreadAlerts(businessId,
    alerts => onData(alerts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))),
    error => {
      if (!isPermissionDenied(error)) console.error('Error en notificaciones:', error);
      onError(error);
    }), [businessId]);
  const { data: alerts } = useScopedSubscription(businessId && isAdmin ? getIdentityKey(user) : null, subscribe);
  const markAsRead = async id => {
    try { await acknowledgeAlert(id); }
    catch (error) { console.error('Error al marcar como leída:', error); }
  };
  return { alerts, isAdmin, markAsRead };
}
