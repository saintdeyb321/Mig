import { Banknote, Check, Coins, Smartphone, Split } from 'lucide-react';
import { createElement, useId } from 'react';
import { Alert, Button, FormField, Input, cn } from '../../shared/ui';

const methods = [
  {
    id: 'efectivo', label: 'Efectivo', icon: Banknote,
    idle: 'border-success/35 bg-success-soft/45 text-success hover:border-success hover:bg-success-soft',
    active: 'border-success bg-success-soft text-success ring-1 ring-inset ring-success hover:border-success hover:bg-success-soft',
  },
  {
    id: 'yape', label: 'Yape / Plin', icon: Smartphone,
    idle: 'border-accent/35 bg-accent-soft/45 text-accent hover:border-accent hover:bg-accent-soft',
    active: 'border-accent bg-accent-soft text-accent ring-1 ring-inset ring-accent hover:border-accent hover:bg-accent-soft',
  },
  {
    id: 'mixto', label: 'Mixto', icon: Split,
    idle: 'border-stellar/35 bg-stellar-soft/45 text-stellar hover:border-stellar hover:bg-stellar-soft',
    active: 'border-stellar bg-stellar-soft text-stellar ring-1 ring-inset ring-stellar hover:border-stellar hover:bg-stellar-soft',
  },
];

export function PaymentSelector({ payment, onSelect, disabled, inTicket = false }) {
  return <div className={cn('pos-payment-methods grid grid-cols-3 gap-1.5', inTicket && 'rounded-xl border border-primary/20 bg-panel p-1')} role="group" aria-label="Método de pago">
    {methods.map(({ id, label, icon: Icon, idle, active }) => {
      const selected = payment === id;
      return <Button key={id} variant="secondary" onClick={() => onSelect(id)} disabled={disabled} aria-pressed={selected} data-ticket-payment={inTicket ? id : undefined}
        className={cn('min-h-11 gap-1 px-1 py-1.5 text-xs shadow-none disabled:border-line disabled:bg-subtle disabled:text-muted disabled:opacity-100 disabled:ring-0',
          inTicket && 'relative',
          selected ? cn(inTicket ? 'font-extrabold' : 'font-bold', active) : idle)}>
        {selected ? <Check aria-hidden="true" className={inTicket ? 'payment-method-check' : 'payment-method-icon'} /> : createElement(Icon, { 'aria-hidden': true, className: 'payment-method-icon' })}
        <span className="min-w-0 wrap-anywhere">{label}</span>
      </Button>;
    })}
  </div>;
}
export function PaymentFields({ payment, amountPaid, onAmountPaid, splitEfectivo, onSplitEfectivo, splitYape, onSplitYape, total, validation, disabled, inTicket = false }) {
  const amountHintId = useId();
  const { errors, valid, change } = validation;
  const cashAmount = <FormField label="Monto recibido (S/)" className={inTicket ? 'gap-1' : undefined} error={amountPaid!==''&&errors.amountPaid}>
    <Input type="text" inputMode="decimal" aria-describedby={amountHintId} value={amountPaid} onChange={event=>onAmountPaid(event.target.value)} placeholder="0.00" disabled={disabled}
      className={cn('font-semibold', inTicket && 'bg-success-soft/30 text-right font-bold tabular-nums')} />
  </FormField>;
  return <div className={inTicket ? 'space-y-2' : 'space-y-3'}>
    {errors.total&&<Alert variant="warning">{errors.total} El carrito se conserva sin cobrar.</Alert>}
    {payment==='efectivo'&&<>
      <span id={amountHintId} className="sr-only">Máximo S/ 50 000. Hasta dos decimales.</span>
      {inTicket ? <div className="pos-cash-payment grid grid-cols-[minmax(0,11fr)_minmax(0,9fr)] items-start gap-2 rounded-xl bg-panel/70">
        {cashAmount}
        <dl className="grid min-w-0 gap-1">
          <dt className="flex items-center gap-1.5 text-sm font-semibold text-brand-deep"><Coins aria-hidden="true" className="size-4 shrink-0 text-success" />Vuelto</dt>
          <dd className={cn('flex min-h-11 justify-end rounded-xl border px-2 py-2 text-right font-extrabold tabular-nums wrap-anywhere sm:px-3',
            valid ? 'border-finance-line bg-success-soft text-success' : 'border-line bg-panel text-muted')}>
            {valid ? `S/ ${change.toFixed(2)}` : <><span aria-hidden="true">—</span><span className="sr-only">Por calcular</span></>}
          </dd>
        </dl>
      </div> : <>
        {cashAmount}
        {valid && <div className="flex justify-between rounded-lg bg-success-soft px-3 py-1 text-sm text-success">
          <span>Vuelto</span>
          <strong>S/ {change.toFixed(2)}</strong>
        </div>}
      </>}
    </>}
    {payment==='mixto'&&<div className={cn('grid grid-cols-2 gap-3', inTicket && 'gap-2')}>
      <FormField label="Efectivo (S/)" error={splitEfectivo!==''&&errors.splitEfectivo}>
        <Input type="text" inputMode="decimal" value={splitEfectivo} onChange={event=>onSplitEfectivo(event.target.value)} placeholder="0.00" disabled={disabled} className={inTicket ? 'bg-success-soft/30 text-right tabular-nums' : undefined} />
      </FormField>
      <FormField label="Yape / Plin (S/)" error={splitYape!==''&&errors.splitYape}>
        <Input type="text" inputMode="decimal" value={splitYape} onChange={event=>onSplitYape(event.target.value)} placeholder="0.00" disabled={disabled} className={inTicket ? 'bg-accent-soft/30 text-right tabular-nums' : undefined} />
      </FormField>
    </div>}
    {errors.payment&&total>0&&<Alert variant="warning">{errors.payment}</Alert>}
  </div>;
}
