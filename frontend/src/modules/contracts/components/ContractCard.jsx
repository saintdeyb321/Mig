import { ArrowRight, Ban, CalendarClock, Check, CircleAlert, ClipboardList, Clock3, FileText, MapPin, Package, Phone, Printer, Truck, WalletCards } from 'lucide-react';
import { memo } from 'react';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { Badge, Button, Card, cn } from '../../../shared/ui';

const formatDateTime = timestamp => {
  const date = toDateSafe(timestamp);
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date).replace(',', ' -');
};
const formatDateOnly = timestamp => {
  const date = toDateSafe(timestamp);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
};
const getUrgencyBadge = (deliveryDate, status) => {
  if (status === 'cancelado' || status === 'entregado') return null;
  const delivery = toDateSafe(deliveryDate);
  if (!delivery) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliveryDay = new Date(delivery.getFullYear(), delivery.getMonth(), delivery.getDate());
  const diffDays = Math.round((deliveryDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Atrasado', variant: 'danger' };
  if (diffDays === 0) return { label: 'Para hoy', variant: 'danger' };
  if (diffDays === 1) return { label: 'Mañana', variant: 'warning' };
  return { label: diffDays <= 3 ? `En ${diffDays} días` : `Faltan ${diffDays} días`, variant: 'neutral' };
};
const getStatusConfig = status => {
  switch (status) {
    case 'cancelado': return { label: 'Anulado', variant: 'danger', icon: Ban };
    case 'entregado': return { label: 'Entregado', variant: 'success', icon: Check };
    case 'entregado_con_deuda': return { label: 'Entregado (falta pago)', variant: 'danger', icon: CircleAlert };
    case 'listo_para_entrega': return { label: 'Listo para entrega', variant: 'warning', icon: Package };
    case 'en_produccion': return { label: 'En producción', variant: 'primary', icon: ClipboardList };
    default: return { label: 'Pendiente', variant: 'neutral', icon: Clock3 };
  }
};
const getDeliveryText = (deliveryType, branches = []) => {
  if (!deliveryType) return 'Sin especificar';
  if (deliveryType === 'domicilio') return 'Delivery a domicilio';
  const branch = branches.find(b => String(b.id) === String(deliveryType));
  if (branch) return `Recojo en: ${branch.name}`;
  return 'Recojo en local';
};
const ContractCard = memo(({
  contract,
  onView,
  branches = [],
  onPrint,
  onPrintProduction,
  onPrintTextOnly
}) => {
  const isPaid = contract.balance <= 0;
  const isCancelled = contract.status === 'cancelado';
  const isDelivered = contract.status === 'entregado' || contract.status === 'entregado_con_deuda';
  const hasDebt = !isPaid && !isCancelled;
  const criticalDebt = hasDebt && isDelivered;

  const urgency = getUrgencyBadge(contract.deliveryDate, contract.status);
  const { label: statusLabel, variant: statusVariant, icon: StatusIcon } = getStatusConfig(contract.status);
  const deliveryText = getDeliveryText(contract.deliveryType, branches);
  const DeliveryIcon = contract.deliveryType === 'domicilio' ? Truck : MapPin;
  const created = formatDateOnly(contract.createdAt);
  const balanceTone = isCancelled ? 'border-line bg-subtle text-muted' : isPaid ? 'border-finance-line bg-success-soft text-success'
    : criticalDebt ? 'border-danger/20 bg-danger-soft text-danger' : 'border-warning/20 bg-warning-soft text-warning';
  return <Card as="article" className={cn(
    'grid gap-3 border-t-4 bg-linear-to-br from-panel via-panel p-3.5 hover:shadow-md focus-within:border-primary/35 motion-safe:transition-[border-color,box-shadow] sm:p-4',
    isCancelled || criticalDebt ? 'border-t-danger/55 to-danger-soft/40' : 'border-t-primary/40 to-primary-soft/40',
  )}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary-soft text-lg font-extrabold text-primary">{contract.clientName.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-brand-deep wrap-anywhere sm:text-lg">{contract.clientName}</h2>
          {contract.clientPhone && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Phone aria-hidden="true" className="size-3 shrink-0" />{contract.clientPhone}</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant={statusVariant}><StatusIcon aria-hidden="true" className="size-3.5" />{statusLabel}</Badge>
        <Badge className="border border-line bg-panel font-mono">{contract.contractId}</Badge>
        {created && <span className="text-xs text-muted">Creado: {created}</span>}
      </div>
    </header>
    <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
      <section className="grid min-w-0 content-center gap-1.5 rounded-xl border border-stellar/20 bg-linear-to-br from-stellar-soft to-panel px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-stellar"><CalendarClock aria-hidden="true" className="size-4 shrink-0" />Fecha de entrega</h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-extrabold tabular-nums">{formatDateTime(contract.deliveryDate)}</p>
          {urgency && <Badge variant={urgency.variant} className="px-2 py-0.5">{urgency.label}</Badge>}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted"><DeliveryIcon aria-hidden="true" className="size-3.5 shrink-0" />{deliveryText}</p>
      </section>
      <section className="min-w-0 rounded-xl border border-finance-line bg-linear-to-br from-success-soft/85 to-panel px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-success"><WalletCards aria-hidden="true" className="size-4 shrink-0" />Resumen financiero</h3>
        <dl className="mt-1.5 grid grid-cols-2 items-stretch gap-1.5 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-finance-line/70 bg-panel/85 px-2 py-1.5">
            <dt className="text-xs font-medium text-muted">Total</dt>
            <dd className="text-base font-extrabold text-success tabular-nums wrap-anywhere">S/ {contract.total.toFixed(2)}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-finance-line/70 bg-panel/85 px-2 py-1.5">
            <dt className="text-xs font-medium text-muted">Abonado</dt>
            <dd className="text-sm font-bold tabular-nums wrap-anywhere">S/ {(contract.total - contract.balance).toFixed(2)}</dd>
          </div>
          <div className={cn('col-span-2 min-w-0 rounded-lg border px-2 py-1.5 sm:col-span-1', balanceTone)}>
            <dt className="text-xs font-medium">{isCancelled ? 'Deuda' : isPaid ? 'Estado' : 'Saldo pendiente'}</dt>
            <dd className="text-sm font-extrabold tabular-nums wrap-anywhere">{isCancelled ? 'S/ 0.00' : isPaid ? 'Pagado' : `S/ ${contract.balance.toFixed(2)}`}</dd>
          </div>
        </dl>
      </section>
    </div>
    <footer className="grid gap-2 border-t border-line/80 pt-2.5 sm:flex sm:items-center sm:justify-between">
      <div role="group" aria-label="Imprimir pedido" className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
        <Button onClick={() => onPrint(contract)} title="Imprimir Ticket" size="sm" variant="secondary" className="gap-1 px-1.5 sm:px-2.5"><Printer aria-hidden="true" />Ticket</Button>
        <Button onClick={() => onPrintProduction(contract)} title="Imprimir Orden de Taller" size="sm" variant="secondary" className="gap-1 px-1.5 sm:px-2.5"><ClipboardList aria-hidden="true" />Orden</Button>
        <Button onClick={() => onPrintTextOnly(contract)} title="Imprimir Texto Solo" size="sm" variant="secondary" className="gap-1 px-1.5 sm:px-2.5"><FileText aria-hidden="true" />Texto</Button>
      </div>
      <Button onClick={() => onView(contract)} className="sm:min-w-36" variant="primary">
        {isCancelled ? 'Historial' : criticalDebt ? 'Cobrar deuda' : 'Gestionar'}<ArrowRight aria-hidden="true" />
      </Button>
    </footer>
  </Card>;
});
export default ContractCard;
