import { Banknote, ChevronDown, ClipboardCheck, WalletCards } from 'lucide-react';
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Dialog, DialogFooter, FormField, Input, Textarea } from '../shared/ui';
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
  const result = provisional ? 'Por revisar' : summary.difference === 0 ? 'Coincide'
    : summary.difference > 0 ? `Sobran ${amount(summary.difference)}` : `Faltan ${amount(-summary.difference)}`;
  return <>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      {[[provisional ? 'Referencia calculada' : 'Dinero esperado', summary.expectedAmount], ['Dinero contado', summary.declaredAmount]].map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-subtle/50 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-xl font-extrabold tabular-nums">{amount(value)}</dd></div>)}
      <div className={`col-span-2 rounded-2xl border p-4 ${provisional || summary.difference > 0 ? 'border-warning/25 bg-warning-soft text-warning' : summary.difference < 0 ? 'border-danger/25 bg-danger-soft text-danger' : 'border-finance-line bg-success-soft text-success'}`}>
        <dt className="text-sm font-semibold">Resultado del conteo</dt><dd className="mt-1 text-2xl font-extrabold tabular-nums">{result}</dd>
        <dd className="mt-1 text-sm">{provisional ? 'Cuadre provisional: hay anulaciones o devoluciones por verificar. Revísalo con el dueño.' : summary.difference === 0 ? 'El conteo coincide con los movimientos registrados.' : 'Deja una observación para revisar la diferencia.'}</dd>
      </div>
    </dl>
    <details className="group rounded-xl border border-line bg-panel p-3 text-xs text-muted"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">Ver detalle del cuadre<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary>
      <dl className="mt-2 space-y-2">{[['Fondo inicial', summary.openingAmount], ['Cobros en efectivo registrados', collected], ['Ventas POS en efectivo', summary.posCash], ['Contratos en efectivo (neto)', summary.contractCash],
        ['Anulaciones en efectivo', summary.posCompensationCash], ['Anulaciones Yape / Plin', summary.posCompensationDigital],
        ['Tickets anulados (importe registrado)', summary.posCompensationTotal], ['Referencia de caja', summary.expectedAmount], ['Diferencia declarada', summary.difference]].filter(([, value]) => value != null).map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="tabular-nums">{amount(value)}</dd></div>)}</dl>
      {summary.posCompensationCount > 0 && <p className="mt-3">{summary.posCompensationCount} tickets anulados. Las compensaciones registradas no acreditan una entrega física de efectivo ni una devolución digital.</p>}
      {summary.expectedAmount < 0 && <p className="mt-3">La referencia negativa de {amount(summary.expectedAmount)} no es un saldo físico ni un sobrante.</p>}
      <p className="mt-3">Los gastos o entregas de dinero no registrados no forman parte de esta referencia; indícalos en observaciones.</p>
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
    {showOpenModal && !tempSummary && <Dialog icon={WalletCards} title="Abrir caja" onClose={() => setShowOpenModal(false)} busy={busy} description="Escribe el fondo inicial disponible. Turno máximo: 10 horas.">
      <form onSubmit={submit(handleOpen)}>
        <fieldset disabled={busy} className="space-y-4">
          <FormField label="Fondo inicial (S/)"><Input type="number" min="0" step="0.01" required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
          <DialogFooter><Button variant="secondary" onClick={() => setShowOpenModal(false)}>Cancelar</Button><Button type="submit" loading={busy}>Abrir caja</Button></DialogFooter>
        </fieldset>
      </form>
      {runtimeCapabilities.offlineSync && <Button variant="secondary" onClick={authorizeOffline} disabled={busy || !navigator.onLine}>Autorizar apertura offline (15 min)</Button>}
    </Dialog>}
    {showCloseModal && !tempSummary && <Dialog icon={Banknote} title="¿Cuánto efectivo contaste?" onClose={() => setShowCloseModal(false)} busy={busy} description="Cuenta billetes y monedas; escribe el total.">
      <form onSubmit={submit(handleCalculate)}><fieldset disabled={busy} className="space-y-4">
        <FormField label="Dinero contado (S/)"><Input type="number" min="0" step="0.01" required value={declaredAmount} onChange={e => setDeclaredAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
        <DialogFooter><Button variant="secondary" onClick={() => setShowCloseModal(false)}>Volver</Button><Button type="submit" loading={busy}>Siguiente</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
    {tempSummary && <Dialog icon={ClipboardCheck} title="Revisa el conteo" onClose={() => setTempSummary(null)} busy={busy} description="Compara el dinero contado con los movimientos registrados." className="cash-confirm-dialog" bodyClassName="overflow-hidden">
      <form onSubmit={submit(handleFinalSave)} className="flex min-h-0 flex-1 flex-col"><fieldset disabled={busy} className="flex min-h-0 flex-1 flex-col">
        <div className="ui-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-3">
        <CashCountSummary summary={tempSummary} />
        {(tempSummary.difference !== 0 || tempSummary.hasUnverifiedDisbursements) && <FormField label="Observaciones para el dueño"><Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Indica si hubo entrega de dinero o movimientos de otro turno." required={tempSummary.difference !== 0} /><p className="text-xs text-muted">Si devolviste dinero de una venta de otro turno, indícalo aquí. No registres otro ticket para compensar.</p></FormField>}
        </div>
        <DialogFooter className="static mt-0"><Button variant="secondary" onClick={() => setTempSummary(null)}>Volver a contar</Button><Button type="submit" loading={busy}>Cerrar turno</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
  </>;
};
