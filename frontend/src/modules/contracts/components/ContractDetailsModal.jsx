import { ContractPhotoViewer } from './ContractPhotoViewer';
import { Dialog, ConfirmDialog, Button, cn, Input, Select, FormField } from "../../../shared/ui";
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
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return date.toLocaleDateString('es-PE', options);
};
const ContractDetailsModal = ({
  contract,
  user,
  onClose,
  onAddPayment,
  onEditRequest,
  onCancelRequest,
  onMarkDelivered,
  isProcessing
}) => {
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [confirmDelivery, setConfirmDelivery] = useState(false);
  const imageReferences = useMemo(() => contractImageList(contract), [contract]);
  const {
    urls: allImages,
    loading: imagesLoading,
    error: imagesError
  } = useContractImageUrls(imageReferences);
  const [paymentResult, setPaymentResult] = useState({
    key: null,
    payments: [],
    error: null
  });
  const paymentKey = `${user?.uid}:${user?.businessId}:${contract?.id}:${contract?.updatedAt?.seconds ?? contract?.updatedAt ?? ''}`;
  const paymentBranch = user?.role === 'cajero' ? user.branchId : 'global';
  useEffect(() => {
    let disposed = false;
    if (!contract?.id || !user?.businessId) return;
    getPaymentsByContract(user.businessId, contract.id, paymentBranch).then(ledger => {
      if (!disposed) setPaymentResult({
        key: paymentKey,
        payments: contract.paymentsMigrated || ledger.length > 0 ? ledger : contract.payments || [],
        error: null
      });
    }).catch(error => {
      if (!disposed) setPaymentResult({
        key: paymentKey,
        payments: [],
        error
      });
    });
    return () => {
      disposed = true;
    };
  }, [contract, user?.businessId, paymentBranch, paymentKey]);
  const payments = paymentResult.key === paymentKey ? paymentResult.payments : [];
  const paymentError = paymentResult.key === paymentKey ? paymentResult.error : null;
  if (!contract) return null;

  // ESTADOS LOGÍSTICOS Y FINANCIEROS SEPARADOS
  const restricted = contract.sparkContractVersion !== 1;
  const isCancelled = contract.status === 'cancelado';
  const isPaid = contract.balance <= 0;
  const isDelivered = contract.status === 'entregado' || contract.status === 'entregado_con_deuda';
  const getStatusDisplay = status => {
    switch (status) {
      case 'pendiente':
        return '⏳ Pendiente';
      case 'en_produccion':
        return '🧑‍🍳 En Producción';
      case 'listo_para_entrega':
        return '📦 Listo p/ Entrega';
      case 'entregado':
        return '✅ Entregado';
      case 'entregado_con_deuda':
        return '✅ Entregado (Falta Pago)';
      case 'cancelado':
        return '❌ Cancelado';
      default:
        return 'Desconocido';
    }
  };
  const closeLightbox = e => {
    e?.stopPropagation();
    setSelectedImageIndex(null);
  };
  const nextImage = e => {
    e.stopPropagation();
    setSelectedImageIndex(prev => (prev + 1) % allImages.length);
  };
  const prevImage = e => {
    e.stopPropagation();
    setSelectedImageIndex(prev => (prev - 1 + allImages.length) % allImages.length);
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
  return <>

      <Dialog title={<>{isCancelled ? 'Pedido Anulado' : isDelivered ? 'Pedido Entregado' : 'Detalles del Pedido'}</>} busy={isProcessing} className="max-w-4xl" onClose={onClose}>

          <div className={cn(`flex items-center gap-3 ${isCancelled ? "text-danger" : ''} `)}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-2xl">{isCancelled ? '❌' : isDelivered ? '🔒' : '👁️'}</span>
              <div className="grid min-w-0 gap-1">

                <span className="rounded-md bg-subtle px-2 py-1 font-mono text-xs text-muted">{contract.contractId}</span>
              </div>
            </div>

          </div>

          {!isCancelled && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>Estado Actual:</span>
                <div className="inline-flex bg-primary-soft text-primary py-1.5 px-3 rounded-xl font-bold text-sm">
                  {getStatusDisplay(contract.status)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Botón de Marcar Entregado (Restaurado) */}
                {!isDelivered && !isCancelled && <Button disabled={restricted || isProcessing} title="Entrega disponible solo para contratos Spark" onClick={() => setConfirmDelivery(true)} className="py-1.5 px-3 text-sm mr-2" type="button" variant="primary">
                    📦 Marcar Entregado
                  </Button>}

                {!isDelivered && !isCancelled && <Button disabled={restricted} title={restricted ? "Contrato histórico: solo lectura, sin migración automática" : "Editar datos permitidos"} onClick={() => onEditRequest(contract)} type="button" variant="secondary">
                    ✏️ Editar
                  </Button>}

                {!isCancelled && <Button disabled={restricted || user.role !== 'dueño'} title="Cancelación Spark: solo dueño y contratos nuevos" onClick={() => onCancelRequest(contract)} type="button" variant="danger">
                    🗑️ Anular
                  </Button>}
              </div>
            </div>}

          <div className="grid min-w-0 gap-4">

            {isCancelled && <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
                 ⚠️ Este pedido fue anulado. Las acciones de edición y cobro están deshabilitadas.
               </div>}

            {!isCancelled && isDelivered && <div className="rounded-xl border p-4 text-sm bg-success-soft text-success border-success-soft">
                 🔒 Logística completada (Entregado). La edición está bloqueada, pero aún puedes registrar pagos si hay deuda.
               </div>}

            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="grid min-w-0 gap-4 rounded-xl border border-line bg-panel p-4">
                <h3 className="border-b border-line pb-3 text-sm font-semibold">Datos del Cliente</h3>
                <div className="grid gap-4">

                  <div className="grid min-w-0 gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted">
                    <label className="text-sm leading-relaxed text-muted">Cliente</label>
                    <p className={cn("break-words text-lg font-bold text-primary", isCancelled ? "line-through" : "no-underline")}>
                      {contract.clientName}
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <div className="grid min-w-0 gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted">
                      <label className="text-sm leading-relaxed text-muted">Teléfono</label>
                      <p>{contract.clientPhone || '---'}</p>
                    </div>
                    <div className="grid min-w-0 gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted">
                      <label className="text-sm leading-relaxed text-muted">Atendido por</label>
                      <p>{contract.creatorName}</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-subtle p-3 text-sm">
                    <label className="text-sm leading-relaxed text-muted">Entrega Programada</label>
                    <p className="font-semibold">{formatFirebaseDate(contract.deliveryDate, true)}</p>
                  </div>

                </div>
              </div>

              <div className="grid min-w-0 gap-4 rounded-xl border border-line bg-panel p-4">
                <h3 className="border-b border-line pb-3 text-sm font-semibold">Fotos de Referencia</h3>
                <div className="min-w-0">
                   {allImages.length > 0 ? <div className={cn("grid gap-2 min-h-30", allImages.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                        {allImages.map((img, idx) => <button key={idx} type="button" className="min-w-0 overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:ring-focus" onClick={() => setSelectedImageIndex(idx)} aria-label={`Ampliar fotografía ${idx + 1}`}><img src={img} alt={`Referencia ${idx + 1}`} title="Haz clic para ampliar" className="w-full h-full max-h-45 object-cover rounded-xl border border-line cursor-zoom-in motion-reduce:transition-none transition-colors hover:border-primary/40 hover:bg-primary-soft/40" /></button>)}
                      </div> : <div className="grid min-h-28 place-content-center gap-2 rounded-xl bg-subtle text-center text-sm text-muted">
                        <span className="text-3xl">🎂</span>
                        <p>Sin referencia</p>
                      </div>}
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 rounded-xl border border-line bg-panel p-4">
              <h3 className="border-b border-line pb-3 text-sm font-semibold">Detalles de Preparación</h3>
              <div className="whitespace-pre-wrap break-words rounded-xl bg-subtle p-4 text-sm leading-relaxed">
                {contract.details}
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2 border-t border-line pt-4">
                <div className="grid min-w-0 gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted">
                  <label className="text-sm leading-relaxed text-muted">Tipo de Envío</label>
                  <p>
                    {contract.deliveryType === 'domicilio' ? '🛵 Delivery a Domicilio' : contract.deliveryType === 'taller' ? '🏭 Recoger en Taller' : '🏪 Recojo en Sede'}
                  </p>
                  {contract.deliveryAddress && <small>{contract.deliveryAddress}</small>}
                </div>
                <div className="grid min-w-0 gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted sm:text-right">
                  <label className="text-sm leading-relaxed text-muted">Costo Delivery</label>
                  <p className="font-semibold">S/ {contract.deliveryCost.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-4 bg-primary-soft">
              <div className="grid gap-1 text-sm [&>label]:text-muted">
                <label className="text-sm leading-relaxed text-muted">Total General</label>
                <span className={cn("text-2xl font-bold", isCancelled ? "line-through" : "no-underline")}>
                  S/ {contract.total.toFixed(2)}
                </span>
              </div>
              <div className="hidden h-12 border-l border-line sm:block"></div>
              <div className="grid gap-1 text-sm [&>label]:text-muted sm:text-right">
                <label className="text-sm leading-relaxed text-muted">Estado Financiero</label>
                <span className={cn(`font-semibold ${isCancelled ? "text-danger" : isPaid ? "text-success" : "text-warning"} `)}>
                  {isCancelled ? 'ANULADO' : isPaid ? '✅ PAGADO' : `Deuda: S/ ${contract.balance.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* TARJETA 5: ACCIÓN DE COBRO (SIEMPRE VISIBLE SI HAY DEUDA) */}
            {!isPaid && !isCancelled && <div className={cn("grid min-w-0 gap-4 rounded-xl border border-line bg-panel p-4 bg-warning-soft/40", isDelivered ? "border-2 border-danger" : "border border-warning-soft")}>
                <div className="flex items-start gap-3">
                  <span>💰</span>
                  <div>
                    <h3 className={cn("m-[0_0_4px_0]", isDelivered ? "text-danger" : "text-warning")}>
                      Registrar Cuota / Abono
                    </h3>
                    <p className={cn("m-0 text-sm", isDelivered ? "text-danger" : "text-warning", isDelivered ? "font-bold" : "font-normal")}>
                      {isDelivered ? '⚠️ ¡ATENCIÓN! El pedido ya se entregó pero el cliente mantiene esta deuda.' : 'Abona una cuota o cancela la deuda para pasarlo a "Listo para entrega".'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-stretch gap-4 sm:flex-row sm:items-end">
                  <FormField className="grid gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted min-w-0 flex-1" label={<>MONTO A ABONAR (S/)</>}>

                    <Input type="number" min="0.1" max={contract.balance} step="0.50" value={payAmount} onChange={e => setPayAmount(e.target.value)} disabled={isProcessing || restricted} placeholder={`Max: ${contract.balance.toFixed(2)}`} className="w-full p-2.5 border border-warning-soft rounded-lg font-bold" />
                  </FormField>
                  <FormField className="grid gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted [&>small]:text-xs [&>small]:text-muted min-w-0 flex-1" label={<>MÉTODO DE PAGO</>}>

                    <Select value={payMethod} onChange={e => setPayMethod(e.target.value)} disabled={isProcessing || restricted} className="w-full p-2.5 border border-warning-soft rounded-lg font-bold bg-panel">
                      <option value="efectivo">💵 Efectivo (A esta Caja)</option>
                      <option value="yape">📱 Yape/Plin</option>
                    </Select>
                  </FormField>
                  <Button onClick={handlePaymentSubmit} disabled={isProcessing || restricted || !payAmount || Number(payAmount) <= 0} type="button" variant={isDelivered ? "danger" : "primary"}>
                    Confirmar Abono
                  </Button>
                </div>
              </div>}

            {/* TARJETA 6: Auditoría de Pagos */}
            {paymentResult.key !== paymentKey && <p>Cargando movimientos del pedido...</p>}
            {paymentError && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{paymentError.message}</p>}
            {imageReferences.length > 0 && <p>Fotos locales: solo este dispositivo/cuenta. Referencias antiguas conservadas.</p>}
            {imagesLoading && <p>Cargando imágenes de referencia...</p>}
            {imagesError && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{imagesError.message}</p>}
            {payments.length > 0 && <div className="grid min-w-0 gap-4 rounded-xl border border-line bg-panel p-4">
                 <h3 className="border-b border-line pb-3 text-sm font-semibold">Auditoría de Transacciones</h3>

                 <div className="grid gap-2">
                   {payments.map((p, idx) => <div key={p.id || idx} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle p-3 p-2.5 mb-2 rounded-lg flex justify-between items-center", p.amount < 0 ? "border-l-4 border-l-danger" : "border-l-4 border-l-success", p.amount < 0 ? "bg-danger-soft" : "bg-subtle")}>

                       <div className="min-w-0 text-sm">
                         <strong className={cn("block", p.amount < 0 ? "text-danger" : "text-ink")}>
                           {p.type === 'refund' || p.type === 'reembolso' ? 'REEMBOLSO' : p.label || (p.type === 'advance' ? 'ADELANTO' : `CUOTA ${idx + 1}`)}
                           <span className="text-xs opacity-70 ml-1.5">({p.method.replace('_taller', '')})</span>
                         </strong>
                         <small className="text-muted">{formatFirebaseDate(p.occurredAt ?? p.date, true)} | Cajero: {p.cashierName || 'Sist.'}</small>
                       </div>

                       <div className={cn("font-bold text-lg", `font-semibold ${p.amount < 0 ? "text-danger" : "text-success"} `, p.amount < 0 ? "text-danger" : "text-success")}>
                         {p.amount < 0 ? '-' : '+'} S/ {Math.abs(p.amount).toFixed(2)}
                       </div>

                     </div>)}
                 </div>

               </div>}

          </div>
        </Dialog>
    {confirmDelivery && <ConfirmDialog title="Confirmar entrega del pedido" description="Confirma que el pedido fue entregado. Los saldos y cobros se conservan según el flujo actual." busy={isProcessing} onClose={() => setConfirmDelivery(false)} onConfirm={markAsDelivered} confirmLabel="Marcar entregado" />}
    {selectedImageIndex !== null && <ContractPhotoViewer images={allImages} index={selectedImageIndex} onClose={closeLightbox} onPrevious={prevImage} onNext={nextImage} busy={isProcessing} />}</>;
};
export default ContractDetailsModal;
