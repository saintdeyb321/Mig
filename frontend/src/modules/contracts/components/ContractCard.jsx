import { cn, Button, Badge, Card } from "../../../shared/ui";
// src/modules/contracts/components/ContractCard.jsx
import React, { memo } from 'react';
const formatDateTime = timestamp => {
  if (!timestamp) return 'Sin fecha';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-PE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date).replace(',', ' -');
};
const formatDateOnly = timestamp => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
};
const getUrgencyBadge = (deliveryDate, status) => {
  if (status === 'cancelado' || status === 'entregado') return null;
  if (!deliveryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = deliveryDate.toDate ? deliveryDate.toDate() : new Date(deliveryDate);
  const deliveryDay = new Date(delivery.getFullYear(), delivery.getMonth(), delivery.getDate());
  const diffDays = Math.round((deliveryDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return {
    text: '¡Atrasado!',
    bg: "var(--color-danger-soft)",
    color: "var(--color-danger)",
    icon: '⚠️'
  };
  if (diffDays === 0) return {
    text: '¡Para Hoy!',
    bg: "var(--color-danger-soft)",
    color: "var(--color-danger)",
    icon: '🚨',
    pulse: true
  };
  if (diffDays === 1) return {
    text: 'Mañana',
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
    icon: '⏳'
  };
  if (diffDays <= 3) return {
    text: `En ${diffDays} días`,
    bg: "var(--color-subtle)",
    color: "var(--color-muted)",
    icon: '📅'
  };
  return {
    text: `Faltan ${diffDays} días`,
    bg: "var(--color-subtle)",
    color: "var(--color-muted)",
    icon: '📅'
  };
};
const getStatusConfig = status => {
  switch (status) {
    case 'cancelado':
      return {
        label: 'Anulado',
        bg: "var(--color-danger-soft)",
        color: "var(--color-danger)",
        border: "var(--color-danger-soft)",
        icon: '✖️'
      };
    case 'entregado':
      return {
        label: 'Entregado',
        bg: "var(--color-success-soft)",
        color: "var(--color-success)",
        border: "var(--color-success-soft)",
        icon: '✅'
      };
    case 'entregado_con_deuda':
      return {
        label: 'Entregado (Falta Pago)',
        bg: "var(--color-danger-soft)",
        color: "var(--color-danger)",
        border: "var(--color-danger-soft)",
        icon: '🚨'
      };
    // 🚀 NUEVO
    case 'listo_para_entrega':
      return {
        label: 'Listo p/ Entrega',
        bg: "var(--color-warning-soft)",
        color: "var(--color-warning)",
        border: "var(--color-warning-soft)",
        icon: '📦'
      };
    case 'en_produccion':
      return {
        label: 'En Producción',
        bg: "var(--color-primary-soft)",
        color: "var(--color-primary)",
        border: "var(--color-primary-soft)",
        icon: '🧑‍🍳'
      };
    default:
      return {
        label: 'Pendiente',
        bg: "var(--color-subtle)",
        color: "var(--color-muted)",
        border: "var(--color-line)",
        icon: '⏳'
      };
  }
};
const getDeliveryText = (deliveryType, branches = []) => {
  if (!deliveryType) return 'Sin especificar';
  if (deliveryType === 'domicilio') return '🛵 Delivery a domicilio';
  const branch = branches.find(b => String(b.id) === String(deliveryType));
  if (branch) return `🏪 Recojo en: ${branch.name}`;
  return '🏪 Recojo en local';
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
  const criticalDebt = hasDebt && isDelivered; // ¡Entregado pero no pagado!

  const urgency = getUrgencyBadge(contract.deliveryDate, contract.status);
  const statusConfig = getStatusConfig(contract.status);
  const deliveryText = getDeliveryText(contract.deliveryType, branches);
  return <Card className={cn(`grid gap-4 border-t-4 border-t-primary/40 ${isCancelled ? "border-danger/25 bg-danger-soft/30" : ''} `, criticalDebt ? "border-l-4 border-l-danger" : "")} as="div">

      <div className="flex-wrap gap-2 border-b border-line pb-3 flex justify-between items-center">
        <div className="flex gap-2 flex-wrap">
          <Badge style={{
          background: statusConfig.bg,
          color: statusConfig.color,
          borderColor: statusConfig.border
        }}>
            <span>{statusConfig.icon}</span> {statusConfig.label}
          </Badge>

          {!isCancelled && <Badge className={cn("font-bold", isPaid ? "bg-success-soft" : "bg-danger-soft", isPaid ? "text-success" : "text-danger", isPaid ? "border-success-soft" : "border-danger-soft")}>
              {isPaid ? '💰 PAGADO' : `⚠️ DEUDA: S/ ${contract.balance.toFixed(2)}`}
            </Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-subtle px-2 py-1 font-mono text-xs text-muted">{contract.contractId}</span>
          <span className="text-xs text-muted">Creado: {formatDateOnly(contract.createdAt)}</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-primary">{contract.clientName.charAt(0).toUpperCase()}</div>
          <div className="grid min-w-0 gap-1">
            <h3 className="break-words text-lg font-bold">{contract.clientName}</h3>
            <div className="text-sm text-muted">{deliveryText}</div>
            {contract.clientPhone && <div className="text-xs text-muted">📞 {contract.clientPhone}</div>}
          </div>
        </div>

        <div className="grid gap-1 rounded-xl border border-accent/15 bg-accent-soft/50 p-3 sm:text-right">
          <div className="text-xs font-medium text-muted">FECHA DE ENTREGA</div>
          <div className="text-sm font-semibold text-primary">{formatDateTime(contract.deliveryDate)}</div>
          {urgency && <Badge className={cn(`inline-flex w-fit items-center gap-1 ${urgency.pulse ? "ring-1 ring-danger/30" : ''} `)} style={{
          background: urgency.bg,
          color: urgency.color
        }}>
              {urgency.icon} {urgency.text}
            </Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 rounded-xl bg-success-soft/40 p-3 sm:w-auto">
          <div className="grid gap-1">
            <span className="text-xs text-muted">Total</span>
            <span className="text-xl font-extrabold text-success tabular-nums">S/ {contract.total.toFixed(2)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted">Abonado</span>
            <span className="text-base font-bold text-success">S/ {(contract.total - contract.balance).toFixed(2)}</span>
          </div>
          <div className={cn(`grid gap-1 rounded-xl px-3 py-2 ${isCancelled ? "bg-subtle text-muted" : isPaid ? "bg-success-soft text-success" : "bg-danger-soft text-danger"} `, criticalDebt ? "bg-danger-soft border-danger-soft" : "")}>
            <span className={cn("text-xs text-muted", criticalDebt ? "text-danger" : "text-inherit")}>
              {isCancelled ? 'Deuda' : isPaid ? 'Estado' : 'Falta Pagar'}
            </span>
            <span className={cn("text-base font-bold", criticalDebt ? "text-danger" : "text-inherit")}>
              {isCancelled ? 'S/ 0.00' : isPaid ? 'Pagado' : `S/ ${contract.balance.toFixed(2)}`}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button onClick={() => onPrint(contract)} title="Imprimir Ticket" type="button" variant="secondary">🖨️ Ticket</Button>
          <Button onClick={() => onPrintProduction(contract)} title="Imprimir Orden de Taller" type="button" variant="secondary">📋 Orden</Button>
          <Button onClick={() => onPrintTextOnly(contract)} title="Imprimir Texto Solo" type="button" variant="secondary">📄 Detalles</Button>
          <Button onClick={() => onView(contract)} className={cn(criticalDebt ? "bg-danger" : "")} type="button" variant="primary">
            {isCancelled ? 'Historial' : criticalDebt ? 'Cobrar Deuda ➔' : 'Gestionar ➔'}
          </Button>
        </div>
      </div>

    </Card>;
});
export default ContractCard;
