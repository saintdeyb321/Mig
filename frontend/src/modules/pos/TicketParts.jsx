import { Check, Clock3, FilePenLine, LockKeyhole, Minus, Plus, Printer, ReceiptText, ShoppingBag, Trash2, UnlockKeyhole, XCircle } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Alert, Badge, Button, Card, IconButton, cn } from '../../shared/ui';
import { VERIFIED_ATOMIC_LINE_LIMIT } from '../../features/sales/domain/checkoutPolicy.js';

export function CashStatus({ readOnly, session, isExpired = false, expiresAt = null, remainingMinutes = null, inPOS = false }) {
  const variant = readOnly || !session ? 'danger'
    : session.serverConfirmed === false || session.needsForceClose || isExpired || (inPOS && session.heldByOther) ? 'warning' : 'success';
  const label = readOnly ? 'Solo lectura' : !session ? 'Caja cerrada'
    : session.serverConfirmed === false ? 'Caja sin verificar'
      : inPOS && isExpired ? 'Caja vencida' : session.heldByOther ? 'Otro responsable'
        : session.needsForceClose ? 'Turno pendiente' : isExpired ? 'Caja vencida' : 'Caja abierta';
  const Icon = variant === 'success' ? UnlockKeyhole : variant === 'warning' ? Clock3 : LockKeyhole;
  const showTime = label === 'Caja abierta' && expiresAt;
  return <Badge
    title={expiresAt ? `Vence ${new Date(expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}. Hora orientativa; el servidor valida cada cobro.` : undefined}
    variant={variant}
    className={inPOS ? cn('border px-3 py-1.5 font-bold', {
      success: 'border-success/50', danger: 'border-danger/45', warning: 'border-warning/50',
    }[variant]) : undefined}
  >
    {inPOS && <Icon aria-hidden="true" className="size-4" />}
    <span>{showTime && !inPOS ? `Caja · ${remainingMinutes} min restantes aprox.` : label}
      {showTime && inPOS && Number.isFinite(remainingMinutes) && <span className="font-semibold"> · {remainingMinutes} min restantes aprox.</span>}
    </span>
  </Badge>;
}
export function CartItem({ item, onQty, onRemove, disabled, change, onAcceptChange }) {
  return <li className="space-y-1.5 border-b border-line py-2.5 last:border-0">
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-2">
      <p className="text-sm leading-snug font-bold wrap-anywhere">{item.name}</p>
      <strong className="text-right text-sm font-extrabold text-brand-deep tabular-nums wrap-anywhere">S/ {(item.price * item.qty).toFixed(2)}</strong>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <span className="min-w-0 text-xs text-muted tabular-nums wrap-anywhere">S/ {Number(item.price).toFixed(2)} c/u</span>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center rounded-xl border border-primary/15 bg-primary-soft/30">
          <IconButton size="sm" label={`Reducir ${item.name}`} onClick={() => onQty(item.id, item.qty - 1)} disabled={disabled || item.qty <= 1} className="size-11 min-h-11 rounded-[inherit] text-primary hover:bg-primary-soft hover:text-primary sm:size-9 sm:min-h-9"><Minus aria-hidden="true" /></IconButton>
          <span className="min-w-6 text-center text-sm font-bold tabular-nums">{item.qty}</span>
          <IconButton size="sm" label={`Aumentar ${item.name}`} onClick={() => onQty(item.id, item.qty + 1)} disabled={disabled} className="size-11 min-h-11 rounded-[inherit] text-primary hover:bg-primary-soft hover:text-primary sm:size-9 sm:min-h-9"><Plus aria-hidden="true" /></IconButton>
        </div>
        <IconButton label={`Quitar ${item.name}`} onClick={() => onRemove(item.id)} disabled={disabled} className="size-11 min-h-11 text-danger hover:bg-danger-soft hover:text-danger sm:size-9 sm:min-h-9"><Trash2 aria-hidden="true" /></IconButton>
      </div>
    </div>
    {change && !disabled && <Alert variant="warning" title={change.type === 'changed' ? 'Catálogo actualizado' : change.type === 'stock' ? 'Stock insuficiente' : 'Producto no disponible'}>
      {change.type === 'changed' ? <><p>Precio del carrito: S/ {Number(change.previousPrice).toFixed(2)} · Vigente: S/ {Number(change.currentPrice).toFixed(2)}. También se revisan costo y descripción.</p><Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAcceptChange(item.id)}>Aceptar datos vigentes</Button></>
        : change.type === 'stock' ? `Quedan ${change.stock} unidades. Reduce la cantidad o retira el producto.` : 'Retira este producto para continuar. No se ha registrado un cobro.'}
    </Alert>}
  </li>;
}
export function CartSummary({ total, children }) {
  return <div className="space-y-4 border-t border-line bg-panel p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-finance-line bg-success-soft px-4 py-3 text-success"><span className="text-xs font-bold uppercase tracking-wide">Total a cobrar</span><strong className="text-3xl font-extrabold tracking-tight tabular-nums">S/ {total.toFixed(2)}</strong></div>{children}</div>;
}
export function SaleStatus({ sale, onPrint, onNew, onVerify, onReview, isProcessing }) {
  const pending = sale.isOffline;
  const draft = sale.financialState === 'draft_offline';
  const rejected = sale.financialState === 'rejected';
  const confirmed = !pending && !draft && !rejected;
  const Icon = confirmed ? Check : rejected ? XCircle : draft ? FilePenLine : Clock3;
  const badge = confirmed ? 'success' : rejected ? 'danger' : 'warning';
  return <Card className="flex max-h-full min-h-0 flex-col overflow-hidden p-0 sm:p-0">
    <div role="region" aria-label="Resultado de la venta" tabIndex={0} className="ui-scroll min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3.5 text-center focus-visible:outline-offset-[-3px]">
      <header className={cn('rounded-2xl border px-3 py-4', confirmed ? 'border-finance-line bg-linear-to-b from-success-soft to-panel' : 'border-line bg-subtle/60')}>
        <span className={cn('mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl border shadow-xs', confirmed ? 'border-finance-line bg-panel text-success' : rejected ? 'border-danger/20 bg-danger-soft text-danger' : 'border-warning/20 bg-warning-soft text-warning')}>
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <Badge variant={badge}>{draft ? 'Sin cobrar' : rejected ? 'No realizada' : pending ? 'Por comprobar' : 'Registrada'}</Badge>
        <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-ink">{draft ? (sale.localRecordMissing ? 'Copia local no disponible' : 'Guardado en este dispositivo') : rejected ? 'La venta no se realizó' : pending ? 'Comprobando venta' : 'Venta registrada'}</h2>
      </header>
      <dl className="space-y-1 rounded-xl border border-line bg-canvas px-3 py-3">
        <dt className="text-xs font-semibold text-muted">{confirmed ? 'Total confirmado' : draft ? 'Importe guardado' : rejected ? 'Importe del ticket' : 'Importe pendiente'}</dt>
        <dd className={cn('text-3xl font-extrabold tracking-tight tabular-nums', confirmed && 'text-success')}>S/ {sale.total.toFixed(2)}</dd>
      </dl>
      {sale.payment === 'efectivo' && sale.change > 0 && <div className={cn('flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-3 py-2 text-left', confirmed ? 'border-finance-line bg-success-soft text-success' : 'border-line bg-subtle text-muted')}>
        <span className="text-sm font-semibold">{confirmed ? 'Vuelto a entregar' : 'Vuelto calculado (pendiente)'}</span>
        <strong className="ml-auto text-lg font-extrabold tabular-nums">S/ {sale.change.toFixed(2)}</strong>
      </div>}
      {sale.localRecordMissing && <Alert variant="warning" className="text-left">El navegador ya no tiene el registro durable de este ticket. Conserva su referencia.</Alert>}
      {draft ? <p className="text-sm text-muted">Aún no se ha cobrado ni se ha movido inventario. Al conectarte, revisa precios, productos y tu caja antes de confirmar.</p>
        : pending && !rejected && <Alert variant="warning" className="text-left">No repitas el cobro. Comprueba el resultado por el mismo ticket.</Alert>}
      <p className="text-xs text-muted wrap-anywhere">ID: {sale.saleId}</p>
    </div>
    <footer className="grid shrink-0 gap-2 border-t border-line bg-panel px-3.5 py-3">
      {draft ? <Button variant="secondary" onClick={onReview} disabled={isProcessing || sale.localRecordMissing}>Revisar y confirmar</Button>
        : pending && !rejected && <Button variant="secondary" onClick={onVerify} loading={isProcessing}>Verificar venta</Button>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="px-2 text-xs" disabled={isProcessing} onClick={() => onPrint(sale)}><Printer aria-hidden="true" />{confirmed ? 'Imprimir ticket' : draft ? 'Imprimir borrador' : 'Imprimir registro sin confirmar'}</Button>
        <Button className="px-2 text-xs" disabled={isProcessing} onClick={onNew}><Plus aria-hidden="true" />Nueva operación</Button>
      </div>
    </footer>
  </Card>;
}
function revealPaymentFocus(pane) {
  const active = document.activeElement;
  if (!pane?.contains(active) || !active.matches('input, select, textarea, button')) return;
  const field = active.getBoundingClientRect(), bounds = pane.getBoundingClientRect();
  if (field.top < bounds.top + 4) pane.scrollTop -= bounds.top + 4 - field.top;
  else if (field.bottom > bounds.bottom - 4) pane.scrollTop += field.bottom - bounds.bottom + 4;
}
export function Ticket({ cart, total, onQty, onRemove, isProcessing, children, action, drawer = false, catalogChanges = {}, onAcceptChange }) {
  const paymentRef = useRef(null);
  useLayoutEffect(() => {
    // Reflow can move an already focused field without firing another focus event.
    const observer = new ResizeObserver(() => revealPaymentFocus(paymentRef.current));
    observer.observe(paymentRef.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { revealPaymentFocus(paymentRef.current); });
  return <Card className={cn('pos-ticket flex min-h-0 flex-col overflow-hidden p-0 sm:p-0', drawer && 'pos-ticket-drawer')}>
    <header className="pos-ticket-heading flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-primary/20 bg-primary-soft px-3.5 py-2">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-brand-deep">
        <span className="pos-ticket-heading-icon flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-panel text-primary"><ReceiptText aria-hidden="true" className="size-4" /></span>
        Ticket de venta
      </h2>
      <Badge variant="primary" className="border border-primary/15 bg-panel/85 px-2 py-0.5 font-bold tabular-nums">{cart.length} {cart.length === 1 ? 'producto' : 'productos'}</Badge>
    </header>
    {cart.length >= VERIFIED_ATOMIC_LINE_LIMIT && <p role="status" className="shrink-0 border-b border-line bg-warning-soft px-3 py-1 text-xs text-warning">Llegaste al límite de productos.</p>}
    <div className="pos-ticket-items ui-scroll px-3.5 focus-visible:outline-offset-[-3px]" role="region" aria-label="Productos del ticket" tabIndex={0}>
      {cart.length ? <ul role="list">
        {cart.map(item => <CartItem key={item.id} item={item} onQty={onQty} onRemove={onRemove} disabled={isProcessing} change={catalogChanges[item.id]} onAcceptChange={onAcceptChange} />)}
      </ul> : <p className="grid min-h-full place-content-center justify-items-center gap-2 py-3 text-center text-sm font-medium text-muted">
        <span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary-soft/50 text-primary"><ShoppingBag aria-hidden="true" className="size-5" /></span>
        Tu ticket está vacío
      </p>}
    </div>
    <div className="pos-ticket-total flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-y border-finance-line px-3.5 py-2">
      <span className="text-sm font-bold">Total a cobrar</span><strong className="ml-auto min-w-0 text-right text-2xl font-extrabold tracking-tight tabular-nums wrap-anywhere">S/ {total.toFixed(2)}</strong>
    </div>
    <div ref={paymentRef} onFocusCapture={() => requestAnimationFrame(() => revealPaymentFocus(paymentRef.current))} className="pos-ticket-payment ui-scroll space-y-2.5 p-3 focus-visible:outline-offset-[-3px]" role="region" aria-label="Pago y validación" tabIndex={0}>
      {children}
    </div>
    <footer className="pos-ticket-actions border-t border-primary/15 bg-panel p-3">{action}</footer>
  </Card>;
}
