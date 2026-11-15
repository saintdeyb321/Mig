import { useEffect, useRef, useState } from 'react';
import { cashExpiryWindow, CASH_EXPIRY_LABEL } from '../features/cash-register/domain/cashExpiry.js';
import { toDateSafe } from '../core/dates/dateValues.js';
import { Alert, Button } from '../shared/ui';

const limaDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/Lima' });
const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export default function CashRecoveryStatus({ session, isExpired, expiresAt, expiryState, online, recoverable, onOpenNext }) {
  const previous = isExpired ? session : expiryState?.finalized ? expiryState.session : null;
  const finalized = expiryState?.finalized && expiryState.id === previous?.id;
  const attempt = expiryState?.id === previous?.id ? expiryState : null;
  const [reference, setReference] = useState(null);
  const request = useRef(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, [previous?.id]);

  async function loadReference() {
    if (!finalized || !navigator.onLine || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setReference({ id: previous.id, loading: true });
    try {
      const { readExpiredCashDetail } = await import('../features/cash-register/infrastructure/cashRegisterRepository.js');
      signal.throwIfAborted();
      const totals = await readExpiredCashDetail({ sessionId: previous.id, businessId: previous.businessId, branchId: previous.branchId, signal });
      if (!signal.aborted) setReference({ id: previous.id, totals });
    } catch {
      if (!signal.aborted) setReference({ id: previous.id, error: true });
    } finally { if (request.current === controller) request.current = null; }
  }

  if (previous) {
    const date = toDateSafe(isExpired ? expiresAt : cashExpiryWindow(previous)?.expiresAt);
    const detail = reference?.id === previous.id ? reference : null;
    return <Alert variant={isExpired ? 'warning' : 'info'} title={CASH_EXPIRY_LABEL}>
      {date && <p>Venció el {limaDate.format(date)} (Lima).</p>}
      {isExpired ? <p>El turno ya no admite cobros ni conteo de cierre.</p> : <p>Finalización confirmada.</p>}
      {attempt?.busy && <p role="status">Confirmando la finalización del turno…</p>}
      {attempt?.error && <p>{attempt.error}</p>}
      {isExpired && !online && <p>Conéctate para abrir el turno siguiente.</p>}
      {isExpired && online && !recoverable && <p>Pide al administrador que revise la caja y su candado.</p>}
      {Number.isFinite(detail?.totals?.expectedCash)
        ? <p>Efectivo esperado: {soles.format(detail.totals.expectedCash)} · Referencia calculada; sin arqueo.
          {Number.isFinite(detail.totals.digitalTotal) && <> Yape/Plin registrado: {soles.format(detail.totals.digitalTotal)}.</>}</p>
        : <p>Referencia pendiente de verificar.{detail?.error ? ' Consulta el historial o los reportes para revisar el turno.' : ''}</p>}
      {isExpired && online && onOpenNext && <Button type="button" size="sm" disabled={attempt?.busy} onClick={onOpenNext}>Abrir caja nueva</Button>}
      {finalized && online && !detail?.totals && <Button type="button" size="sm" variant="secondary" loading={detail?.loading} onClick={loadReference}>
        {detail?.error ? 'Reintentar lectura de referencia' : 'Consultar referencia'}
      </Button>}
    </Alert>;
  }
  if (session?.status === 'open' && !cashExpiryWindow(session)) {
    return <Alert variant="warning" title="Revisión administrativa necesaria">Este turno carece del protocolo de vencimiento verificable.</Alert>;
  }
  return null;
}
