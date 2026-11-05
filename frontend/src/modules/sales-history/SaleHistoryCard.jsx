import { Card, Button, Badge } from '../../shared/ui';
import { Ban, CheckCircle2, ChevronDown, Clock3, FilePenLine, LoaderCircle, WalletCards, XCircle } from 'lucide-react';
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
  const StateIcon = s.voided ? Ban : rejected ? XCircle : draft ? FilePenLine : uncertain ? Clock3 : voidPending ? LoaderCircle : CheckCircle2;
  const itemRow = (item, index) => <li key={item.id ?? index} className="flex justify-between gap-3 py-2"><span className="min-w-0 wrap-anywhere">{item.qty} × {item.name}</span><span className="shrink-0 tabular-nums">S/ {(item.price * item.qty).toFixed(2)}</span></li>;
  return <Card as="article" aria-label={`${state} · ${s.saleId ?? s.id}`} className="sale-history-card flex min-w-0 flex-col gap-3 overflow-hidden border-t-2 border-t-primary/50 p-4 sm:p-4">
    <header className="-mx-4 -mt-4 space-y-2 border-b border-line bg-subtle/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-semibold">{formatDate(s.createdAt ?? s.date)}</p><Badge variant={s.voided || rejected ? 'neutral' : draft || uncertain || voidPending ? 'warning' : 'success'}><StateIcon aria-hidden="true" className="size-3.5" />{state}</Badge></div>
      <p className="text-xs text-muted">{branch}</p>
    </header>
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs text-muted">{draft ? 'Importe guardado' : uncertain || rejected ? 'Importe del ticket' : 'Total del ticket'}</p><strong className="text-2xl font-extrabold tabular-nums">S/ {Number(s.total).toFixed(2)}</strong></div><span className="flex items-center gap-1 text-xs font-semibold text-primary"><WalletCards aria-hidden="true" className="size-4" />{payment}</span></div>
    <ul className="divide-y divide-line text-sm">{s.items?.slice(0, 3).map(itemRow)}</ul>
    {s.items?.length > 3 && <details className="group text-sm"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-primary">Ver {s.items.length - 3} productos más<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary><ul className="divide-y divide-line">{s.items.slice(3).map(itemRow)}</ul></details>}
    {s.payment === 'mixto' && s.splitPayments && <p className="text-xs text-muted">Efectivo S/ {Number(s.splitPayments.efectivo).toFixed(2)} · Yape / Plin S/ {Number(s.splitPayments.yape).toFixed(2)}</p>}
    {draft && <p className="text-sm text-muted">Guardado en este dispositivo. Aún no se ha cobrado.</p>}
    {uncertain && <p className="text-sm text-muted">Comprueba el resultado antes de cobrar otra vez.</p>}
    {voidPending && <p className="text-sm text-muted">Solo falta comprobar la anulación. No repitas la operación.</p>}
    {s.voided && <p className="text-sm text-muted">{s.voidReason} · La entrega física del dinero debe revisarse por separado.</p>}
    <div className="mt-auto grid gap-2 border-t border-line pt-3">
    {draft && <Button variant="secondary" onClick={() => onReviewDraft(s)} disabled={isProcessing || activeBranchId !== s.branchId || s.userId !== user.uid}>Revisar y confirmar</Button>}
    {draft && activeBranchId !== s.branchId && <p className="text-xs text-muted">Selecciona la sede del ticket para revisarlo.</p>}
    {uncertain && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarPendiente(s)}>Verificar venta</Button>}
    {voidPending && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarAnulacion(s)}>Verificar anulación</Button>}
    {!s.isOffline && !s.voided && !voidPending && ['dueño', 'cajero'].includes(user?.role) && (user.role !== 'cajero' || s.branchId === user.branchId)
      && <Button variant="secondary" className="border-danger/25 text-danger hover:bg-danger-soft" onClick={() => setSaleToCancel(s)} disabled={isProcessing || !canOperate || !runtimeCapabilities.saleVoid || s.atomicProtocol !== 2}>Anular ticket</Button>}
    <details className="group text-xs text-muted"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2">Ver detalle del registro<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary><p className="wrap-anywhere">Ticket: {s.saleId ?? s.id}</p>{s.lastError && <p className="wrap-anywhere">{s.lastError}</p>}</details>
    </div>
  </Card>;
}
