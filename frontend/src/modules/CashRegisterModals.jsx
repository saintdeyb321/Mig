import { Banknote, ChevronDown, ClipboardCheck, WalletCards } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Dialog, DialogFooter, FormField, Input, Textarea, cn } from '../shared/ui';
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
  const resultTone = provisional || summary.difference < 0 ? 'border-warning/30 bg-warning-soft text-warning'
    : summary.difference > 0 ? 'border-danger/30 bg-danger-soft text-danger' : 'border-finance-line bg-success-soft text-success';
  const groups = [
    ['Fondo inicial', [['Fondo de apertura', summary.openingAmount]]],
    ['Cobros y medios de pago', [['Cobros en efectivo registrados', collected], ['Ventas POS en efectivo', summary.posCash], ['Contratos en efectivo (neto)', summary.contractCash], ['Yape / Plin (neto)', summary.digitalTotal]]],
    ['Anulaciones y compensaciones', [['Anulaciones en efectivo', summary.posCompensationCash], ['Anulaciones Yape / Plin', summary.posCompensationDigital], ['Tickets anulados (importe registrado)', summary.posCompensationTotal]]],
    ['Referencia y diferencia', [['Referencia de caja', summary.expectedAmount], [provisional ? 'Diferencia estimada' : 'Diferencia declarada', summary.difference]]],
  ];
  return <>
    <dl className="grid gap-3 text-sm xs:grid-cols-2">
      <div className="rounded-xl border border-stellar/25 bg-stellar-soft p-3">
        <dt className="text-xs font-semibold text-stellar">{provisional ? 'Referencia calculada' : 'Dinero esperado'}</dt>
        <dd className="mt-1 text-xl font-extrabold tabular-nums">{amount(summary.expectedAmount)}</dd>
      </div>
      <div className="rounded-xl border border-line bg-canvas p-3">
        <dt className="text-xs font-semibold text-muted">Dinero contado</dt>
        <dd className="mt-1 text-xl font-extrabold tabular-nums">{amount(summary.declaredAmount)}</dd>
      </div>
      <div className={cn('rounded-xl border p-3 xs:col-span-2', resultTone)}>
        <dt className="text-sm font-semibold">Resultado del conteo</dt><dd className="mt-1 text-2xl font-extrabold tabular-nums">{result}</dd>
        <dd className="mt-1 text-sm">{provisional ? 'Cuadre provisional: hay anulaciones o devoluciones por verificar. Revísalo con el dueño.' : summary.difference === 0 ? 'El conteo coincide con los movimientos registrados.' : 'Deja una observación para revisar la diferencia.'}</dd>
      </div>
    </dl>
    <details className="group rounded-xl border border-line bg-subtle/50 px-3 text-xs text-muted">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-ink">Ver detalle del cuadre<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary>
      <div className="space-y-3 border-t border-line py-3">
        {groups.map(([heading, rows]) => {
          const recorded = rows.filter(([, value]) => value != null);
          if (!recorded.length) return null;
          return <section key={heading} className="space-y-1.5">
            <h3 className="font-semibold text-ink">{heading}</h3>
            <dl className="divide-y divide-line">{recorded.map(([label, value]) => <div key={label} className="flex justify-between gap-2 py-1"><dt>{label}</dt><dd className="shrink-0 font-medium tabular-nums">{amount(value)}</dd></div>)}</dl>
          </section>;
        })}
        <div className="space-y-2 rounded-lg bg-warning-soft p-3 text-warning">
          <h3 className="font-semibold">Aclaraciones</h3>
          {summary.posCompensationCount > 0 && <p>{summary.posCompensationCount} tickets anulados. Las compensaciones registradas no acreditan una entrega física de efectivo ni una devolución digital.</p>}
          {summary.expectedAmount < 0 && <p>La referencia negativa de {amount(summary.expectedAmount)} no es un saldo físico ni un sobrante.</p>}
          <p>Los gastos o entregas de dinero no registrados quedan fuera de esta referencia. Indícalos en observaciones.</p>
          <p>Cierre operativo con conciliación pendiente. La referencia del navegador no certifica el saldo físico ni la entrega de dinero.</p>
        </div>
      </div>
    </details>
  </>;
}

export const CashRegisterModals = ({
  showOpenModal, setShowOpenModal, showCloseModal, setShowCloseModal,
  currentSession, isLoadingSession, checkSession,
  authorizeOffline, openRegister, calculateClose, confirmClose
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [needsOpeningCheck, setNeedsOpeningCheck] = useState(false);
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [tempSummary, setTempSummary] = useState(null);
  const [closeNotes, setCloseNotes] = useState('');
  const hasOpenSession = currentSession?.status === 'open';
  const confirmedOpening = hasOpenSession && currentSession.serverConfirmed === true && !currentSession.heldByOther;

  useEffect(() => {
    // The availability watcher can confirm the turn before the opening promise settles.
    if (showOpenModal && confirmedOpening) setShowOpenModal(false);
  }, [showOpenModal, confirmedOpening, setShowOpenModal]);

  const dismissOpening = () => setShowOpenModal(false);
  const dismissClosing = () => {
    setTempSummary(null);
    setShowCloseModal(false);
  };

  const MODAL_TOAST_ID = 'cash-modal-error'; // 🚀 Candado Anti-spam

  const handleOpen = async (e) => {
    e.preventDefault();
    if (hasOpenSession) return;
    let amount;
    try { amount = cashAmount(openingAmount); }
    catch (error) {
      toast.error(error.message, { id: MODAL_TOAST_ID });
      return;
    }
    if (await openRegister(amount)) dismissOpening();
    else setNeedsOpeningCheck(true);
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
      setDeclaredAmount('');
      setCloseNotes('');
      dismissClosing();
    }
  };

  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = isLoadingSession || isSubmitting;
  const submit = handler => async event => {
    event.preventDefault();
    if (submitting.current || isLoadingSession) return;
    submitting.current = true;
    setIsSubmitting(true);
    try { await handler(event); }
    finally { submitting.current = false; setIsSubmitting(false); }
  };

  return <>
    {showOpenModal && !confirmedOpening && <Dialog icon={WalletCards} title="Abrir caja" onClose={dismissOpening} busy={busy} description="Escribe el fondo inicial disponible. Turno máximo: 10 horas.">
      <form onSubmit={submit(handleOpen)}>
        <fieldset disabled={busy} className="space-y-4">
          <FormField label="Fondo inicial (S/)">
            <Input type="number" min="0" step="0.01" required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)}
              onKeyDown={event => { if (needsOpeningCheck && event.key === 'Enter') event.preventDefault(); }}
              placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" />
          </FormField>
          {(hasOpenSession || needsOpeningCheck) && <Alert variant="warning">
            <p>{hasOpenSession ? 'Ya hay un turno en esta sede. Comprueba su estado antes de volver a abrir.' : 'La apertura aún no se confirmó. Puedes comprobar el estado de la caja antes de reintentar.'}</p>
            {checkSession && <Button variant="secondary" size="sm" className="mt-2" onClick={submit(checkSession)}>Comprobar estado de caja</Button>}
          </Alert>}
          <DialogFooter>
            <Button variant="secondary" onClick={dismissOpening}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={hasOpenSession}>{needsOpeningCheck ? 'Reintentar apertura' : 'Abrir caja'}</Button>
          </DialogFooter>
        </fieldset>
      </form>
      {runtimeCapabilities.offlineSync && <Button variant="secondary" onClick={authorizeOffline} disabled={busy || !navigator.onLine}>Autorizar apertura offline (15 min)</Button>}
    </Dialog>}
    {showCloseModal && !tempSummary && <Dialog icon={Banknote} title="¿Cuánto efectivo contaste?" onClose={dismissClosing} busy={busy} description="Cuenta billetes y monedas y escribe el total.">
      <form onSubmit={submit(handleCalculate)}><fieldset disabled={busy} className="space-y-4">
        <FormField label="Dinero contado (S/)"><Input type="number" min="0" step="0.01" required value={declaredAmount} onChange={e => setDeclaredAmount(e.target.value)} placeholder="0.00" autoFocus className="min-h-16 border-finance-line bg-panel text-center text-3xl font-extrabold text-success" /></FormField>
        <DialogFooter><Button variant="secondary" onClick={dismissClosing}>Volver</Button><Button type="submit" loading={busy}>Siguiente</Button></DialogFooter>
      </fieldset></form>
    </Dialog>}
    {showCloseModal && tempSummary && <Dialog icon={ClipboardCheck} title="Revisa el conteo" onClose={dismissClosing} busy={busy} description="Compara el dinero contado con los movimientos registrados." className="cash-confirm-dialog" bodyClassName="overflow-hidden p-0 sm:p-0">
      <form onSubmit={submit(handleFinalSave)} className="flex min-h-0 flex-1 flex-col"><fieldset disabled={busy} className="flex min-h-0 flex-1 flex-col">
        <div className="ui-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <CashCountSummary summary={tempSummary} />
          {(tempSummary.difference !== 0 || tempSummary.hasUnverifiedDisbursements) && <FormField label="Observaciones para el dueño" required={tempSummary.difference !== 0} className="rounded-xl border border-warning/20 bg-warning-soft/60 p-3" hint="Si devolviste dinero de una venta de otro turno, indícalo aquí. No registres otro ticket para compensar.">
            <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Indica si hubo entrega de dinero o movimientos de otro turno." required={tempSummary.difference !== 0} />
          </FormField>}
        </div>
        <DialogFooter className="static m-0 grid grid-cols-2 gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:m-0 sm:px-5">
          <Button variant="secondary" className="px-2" onClick={() => setTempSummary(null)}>Volver a contar</Button>
          <Button type="submit" className="px-2" loading={busy}>Cerrar turno</Button>
        </DialogFooter>
      </fieldset></form>
    </Dialog>}
  </>;
};
