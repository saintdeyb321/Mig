import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Alert, Button } from '../../../shared/ui';
import { availableLegacyPhotos, finishContractMediaJobs, readContractMediaJobs, stageContractMediaJobs } from '../../../features/contracts/infrastructure/contractImages.js';
import { LOCAL_IMAGE } from '../../../features/contracts/application/contractImagePolicy.js';

export function ContractMediaActions({ scope, contract, onManifest }) {
  const key = JSON.stringify(scope);
  const [local, setLocal] = useState({ key: null, jobs: [] });
  const [progress, setProgress] = useState(null);
  const operation = useRef(null);
  useEffect(() => {
    const scope = JSON.parse(key);
    if (!scope.uid || !scope.contractId || !scope.businessId || !scope.branchId) return;
    const subscription = liveQuery(() => readContractMediaJobs(scope)).subscribe({
      next: jobs => setLocal({ key, jobs }),
      error: () => setLocal({ key, jobs: [], error: 'No se pudieron leer las fotos pendientes de este dispositivo.' }),
    });
    return () => { subscription.unsubscribe(); operation.current?.abort(); operation.current = null; };
  }, [key]);
  const jobs = local.key === key ? local.jobs : [];
  const pending = contract.pendingMedia;
  const remaining = jobs.length + Number(Boolean(pending && !jobs.some(job => job.mediaId === pending.id)));
  const historical = (contract.referenceImages ?? []).filter(ref => LOCAL_IMAGE.test(ref));
  const busy = progress?.key === key && progress.busy;
  const run = async migrate => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setProgress({ key, busy: true });
    try {
      let selected = jobs, missing = 0;
      if (migrate) {
        const available = await availableLegacyPhotos(scope, historical);
        controller.signal.throwIfAborted();
        if (!available.length) throw new Error('Foto histórica no disponible; vuelve a adjuntarla desde el archivo original.');
        missing = historical.length - available.length;
        selected = await stageContractMediaJobs(scope, { migration: available }, controller.signal);
      }
      const result = await finishContractMediaJobs(scope, { jobs: migrate ? selected : undefined, pending, signal: controller.signal });
      if (!controller.signal.aborted && result.manifest) onManifest(result.manifest);
      if (operation.current !== controller) return;
      setProgress({ key, message: controller.signal.aborted ? 'Carga detenida. Las fotos pendientes pueden reanudarse.'
        : result.remaining ? `${result.remaining} cambios pendientes. ${result.error?.message ?? 'Reintenta con conexión.'}`
          : missing ? 'Se copiaron las fotos disponibles. Las demás requieren el archivo original.' : 'Fotos confirmadas por el servidor.' });
    } catch (error) {
      if (operation.current === controller) setProgress({ key, message: controller.signal.aborted
        ? 'Carga detenida. Las fotos pendientes pueden reanudarse.' : error.message });
    } finally { if (operation.current === controller) operation.current = null; }
  };
  const message = progress?.key === key ? progress.message : null;
  const localError = local.key === key ? local.error : null;
  if (!remaining && !historical.length && !message && !busy && !localError) return null;
  return <div className="space-y-2">
    {remaining > 0 && <Alert variant="warning">Pedido guardado; {remaining} {remaining === 1 ? 'cambio de foto pendiente' : 'cambios de fotos pendientes'}. Reintenta desde este pedido.</Alert>}
    {localError && <p role="status" className="text-xs text-warning">{localError}</p>}
    {message && <p role="status" className="text-xs text-muted">{message}</p>}
    <div className="flex flex-wrap gap-2">
      {busy ? <Button size="sm" variant="secondary" onClick={() => operation.current?.abort()}>Detener carga</Button>
        : remaining > 0 ? <Button size="sm" variant="secondary" onClick={() => void run(false)}>Reintentar fotos</Button>
          : historical.length > 0 && contract.status !== 'cancelado' && <Button size="sm" variant="secondary" onClick={() => void run(true)}>Copiar fotos de este dispositivo</Button>}
    </div>
  </div>;
}
