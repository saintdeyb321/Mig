import { Banknote, ClipboardCheck, WalletCards } from 'lucide-react';
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Dialog, DialogFooter, FormField, Input, Textarea } from '../shared/ui';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { saleAmountCents } from '../features/sales/domain/saleModel.js';

function cashAmount(text) {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error('Ingresa un importe no negativo con máximo dos decimales, sin redondear.');
  }
  const value = Number(text);
  // Keep the existing cash/Rules ceiling; the POS text parser has a lower sale-only cap.
  saleAmountCents(value, 'El importe de caja', 1000000000);
  return value;
}

export function CashCountSummary({ summary }) {
  const provisional = summary.hasUnverifiedDisbursements || summary.expectedAmount < 0;
  const amount = value => `S/ ${Number(value ?? 0).toFixed(2)}`;
  const collected = summary.posCash + (summary.contractCashCollected ?? summary.contractCash);
  const result = provisional ? 'Por revisar con el dueño' : summary.difference === 0 ? 'Coincide con lo registrado'
    : summary.difference > 0 ? `Sobran ${amount(summary.difference)}` : `Faltan ${amount(-summary.difference)}`;
  return <>
    <dl className="space-y-3 rounded-2xl border border-finance-line bg-panel p-4 text-sm">
      {[['Dinero con que abriste', summary.openingAmount], ['Cobros en efectivo registrados', collected],
        [`Tickets anulados registrados${summary.posCompensationCount ? ` · ${summary.posCompensationCount}` : ''}`, Math.abs(summary.posCompensationTotal ?? summary.posCompensationCash ?? 0)],
        ['Dinero que contaste', summary.declaredAmount]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{amount(value)}</dd></div>)}
    </dl>
    <Alert variant={provisional || summary.difference > 0 ? 'warning' : summary.difference < 0 ? 'danger' : 'success'} title="Resultado del conteo">{result}</Alert>
    {provisional && <Alert variant="warning">{summary.posCompensationCount ? `Hay ${summary.posCompensationCount} anulaciones. ` : 'Hay devoluciones por revisar. '}Confirma con el dueño si se devolvió dinero. El resultado de caja es provisional.
      {summary.expectedAmount < 0 && <p>Los movimientos dan una referencia negativa de {amount(summary.expectedAmount)}. No es un saldo físico ni un sobrante.</p>}
    </Alert>}
    <details className="rounded-xl border border-line p-3 text-xs text-muted"><summary className="min-h-8 cursor-pointer font-semibold">Ver detalle</summary>
      <dl className="space-y-2">{[['Ventas POS en efectivo', summary.posCash], ['Contratos en efectivo (neto)', summary.contractCash],
        ['Anulaciones en efectivo', summary.posCompensationCash], ['Anulaciones Yape / Plin', summary.posCompensationDigital],
        ['Referencia de caja', summary.expectedAmount], ['Diferencia declarada', summary.difference]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd>{amount(value)}</dd></div>)}</dl>
      <p className="mt-3">Cierre operativo con conciliación pendiente. La referencia del navegador no certifica el saldo físico ni la entrega de dinero.</p>
    </details>
  </>;
}

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
    let amount;
    try { amount = cashAmount(openingAmount); }
    catch (error) {
      toast.error(error.message, { id: MODAL_TOAST_ID });
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
    let amount;
    try { amount = cashAmount(declaredAmount); }
    catch (error) {
      toast.error(error.message, { id: MODAL_TOAST_ID });
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
      toast.error('Agrega una observación de al menos 5 caracteres para revisar la diferencia.', { id: MODAL_TOAST_ID });
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
          <FormField label="Monto inicial (S/)"><Input type="number" min="0" step="0.01" required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
          <DialogFooter><Button variant="secondary" onClick={() => setShowOpenModal(false)}>Cancelar</Button><Button type="submit" loading={busy}>Abrir caja</Button></DialogFooter>
        </fieldset>
      </form>
      {runtimeCapabilities.offlineSync && <Button variant="secondary" onClick={authorizeOffline} disabled={busy || !navigator.onLine}>Autorizar apertura offline (15 min)</Button>}
    </Dialog>}
    {showCloseModal && !tempSummary && <Dialog icon={Banknote} title="¿Cuánto dinero tienes en la caja?" onClose={() => setShowCloseModal(false)} busy={busy} description="Cuenta los billetes y monedas que tienes físicamente y escribe el total.">
      <form onSubmit={submit(handleCalculate)}><fieldset disabled={busy} className="space-y-4">
        <FormField label="Toda la plata que contaste (S/)"><Input type="number" min="0" step="0.01" required value={declaredAmount} onChange={e => setDeclaredAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
        <DialogFooter><Button variant="secondary" onClick={() => setShowCloseModal(false)}>Aún no cerrar</Button><Button type="submit" loading={busy}>Siguiente</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
    {tempSummary && <Dialog icon={ClipboardCheck} title="Revisa el conteo" onClose={() => setTempSummary(null)} busy={busy} description="Compara el dinero contado con los movimientos registrados.">
      <CashCountSummary summary={tempSummary} />
      <form onSubmit={submit(handleFinalSave)}><fieldset disabled={busy} className="space-y-4">
        {(tempSummary.difference !== 0 || tempSummary.hasUnverifiedDisbursements) && <FormField label="Observaciones para el dueño"><Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Indica si hubo entrega de dinero o movimientos de otro turno." required={tempSummary.difference !== 0} /><p className="text-xs text-muted">Si devolviste dinero de una venta de otro turno, indícalo aquí. No registres otro ticket para compensar.</p></FormField>}
        <DialogFooter><Button variant="secondary" onClick={() => setTempSummary(null)}>Volver a contar</Button><Button type="submit" loading={busy}>Cerrar turno</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
  </>;
};
