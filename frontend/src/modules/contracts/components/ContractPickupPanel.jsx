import { useEffect, useState } from 'react';
import { Alert, Button } from '../../../shared/ui';
import { subscribeContractPickups } from '../../../features/contracts/infrastructure/contractRepository.js';
import { PICKUP_LIMIT } from '../../../features/contracts/infrastructure/contractQueryRepository.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus.js';

function Pickups({ user, branchId, branches }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const stop = subscribeContractPickups(user.businessId, branchId, (rows, metadata) => {
      if (active) setResult({ rows, ...metadata });
    }, () => { if (active) setResult({ error: true }); });
    return () => { active = false; stop(); };
  }, [user.businessId, branchId, attempt]);
  if (result?.fromCache) return <p role="status" className="text-muted">Comprobando recojos con el servidor…</p>;
  if (result?.error) return <Alert variant="warning">
    No se pudo verificar la lista de recojos.
    <Button size="sm" variant="secondary" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Comprobar recojos</Button>
  </Alert>;
  if (!result) return <p role="status" className="text-muted">Consultando recojos…</p>;
  if (!result.rows.length) return <p className="text-muted">Sin fichas de recojo vigentes.</p>;
  return <>
    <p className="text-muted">Vista logística. Coordina los cambios y la entrega con la sede de origen.</p>
    {result.limited && <p role="status">Se muestran hasta {PICKUP_LIMIT} recojos. Coordina los demás con el dueño.</p>}
    <ul className="divide-y divide-line">{result.rows.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
      <strong>{row.contractNumber}</strong>
      <span>Origen {branches.find(branch => branch.id === row.originBranchId)?.name || 'Sede no disponible'}</span>
      <span>{toDateSafe(row.deliveryDate)?.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) || 'Fecha pendiente'}</span>
    </li>)}</ul>
  </>;
}

export default function ContractPickupPanel({ user, branchId, branches }) {
  const [open, setOpen] = useState(false);
  const online = useNetworkStatus();
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="rounded-xl border border-primary/20 bg-panel px-4 text-sm">
    <summary className="cursor-pointer py-3 font-bold text-brand-deep">Recojos de otras sedes</summary>
    {open && <div className="space-y-2 pb-4">{online
      ? <Pickups key={JSON.stringify([user.uid, user.businessId, branchId])} user={user} branchId={branchId} branches={branches} />
      : <p role="status" className="text-muted">Conéctate para comprobar los recojos de esta sede.</p>}</div>}
  </details>;
}

