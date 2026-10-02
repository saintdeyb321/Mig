import { toDateSafe } from '../../../core/dates/dateValues';
// src/modules/contracts/components/ContractDetailsModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getPaymentsByContract } from '../../../features/payments/infrastructure/paymentRepository';
import { contractImageList } from '../../../features/contracts/infrastructure/contractImages';
import { useContractImageUrls } from '../../../features/contracts/hooks/useContractImageUrls';

const formatFirebaseDate = (timestamp, includeTime = false) => {
  if (!timestamp) return 'Sin fecha';
  const date = toDateSafe(timestamp);
  if (!date) return 'Sin fecha';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  if (includeTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
  return date.toLocaleDateString('es-PE', options);
};

const ContractDetailsModal = ({
  contract, user, onClose, onAddPayment, onEditRequest, onCancelRequest, onMarkDelivered, isProcessing
}) => {
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');

  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const imageReferences = useMemo(() => contractImageList(contract), [contract]);
  const { urls: allImages, loading: imagesLoading, error: imagesError } = useContractImageUrls(imageReferences);
  const [paymentResult, setPaymentResult] = useState({ key: null, payments: [], error: null });
  const paymentKey = `${user?.uid}:${user?.businessId}:${contract?.id}:${contract?.updatedAt?.seconds ?? contract?.updatedAt ?? ''}`;
  const paymentBranch = user?.role === 'cajero' ? user.branchId : 'global';
  useEffect(() => {
    let disposed = false;
    if (!contract?.id || !user?.businessId) return;
    getPaymentsByContract(user.businessId, contract.id, paymentBranch).then(ledger => {
      if (!disposed) setPaymentResult({ key: paymentKey,
        payments: contract.paymentsMigrated || ledger.length > 0 ? ledger : (contract.payments || []), error: null });
    }).catch(error => {
      if (!disposed) setPaymentResult({ key: paymentKey, payments: [], error });
    });
    return () => { disposed = true; };
  }, [contract, user?.businessId, paymentBranch, paymentKey]);
  const payments = paymentResult.key === paymentKey ? paymentResult.payments : [];
  const paymentError = paymentResult.key === paymentKey ? paymentResult.error : null;

  if (!contract) return null;

  // ESTADOS LOGÍSTICOS Y FINANCIEROS SEPARADOS
  const isCancelled = contract.status === 'cancelado';
  const isPaid = contract.balance <= 0;
  const isDelivered = contract.status === 'entregado' || contract.status === 'entregado_con_deuda';

  const getStatusDisplay = (status) => {
    switch(status) {
      case 'pendiente': return '⏳ Pendiente';
      case 'en_produccion': return '🧑‍🍳 En Producción';
      case 'listo_para_entrega': return '📦 Listo p/ Entrega';
      case 'entregado': return '✅ Entregado';
      case 'entregado_con_deuda': return '✅ Entregado (Falta Pago)';
      case 'cancelado': return '❌ Cancelado';
      default: return 'Desconocido';
    }
  };

  const closeLightbox = (e) => { e.stopPropagation(); setSelectedImageIndex(null); };
  const nextImage = (e) => {
    e.stopPropagation();
    setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
  };
  const prevImage = (e) => {
    e.stopPropagation();
    setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };
  const handlePaymentSubmit = async () => {
    const amount = Number(payAmount);
    if (amount <= 0 || amount > contract.balance) {
      toast.error('Monto inválido. Verifica el saldo restante.');
      return;
    }
    const success = await onAddPayment(contract.id, amount, payMethod);
    if (success) {
      setPayAmount('');
    }
  };

  const markAsDelivered = async () => {
    if (await onMarkDelivered(contract)) onClose();
  };

  return (
    <>
      {selectedImageIndex !== null && (
        <div
          className="fade-in"
          onClick={closeLightbox}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.95)', zIndex: 999999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(5px)'
          }}
        >
          <button
            onClick={closeLightbox}
            style={{ position: 'absolute', top: '20px', right: '25px', background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer', zIndex: 2 }}
            title="Cerrar"
          >✖</button>

          {allImages.length > 1 && (
            <button
              onClick={prevImage}
              style={{ position: 'absolute', left: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '3rem', width: '60px', height: '60px', borderRadius: '50%', cursor: 'pointer', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '6px' }}
            >‹</button>
          )}

          <img
            src={allImages[selectedImageIndex]}
            alt="Ampliación"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
          />

          {allImages.length > 1 && (
            <button
              onClick={nextImage}
              style={{ position: 'absolute', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '3rem', width: '60px', height: '60px', borderRadius: '50%', cursor: 'pointer', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '6px' }}
            >›</button>
          )}
        </div>
      )}

      <div className="cd-overlay fade-in" style={{ zIndex: 9999 }}>
        <div className="cd-modal-container">

          <div className={`cd-header ${isCancelled ? 'cd-header-void' : ''}`}>
            <div className="cd-header-info">
              <span className="cd-header-icon">{isCancelled ? '❌' : (isDelivered ? '🔒' : '👁️')}</span>
              <div className="cd-header-titles">
                <h2>{isCancelled ? 'Pedido Anulado' : (isDelivered ? 'Pedido Entregado' : 'Detalles del Pedido')}</h2>
                <span className="cd-id-badge">{contract.contractId}</span>
              </div>
            </div>
            <button onClick={onClose} className="cd-btn-close">✖</button>
          </div>

          {!isCancelled && (
            <div className="cd-toolbar">
              <div className="cd-toolbar-status">
                <span>Estado Actual:</span>
                <div className={`cd-status-badge cd-status-${contract.status}`} style={{ padding: '6px 12px', borderRadius: '8px', fontWeight: '800', fontSize: '0.85rem' }}>
                  {getStatusDisplay(contract.status)}
                </div>
              </div>

              <div className="cd-toolbar-actions">
                {/* Botón de Marcar Entregado (Restaurado) */}
                {!isDelivered && !isCancelled && (
                  <button onClick={markAsDelivered} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem', marginRight: '8px' }}>
                    📦 Marcar Entregado
                  </button>
                )}

                {!isDelivered && !isCancelled && (
                  <button onClick={() => onEditRequest(contract)} className="cd-btn cd-btn-edit">
                    ✏️ Editar
                  </button>
                )}

                {!isCancelled && (
                  <button onClick={() => onCancelRequest(contract)} className="cd-btn cd-btn-danger">
                    🗑️ Anular
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="cd-body">

            {isCancelled && (
               <div className="cd-alert-void">
                 ⚠️ Este pedido fue anulado. Las acciones de edición y cobro están deshabilitadas.
               </div>
            )}

            {(!isCancelled && isDelivered) && (
               <div className="cd-alert-void" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>
                 🔒 Logística completada (Entregado). La edición está bloqueada, pero aún puedes registrar pagos si hay deuda.
               </div>
            )}

            <div className="cd-grid-2-1">
              <div className="cd-card">
                <h3 className="cd-card-title">Datos del Cliente</h3>
                <div className="cd-info-section">

                  <div className="cd-data-group">
                    <label>Cliente</label>
                    <p className="cd-highlight" style={{ textDecoration: isCancelled ? 'line-through' : 'none' }}>
                      {contract.clientName}
                    </p>
                  </div>

                  <div className="cd-grid-2">
                    <div className="cd-data-group">
                      <label>Teléfono</label>
                      <p>{contract.clientPhone || '---'}</p>
                    </div>
                    <div className="cd-data-group">
                      <label>Atendido por</label>
                      <p>{contract.creatorName}</p>
                    </div>
                  </div>

                  <div className="cd-data-box">
                    <label>Entrega Programada</label>
                    <p className="cd-date-text">{formatFirebaseDate(contract.deliveryDate, true)}</p>
                  </div>

                </div>
              </div>

              <div className="cd-card">
                <h3 className="cd-card-title">Fotos de Referencia</h3>
                <div className="cd-photo-section">
                   {allImages.length > 0 ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: allImages.length > 1 ? '1fr 1fr' : '1fr',
                        gap: '8px',
                        minHeight: '120px'
                      }}>
                        {allImages.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Referencia ${idx + 1}`}
                            onClick={() => setSelectedImageIndex(idx)}
                            title="Haz clic para ampliar"
                            style={{
                              width: '100%', height: '100%', maxHeight: '180px', objectFit: 'cover',
                              borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'zoom-in',
                              transition: 'transform 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="cd-no-photo">
                        <span style={{ fontSize: '2rem' }}>🎂</span>
                        <p>Sin referencia</p>
                      </div>
                    )}
                </div>
              </div>
            </div>

            <div className="cd-card">
              <h3 className="cd-card-title">Detalles de Preparación</h3>
              <div className="cd-details-box">
                {contract.details}
              </div>

              <div className="cd-grid-2 cd-logistics-row">
                <div className="cd-data-group">
                  <label>Tipo de Envío</label>
                  <p>
                    {contract.deliveryType === 'domicilio' ? '🛵 Delivery a Domicilio' :
                     contract.deliveryType === 'taller' ? '🏭 Recoger en Taller' :
                     '🏪 Recojo en Sede'}
                  </p>
                  {contract.deliveryAddress && <small>{contract.deliveryAddress}</small>}
                </div>
                <div className="cd-data-group cd-align-right">
                  <label>Costo Delivery</label>
                  <p className="cd-money-text">S/ {contract.deliveryCost.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="cd-card cd-finance-summary">
              <div className="cd-finance-item">
                <label>Total General</label>
                <span className="cd-total-amount" style={{ textDecoration: isCancelled ? 'line-through' : 'none' }}>
                  S/ {contract.total.toFixed(2)}
                </span>
              </div>
              <div className="cd-finance-divider"></div>
              <div className="cd-finance-item cd-align-right">
                <label>Estado Financiero</label>
                <span className={`cd-status-amount ${isCancelled ? 'cd-text-void' : (isPaid ? 'cd-text-paid' : 'cd-text-debt')}`}>
                  {isCancelled ? 'ANULADO' : (isPaid ? '✅ PAGADO' : `Deuda: S/ ${contract.balance.toFixed(2)}`)}
                </span>
              </div>
            </div>

            {/* TARJETA 5: ACCIÓN DE COBRO (SIEMPRE VISIBLE SI HAY DEUDA) */}
            {(!isPaid && !isCancelled) && (
              <div className="cd-card cd-payment-action" style={{ border: isDelivered ? '2px solid #ef4444' : '1px solid #fde68a' }}>
                <div className="cd-payment-header">
                  <span>💰</span>
                  <div>
                    <h3 style={{ color: isDelivered ? '#ef4444' : '#b45309', margin: '0 0 4px 0' }}>
                      Registrar Cuota / Abono
                    </h3>
                    <p style={{ color: isDelivered ? '#dc2626' : '#d97706', fontWeight: isDelivered ? 'bold' : 'normal', margin: 0, fontSize: '0.85rem' }}>
                      {isDelivered
                        ? '⚠️ ¡ATENCIÓN! El pedido ya se entregó pero el cliente mantiene esta deuda.'
                        : 'Abona una cuota o cancela la deuda para pasarlo a "Listo para entrega".'}
                    </p>
                  </div>
                </div>

                <div className="cd-payment-controls" style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginTop: '15px' }}>
                  <div className="cd-data-group" style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#b45309', marginBottom: '4px' }}>MONTO A ABONAR (S/)</label>
                    <input
                      type="number" min="0.1" max={contract.balance} step="0.50"
                      value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      disabled={isProcessing} placeholder={`Max: ${contract.balance.toFixed(2)}`}
                      style={{ width: '100%', padding: '10px', border: '1px solid #fcd34d', borderRadius: '6px', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="cd-data-group" style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#b45309', marginBottom: '4px' }}>MÉTODO DE PAGO</label>
                    <select
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                      disabled={isProcessing}
                      style={{ width: '100%', padding: '10px', border: '1px solid #fcd34d', borderRadius: '6px', fontWeight: 'bold', background: 'white' }}
                    >
                      <option value="efectivo">💵 Efectivo (A esta Caja)</option>
                      <option value="yape">📱 Yape/Plin</option>
                    </select>
                  </div>
                  <button
                    onClick={handlePaymentSubmit}
                    disabled={isProcessing || !payAmount || Number(payAmount) <= 0}
                    className="cd-btn-confirm-pay"
                    style={{ padding: '10px 20px', background: isDelivered ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Confirmar Abono
                  </button>
                </div>
              </div>
            )}

            {/* TARJETA 6: Auditoría de Pagos */}
            {paymentResult.key !== paymentKey && <p>Cargando movimientos del pedido...</p>}
            {paymentError && <p role="alert">No se pudo cargar la auditoría de pagos.</p>}
            {imagesLoading && <p>Cargando imágenes de referencia...</p>}
            {imagesError && <p role="alert">No se pudieron cargar las imágenes de referencia.</p>}
            {payments.length > 0 && (
               <div className="cd-card">
                 <h3 className="cd-card-title">Auditoría de Transacciones</h3>

                 <div className="cd-audit-list">
                   {payments.map((p, idx) => (
                     <div key={p.id || idx} className="cd-audit-item" style={{ borderLeft: p.amount < 0 ? '4px solid #ef4444' : '4px solid #10b981', background: p.amount < 0 ? '#fef2f2' : '#f8fafc', padding: '10px', marginBottom: '8px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                       <div className="cd-audit-info">
                         <strong style={{ display: 'block', color: p.amount < 0 ? '#dc2626' : '#0f172a' }}>
                           {p.type === 'refund' || p.type === 'reembolso' ? 'REEMBOLSO' : (p.label || (p.type === 'advance' ? 'ADELANTO' : `CUOTA ${idx + 1}`))}
                           <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '6px' }}>({p.method.replace('_taller', '')})</span>
                         </strong>
                         <small style={{ color: '#64748b' }}>{formatFirebaseDate(p.occurredAt ?? p.date, true)} | Cajero: {p.cashierName || 'Sist.'}</small>
                       </div>

                       <div className={`cd-audit-amount ${p.amount < 0 ? 'cd-text-void' : 'cd-text-paid'}`} style={{ fontWeight: '900', fontSize: '1.1rem', color: p.amount < 0 ? '#dc2626' : '#10b981' }}>
                         {p.amount < 0 ? '-' : '+'} S/ {Math.abs(p.amount).toFixed(2)}
                       </div>

                     </div>
                   ))}
                 </div>

               </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default ContractDetailsModal;
