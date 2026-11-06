import { useState } from 'react';
import { Card, Button, Badge, Dialog, cn } from '../../shared/ui';
import { Ban, CheckCircle2, Clock3, FilePenLine, LoaderCircle, UserRound, WalletCards, XCircle } from 'lucide-react';
import { runtimeCapabilities } from '../../config/runtimeCapabilities.js';

const digitalPayment = { label: 'Yape / Plin', stripe: 'border-t-accent', panel: 'border-accent/25 bg-accent-soft text-accent' };
const paymentStyles = new Map([
  ['efectivo', { label: 'Efectivo', stripe: 'border-t-success', panel: 'border-success/25 bg-success-soft text-success' }],
  ['yape', digitalPayment],
  ['plin', digitalPayment],
  ['mixto', { label: 'Pago mixto', stripe: 'border-t-stellar', panel: 'border-stellar/25 bg-stellar-soft text-stellar' }],
]);
const unknownPayment = { label: 'Pago por revisar', stripe: 'border-t-control', panel: 'border-line bg-subtle text-muted' };

function isRecordedAmount(value) {
  const isDecimal = typeof value === 'number'
    || (typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()));
  return isDecimal && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function SaleHistoryCard({ s, user, businessBranches, formatDate, isProcessing, canOperate = true,
  verificarPendiente, verificarAnulacion, setSaleToCancel, onReviewDraft, activeBranchId }) {
  const [detail, setDetail] = useState(null);
  const rejected = s.financialState === 'rejected' || s.queueStatus === 'failed';
  const draft = !rejected && s.financialState === 'draft_offline';
  const uncertain = s.isOffline && !draft && !rejected;
  const voidPending = !s.voided && s.voidCheckPending;
  const confirmedVoid = s.voided && s.voidServerConfirmed !== false;
  const checkingVoid = voidPending || (s.voided && s.voidServerConfirmed === false);
  const [state, StateIcon, stateTone] = confirmedVoid ? ['Venta anulada', Ban, 'danger']
    : checkingVoid ? ['Comprobando anulación', LoaderCircle, 'warning']
    : rejected ? ['Venta no realizada', XCircle, 'danger']
    : draft ? ['Sin cobrar', FilePenLine, 'warning']
    : uncertain ? ['Por comprobar', Clock3, 'warning']
    : ['Venta registrada', CheckCircle2, 'success'];
  const branchName = businessBranches?.find(row => row.id === s.branchId)?.name;
  const branch = (typeof branchName === 'string' && branchName.trim()) || 'Sucursal no disponible';
  const cashier = (typeof s.cashierName === 'string' && s.cashierName.trim()) || 'Cajero no informado';
  const payment = paymentStyles.get(s.payment) ?? unknownPayment;
  const cashPart = s.splitPayments?.efectivo;
  const digitalPart = s.splitPayments?.yape ?? s.splitPayments?.plin;
  const showSplit = s.payment === 'mixto' && isRecordedAmount(cashPart) && isRecordedAmount(digitalPart);
  const showCashChange = s.payment === 'efectivo' && !s.isOffline && !s.voided && !draft && !rejected && !checkingVoid
    && isRecordedAmount(s.amountPaid) && isRecordedAmount(s.change) && Number(s.change) > 0;
  const amountLabel = confirmedVoid ? 'Importe anulado' : draft ? 'Importe guardado'
    : uncertain || rejected || checkingVoid ? 'Importe del ticket' : 'Total del ticket';
  const paymentTone = confirmedVoid ? 'border-danger/25 bg-danger-soft/60 text-danger'
    : draft || uncertain || rejected || checkingVoid ? unknownPayment.panel : payment.panel;
  const voidReason = typeof s.voidReason === 'string' && s.voidReason.trim() ? s.voidReason : '';
  const itemRow = (item, index, preview = false) => <li key={item.id ?? index} className="flex justify-between gap-2 py-1.5">
    <span className={cn('min-w-0 wrap-anywhere', preview && 'line-clamp-2')}>
      <span className="font-semibold tabular-nums">{item.qty} ×</span> {item.name}
    </span>
    <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">S/ {(item.price * item.qty).toFixed(2)}</span>
  </li>;
  return <Card as="article" aria-label={`${state} · ${s.saleId ?? s.id}`} className={cn(
    'sale-history-card flex min-w-0 flex-col gap-2 border-t-4 p-3 sm:p-3.5',
    confirmedVoid ? 'border-danger/45 border-t-danger' : payment.stripe,
  )}>
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
      <div className="min-w-0">
        <p className="text-sm font-bold">{formatDate(s.createdAt ?? s.date)}</p>
        <p className="mt-0.5 text-xs text-muted wrap-anywhere">{branch}</p>
      </div>
      <Badge variant={stateTone} className={cn('max-w-36 justify-self-end', confirmedVoid && 'uppercase')}><StateIcon aria-hidden="true" className="size-3.5" />{state}</Badge>
    </header>
    {s.items?.length > 0 && <div className="rounded-xl border border-line bg-subtle px-2.5 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-line">
        <p className="text-xs font-semibold text-muted">Detalle del ticket</p>
        <Button variant="ghost" size="sm" aria-haspopup="dialog" className="min-h-9 px-1 text-xs text-primary" onClick={() => setDetail('products')}>
          {s.items.length > 3 ? 'Ver más productos' : 'Ver detalle'}
        </Button>
      </div>
      <ul className={cn('divide-y divide-line text-sm', confirmedVoid && 'text-muted')}>
        {s.items.slice(0, 3).map((item, index) => itemRow(item, index, true))}
      </ul>
    </div>}
    {draft && <p className="text-sm text-muted">Guardado en este dispositivo. Aún no se ha cobrado.</p>}
    {uncertain && <p className="text-sm text-muted">Comprueba el resultado antes de cobrar otra vez.</p>}
    {checkingVoid && <p className="text-sm text-muted">Solo falta comprobar la anulación. No repitas la operación.</p>}
    {confirmedVoid && <div className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft/50 px-2.5 py-2">
      <div className="min-w-0">
        {voidReason && <>
          <p className="line-clamp-2 text-sm text-ink wrap-anywhere"><strong>Motivo</strong> · {voidReason}</p>
          <Button variant="ghost" size="sm" aria-haspopup="dialog" className="min-h-9 px-1 text-xs text-danger hover:bg-danger-soft" onClick={() => setDetail('reason')}>Ver motivo</Button>
        </>}
        <p className="text-xs text-muted">La devolución física se revisa por separado.</p>
      </div>
      <span aria-hidden="true" className="pointer-events-none mr-1 shrink-0 -rotate-12 select-none rounded border-2 border-danger/30 px-1.5 py-0.5 text-xs font-extrabold tracking-wider text-danger/60">ANULADA</span>
    </div>}
    {draft && activeBranchId !== s.branchId && <p className="text-xs text-muted">Selecciona la sede del ticket para revisarlo.</p>}
    <div className={cn('mt-auto space-y-2 rounded-xl border px-2.5 py-2', paymentTone)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><WalletCards aria-hidden="true" className="size-3.5 shrink-0" />{payment.label}</p>
        <dl className="ml-auto text-right">
          <dt className="text-xs font-medium">{amountLabel}</dt>
          <dd className="text-xl leading-tight font-extrabold tabular-nums sm:text-2xl">S/ {Number(s.total).toFixed(2)}</dd>
        </dl>
      </div>
      {showSplit && <dl className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="min-w-0 rounded-lg border border-success/20 bg-success-soft px-2 py-1.5 text-success">
          <dt>Efectivo</dt><dd className="font-bold tabular-nums">S/ {Number(cashPart).toFixed(2)}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-accent/20 bg-accent-soft px-2 py-1.5 text-accent">
          <dt>Yape / Plin</dt><dd className="font-bold tabular-nums">S/ {Number(digitalPart).toFixed(2)}</dd>
        </div>
      </dl>}
      {showCashChange && <dl className="flex flex-wrap justify-between gap-x-2 gap-y-1 border-t border-success/20 pt-1.5 text-xs tabular-nums">
        <div className="flex gap-1"><dt>Recibido</dt><dd className="font-semibold">S/ {Number(s.amountPaid).toFixed(2)}</dd></div>
        <div className="flex gap-1"><dt>Vuelto</dt><dd className="font-semibold">S/ {Number(s.change).toFixed(2)}</dd></div>
      </dl>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line pt-2">
      <p className="flex min-w-0 flex-1 basis-24 items-center gap-1.5 text-sm font-medium text-ink wrap-anywhere">
        <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="min-w-0">{cashier}</span>
      </p>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {s.lastError && <Button variant="ghost" size="sm" aria-haspopup="dialog" className="min-h-9 px-2 text-xs text-primary" onClick={() => setDetail('error')}>Ver incidencia</Button>}
        {draft && <Button variant="secondary" onClick={() => onReviewDraft(s)} disabled={isProcessing || activeBranchId !== s.branchId || s.userId !== user.uid}>Revisar y confirmar</Button>}
        {uncertain && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarPendiente(s)}>Verificar venta</Button>}
        {voidPending && <Button variant="secondary" disabled={isProcessing} onClick={() => verificarAnulacion(s)}>Verificar anulación</Button>}
        {!s.isOffline && !s.voided && !voidPending && ['dueño', 'cajero'].includes(user?.role) && (user.role !== 'cajero' || s.branchId === user.branchId)
          && <Button variant="secondary" size="sm" className="min-h-11 border-danger/30 px-3 text-danger hover:bg-danger-soft" onClick={() => setSaleToCancel(s)} disabled={isProcessing || !canOperate || !runtimeCapabilities.saleVoid || s.atomicProtocol !== 2}>Anular ticket</Button>}
      </div>
    </footer>
    {detail === 'products' && <Dialog title="Productos del ticket" onClose={() => setDetail(null)} className="max-w-md">
      <ul className="divide-y divide-line text-sm">{s.items?.map((item, index) => itemRow(item, index))}</ul>
    </Dialog>}
    {detail === 'reason' && <Dialog title="Motivo de anulación" onClose={() => setDetail(null)} className="max-w-md">
      <p className="whitespace-pre-wrap text-sm wrap-anywhere">{voidReason}</p>
    </Dialog>}
    {detail === 'error' && <Dialog title="Incidencia del ticket" onClose={() => setDetail(null)} className="max-w-md">
      <p className="whitespace-pre-wrap text-sm wrap-anywhere">{s.lastError}</p>
    </Dialog>}
  </Card>;
}
