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
  return <div className="pos-payment-methods grid grid-cols-3 gap-1.5" role="group" aria-label="Método de pago">
    {methods.map(({ id, label, icon: Icon, idle, active }) => {
      const selected = payment === id;
      return <Button key={id} variant="secondary" onClick={() => onSelect(id)} disabled={disabled} aria-pressed={selected}
        className={cn('min-h-11 gap-1 px-1 py-1.5 text-xs shadow-none disabled:border-line disabled:bg-subtle disabled:text-muted disabled:opacity-100 disabled:ring-0',
          inTicket && 'relative',
          selected ? cn('font-bold', active) : cn(idle, inTicket && 'border-line bg-panel'))}>
        {selected ? <Check aria-hidden="true" className={inTicket ? 'payment-method-check' : 'payment-method-icon'} /> : createElement(Icon, { 'aria-hidden': true, className: 'payment-method-icon' })}
        <span className="min-w-0 wrap-anywhere">{label}</span>
      </Button>;
    })}
  </div>;
}
export function PaymentFields({ payment, amountPaid, onAmountPaid, splitEfectivo, onSplitEfectivo, splitYape, onSplitYape, total, validation, disabled, inTicket = false }) {
  const amountHintId = useId();
  const { errors, valid, change } = validation;
  return <div className={inTicket ? 'space-y-2' : 'space-y-3'}>
    {errors.total&&<Alert variant="warning">{errors.total} El carrito se conserva sin cobrar.</Alert>}
    {payment==='efectivo'&&<>
      <span id={amountHintId} className="sr-only">Máximo S/ 50 000. Hasta dos decimales.</span>
      <FormField label="Monto recibido (S/)" className={inTicket ? 'gap-1' : undefined} error={amountPaid!==''&&errors.amountPaid}>
        <Input type="text" inputMode="decimal" aria-describedby={amountHintId} value={amountPaid} onChange={event=>onAmountPaid(event.target.value)} placeholder="0.00" disabled={disabled}
          className={cn('font-semibold', inTicket && 'bg-success-soft/30 text-right font-bold tabular-nums')} />
      </FormField>
      {valid&&<div className={cn('flex justify-between rounded-lg bg-success-soft px-3 py-1 text-sm text-success', inTicket && 'flex-wrap items-center gap-1.5 border border-finance-line py-1.5')}>
        <span className={inTicket ? 'flex items-center gap-1.5 font-semibold' : undefined}>{inTicket && <Coins aria-hidden="true" className="size-4" />}Vuelto</span>
        <strong className={inTicket ? 'ml-auto font-extrabold tabular-nums' : undefined}>S/ {change.toFixed(2)}</strong>
      </div>}
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
