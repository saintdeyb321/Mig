import { Card, Button, Badge } from '../../shared/ui';
import { runtimeCapabilities } from '../../config/runtimeCapabilities.js';

export function SaleHistoryCard({ s, user, businessBranches, formatDate, isProcessing, canOperate = true,
  verificarPendiente, verificarAnulacion, setSaleToCancel, onReviewDraft, activeBranchId }) {
  const rejected = s.financialState === 'rejected' || s.queueStatus === 'failed';
  const draft = !rejected && s.financialState === 'draft_offline';
  const uncertain = s.isOffline && !draft && !rejected;
  const voidPending = !s.voided && s.voidCheckPending;
  const state = s.voided ? 'Venta anulada' : rejected ? 'Venta no realizada' : draft ? 'Sin cobrar' : uncertain ? 'Por comprobar' : voidPending ? 'Comprobando anulación' : 'Venta registrada';
  const branch = businessBranches?.find(row => row.id === s.branchId)?.name ?? 'Sucursal';
  const payment = ({ efectivo: 'Efectivo', yape: 'Yape / Plin', plin: 'Yape / Plin', mixto: 'Pago mixto' })[s.payment] ?? 'Pago por revisar';
  return <Card className="flex min-w-0 flex-col gap-4 border-t-2 border-t-primary/30">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{formatDate(s.createdAt ?? s.date)}</p><p className="text-xs text-muted">{branch} · {payment}</p></div><Badge variant={s.voided || rejected ? 'neutral' : draft || uncertain || voidPending ? 'warning' : 'success'}>{state}</Badge></div>
    <div className="flex items-baseline justify-between gap-3"><span className="text-xs text-muted">{draft ? 'Importe guardado' : uncertain || rejected ? 'Importe del ticket' : 'Total del ticket'}</span><strong className="text-2xl tabular-nums">S/ {Number(s.total).toFixed(2)}</strong></div>
    <ul className="divide-y divide-line text-sm">{s.items?.map((item, index) => <li key={item.id ?? index} className="flex justify-between gap-3 py-2"><span className="break-words">{item.qty} × {item.name}</span><span className="shrink-0 tabular-nums">S/ {(item.price * item.qty).toFixed(2)}</span></li>)}</ul>
    {s.payment === 'mixto' && s.splitPayments && <p className="text-xs text-muted">Efectivo S/ {Number(s.splitPayments.efectivo).toFixed(2)} · Yape / Plin S/ {Number(s.splitPayments.yape).toFixed(2)}</p>}
    {draft && <p className="text-sm text-muted">Guardado en este dispositivo. Aún no se ha cobrado.</p>}
    {uncertain && <p className="text-sm text-muted">Comprueba el resultado antes de cobrar otra vez.</p>}
    {voidPending && <p className="text-sm text-muted">Solo falta comprobar la anulación. No repitas la operación.</p>}
    {s.voided && <p className="text-sm text-muted">{s.voidReason} · La entrega física del dinero debe revisarse por separado.</p>}
    {draft && <Button variant="secondary" onClick={() => onReviewDraft(s)} disabled={isProcessing || activeBranchId !== s.branchId || s.userId !== user.uid}>Revisar y confirmar</Button>}
    {draft && activeBranchId !== s.branchId && <p className="text-xs text-muted">Selecciona la sede del ticket para revisarlo.</p>}
    {uncertain && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarPendiente(s)}>Verificar venta</Button>}
    {voidPending && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarAnulacion(s)}>Verificar anulación</Button>}
    {!s.isOffline && !s.voided && !voidPending && ['dueño', 'cajero'].includes(user?.role) && (user.role !== 'cajero' || s.branchId === user.branchId)
      && <Button variant="danger" onClick={() => setSaleToCancel(s)} disabled={isProcessing || !canOperate || !runtimeCapabilities.saleVoid || s.atomicProtocol !== 2}>Anular ticket</Button>}
    <details className="mt-auto text-xs text-muted"><summary className="min-h-8 cursor-pointer">Ver detalle del registro</summary><p className="break-all">Ticket: {s.saleId ?? s.id}</p>{s.lastError && <p className="break-words">{s.lastError}</p>}</details>
  </Card>;
}
