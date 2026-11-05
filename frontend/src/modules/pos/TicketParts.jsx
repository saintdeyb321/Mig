import { Check, Clock3, Minus, Plus, Printer, ReceiptText, ShoppingBag, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Alert, Badge, Button, Card, IconButton, cn } from '../../shared/ui';
import { VERIFIED_ATOMIC_LINE_LIMIT } from '../../features/sales/domain/checkoutPolicy.js';

export function CashStatus({ readOnly, session, isExpired = false, expiresAt = null, remainingMinutes = null }) {
  return <Badge title={expiresAt ? `Vence ${new Date(expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}. Hora orientativa; el servidor valida cada cobro.` : undefined} variant={readOnly||!session?'danger':session.serverConfirmed===false||session.needsForceClose||isExpired?'warning':'success'}>{readOnly?'Solo lectura':!session?'Caja cerrada':session.serverConfirmed===false?'Caja sin verificar':session.heldByOther?'Otro responsable':session.needsForceClose?'Turno pendiente':isExpired?'Caja vencida':expiresAt?`Caja · ${remainingMinutes} min restantes aprox.`:'Caja abierta'}</Badge>;
}
export function CartItem({ item, onQty, onRemove, disabled, change, onAcceptChange }) {
  return <div className="space-y-2 border-b border-line py-3 last:border-0"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold">{item.name}</p><strong className="shrink-0 text-sm tabular-nums">S/ {(item.price*item.qty).toFixed(2)}</strong></div>
    {change && !disabled && <Alert variant="warning" title={change.type === 'changed' ? 'Catálogo actualizado' : change.type === 'stock' ? 'Stock insuficiente' : 'Producto no disponible'}>
      {change.type === 'changed' ? <><p>Precio del carrito: S/ {Number(change.previousPrice).toFixed(2)} · Vigente: S/ {Number(change.currentPrice).toFixed(2)}. También se revisan costo y descripción.</p><Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAcceptChange(item.id)}>Aceptar datos vigentes</Button></>
        : change.type === 'stock' ? `Quedan ${change.stock} unidades. Reduce la cantidad o retira el producto.` : 'Retira este producto para continuar. No se ha registrado un cobro.'}
    </Alert>}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="whitespace-nowrap text-xs text-muted">S/ {Number(item.price).toFixed(2)} c/u</span>
      <div className="flex items-center rounded-xl border border-line bg-subtle/40"><IconButton size="sm" label={`Reducir ${item.name}`} onClick={()=>onQty(item.id,item.qty-1)} disabled={disabled||item.qty<=1} className="size-11 min-h-11 sm:size-9 sm:min-h-9"><Minus /></IconButton><span className="min-w-6 text-center text-sm font-semibold tabular-nums">{item.qty}</span><IconButton size="sm" label={`Aumentar ${item.name}`} onClick={()=>onQty(item.id,item.qty+1)} disabled={disabled} className="size-11 min-h-11 sm:size-9 sm:min-h-9"><Plus /></IconButton></div>
      <IconButton label={`Quitar ${item.name}`} onClick={()=>onRemove(item.id)} disabled={disabled} className="size-11 min-h-11 sm:size-9 sm:min-h-9 text-danger"><Trash2 /></IconButton>
    </div>
  </div>;
}
export function CartSummary({ total, children }) {
  return <div className="space-y-4 border-t border-line bg-panel p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-finance-line bg-success-soft px-4 py-3 text-success"><span className="text-xs font-bold uppercase tracking-wide">Total a cobrar</span><strong className="text-3xl font-extrabold tracking-tight tabular-nums">S/ {total.toFixed(2)}</strong></div>{children}</div>;
}
export function SaleStatus({ sale, onPrint, onNew, onVerify, onReview, isProcessing }) {
  const pending=sale.isOffline;
  const draft=sale.financialState==='draft_offline';
  const rejected=sale.financialState==='rejected';
  const Icon=pending?Clock3:Check;
  return <Card className="space-y-5 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-subtle text-accent"><Icon className="size-7" /></span>
    <div><Badge variant={pending?'warning':'success'}>{draft?'Sin cobrar':rejected?'No realizada':pending?'Por comprobar':'Registrada'}</Badge><h2 className="mt-3 text-xl font-bold">{draft?'Guardado en este dispositivo':rejected?'La venta no se realizó':pending?'Comprobando venta':'Venta registrada'}</h2></div>
    <p className="text-sm text-muted">{pending?'Importe pendiente:':'Total confirmado:'}<strong className="mt-1 block text-3xl text-ink tabular-nums">S/ {sale.total.toFixed(2)}</strong></p>
    <p className="break-all text-xs text-muted">ID: {sale.saleId}</p>
    {sale.payment==='efectivo'&&sale.change>0&&<p className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success">{pending?'Vuelto calculado (pendiente):':'Vuelto a entregar:'} S/ {sale.change.toFixed(2)}</p>}
    {draft ? <p className="text-sm text-muted">Aún no se ha cobrado ni se ha movido inventario. Al conectarte, revisa precios, productos y tu caja antes de confirmar.</p>
      : pending && !rejected && <Alert variant="warning">No repitas el cobro. Comprueba el resultado por el mismo ticket.</Alert>}
    <div className="grid gap-2">{draft ? <Button variant="secondary" onClick={onReview} disabled={isProcessing}>Revisar y confirmar</Button>
      : pending&&!rejected&&<Button variant="secondary" onClick={onVerify} loading={isProcessing}>Verificar venta</Button>}<Button variant="secondary" disabled={isProcessing} onClick={()=>onPrint(sale)}><Printer />{draft?'Imprimir borrador':pending?'Imprimir registro sin confirmar':'Imprimir ticket'}</Button><Button disabled={isProcessing} onClick={onNew}><Plus />Nueva operación</Button></div>
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
    <div className="pos-ticket-heading nebula-brand flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 text-white"><h2 className="flex items-center gap-2 font-bold"><ReceiptText aria-hidden="true" className="size-5" />Ticket de venta</h2><Badge className="bg-white/15 text-white">{cart.length} {cart.length === 1 ? 'producto' : 'productos'}</Badge></div>
    {cart.length >= VERIFIED_ATOMIC_LINE_LIMIT && <p role="status" className="shrink-0 border-b border-line bg-warning-soft px-3 py-1 text-xs text-warning">Llegaste al límite de productos.</p>}
    <div className="pos-ticket-items ui-scroll px-4" role="region" aria-label="Productos del ticket" tabIndex={0}>{cart.length?cart.map(item=><CartItem key={item.id} item={item} onQty={onQty} onRemove={onRemove} disabled={isProcessing} change={catalogChanges[item.id]} onAcceptChange={onAcceptChange} />):<p className="flex items-center justify-center gap-2 py-4 text-sm text-muted"><ShoppingBag aria-hidden="true" className="size-5 shrink-0" />Tu ticket está vacío</p>}</div>
    <div className="pos-ticket-total flex flex-wrap items-center justify-between gap-2 border-y border-finance-line bg-success-soft px-4 py-3 text-success"><span className="text-sm font-semibold">Total a cobrar</span><strong className="text-2xl font-extrabold tabular-nums">S/ {total.toFixed(2)}</strong></div>
    <div ref={paymentRef} onFocusCapture={() => requestAnimationFrame(() => revealPaymentFocus(paymentRef.current))} className="pos-ticket-payment ui-scroll space-y-3 bg-panel p-4" role="region" aria-label="Pago y validación" tabIndex={0}>
      {children}
    </div>
    <div className="pos-ticket-actions border-t border-line bg-panel p-4">{action}</div>
  </Card>;
}
