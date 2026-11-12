import FirestoreQueryError from '../../components/FirestoreQueryError';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { readPlatformBusiness } from '../../features/licenses/infrastructure/platformBusinessRepository.js';
import { operationalBranches, DEFAULT_MAX_REGISTERED_BRANCHES, MAX_ACTIVE_BRANCHES, MAX_REGISTERED_BRANCHES, validateBranchQuotas } from '../../features/branches/domain/branchPolicy.js';
import { Alert, Button, Dialog, DialogFooter, FormField, Input, LoadingState } from '../../shared/ui';

export function BranchQuotaModal({ user, license, onClose, onSave, busy, canOperate, accessRecovery }) {
  const [maximum, setMaximum] = useState(license.maxActiveBranches ?? 1);
  const [registeredMaximum, setRegisteredMaximum] = useState(license.maxRegisteredBranches ?? Math.max(DEFAULT_MAX_REGISTERED_BRANCHES, license.maxActiveBranches ?? 1));
  const [reviewed, setReviewed] = useState(false), [attempt, retry] = useState(0);
  const [result, setResult] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    readPlatformBusiness({ actorId: user.uid, businessId: license.id, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setResult(value); setError(null); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [user.uid, license.id, attempt]);
  const historical = license.branchQuotaVersion !== 1 || license.registeredBranchQuotaVersion !== 1;
  const observed = result ? operationalBranches(result.branches).map(branch => branch.id) : [];
  const rosterMatches = license.branchQuotaVersion !== 1 || observed.length === license.activeBranchIds?.length && observed.every(id => license.activeBranchIds.includes(id));
  const registeredMatches = license.registeredBranchQuotaVersion !== 1 || Boolean(result && Array.isArray(license.registeredBranchIds) && result.branches.length === license.registeredBranchIds.length && result.branches.every(branch => license.registeredBranchIds.includes(branch.id)));
  const canReview = result?.complete && rosterMatches && registeredMatches && result.branches.every(branch => ['activo', 'inactivo'].includes(branch.status));
  const registeredCount = result?.branches.length ?? 0;
  const minimumRegistered = Math.max(1, registeredCount, Number(maximum) || 1);
  const activeTooLow = Number(maximum) < observed.length;
  const invalidRegistered = !Number.isInteger(Number(registeredMaximum))
    || Number(registeredMaximum) < minimumRegistered || Number(registeredMaximum) > MAX_REGISTERED_BRANCHES;
  const submit = async event => {
    event.preventDefault();
    if (!canOperate || !canReview || activeTooLow || invalidRegistered || historical && !reviewed) return;
    const limits = validateBranchQuotas(Number(maximum), Number(registeredMaximum));
    if (await onSave({ businessId: license.id, ...limits,
      expected: { active: license.maxActiveBranches ?? null, registered: license.maxRegisteredBranches ?? null },
      activeBranchIds: observed, registeredBranchIds: result.branches.map(branch => branch.id), confirmHistoricalReview: historical && reviewed })) onClose();
  };
  return <Dialog title="Gestionar sedes y cupos" icon={Building2} description={license.businessName} onClose={onClose} busy={busy}>
    {accessRecovery}
    {error ? <FirestoreQueryError error={error} area="platform-detail" user={user} onRetry={() => retry(value => value + 1)} /> : !result ? <LoadingState>Verificando sedes…</LoadingState> : <>
      <dl className="grid grid-cols-2 gap-2 rounded-xl border border-primary/20 bg-primary-soft/40 p-3 text-sm">
        <div><dt className="text-muted">Sedes activas hoy</dt><dd className="font-bold">{observed.length} de {license.maxActiveBranches ?? 'cupo por revisar'}</dd></div>
        <div><dt className="text-muted">Sedes inactivas</dt><dd className="font-bold">{result.branches.filter(branch => branch.status === 'inactivo').length}</dd></div>
        <div className="col-span-2"><dt className="text-muted">Sedes registradas</dt><dd className="font-bold">{registeredCount} de {license.maxRegisteredBranches ?? 'inventario por revisar'}</dd></div>
      </dl>
      {result.warnings.map(warning => <Alert variant="warning" key={warning}>{warning}</Alert>)}
      {!canReview && <Alert variant="warning">El inventario es parcial, contiene estados desconocidos o no coincide con el registro de cupos. Revisa en Console antes de establecer el cupo.</Alert>}
      <details open={historical || undefined} className="rounded-xl border border-line bg-canvas p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Sedes observadas</summary>
        <ul className="mt-2 divide-y divide-line">{result.branches.map(branch => <li key={branch.id} className="flex justify-between gap-2 py-1.5">
          <span className="wrap-anywhere">{branch.name || 'Sede sin nombre'}</span><span className="shrink-0 text-muted">{branch.status ?? 'Sin verificar'}</span>
        </li>)}</ul>
        <p className="mt-2 text-muted">Las sedes inactivas quedan fuera de los selectores operativos y conservan su historial. Se pueden desactivar desde el negocio después de revisar cajas y pendientes. La eliminación está deshabilitada.</p>
      </details>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Sedes que pueden estar abiertas al mismo tiempo" hint="Inactivar una sede libera una plaza activa." error={activeTooLow ? `Hay ${observed.length} sedes activas. Desactiva una desde el negocio antes de reducir este cupo.` : undefined}>
          <Input type="number" min={Math.max(1, observed.length)} max={MAX_ACTIVE_BRANCHES} step="1" required value={maximum} onChange={event => setMaximum(event.target.value)} />
        </FormField>
        <details open={historical || undefined} className="rounded-xl border border-line bg-canvas p-3">
          <summary className="cursor-pointer text-sm font-semibold">Opciones avanzadas del inventario</summary>
          <FormField className="mt-2" label="Máximo de sedes registradas" hint={`Incluye activas e inactivas. Mínimo para este inventario: ${minimumRegistered}.`}>
            <Input type="number" min={minimumRegistered} max={MAX_REGISTERED_BRANCHES} step="1" required value={registeredMaximum} onChange={event => setRegisteredMaximum(event.target.value)} />
          </FormField>
        </details>
        {invalidRegistered && <p role="alert" className="text-sm text-danger">En Opciones avanzadas, usa un cupo registrado entre {minimumRegistered} y {MAX_REGISTERED_BRANCHES}.</p>}
        {historical && <label className="flex items-start gap-3 text-sm"><Input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Confirmo que revisé todas las sedes activas e inactivas antes de regularizar el inventario histórico.</label>}
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!canOperate || !canReview || activeTooLow || invalidRegistered || historical && !reviewed}>Guardar cupo</Button></DialogFooter>
      </form>
    </>}
  </Dialog>;
}
