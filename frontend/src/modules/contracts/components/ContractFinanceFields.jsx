import { FormField, Input, Select, cn, SectionCard } from '../../../shared/ui';
import { WalletCards } from 'lucide-react';
export function ContractFinanceFields({
  formData,
  isProcessing,
  isEditing,
  totals,
  handleChange
}) {
  const hasBalance = totals.balance > 0;
  return <SectionCard number="4" title="Finanzas y cobro" icon={WalletCards} tone="finance" description={isEditing ? 'Puedes ajustar los precios. Los abonos previos se mantienen.' : 'Define el total y registra una primera cuota si corresponde.'}>
    <div className={cn('grid gap-3', isEditing ? 'md:grid-cols-2' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)]')}>
      <fieldset className="grid min-w-0 content-start gap-3 rounded-xl border border-finance-line/75 bg-panel/85 p-3 sm:grid-cols-2 md:grid-cols-1">
        <legend className="px-1 text-xs font-bold text-success">Costos del pedido</legend>
        <FormField label="Costo del Producto (S/)" required>
          <Input name="subtotal" type="number" min="0" step="0.01" value={formData.subtotal} onChange={handleChange} disabled={isProcessing} required placeholder="0.00" />
        </FormField>
        <FormField label="Costo Delivery (S/)">
          <Input name="deliveryCost" type="number" min="0" step="0.01" value={formData.deliveryCost} onChange={handleChange} disabled={isProcessing || formData.deliveryType !== 'domicilio'} placeholder="0.00" />
        </FormField>
      </fieldset>
      <dl className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-success/35 bg-linear-to-br from-panel to-success-soft p-4 text-center text-success shadow-xs md:mt-2">
        <dt className="text-xs font-extrabold tracking-wider uppercase">Total del pedido</dt>
        <dd className="max-w-full text-3xl font-extrabold tracking-tight tabular-nums wrap-anywhere">S/ {totals.total.toFixed(2)}</dd>
      </dl>
      {!isEditing && <fieldset className="grid min-w-0 content-start gap-3 rounded-xl border border-finance-line/75 bg-panel/85 p-3 sm:grid-cols-2 md:grid-cols-1">
        <legend className="px-1 text-xs font-bold text-success">Pago inicial</legend>
        <FormField label={<>1ra Cuota (S/) <span className="text-xs font-normal text-muted">(Opcional)</span></>}>
          <Input name="advancePayment" type="number" min="0" max={totals.total} step="0.01" value={formData.advancePayment} onChange={handleChange} disabled={isProcessing || totals.total === 0} placeholder="0.00" />
        </FormField>
        <FormField label="Método de Pago">
          <Select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} disabled={isProcessing || !formData.advancePayment || Number(formData.advancePayment) === 0}>
            <option value="efectivo">Efectivo (a caja)</option>
            <option value="yape">Yape / Plin</option>
          </Select>
        </FormField>
      </fieldset>}
    </div>
    {(isEditing || totals.total > 0) && <dl className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3 py-2.5', hasBalance
      ? 'border-danger/25 bg-danger-soft text-danger' : 'border-finance-line bg-panel/85 text-success')}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <dt className="text-sm font-bold">{isEditing ? 'Nuevo saldo pendiente' : 'Saldo pendiente'}</dt>
        <dd className="text-xl font-extrabold tabular-nums">S/ {totals.balance.toFixed(2)}</dd>
      </div>
      {isEditing && <div className="flex flex-wrap gap-x-2 text-xs text-muted">
        <dt>Total abonado hasta ahora</dt><dd className="font-semibold tabular-nums">S/ {totals.totalPaid.toFixed(2)}</dd>
      </div>}
      {!isEditing && !hasBalance && <div className="text-xs font-medium"><dt className="sr-only">Estado</dt><dd>El pedido quedará totalmente pagado.</dd></div>}
    </dl>}
  </SectionCard>;
}
