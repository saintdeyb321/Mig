import { Banknote, Smartphone, Split } from 'lucide-react';
import { Alert, Button, FormField, Input } from '../../shared/ui';

const methods=[{id:'efectivo',label:'Efectivo',icon:Banknote},{id:'yape',label:'Yape / Plin',icon:Smartphone},{id:'mixto',label:'Mixto',icon:Split}];
export function PaymentSelector({ payment, onSelect, disabled }) {
  return <div className="grid grid-cols-3 gap-2" aria-label="Método de pago">{methods.map(method=>{
    const Icon=method.icon;
    return <Button key={method.id} variant={payment===method.id?'primary':'secondary'} onClick={()=>onSelect(method.id)} disabled={disabled} aria-pressed={payment===method.id} className="flex-col gap-1 px-1 py-2 text-[11px]"><Icon />{method.label}</Button>;
  })}</div>;
}
export function PaymentFields({ payment, amountPaid, onAmountPaid, splitEfectivo, onSplitEfectivo, splitYape, onSplitYape, total, disabled }) {
  return <div className="space-y-3">
    {payment==='efectivo'&&<><FormField label="Monto recibido (S/)"><Input type="number" inputMode="decimal" value={amountPaid} onChange={event=>onAmountPaid(event.target.value)} placeholder="0.00" disabled={disabled} className="font-semibold" /></FormField>
      {Number(amountPaid)>=total&&total>0&&<div className="flex justify-between rounded-xl bg-success-soft p-3 text-sm text-success"><span>Vuelto</span><strong>S/ {(Number(amountPaid)-total).toFixed(2)}</strong></div>}
    </>}
    {payment==='mixto'&&<><div className="grid grid-cols-2 gap-3"><FormField label="Efectivo (S/)"><Input type="number" inputMode="decimal" value={splitEfectivo} onChange={event=>onSplitEfectivo(event.target.value)} placeholder="0.00" disabled={disabled} /></FormField>
      <FormField label="Yape / Plin (S/)"><Input type="number" inputMode="decimal" value={splitYape} onChange={event=>onSplitYape(event.target.value)} placeholder="0.00" disabled={disabled} /></FormField></div>
      {(Number(splitEfectivo)+Number(splitYape)).toFixed(2)!==total.toFixed(2)&&(splitEfectivo!==''||splitYape!=='')&&<Alert variant="warning">La suma debe ser exactamente S/ {total.toFixed(2)}</Alert>}
    </>}
  </div>;
}
