import { FormField, Input, Select, cn } from '../../../shared/ui';
export function ContractFinanceFields({
  formData,
  isProcessing,
  isEditing,
  totals,
  handleChange
}) {
  return <div className="grid min-w-0 gap-4 rounded-xl border border-line p-4 bg-subtle/50">
              <h4 className="text-sm font-semibold">
                4. Finanzas y Cobro
                {isEditing && <span className="block text-xs font-normal text-muted"> (Puedes ajustar los precios. Los abonos previos se mantienen)</span>}
              </h4>

              <div className="grid min-w-0 gap-4">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <FormField label={<>Costo del Producto (S/) <span className="text-danger">*</span></>}>

                    <Input name="subtotal" type="number" min="0" step="0.50" value={formData.subtotal} onChange={handleChange} disabled={isProcessing} required placeholder="0.00" />
                  </FormField>
                  <FormField label={<>Costo Delivery (S/)</>}>

                    <Input name="deliveryCost" type="number" min="0" step="0.50" value={formData.deliveryCost} onChange={handleChange} disabled={isProcessing || formData.deliveryType !== 'domicilio'} placeholder="0.00" />
                  </FormField>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-soft p-4 text-sm text-primary [&>strong]:text-2xl">
                  <span>Total a Pagar</span>
                  <strong>S/ {totals.total.toFixed(2)}</strong>
                </div>

                {!isEditing && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <FormField label={<>1ra Cuota (S/) <span className="text-xs opacity-70 font-normal">(Opcional)</span></>}>

                      <Input name="advancePayment" type="number" min="0" max={totals.total} step="0.50" value={formData.advancePayment} onChange={handleChange} disabled={isProcessing || totals.total === 0} placeholder="0.00" />
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
            </div>;
}
