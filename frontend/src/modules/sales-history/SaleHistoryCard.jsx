import { Card, Button, Badge, cn } from '../../shared/ui';
import { runtimeCapabilities } from '../../config/runtimeCapabilities.js';
export function SaleHistoryCard({
  s,
  user,
  businessBranches,
  formatDate,
  isProcessing,
  verificarPendiente,
  setSaleToCancel
}) {
  const isAnulada = s.voided === true;
  const branchName = businessBranches?.find(b => b.id === s.branchId)?.name || 'Sede Local';
  const tipoPago = String(s.payment || 'efectivo').toLowerCase();
  const isEfectivo = tipoPago === 'efectivo';
  const isYape = tipoPago === 'yape' || tipoPago === 'plin';
  const isMixto = tipoPago === 'mixto';

  // Definimos el color del borde de la cabecera
  let borderClass = '';
  if (isAnulada) borderClass = "border-t-line";else if (isEfectivo) borderClass = "border-t-success";else if (isYape) borderClass = "border-t-accent";else if (isMixto) borderClass = "border-t-primary";
  return <Card key={s.id} className={cn(`flex min-w-0 flex-col overflow-hidden p-0 sm:p-0 animate-enter motion-reduce:animate-none ${isAnulada ? "border-dashed opacity-65" : ''} `)} as="div">

                {/* CABECERA DE LA TARJETA MEJORADA */}
                <div className={cn(`flex flex-wrap items-start justify-between gap-3 border-t-4 p-4 ${borderClass} `)}>
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{formatDate(s.createdAt || s.date)}</span>
                      {s.isOffline && !isAnulada && <span className="rounded-md border border-line bg-subtle px-2 py-1 text-xs text-muted">{s.queueStatus === 'failed' ? 'FALLIDA' : 'PENDIENTE'}</span>}
                    </div>
                    <span className="break-all font-mono text-xs text-muted">ID: {s.id.substring(0, 8).toUpperCase()} • 🏢 {branchName}</span>
                    {s.lastError && <span role="alert">{s.lastError || 'La venta no pudo sincronizarse.'}</span>}
                  </div>

                  <div className="grid gap-2 text-right">
                    <span className="text-2xl font-extrabold text-brand-deep tabular-nums">S/ {Number(s.total).toFixed(2)}</span>
                    {isAnulada ? <Badge className="inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-danger-soft text-danger">❌ ANULADA</Badge> : <Badge className={cn(`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isEfectivo ? "bg-success-soft text-success" : isYape ? "bg-accent-soft text-accent" : isMixto ? "bg-primary-soft text-primary" : ''} `)}>
                        {isEfectivo ? '💵 EFECTIVO' : isYape ? '📲 YAPE' : isMixto ? '🔄 MIXTO' : s.payment}
                      </Badge>}
                  </div>
                </div>

                {/* DETALLE COMPRA */}
                <div className="grid flex-1 gap-3 border-t border-dashed border-line bg-primary-soft/25 p-4">
                  <p className="text-xs font-semibold text-muted">Detalle del Ticket</p>

                  <div className="grid divide-y divide-line">
                    {s.items && s.items.map((i, index) => <div key={i.id || index} className="flex min-w-0 items-center justify-between gap-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="shrink-0 rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold">{i.qty}x</div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="break-words text-sm font-medium">{i.name}</span>
                            {i.category && <span className="rounded-md bg-primary-soft px-2 py-1 text-xs text-primary">
                                {i.category}
                              </span>}
                          </div>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">
                          S/ {(i.price * i.qty).toFixed(2)}
                        </span>
                      </div>)}
                  </div>

                  {!isAnulada && <>
                      {/* Resumen de Vuelto (Para Efectivo puro) */}
                      {isEfectivo && s.amountPaid && s.change > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line pt-3 text-sm text-muted">
                          <span>Recibido: <strong>S/ {Number(s.amountPaid).toFixed(2)}</strong></span>
                          <span>Vuelto: <span className="rounded-md bg-success-soft px-2 py-1 font-semibold text-success">S/ {Number(s.change).toFixed(2)}</span></span>
                        </div>}

                      {isMixto && s.splitPayments && <div className="flex flex-wrap gap-2 animate-enter motion-reduce:animate-none">
                          <div className="flex flex-1 flex-wrap justify-center gap-1 rounded-xl bg-success-soft p-3 text-xs font-semibold text-success">
                            <span>💵 Ef:</span>
                            <span>S/ {Number(s.splitPayments.efectivo).toFixed(2)}</span>
                          </div>
                          <div className="flex flex-1 flex-wrap justify-center gap-1 rounded-xl bg-accent-soft p-3 text-xs font-semibold text-accent">
                            <span>📲 Yp:</span>
                            <span>S/ {Number(s.splitPayments.yape).toFixed(2)}</span>
                          </div>
                        </div>}
                    </>}
                </div>

                {/* FOOTER */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                    <span>👤</span>
                    <span className="break-words">
                      {s.cashierName?.includes('@') ? 'Cajero de Turno' : s.cashierName}
                    </span>
                  </div>

                  {s.isOffline && <Button disabled={isProcessing} onClick={() => verificarPendiente(s)} type="button" variant="secondary">Consultar receipt remoto (sin cobrar)</Button>}
                  {!isAnulada && !s.isOffline && user?.role === 'dueño' && <Button onClick={() => setSaleToCancel(s)} disabled={isProcessing || !runtimeCapabilities.saleVoid || s.atomicProtocol !== 2} title={s.atomicProtocol === 2 ? 'Requiere tu caja activa en la sede de origen; devolución única por los medios originales.' : 'Ticket histórico: requiere revisión; se conserva sin modificar.'} type="button" variant="danger">
                      {isProcessing ? '...' : 'Anular Ticket'}
                    </Button>}
                </div>

              </Card>;
}
