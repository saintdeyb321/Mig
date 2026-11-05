import { Banknote, Smartphone, Split } from 'lucide-react';
import { useId } from 'react';
import { Alert, Button, FormField, Input } from '../../shared/ui';

const methods=[{id:'efectivo',label:'Efectivo',icon:Banknote},{id:'yape',label:'Yape / Plin',icon:Smartphone},{id:'mixto',label:'Mixto',icon:Split}];
export function PaymentSelector({ payment, onSelect, disabled }) {
  return <div className="grid grid-cols-3 gap-2" role="group" aria-label="Método de pago">{methods.map(method=>{
    const Icon=method.icon;
    return <Button key={method.id} variant={payment===method.id?'primary':'secondary'} onClick={()=>onSelect(method.id)} disabled={disabled} aria-pressed={payment===method.id} className="min-h-11 gap-1 px-1 py-2 text-xs"><Icon aria-hidden="true" />{method.label}</Button>;
  })}</div>;
}
export function PaymentFields({ payment, amountPaid, onAmountPaid, splitEfectivo, onSplitEfectivo, splitYape, onSplitYape, total, validation, disabled }) {
  const amountHintId = useId();
  const { errors, valid, change } = validation;
  return <div className="space-y-3">
    {errors.total&&<Alert variant="warning">{errors.total} El carrito se conserva sin cobrar.</Alert>}
    {payment==='efectivo'&&<><span id={amountHintId} className="sr-only">Máximo S/ 50 000. Hasta dos decimales.</span><FormField label="Monto recibido (S/)" error={amountPaid!==''&&errors.amountPaid}><Input type="text" inputMode="decimal" aria-describedby={amountHintId} value={amountPaid} onChange={event=>onAmountPaid(event.target.value)} placeholder="0.00" disabled={disabled} className="font-semibold" /></FormField>
      {valid&&<div className="flex justify-between rounded-lg bg-success-soft px-3 py-1 text-sm text-success"><span>Vuelto</span><strong>S/ {change.toFixed(2)}</strong></div>}
    </>}
    {payment==='mixto'&&<><div className="grid grid-cols-2 gap-3"><FormField label="Efectivo (S/)" error={splitEfectivo!==''&&errors.splitEfectivo}><Input type="text" inputMode="decimal" value={splitEfectivo} onChange={event=>onSplitEfectivo(event.target.value)} placeholder="0.00" disabled={disabled} /></FormField>
      <FormField label="Yape / Plin (S/)" error={splitYape!==''&&errors.splitYape}><Input type="text" inputMode="decimal" value={splitYape} onChange={event=>onSplitYape(event.target.value)} placeholder="0.00" disabled={disabled} /></FormField></div>
    </>}
    {errors.payment&&total>0&&<Alert variant="warning">{errors.payment}</Alert>}
  </div>;
}
