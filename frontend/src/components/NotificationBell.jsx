import FirestoreQueryError from './FirestoreQueryError';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { toDateSafe } from '../core/dates/dateValues';
import { Badge, Button, Card, Dialog, EmptyState, IconButton } from '../shared/ui';

export function NotificationBell({ user, alerts, notificationError, isAdmin, canViewNotifications=false, markAsRead, markAllAsRead }) {
  const {businessBranches=[]}=useTenantData()??{};
  const [isOpen,setIsOpen]=useState(false);
  if(!canViewNotifications&&!isAdmin) return null;
  return <>
    <span className="relative inline-flex"><IconButton label="Notificaciones" onClick={()=>setIsOpen(true)} className="text-inherit"><Bell /></IconButton>
      {(notificationError||alerts.length>0)&&<span className="pointer-events-none absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{notificationError?'!':alerts.length}</span>}
    </span>
    {isOpen&&<Dialog title="Notificaciones" description="Avisos de tus operaciones y de tu negocio." onClose={()=>setIsOpen(false)}>
      <FirestoreQueryError error={notificationError} area="notifications-unread" user={user} />
      {!notificationError&&!alerts.length&&<EmptyState title="Todo al día" description="No tienes notificaciones pendientes." />}
      {alerts.length>0&&markAllAsRead&&<Button variant="secondary" size="sm" onClick={markAllAsRead}>Marcar todas como leídas</Button>}
      {alerts.map(notification=>{
        const metadata=notification.metadata??{};
        return <Card key={notification.id} className="space-y-2 p-4 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{notification.title}</h3><Badge>{toDateSafe(notification.createdAt)?.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Badge></div>
          <p className="text-sm text-muted">{notification.message}</p>
          <p className="text-xs text-muted">{businessBranches.find(branch=>branch.id===notification.branchId)?.name??'Sucursal'} · {notification.actorName}</p>
          {metadata.reason&&<p className="text-sm">{metadata.reason}</p>}
          {metadata.difference!=null&&<p className="text-sm font-semibold">Diferencia: S/ {Number(metadata.difference).toFixed(2)}</p>}
          <Button variant="ghost" size="sm" onClick={()=>markAsRead(notification.id)}>Marcar como leída</Button>
        </Card>;
      })}
    </Dialog>}
  </>;
}
