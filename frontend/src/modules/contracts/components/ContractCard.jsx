// src/modules/contracts/components/ContractCard.jsx
import React, { memo } from 'react';

const formatDateTime = (timestamp) => {
  if (!timestamp) return 'Sin fecha';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-PE', { 
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
  }).format(date).replace(',', ' -');
};

const formatDateOnly = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const getUrgencyBadge = (deliveryDate, status) => {
  if (status === 'cancelado' || status === 'entregado') return null;
  if (!deliveryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  const delivery = deliveryDate.toDate ? deliveryDate.toDate() : new Date(deliveryDate);
  const deliveryDay = new Date(delivery.getFullYear(), delivery.getMonth(), delivery.getDate());
  
  const diffDays = Math.round((deliveryDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)); 

  if (diffDays < 0) return { text: '¡Atrasado!', bg: '#fee2e2', color: '#b91c1c', icon: '⚠️' };
  if (diffDays === 0) return { text: '¡Para Hoy!', bg: '#fef2f2', color: '#dc2626', icon: '🚨', pulse: true };
  if (diffDays === 1) return { text: 'Mañana', bg: '#fffbeb', color: '#d97706', icon: '⏳' };
  if (diffDays <= 3) return { text: `En ${diffDays} días`, bg: '#f3f4f6', color: '#475569', icon: '📅' };
  return { text: `Faltan ${diffDays} días`, bg: '#f8fafc', color: '#64748b', icon: '📅' };
};

const getStatusConfig = (status) => {
  switch(status) {
    case 'cancelado': return { label: 'Anulado', bg: '#fef2f2', color: '#ef4444', border: '#fecaca', icon: '✖️' };
    case 'entregado': return { label: 'Entregado', bg: '#dcfce7', color: '#10b981', border: '#bbf7d0', icon: '✅' };
    case 'entregado_con_deuda': return { label: 'Entregado (Falta Pago)', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', icon: '🚨' }; // 🚀 NUEVO
    case 'listo_para_entrega': return { label: 'Listo p/ Entrega', bg: '#fef3c7', color: '#d97706', border: '#fde68a', icon: '📦' };
    case 'en_produccion': return { label: 'En Producción', bg: '#dbeafe', color: '#2563eb', border: '#bfdbfe', icon: '🧑‍🍳' };
    default: return { label: 'Pendiente', bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', icon: '⏳' };
  }
};

const getDeliveryText = (deliveryType, branches = []) => {
  if (!deliveryType) return 'Sin especificar';
  if (deliveryType === 'domicilio') return '🛵 Delivery a domicilio';
  const branch = branches.find(b => String(b.id) === String(deliveryType));
  if (branch) return `🏪 Recojo en: ${branch.name}`;
  return '🏪 Recojo en local';
};

const ContractCard = memo(({ contract, onView, branches = [], onPrint, onPrintProduction, onPrintTextOnly }) => {
  const isPaid = contract.balance <= 0;
  const isCancelled = contract.status === 'cancelado';
  const isDelivered = contract.status === 'entregado' || contract.status === 'entregado_con_deuda';
  
  const hasDebt = !isPaid && !isCancelled;
  const criticalDebt = hasDebt && isDelivered; // ¡Entregado pero no pagado!
  
  const urgency = getUrgencyBadge(contract.deliveryDate, contract.status);
  const statusConfig = getStatusConfig(contract.status);
  const deliveryText = getDeliveryText(contract.deliveryType, branches);

  return (
    <div className={`enterprise-card ${isCancelled ? 'is-voided' : ''}`} style={criticalDebt ? { borderLeft: '5px solid #ef4444' } : {}}>
      
      <div className="ec-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div className="ec-status" style={{ background: statusConfig.bg, color: statusConfig.color, borderColor: statusConfig.border }}>
            <span>{statusConfig.icon}</span> {statusConfig.label}
          </div>

          {!isCancelled && (
            <div className="ec-status" style={{ background: isPaid ? '#ecfdf5' : '#fef2f2', color: isPaid ? '#059669' : '#dc2626', borderColor: isPaid ? '#a7f3d0' : '#fca5a5', fontWeight: 800 }}>
              {isPaid ? '💰 PAGADO' : `⚠️ DEUDA: S/ ${contract.balance.toFixed(2)}`}
            </div>
          )}
        </div>
        
        <div className="ec-meta-top">
          <span className="ec-id">{contract.contractId}</span>
          <span className="ec-created-date">Creado: {formatDateOnly(contract.createdAt)}</span>
        </div>
      </div>

      <div className="ec-body">
        <div className="ec-client-info">
          <div className="ec-avatar">{contract.clientName.charAt(0).toUpperCase()}</div>
          <div className="ec-client-details">
            <h3 className="ec-name">{contract.clientName}</h3>
            <div className="ec-delivery-method">{deliveryText}</div>
            {contract.clientPhone && <div className="ec-phone">📞 {contract.clientPhone}</div>}
          </div>
        </div>

        <div className="ec-timeline">
          <div className="ec-timeline-label">FECHA DE ENTREGA</div>
          <div className="ec-timeline-date">{formatDateTime(contract.deliveryDate)}</div>
          {urgency && (
            <div className={`ec-urgency ${urgency.pulse ? 'pulse-alert' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>
              {urgency.icon} {urgency.text}
            </div>
          )}
        </div>
      </div>

      <div className="ec-footer">
        <div className="ec-finances">
          <div className="ec-money-block">
            <span className="ec-money-label">Total</span>
            <span className="ec-money-val">S/ {contract.total.toFixed(2)}</span>
          </div>
          <div className="ec-money-block">
            <span className="ec-money-label">Abonado</span>
            <span className="ec-money-val ec-color-success">S/ {(contract.total - contract.balance).toFixed(2)}</span>
          </div>
          <div className={`ec-money-block ec-debt-box ${isCancelled ? 'debt-void' : (isPaid ? 'debt-paid' : 'debt-pending')}`} style={criticalDebt ? { background: '#fef2f2', borderColor: '#fca5a5' } : {}}>
            <span className="ec-money-label" style={{ color: criticalDebt ? '#dc2626' : 'inherit' }}>
              {isCancelled ? 'Deuda' : (isPaid ? 'Estado' : 'Falta Pagar')}
            </span>
            <span className="ec-money-val" style={{ color: criticalDebt ? '#dc2626' : 'inherit' }}>
              {isCancelled ? 'S/ 0.00' : (isPaid ? 'Pagado' : `S/ ${contract.balance.toFixed(2)}`)}
            </span>
          </div>
        </div>

        <div className="ec-actions-wrapper">
          <button onClick={() => onPrint(contract)} className="ec-btn-secondary" title="Imprimir Ticket">🖨️ Ticket</button>
          <button onClick={() => onPrintProduction(contract)} className="ec-btn-secondary" title="Imprimir Orden de Taller">📋 Orden</button>
          <button onClick={() => onPrintTextOnly(contract)} className="ec-btn-secondary" title="Imprimir Texto Solo">📄 Detalles</button>
          <button onClick={() => onView(contract)} className="ec-btn-action" style={criticalDebt ? { background: '#ef4444' } : {}}>
            {isCancelled ? 'Historial' : criticalDebt ? 'Cobrar Deuda ➔' : 'Gestionar ➔'} 
          </button>
        </div>
      </div>
      
    </div>
  );
});

export default ContractCard;