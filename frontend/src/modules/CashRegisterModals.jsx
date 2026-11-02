import { Banknote, ClipboardCheck, WalletCards } from 'lucide-react';
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Dialog, DialogFooter, FormField, Input, Textarea } from '../shared/ui';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';

export const CashRegisterModals = ({
  showOpenModal, setShowOpenModal,
  showCloseModal, setShowCloseModal,
  isLoadingSession, authorizeOffline, openRegister, calculateClose, confirmClose
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [tempSummary, setTempSummary] = useState(null);
  const [closeNotes, setCloseNotes] = useState('');

  const MODAL_TOAST_ID = 'cash-modal-error'; // 🚀 Candado Anti-spam

  const handleOpen = async (e) => {
    e.preventDefault();
    const amount = Number(openingAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Ingresa un monto válido", { id: MODAL_TOAST_ID });
      return;
    }
    const success = await openRegister(amount);
    if (success) {
      setShowOpenModal(false);
      setOpeningAmount('');
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    const amount = Number(declaredAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Ingresa un monto válido", { id: MODAL_TOAST_ID });
      return;
    }
    const result = await calculateClose(amount);
    if (result && typeof result === 'object') {
      setTempSummary(result);
      setShowCloseModal(false);
    }
  };

  const handleFinalSave = async (e) => {
    e.preventDefault(); // 🚀 FIX: Prevenimos recarga de página al ser un formulario
    if (!tempSummary) return;

    if (tempSummary.difference !== 0 && closeNotes.trim().length < 5) {
      toast.error("Por favor, explica brevemente qué pasó con el dinero.", { id: MODAL_TOAST_ID });
      return;
    }

    const success = await confirmClose(tempSummary, closeNotes);

    if (success) {
      setTempSummary(null);
      setDeclaredAmount('');
      setCloseNotes('');
      setShowCloseModal(false);
    }
  };

  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = isLoadingSession || isSubmitting;
  const submit = handler => async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try { await handler(event); }
    finally { submitting.current = false; setIsSubmitting(false); }
  };

  return <>
    {showOpenModal && !tempSummary && <Dialog icon={WalletCards} title="Apertura de caja" onClose={() => setShowOpenModal(false)} busy={busy} description="Cuenta el fondo inicial. La nueva caja admite cobros durante un máximo de 10 horas; después debes cerrarla.">
      <form onSubmit={submit(handleOpen)}>
        <fieldset disabled={busy} className="space-y-4">
          <FormField label="Monto inicial (S/)"><Input type="number" step="0.10" required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
          <DialogFooter><Button variant="secondary" onClick={() => setShowOpenModal(false)}>Cancelar</Button><Button type="submit" loading={busy}>Abrir caja</Button></DialogFooter>
        </fieldset>
      </form>
      {runtimeCapabilities.offlineSync && <Button variant="secondary" onClick={authorizeOffline} disabled={busy || !navigator.onLine}>Autorizar apertura offline (15 min)</Button>}
    </Dialog>}
    {showCloseModal && !tempSummary && <Dialog icon={Banknote} title="¿Cuánto dinero tienes en la caja?" onClose={() => setShowCloseModal(false)} busy={busy} description="Cierre operativo: el resumen es una estimación del navegador, sin conciliación certificada. Cuenta toda la plata que tienes físicamente (billetes y monedas) y escribe el total abajo.">
      <form onSubmit={submit(handleCalculate)}><fieldset disabled={busy} className="space-y-4">
        <FormField label="Toda la plata que contaste (S/)"><Input type="number" step="0.10" required value={declaredAmount} onChange={e => setDeclaredAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
        <DialogFooter><Button variant="secondary" onClick={() => setShowCloseModal(false)}>Aún no cerrar</Button><Button type="submit" loading={busy}>Siguiente</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
    {tempSummary && <Dialog icon={ClipboardCheck} title="Confirmar cierre" onClose={() => setTempSummary(null)} busy={busy} description="Estimación del navegador. El cierre será operativo y quedará pendiente de conciliación; no certifica el libro completo.">
      <dl className="space-y-3 rounded-2xl border border-finance-line bg-success-soft p-5 text-sm">
        {[['Fondo inicial', tempSummary.openingAmount], ['Ventas cobradas en efectivo (incluye mixtos)', tempSummary.posCash], ['Cobros y devoluciones de contratos en efectivo', tempSummary.contractCash], ['Compensaciones POS en efectivo (entrega no acreditada)', tempSummary.posCompensationCash ?? 0], ['Efectivo esperado estimado', tempSummary.expectedAmount]].map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-semibold">S/ {Number(amount).toFixed(2)}</dd></div>)}
        <div className="flex flex-wrap justify-between gap-2"><dt>Dinero que dejaste</dt><dd className="font-bold text-primary">S/ {tempSummary.declaredAmount.toFixed(2)}</dd></div>
      </dl>
      {(tempSummary.hasUnverifiedDisbursements || tempSummary.expectedAmount < 0) && <Alert variant="warning" title="Revisión del dueño y conciliación pendientes">Las compensaciones se registran en la caja donde se anula, incluso para tickets de turnos anteriores. No acreditan una entrega física de efectivo ni Yape. {tempSummary.expectedAmount < 0 && 'La estimación negativa indica que las compensaciones superan el efectivo contable disponible; no representa un saldo físico ni un sobrante normal.'} El cierre conserva esta limitación y la declaración física.</Alert>}
      <Alert variant={tempSummary.requiresOwnerReview ? 'warning' : tempSummary.difference < 0 ? 'danger' : tempSummary.difference > 0 ? 'warning' : 'success'} title="Diferencia declarada frente a la estimación">
        {tempSummary.expectedAmount < 0 || tempSummary.hasUnverifiedDisbursements ? <>Diferencia estimada: S/ {tempSummary.difference.toFixed(2)}. Pendiente de revisión; no certifica faltante ni sobrante físico.</>
          : tempSummary.difference === 0 ? 'Conteo sin diferencia estimada'
          : tempSummary.difference > 0 ? <>Sobran S/ {tempSummary.difference.toFixed(2)} frente a la estimación</>
          : <>Faltan S/ {Math.abs(tempSummary.difference).toFixed(2)} frente a la estimación</>}
      </Alert>
      <p className="text-xs leading-relaxed text-muted">Fondo: S/ {Number(tempSummary.openingAmount).toFixed(2)} · POS efectivo (incluye mixtos): S/ {Number(tempSummary.posCash).toFixed(2)} · Contratos efectivo: S/ {Number(tempSummary.contractCash).toFixed(2)} · Digital (incluye mixtos): S/ {Number(tempSummary.digitalTotal).toFixed(2)}</p>
      <form onSubmit={submit(handleFinalSave)}><fieldset disabled={busy} className="space-y-4">
        {tempSummary.difference !== 0 && <FormField label="¿Qué pasó? Justifica el error"><Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Explica por qué faltó o sobró dinero..." required /></FormField>}
        <DialogFooter><Button variant="secondary" onClick={() => setTempSummary(null)}>Volver a contar</Button><Button type="submit" loading={busy}>Cerrar turno</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
  </>;
};
