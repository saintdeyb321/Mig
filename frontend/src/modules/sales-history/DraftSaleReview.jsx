import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { reviewDraftSaleTransaction, confirmDraftSaleTransaction } from '../../features/sales/infrastructure/saleTransactions.js';
import { validatePOSPayment } from '../../features/sales/domain/saleModel.js';
import { PaymentFields, PaymentSelector } from '../pos/PaymentParts.jsx';
import { Dialog, Alert, Button, Input, LoadingState } from '../../shared/ui';

export function DraftSaleReview({ sale, user, activeBranchId, onClose, onResult }) {
  const [review, setReview] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [payment, setPayment] = useState(sale.payment ?? 'efectivo');
  const [amountPaid, setAmountPaid] = useState(''), [splitEfectivo, setSplitEfectivo] = useState(''), [splitYape, setSplitYape] = useState('');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const inFlight = useRef(false), current = useRef(false), resultCallback = useRef(onResult);
  useEffect(() => { resultCallback.current = onResult; }, [onResult]);
  const id = sale.saleId ?? sale.id ?? sale.localId;
  const uid = user.uid, businessId = user.businessId, role = user.role;
  useEffect(() => {
    let active = true; current.current = true;
    setReview(null); setError(''); setConsent(false); setAmountPaid(''); setSplitEfectivo(''); setSplitYape('');
    if (sale.branchId !== activeBranchId) { setError('Selecciona la sede que guardó el ticket.'); return () => { active = false; current.current = false; }; }
    reviewDraftSaleTransaction({ saleId: id }, { uid, businessId, branchId: activeBranchId, role }, () => active)
      .then(result => { if (!active) return; if (result.alreadyConfirmed) resultCallback.current(result.result); else setReview(result); })
      .catch(error => { if (active) setError(error.message || 'No se pudo revisar el ticket.'); });
    return () => { active = false; current.current = false; };
  }, [id, uid, businessId, activeBranchId, role, sale.branchId, attempt]);
  const total = review?.candidate.total ?? 0;
  const validation = validatePOSPayment({ payment, total, amountPaid, splitEfectivo, splitYape });
  const confirm = async event => {
    event.preventDefault();
    if (inFlight.current || !review || !consent || !validation.valid || sale.branchId !== activeBranchId) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await confirmDraftSaleTransaction(review, validation, { uid, businessId, branchId: activeBranchId, role }, () => current.current);
      if (!current.current) return;
      if (result.success) toast.success('Venta registrada.');
      else if (result.rejected) toast.error(result.error?.message || 'La venta no se realizó. El intento se conserva en Revisión local.');
      else toast('Comprobando la venta. No vuelvas a cobrar este ticket.', { icon: '⚠️' });
      resultCallback.current(result);
    } catch (error) { if (current.current) setError(error.message || 'Revisa el ticket antes de continuar.'); }
    finally { inFlight.current = false; if (current.current) setBusy(false); }
  };
  return <Dialog title="Revisar ticket guardado" description="Aún no se ha cobrado. Revisa los datos vigentes y confirma una sola vez." onClose={onClose} busy={busy}>
    {error ? <Alert variant="warning">{error}<Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Revisar de nuevo</Button></Alert>
      : !review ? <LoadingState>Revisando productos y tu caja con el servidor…</LoadingState>
      : <form onSubmit={confirm} className="space-y-4">
        <ul className="divide-y divide-line">{review.candidate.items.map(item => <li key={item.id} className="flex justify-between gap-3 py-2 text-sm"><span>{item.qty} × {item.name}</span><strong>S/ {(item.qty * item.price).toFixed(2)}</strong></li>)}</ul>
        <p className="text-sm text-muted">Importe guardado: S/ {review.original.total.toFixed(2)} · Total vigente: <strong className="text-ink">S/ {total.toFixed(2)}</strong></p>
        <p className="text-xs text-muted">Se usará tu caja activa de esta sede. El servidor comprobará nuevamente existencias, precios, horario y permisos al registrar.</p>
        <PaymentSelector payment={payment} disabled={busy} onSelect={value => { setPayment(value); setAmountPaid(''); setSplitEfectivo(''); setSplitYape(''); setConsent(false); }} />
        <PaymentFields payment={payment} amountPaid={amountPaid} onAmountPaid={setAmountPaid} splitEfectivo={splitEfectivo} onSplitEfectivo={setSplitEfectivo} splitYape={splitYape} onSplitYape={setSplitYape} total={total} validation={validation} disabled={busy} />
        <label className="flex min-h-11 items-start gap-3 text-sm"><Input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} />Revisé los productos y el pago. Confirmo registrar este cobro una sola vez.</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={busy}>Volver</Button><Button type="submit" disabled={!consent || !validation.valid || busy} loading={busy}>Confirmar venta</Button></div>
      </form>}
  </Dialog>;
}
