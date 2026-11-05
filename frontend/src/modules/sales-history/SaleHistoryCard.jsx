import { Card, Button, Badge, cn } from '../../shared/ui';
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
  const itemRow = (item, index) => <li key={item.id ?? index} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 wrap-anywhere">{item.qty} × {item.name}</span><span className="shrink-0 tabular-nums">S/ {(item.price * item.qty).toFixed(2)}</span></li>;
  return <Card as="article" aria-label={`${state} · ${s.saleId ?? s.id}`} className={cn('sale-history-card flex min-w-0 flex-col gap-2 overflow-hidden border-t-2 bg-white p-4 sm:p-4', s.voided || rejected ? 'border-t-danger' : draft || uncertain || voidPending ? 'border-t-warning' : 'border-t-success')}>
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-bold">{formatDate(s.createdAt ?? s.date)}</p><div className="shrink-0 text-right"><strong className="text-2xl font-extrabold leading-none tabular-nums">S/ {Number(s.total).toFixed(2)}</strong><p className="mt-1 text-xs text-muted">{draft ? 'Importe guardado' : uncertain || rejected ? 'Importe del ticket' : 'Total del ticket'}</p></div></div>
      <p className="text-xs text-muted"><span className="font-mono wrap-anywhere">{s.saleId ?? s.id}</span> · {branch}</p>
      <div className="flex flex-wrap items-center gap-2"><Badge variant={s.voided || rejected ? 'danger' : draft || uncertain || voidPending ? 'warning' : 'success'}><StateIcon aria-hidden="true" className="size-3.5" />{state}</Badge><Badge className="border border-line bg-white text-ink"><WalletCards aria-hidden="true" className="size-3.5" />{payment}</Badge></div>
    </header>
    <ul className="divide-y divide-line border-y border-line py-1 text-sm">{s.items?.slice(0, 3).map(itemRow)}</ul>
    {s.items?.length > 3 && <details className="group text-sm"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-primary">Ver {s.items.length - 3} productos más<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary><ul className="divide-y divide-line">{s.items.slice(3).map(itemRow)}</ul></details>}
    {s.payment === 'mixto' && s.splitPayments && <p className="text-xs text-muted">Efectivo S/ {Number(s.splitPayments.efectivo).toFixed(2)} · Yape / Plin S/ {Number(s.splitPayments.yape).toFixed(2)}</p>}
    {draft && <p className="text-sm text-muted">Guardado en este dispositivo. Aún no se ha cobrado.</p>}
    {uncertain && <p className="text-sm text-muted">Comprueba el resultado antes de cobrar otra vez.</p>}
    {voidPending && <p className="text-sm text-muted">Solo falta comprobar la anulación. No repitas la operación.</p>}
    {s.voided && <p className="text-sm text-muted">{s.voidReason} · La entrega física del dinero debe revisarse por separado.</p>}
    <footer className="flex flex-wrap items-center justify-between gap-2 pt-1">
    <div className="min-w-0 flex-1"><p className="text-xs text-muted">{s.cashierName || 'Responsable no informado'}</p>
    <details className="group text-xs text-muted"><summary className="flex min-h-8 cursor-pointer items-center gap-2">Ver detalle del registro<ChevronDown aria-hidden="true" className="size-3.5 shrink-0 group-open:rotate-180" /></summary><p className="wrap-anywhere">Ticket: {s.saleId ?? s.id}</p>{s.userId && <p className="wrap-anywhere">Responsable (ID): {s.userId}</p>}{s.lastError && <p className="wrap-anywhere">{s.lastError}</p>}</details>
    </div>
    <div className="flex flex-wrap gap-2">
    {draft && <Button variant="secondary" onClick={() => onReviewDraft(s)} disabled={isProcessing || activeBranchId !== s.branchId || s.userId !== user.uid}>Revisar y confirmar</Button>}
    {draft && activeBranchId !== s.branchId && <p className="text-xs text-muted">Selecciona la sede del ticket para revisarlo.</p>}
    {uncertain && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarPendiente(s)}>Verificar venta</Button>}
    {voidPending && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarAnulacion(s)}>Verificar anulación</Button>}
    {!s.isOffline && !s.voided && !voidPending && ['dueño', 'cajero'].includes(user?.role) && (user.role !== 'cajero' || s.branchId === user.branchId)
      && <Button variant="secondary" size="sm" className="min-h-11 border-danger/30 px-3 text-danger hover:bg-danger-soft" onClick={() => setSaleToCancel(s)} disabled={isProcessing || !canOperate || !runtimeCapabilities.saleVoid || s.atomicProtocol !== 2}>Anular ticket</Button>}
    </div>
    </footer>
  </Card>;
}
