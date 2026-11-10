import { toDateSafe } from '../core/dates/dateValues.js';
import { Alert, Button } from '../shared/ui';

const limaDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const when = value => {
  const date = toDateSafe(value);
  return date ? limaDate.format(date) : 'Fecha no verificada';
};

export default function CashRecoveryStatus({ session, isExpired, expiresAt, recoverySession, lastRecovery, onRecover, onCheck, online }) {
  if (isExpired) return <Alert variant="warning" title="Turno vencido por límite de 10 horas">
    <p>El plazo se cuenta desde la apertura. Aún no se declaró el dinero contado.</p>
    <details className="my-2">
      <summary className="cursor-pointer font-semibold">Revisar turno anterior</summary>
      <p>Responsable: {session.cashierName || session.userId}</p>
      <p>Apertura: {when(session.openedAt)} · Vencimiento: {when(expiresAt)} (Lima)</p>
    </details>
    <div className="flex flex-wrap gap-2">
      {recoverySession && <Button size="sm" disabled={!online} onClick={onRecover}>Recuperar y abrir nueva caja</Button>}
      <Button size="sm" variant="secondary" disabled={!online} onClick={onCheck}>Reintentar comprobación</Button>
    </div>
  </Alert>;
  if (lastRecovery && session?.id === lastRecovery.current.id) return <Alert variant="info" title="Nueva caja abierta y confirmada">
    <details>
      <summary className="cursor-pointer">Turno anterior: vencido, sin arqueo, pendiente de revisión</summary>
      <p>Anterior: {lastRecovery.previous.id} · Venció {when(lastRecovery.previous.expiredAt)} (Lima)</p>
      <p>Nueva: {lastRecovery.current.id} · Abrió {when(lastRecovery.current.openedAt)} (Lima)</p>
    </details>
  </Alert>;
  if (session?.status === 'open' && (session.runtime !== 'spark' || session.durationHours !== 10 || !toDateSafe(session.openedAt))) {
    return <Alert variant="warning" title="Revisión administrativa necesaria">Este turno carece del protocolo de vencimiento verificable.</Alert>;
  }
  return null;
}
