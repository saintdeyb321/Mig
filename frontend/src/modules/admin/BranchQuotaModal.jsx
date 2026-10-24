import FirestoreQueryError from '../../components/FirestoreQueryError';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { readPlatformBusiness } from '../../features/licenses/infrastructure/platformBusinessRepository.js';
import { operationalBranches } from '../../features/branches/domain/branchPolicy.js';
import { Alert, Button, Dialog, DialogFooter, FormField, Input, LoadingState } from '../../shared/ui';

export function BranchQuotaModal({ user, license, onClose, onSave, busy }) {
  const [maximum, setMaximum] = useState(license.maxActiveBranches ?? 1);
  const [reviewed, setReviewed] = useState(false), [attempt, retry] = useState(0);
  const [result, setResult] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    readPlatformBusiness({ actorId: user.uid, businessId: license.id, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setResult(value); setError(null); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [user.uid, license.id, attempt]);
  const historical = license.branchQuotaVersion !== 1;
  const observed = result ? operationalBranches(result.branches).map(branch => branch.id) : [];
  const rosterMatches = historical || observed.length === license.activeBranchIds?.length && observed.every(id => license.activeBranchIds.includes(id));
  const canReview = result?.complete && rosterMatches && result.branches.every(branch => ['activo', 'inactivo'].includes(branch.status));
  const submit = async event => {
    event.preventDefault();
    if (!canReview || historical && !reviewed) return;
    if (await onSave({ businessId: license.id, maxActiveBranches: Number(maximum),
      activeBranchIds: operationalBranches(result.branches).map(branch => branch.id), confirmHistoricalReview: historical && reviewed })) onClose();
  };
  return <Dialog title="Cupo de sucursales" icon={Building2} description={license.businessName} onClose={onClose} busy={busy}>
    <p className="text-xs text-muted">Lectura bajo demanda de sedes. Usa un permiso administrativo temporal (1–2 escrituras de control, 0 escrituras de negocio para leer).</p>
    {error ? <FirestoreQueryError error={error} area="platform-detail" user={user} onRetry={() => retry(value => value + 1)} /> : !result ? <LoadingState>Verificando sedes…</LoadingState> : <>
      <p className="text-sm">Sedes activas observadas: <strong>{operationalBranches(result.branches).length}</strong>. Cupo actual: {license.maxActiveBranches ?? 'sin regularizar'}.</p>
      {result.warnings.map(warning => <Alert variant="warning" key={warning}>{warning}</Alert>)}
      {!canReview && <Alert variant="warning">El inventario es parcial, contiene estados desconocidos o no coincide con el registro de cupos. Revisa en Console antes de establecer el cupo.</Alert>}
      <form onSubmit={submit} className="space-y-4"><FormField label="Máximo de sedes activas" hint="Política de producto: 1 sede activa inicial, configurable por SuperAdmin entre 1 y 100. Inactivas no consumen cupo."><Input type="number" min="1" max="100" step="1" required value={maximum} onChange={event => setMaximum(event.target.value)} /></FormField>
        {historical && <label className="flex items-start gap-3 text-sm"><Input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Confirmo el inventario de sedes existentes de este negocio histórico. Esto regulariza el cupo, sin borrar stock ni certificar cajas/pendientes.</label>}
        <DialogFooter><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" loading={busy} disabled={!canReview || historical && !reviewed}>Guardar cupo</Button></DialogFooter>
      </form>
    </>}
  </Dialog>;
}
