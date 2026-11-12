import FirestoreQueryError from './FirestoreQueryError';
import { useEffect, useRef, useState } from 'react';
import { Ban, Bell, ChevronDown, ClipboardCheck, Info } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { subscribeLogicalCashExpiry } from '../features/notifications/infrastructure/notificationRepository.js';
import { toDateSafe } from '../core/dates/dateValues';
import { Badge, Button, Card, Dialog, EmptyState, IconButton, cn } from '../shared/ui';

const noticeStyles = {
  voided: { label: 'Anulación confirmada', icon: Ban, surface: 'border-danger/25 border-l-danger bg-danger-soft', badge: 'danger', amount: 'text-danger' },
  cash: { label: 'Cuadre por revisar', icon: ClipboardCheck, surface: 'border-warning/25 border-l-warning bg-warning-soft', badge: 'warning', amount: 'text-warning' },
  info: { label: 'Información', icon: Info, surface: 'border-primary/25 border-l-primary bg-primary-soft/45', badge: 'primary', amount: 'text-primary' },
};
const when = value => toDateSafe(value)?.toLocaleString('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
}) ?? 'No verificada';
const soles = value => Number.isFinite(value) ? `S/ ${value.toFixed(2)}` : 'No verificado';

function ExpiryDetail({ notice, logical }) {
  const [state, setState] = useState(null);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const load = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ loading: true });
    try {
      const { readExpiredCashDetail } = await import('../features/cash-register/infrastructure/cashRegisterRepository.js');
      controller.signal.throwIfAborted();
      const totals = await readExpiredCashDetail({ businessId: notice.businessId, branchId: notice.branchId,
        sessionId: notice.sourceId, signal: controller.signal });
      if (!controller.signal.aborted) setState({ totals });
    } catch {
      if (!controller.signal.aborted) setState({ error: true });
    } finally { request.current = null; }
  };
  const { openedAt, expiredAt, openingAmount } = notice.metadata;
  const totals = state?.totals;
  return <>
    <dl className="grid gap-2 rounded-lg border border-line bg-panel/85 p-2.5 text-xs xs:grid-cols-2">
      <div><dt>Apertura</dt><dd>{when(openedAt)}</dd></div>
      <div><dt>Vencimiento efectivo</dt><dd>{when(expiredAt)}</dd></div>
      <div><dt>Finalización confirmada</dt><dd>{logical ? 'Pendiente en Firestore' : when(notice.createdAt)}</dd></div>
      <div><dt>Fondo inicial declarado</dt><dd>{soles(openingAmount)}</dd></div>
    </dl>
    {logical ? <p className="text-xs text-muted">Referencia pendiente de verificar.</p> : totals ? <>
      <dl className="grid gap-2 text-xs xs:grid-cols-2">
        <div><dt>POS en efectivo · neto</dt><dd>{soles(totals.posCashNet)}</dd></div>
        <div><dt>Pedidos en efectivo · neto</dt><dd>{soles(totals.contractCash)}</dd></div>
        <div><dt>Yape / Plin · neto contable</dt><dd>{soles(totals.digitalTotal)}</dd></div>
        <div><dt>Compensaciones POS · efectivo / digital</dt><dd>{soles(totals.posCompensationCash)} / {soles(totals.posCompensationDigital)}</dd></div>
        <div><dt>Efectivo esperado · referencia estimada</dt><dd>{soles(totals.expectedCash)}</dd></div>
      </dl>
      <p className="text-xs text-muted">Importes registrados en este turno. Los ajustes contables no acreditan una entrega de dinero.</p>
    </> : <div className="space-y-2">
      <p role="status" className="text-xs text-muted">{state?.loading ? 'Comprobando movimientos…' : 'Importes pendientes de verificar.'}</p>
      <Button size="sm" variant="secondary" loading={state?.loading} onClick={load}>{state?.error ? 'Volver a comprobar importes' : 'Verificar importes del turno'}</Button>
    </div>}
  </>;
}

export function NotificationBell({ user, alerts = [], notificationError, isAdmin, canViewNotifications=false, markAsRead, markAllAsRead, retryNotifications, isMarkingRead, notificationsStale, onOpenCashAudit }) {
  const {businessBranches=[],settings}=useTenantData()??{};
  const [isOpen,setIsOpen]=useState(false);
  const [logicalCash, setLogicalCash] = useState(null);
  const scope = JSON.stringify([user?.uid, user?.businessId]);
  const owner = isAdmin && user?.role === 'dueño';
  useEffect(() => {
    if (!owner || !isOpen || !user?.businessId || !user?.uid) return;
    let active = true;
    let stop;
    const error = error => { if (active) setLogicalCash({ scope, rows: [], error }); };
    try {
      stop = subscribeLogicalCashExpiry(user.businessId, user.uid, (rows, meta) => {
        if (active) setLogicalCash({ scope, rows, ...meta });
      }, error);
    } catch (failure) { error(failure); }
    return () => { active = false; stop?.(); };
  }, [owner, isOpen, user?.uid, user?.businessId, scope]);
  const close = () => { setIsOpen(false); setLogicalCash(null); };
  const observations = owner && logicalCash?.scope === scope ? logicalCash : null;
  const seen = new Set(alerts.map(row => row.id));
  const visible = [...alerts, ...(observations?.rows ?? []).filter(row => !seen.has(row.id))];
  if(!canViewNotifications&&!isAdmin) return null;
  return <>
    <span className="relative inline-flex"><IconButton label="Notificaciones" onClick={()=>setIsOpen(true)} className="text-inherit"><Bell /></IconButton>
      {(notificationError||alerts.length>0)&&<span className="pointer-events-none absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{notificationError?'!':alerts.length}</span>}
    </span>
    {isOpen&&<Dialog title="Notificaciones" description="Avisos de tus operaciones y de tu negocio." onClose={close} busy={isMarkingRead}>
      <FirestoreQueryError error={notificationError} area="notifications-unread" user={user} onRetry={retryNotifications} commercial />
      {isAdmin&&<p className="text-xs text-muted">Avisos recientes: anulaciones, cierres manuales y hasta 10 turnos finalizados por vencimiento. Consulta el historial para períodos anteriores.</p>}
      {notificationsStale&&!notificationError&&<p role="status" className="text-xs text-muted">Actualizando con el servidor. Los acuses pendientes no se presentan como confirmados.</p>}
      {observations?.stale && <p role="status" className="text-xs text-muted">Comprobando turnos pendientes de finalización…</p>}
      {observations?.error && <p role="status" className="text-xs text-warning">No se pudieron comprobar los turnos pendientes de finalización.</p>}
      {observations?.limited && <p className="text-xs text-muted">Vista acotada a 10 turnos abiertos candidatos. Para otros períodos, consulta Auditoría de caja.</p>}
      {!notificationError&&!notificationsStale&&!observations?.stale&&!observations?.error&&!visible.length&&<EmptyState title={isAdmin?'Sin avisos recientes pendientes':'Todo al día'} description={isAdmin?'Consulta el historial para revisar operaciones de períodos anteriores.':'No tienes notificaciones pendientes.'} />}
      {alerts.length>0&&markAllAsRead&&<Button variant="secondary" size="sm" onClick={markAllAsRead} loading={isMarkingRead}>Marcar visibles como leídas</Button>}
      {visible.map(notification=>{
        const metadata = notification.metadata ?? {};
        const evidence = notification.authority === 'evidence-projection';
        const voided = evidence && notification.sourceType === 'pos-void';
        const cashClose = evidence && notification.sourceType === 'cash-close';
        const logical = notification.authority === 'logical-expiry';
        const cashExpiry = (evidence || logical) && notification.sourceType === 'cash-expiry';
        // The close projection carries an estimate, but drops the flags that distinguish provisional counts.
        const style = voided ? noticeStyles.voided : cashClose || cashExpiry ? noticeStyles.cash : noticeStyles.info;
        const Icon = style.icon;
        const amount = voided ? metadata.amount : cashClose ? metadata.difference : null;
        const differenceLabel = amount > 0 ? 'Sobrante estimado' : amount < 0 ? 'Faltante estimado' : 'Diferencia estimada';
        const date = toDateSafe(notification.createdAt);
        const actor = notification.actorDisplayName ?? 'Responsable del negocio';
        const branch = businessBranches.find(row => row.id === notification.branchId)?.name || 'Sucursal no disponible';
        return <Card key={notification.id} as="article" className={cn('space-y-3 border-l-4 p-3.5 sm:p-4', style.surface)}>
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1.5">
              <Badge variant={style.badge}><Icon aria-hidden="true" className="size-3.5" />{cashExpiry ? 'Sin arqueo · requiere revisión' : style.label}</Badge>
              <h3 className="text-sm font-bold text-ink">{notification.title}</h3>
            </div>
            {Number.isFinite(amount) && <dl className={cn('ml-auto text-right', style.amount)}>
              <dt className="text-xs font-semibold">{voided ? 'Importe de la anulación' : differenceLabel}</dt>
              <dd className="text-lg font-extrabold tabular-nums">S/ {amount.toFixed(2)}</dd>
            </dl>}
          </header>
          <dl className="grid gap-x-3 gap-y-2 rounded-lg border border-line bg-panel/85 p-2.5 text-xs xs:grid-cols-2">
            {cashExpiry && <div><dt className="text-muted">Negocio</dt><dd className="font-semibold">{settings?.companyData?.razonSocial || user?.businessName || 'Tu negocio'}</dd></div>}
            <div><dt className="text-muted">Sede</dt><dd className="font-semibold">{branch}</dd></div>
            <div><dt className="text-muted">Responsable</dt><dd className="font-semibold">{cashClose || cashExpiry ? notification.responsibleDisplayName ?? 'Responsable del turno' : actor}</dd></div>
            {cashClose && metadata.actorId !== metadata.responsibleId && <div><dt className="text-muted">Cierre registrado por</dt><dd className="font-semibold">{actor}</dd></div>}
          </dl>
          <p className="text-sm text-muted">{voided ? 'La compensación contable no acredita una entrega física de dinero. Requiere revisión.' : notification.message}</p>
          {cashExpiry && isAdmin && <ExpiryDetail key={`${user.uid}:${notification.id}`} notice={notification} logical={logical} />}
          {typeof metadata.reason === 'string' && metadata.reason.trim() && <details className="group rounded-lg border border-line bg-panel/85 px-2.5 text-sm">
            <summary className="block min-h-11 cursor-pointer list-none py-2.5 font-semibold">
              <span className="flex items-center justify-between gap-2">Ver motivo<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></span>
              <span aria-hidden="true" className="mt-1 line-clamp-2 font-normal text-muted wrap-anywhere group-open:hidden">{metadata.reason}</span>
            </summary>
            <p className="whitespace-pre-wrap pb-2 wrap-anywhere">{metadata.reason}</p>
          </details>}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            {date && !cashExpiry && <time dateTime={date.toISOString()} className="text-xs text-muted">{when(date)}</time>}
            {cashExpiry && onOpenCashAudit && <Button variant="secondary" size="sm" onClick={() => { close(); onOpenCashAudit(); }}>Ir a auditoría de caja</Button>}
            {!logical && <Button variant="secondary" size="sm" className="ml-auto" onClick={() => markAsRead(notification.id)} disabled={isMarkingRead}>Marcar como leída</Button>}
          </footer>
        </Card>;
      })}
    </Dialog>}
  </>;
}
