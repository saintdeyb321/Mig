import React, { useState } from 'react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { toDateSafe } from '../core/dates/dateValues';

export const NotificationBell = ({ alerts, isAdmin, canViewNotifications = false, markAsRead, markAllAsRead, isDesktop = false }) => {
  const { businessBranches } = useTenantData();
  const [isOpen, setIsOpen] = useState(false);
  if (!canViewNotifications && !isAdmin) return null;
  return <div className="bell-wrapper">
    <button className="bell-button" onClick={() => setIsOpen(!isOpen)} title="Notificaciones" aria-expanded={isOpen}>
      🔔{alerts.length > 0 && <span className="bell-badge fade-in">{alerts.length}</span>}
    </button>
    {isOpen && <>
      {!isDesktop && <div className="bell-overlay" onClick={() => setIsOpen(false)} />}
      <div className={'bell-dropdown fade-in ' + (isDesktop ? 'desktop' : 'mobile')}>
        <div className="bell-header"><h4>Notificaciones</h4>
          {alerts.length > 0 && markAllAsRead && <button type="button" onClick={markAllAsRead}>Marcar todas como leídas</button>}
        </div>
        <div className="bell-list-container">
          {!alerts.length && <p className="bell-empty">No tienes notificaciones pendientes.</p>}
          {alerts.map(notification => {
            const metadata = notification.metadata ?? {};
            return <div key={notification.id} className="alert-item warning">
              <div className="alert-item-header"><span className="alert-title">{notification.title}</span>
                <span className="alert-time">{toDateSafe(notification.createdAt)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="alert-text">{notification.message}</p>
              <p className="alert-text">Sede: {businessBranches?.find(branch => branch.id === notification.branchId)?.name ?? 'Sucursal'}</p>
              <p className="alert-text">Usuario: {notification.actorName}</p>
              {metadata.reason && <p className="alert-note">{metadata.reason}</p>}
              {metadata.difference != null && <p className="alert-text">Diferencia: S/ {Number(metadata.difference).toFixed(2)}</p>}
              <button type="button" onClick={() => markAsRead(notification.id)}>Marcar como leída</button>
            </div>;
          })}
        </div>
      </div>
    </>}
  </div>;
};
