import FirestoreQueryError from './FirestoreQueryError';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { toDateSafe } from '../core/dates/dateValues';
import { Badge, Button, Card, Dialog, EmptyState, IconButton } from '../shared/ui';

export function NotificationBell({ user, alerts, notificationError, isAdmin, canViewNotifications=false, markAsRead, markAllAsRead, retryNotifications, isMarkingRead, notificationsStale }) {
  const {businessBranches=[]}=useTenantData()??{};
  const [isOpen,setIsOpen]=useState(false);
  if(!canViewNotifications&&!isAdmin) return null;
  return <>
    <span className="relative inline-flex"><IconButton label="Notificaciones" onClick={()=>setIsOpen(true)} className="text-inherit"><Bell /></IconButton>
      {(notificationError||alerts.length>0)&&<span className="pointer-events-none absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{notificationError?'!':alerts.length}</span>}
    </span>
    {isOpen&&<Dialog title="Notificaciones" description="Avisos de tus operaciones y de tu negocio." onClose={()=>setIsOpen(false)} busy={isMarkingRead}>
      <FirestoreQueryError error={notificationError} area="notifications-unread" user={user} onRetry={retryNotifications} commercial />
      {isAdmin&&<p className="text-xs text-muted">Movimientos recientes confirmados: hasta 30 anulaciones y 30 cierres. Consulta el historial para períodos anteriores.</p>}
      {notificationsStale&&!notificationError&&<p role="status" className="text-xs text-muted">Actualizando con el servidor. Los acuses pendientes no se presentan como confirmados.</p>}
      {!notificationError&&!notificationsStale&&!alerts.length&&<EmptyState title={isAdmin?'Sin avisos recientes pendientes':'Todo al día'} description={isAdmin?'Consulta el historial para revisar operaciones de períodos anteriores.':'No tienes notificaciones pendientes.'} />}
      {alerts.length>0&&markAllAsRead&&<Button variant="secondary" size="sm" onClick={markAllAsRead} loading={isMarkingRead}>Marcar visibles como leídas</Button>}
      {alerts.map(notification=>{
        const metadata=notification.metadata??{};
        return <Card key={notification.id} className="space-y-2 p-4 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{notification.title}</h3><Badge>{toDateSafe(notification.createdAt)?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Badge></div>
          <p className="text-sm text-muted">{notification.message}</p>
          <p className="text-xs text-muted">{businessBranches.find(branch=>branch.id===notification.branchId)?.name??'Sucursal'} · {notification.actorDisplayName ?? 'Responsable del negocio'}</p>
          {metadata.ticketId&&<p className="break-all text-xs">Ticket: {metadata.ticketId} · Anulación confirmada</p>}
          {metadata.closeId&&<p className="break-all text-xs">Cierre: {metadata.closeId} · Responsable: {notification.responsibleDisplayName ?? 'Responsable del turno'}</p>}
          <p className="text-xs text-muted">{toDateSafe(notification.createdAt)?.toLocaleString('es-PE')}</p>
          {metadata.reason&&<p className="text-sm">{metadata.reason}</p>}
          {metadata.difference!=null&&<p className="text-sm font-semibold">Diferencia estimada: S/ {Number(metadata.difference).toFixed(2)}</p>}
          <Button variant="ghost" size="sm" onClick={()=>markAsRead(notification.id)} disabled={isMarkingRead}>Marcar como leída</Button>
        </Card>;
      })}
    </Dialog>}
  </>;
}
