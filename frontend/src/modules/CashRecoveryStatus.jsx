import { toDateSafe } from '../core/dates/dateValues.js';
import { Alert, Button } from '../shared/ui';

const limaDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const when = value => {
  const date = toDateSafe(value);
  return date ? limaDate.format(date) : 'Fecha no verificada';
};

export default function CashRecoveryStatus({ session, isExpired, expiresAt, recoverySession, expiryState, onFinalize, onCheck, online }) {
  const attempt = expiryState?.id === session?.id ? expiryState : null;
  if (isExpired) return <Alert variant="warning" title="Caja vencida · sin arqueo">
    <p>Venció el {when(expiresAt)} (Lima). El turno ya no admite cobros ni conteo de cierre.</p>
    {attempt?.busy && <p role="status">Confirmando la finalización del turno…</p>}
    {attempt?.error && <p>{attempt.error}</p>}
    {!online && <p>Conéctate para confirmar la finalización.</p>}
    <div className="flex flex-wrap gap-2">
      {recoverySession && !attempt?.busy && <Button size="sm" disabled={!online} onClick={onFinalize}>Finalizar turno vencido</Button>}
      {attempt?.error && <Button size="sm" variant="secondary" disabled={!online} onClick={onCheck}>Comprobar estado</Button>}
    </div>
  </Alert>;
  if (!session && expiryState?.finalized) return <Alert variant="info">Turno finalizado por vencimiento · sin arqueo.</Alert>;
  if (session?.status === 'open' && (session.runtime !== 'spark' || session.durationHours !== 10 || !toDateSafe(session.openedAt))) {
    return <Alert variant="warning" title="Revisión administrativa necesaria">Este turno carece del protocolo de vencimiento verificable.</Alert>;
  }
  return null;
}
