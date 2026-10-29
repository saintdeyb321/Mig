import { Check, Clock3, Minus, Plus, Printer, ReceiptText, ShoppingBag, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, cn } from '../../shared/ui';

export function CashStatus({ readOnly, session, isExpired = false, expiresAt = null, remainingMinutes = null }) {
  return <Badge title={expiresAt ? `Vence ${new Date(expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}. Hora orientativa; el servidor valida cada cobro.` : undefined} variant={readOnly||!session?'danger':session.needsForceClose||isExpired?'warning':'success'}>{readOnly?'Solo lectura':!session?'Caja cerrada':session.heldByOther?'Otro responsable':session.needsForceClose?'Turno pendiente':isExpired?'Caja vencida':expiresAt?`Caja · ${remainingMinutes} min restantes aprox.`:'Caja abierta'}</Badge>;
}
export function CartItem({ item, onQty, onRemove, disabled }) {
  return <div className="space-y-2 border-b border-line py-3 last:border-0"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold">{item.name}</p><strong className="shrink-0 text-sm tabular-nums">S/ {(item.price*item.qty).toFixed(2)}</strong></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="whitespace-nowrap text-xs text-muted">S/ {Number(item.price).toFixed(2)} c/u</span>
      <div className="flex items-center rounded-xl border border-line bg-subtle/40"><IconButton size="sm" label={`Reducir ${item.name}`} onClick={()=>onQty(item.id,item.qty-1)} disabled={disabled||item.qty<=1} className="size-11 min-h-11 sm:size-9 sm:min-h-9"><Minus /></IconButton><span className="min-w-6 text-center text-sm font-semibold tabular-nums">{item.qty}</span><IconButton size="sm" label={`Aumentar ${item.name}`} onClick={()=>onQty(item.id,item.qty+1)} disabled={disabled} className="size-11 min-h-11 sm:size-9 sm:min-h-9"><Plus /></IconButton></div>
      <IconButton label={`Quitar ${item.name}`} onClick={()=>onRemove(item.id)} disabled={disabled} className="size-11 min-h-11 sm:size-9 sm:min-h-9 text-danger"><Trash2 /></IconButton>
    </div>
  </div>;
}
export function CartSummary({ total, children }) {
  return <div className="space-y-4 border-t border-line bg-panel p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-finance-line bg-success-soft px-4 py-3 text-success"><span className="text-xs font-bold uppercase tracking-wide">Total a cobrar</span><strong className="text-3xl font-extrabold tracking-tight tabular-nums">S/ {total.toFixed(2)}</strong></div>{children}</div>;
}
export function SaleStatus({ sale, onPrint, onNew }) {
  const pending=sale.isOffline;
  const Icon=pending?Clock3:Check;
  return <Card className="space-y-5 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-subtle text-accent"><Icon className="size-7" /></span>
    <div><Badge variant={pending?'warning':'success'}>{pending?'Sin confirmación remota':'Confirmación remota recibida'}</Badge><h2 className="mt-3 text-xl font-bold">{pending?'Pendiente local, sin confirmar':'¡Venta confirmada!'}</h2></div>
    <p className="text-sm text-muted">{pending?'Importe pendiente:':'Total confirmado:'}<strong className="mt-1 block text-3xl text-ink tabular-nums">S/ {sale.total.toFixed(2)}</strong></p>
    <p className="break-all text-xs text-muted">ID: {sale.saleId}</p>
    {sale.payment==='efectivo'&&sale.change>0&&<p className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success">{pending?'Vuelto calculado (pendiente):':'Vuelto a entregar:'} S/ {sale.change.toFixed(2)}</p>}
    <div className="grid gap-2"><Button variant="secondary" onClick={()=>onPrint(sale)}><Printer />{pending?'Imprimir pendiente (sin confirmar)':'Imprimir ticket'}</Button><Button onClick={onNew}><Plus />Nueva venta</Button></div>
  </Card>;
}
export function Ticket({ cart, total, onQty, onRemove, isProcessing, children, action, drawer = false }) {
  return <Card className={cn("flex min-h-0 flex-col overflow-hidden p-0 sm:p-0", drawer ? "flex-1" : "max-h-[calc(100dvh-3rem)]")}><div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-linear-to-br from-brand-deep to-primary p-4 text-white sm:p-5"><h2 className="flex items-center gap-2 font-bold"><ReceiptText aria-hidden="true" className="size-5" />Ticket de venta</h2><Badge className="bg-white/15 text-white">{cart.length} {cart.length === 1 ? 'producto' : 'productos'}</Badge></div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="px-4 sm:px-5">{cart.length?cart.map(item=><CartItem key={item.id} item={item} onQty={onQty} onRemove={onRemove} disabled={isProcessing} />):<EmptyState icon={ShoppingBag} title="Tu ticket está vacío" description="Selecciona productos del catálogo para comenzar." className="my-4 border-0 py-6" />}</div>
    <CartSummary total={total}>{children}</CartSummary></div>
    <div className="shrink-0 border-t border-line bg-panel p-4 sm:p-5">{action}</div>
  </Card>;
}
