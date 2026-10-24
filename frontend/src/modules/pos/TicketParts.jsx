import { Check, Clock3, Minus, Plus, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton } from '../../shared/ui';

export function CashStatus({ readOnly, session }) {
  return <Badge variant={readOnly||!session?'danger':session.needsForceClose?'warning':'success'}>{readOnly?'Solo lectura':!session?'Caja cerrada':session.needsForceClose?'Turno pendiente':'Caja abierta'}</Badge>;
}
export function CartItem({ item, onQty, onRemove, disabled }) {
  return <div className="space-y-2 border-b border-line py-3 last:border-0"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold">{item.name}</p><strong className="shrink-0 text-sm tabular-nums">S/ {(item.price*item.qty).toFixed(2)}</strong></div>
    <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">S/ {Number(item.price).toFixed(2)} c/u</span>
      <div className="flex items-center rounded-lg border border-line"><IconButton size="sm" label={`Reducir ${item.name}`} onClick={()=>onQty(item.id,item.qty-1)} disabled={disabled||item.qty<=1} className="size-8 min-h-8"><Minus /></IconButton><span className="min-w-7 text-center text-sm font-semibold tabular-nums">{item.qty}</span><IconButton size="sm" label={`Aumentar ${item.name}`} onClick={()=>onQty(item.id,item.qty+1)} disabled={disabled} className="size-8 min-h-8"><Plus /></IconButton></div>
      <IconButton label={`Quitar ${item.name}`} onClick={()=>onRemove(item.id)} disabled={disabled} className="size-8 min-h-8 text-danger"><Trash2 /></IconButton>
    </div>
  </div>;
}
export function CartSummary({ total, children, action }) {
  return <div className="space-y-4 border-t border-line bg-panel p-4 sm:p-5"><div className="flex items-end justify-between gap-3"><span className="text-sm font-semibold text-muted">Total a cobrar</span><strong className="text-3xl font-bold tracking-tight text-primary tabular-nums">S/ {total.toFixed(2)}</strong></div>{children}{action}</div>;
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
export function Ticket({ cart, total, onQty, onRemove, isProcessing, children, action }) {
  return <Card className="overflow-hidden p-0 sm:p-0"><div className="flex items-center justify-between gap-2 border-b border-line p-4 sm:p-5"><h2 className="font-bold">Ticket de venta</h2><Badge variant="accent">{cart.length} / 2 productos</Badge></div>
    <div className="max-h-[35dvh] overflow-y-auto px-4 sm:px-5">{cart.length?cart.map(item=><CartItem key={item.id} item={item} onQty={onQty} onRemove={onRemove} disabled={isProcessing} />):<EmptyState icon={ShoppingBag} title="Tu ticket está vacío" description="Selecciona productos del catálogo para comenzar." className="my-4 border-0 py-6" />}</div>
    <CartSummary total={total} action={action}>{children}</CartSummary>
  </Card>;
}
