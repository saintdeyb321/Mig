import { FormField, Input, Select, cn, SectionCard } from '../../../shared/ui';
import { WalletCards } from 'lucide-react';
export function ContractFinanceFields({
  formData,
  isProcessing,
  isEditing,
  totals,
  handleChange
}) {
  return <SectionCard number="4" title="Finanzas y cobro" icon={WalletCards} tone="finance" description={isEditing ? 'Puedes ajustar los precios. Los abonos previos se mantienen.' : 'Define el total y registra una primera cuota si corresponde.'}>
              <div className="grid min-w-0 gap-4">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <FormField label={<>Costo del Producto (S/) <span className="text-danger">*</span></>}>

                    <Input name="subtotal" type="number" min="0" step="0.01" value={formData.subtotal} onChange={handleChange} disabled={isProcessing} required placeholder="0.00" />
                  </FormField>
                  <FormField label={<>Costo Delivery (S/)</>}>

                    <Input name="deliveryCost" type="number" min="0" step="0.01" value={formData.deliveryCost} onChange={handleChange} disabled={isProcessing || formData.deliveryType !== 'domicilio'} placeholder="0.00" />
                  </FormField>
                </div>

                <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-success/40 bg-panel p-4 text-success shadow-sm shadow-success/10">
                  <span className="text-xs font-bold uppercase tracking-widest">Total del pedido</span>
                  <strong className="text-3xl font-extrabold tabular-nums sm:text-4xl">S/ {totals.total.toFixed(2)}</strong>
                </div>

                {!isEditing && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <FormField label={<>1ra Cuota (S/) <span className="text-xs opacity-70 font-normal">(Opcional)</span></>}>

                      <Input name="advancePayment" type="number" min="0" max={totals.total} step="0.01" value={formData.advancePayment} onChange={handleChange} disabled={isProcessing || totals.total === 0} placeholder="0.00" />
                    </FormField>
                    <FormField label={<>Método de Pago</>}>

                      <Select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} disabled={isProcessing || !formData.advancePayment || Number(formData.advancePayment) === 0}>
                        <option value="efectivo">💵 Efectivo (A Caja)</option>
                        <option value="yape">📱 Yape/Plin</option>
                      </Select>
                    </FormField>
                  </div>}
              </div>

              {isEditing ? <div className={cn(`rounded-xl p-3 text-sm ${totals.balance > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"} `)}>
                  <div className="flex justify-between mb-1">
                    <span>Total Abonado hasta ahora:</span>
                    <strong>S/ {totals.totalPaid.toFixed(2)}</strong>
                  </div>
                  <div className={cn("flex justify-between", totals.balance > 0 ? "text-warning" : "text-success")}>
                    <span>Nuevo saldo pendiente:</span>
                    <strong>S/ {totals.balance.toFixed(2)}</strong>
                  </div>
                </div> : totals.total > 0 && <div className={cn(`rounded-xl p-3 text-sm ${totals.balance > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"} `)}>
                    {totals.balance > 0 ? `El cliente dejará un saldo pendiente de S/ ${totals.balance.toFixed(2)}` : 'El pedido quedará totalmente pagado ✅'}
                  </div>}
            </SectionCard>;
}
