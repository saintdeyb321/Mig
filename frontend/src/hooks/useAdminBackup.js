import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { adminCall } from '../features/licenses/infrastructure/administrationRepository';

export const useAdminBackup = user => {
  const [jobId, setJobId] = useState(null), [job, setJob] = useState(null), [error, setError] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false), busy = useRef(false), operations = useRef(new Map());
  const [refreshCount, setRefreshCount] = useState(0);
  const identity = `${user?.uid}:${user?.role}`;
  useEffect(() => { setJobId(null); setJob(null); setError(null); operations.current.clear(); }, [identity]);
  useEffect(() => {
    if (!jobId || user?.role !== 'superadmin') return;
    let active = true, pending = false, timer;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await adminCall('getPlatformJob', { jobId });
        if (active) { setJob(result); setError(null); if (['completed', 'failed', 'cancelled'].includes(result.status)) clearInterval(timer); }
      } catch (failure) { if (active) setError(failure.message); }
      finally { pending = false; }
    };
    void refresh(); timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, user?.role, identity, refreshCount]);
  const action = async work => {
    if (busy.current) return;
    busy.current = true; setIsBackingUp(true);
    try { return await work(); }
    catch (failure) { setError(failure.message); toast.error(failure.message || 'No se pudo completar la acción.'); }
    finally { busy.current = false; setIsBackingUp(false); }
  };
  return { job, error, isBackingUp,
    downloadTenantBackup: (businessId, existingJobId) => action(async () => {
      if (existingJobId) { setJob(null); setJobId(existingJobId); setRefreshCount(count => count + 1); return; }
      if (!operations.current.has(businessId)) operations.current.set(businessId, crypto.randomUUID());
      const result = await adminCall('startTenantBackup', { businessId, operationId: operations.current.get(businessId) });
      operations.current.delete(businessId); setJob(null); setJobId(result.jobId);
      toast.success('Backup en curso. Las escrituras se pausarán hasta verificar la copia. Puedes cerrar esta página.');
    }),
    retryJob: () => action(async () => { await adminCall('retryPlatformJob', { jobId }); setRefreshCount(count => count + 1); }),
    cancelBackup: () => action(async () => { await adminCall('cancelPlatformBackup', { jobId }); setRefreshCount(count => count + 1); }),
    restoreDryRun: () => action(async () => {
      const result = await adminCall('startRestoreDryRun', { backupId: jobId }); setJob(null); setJobId(result.jobId);
    }),
    downloadPart: index => action(async () => {
      const result = await adminCall('getBackupDownload', { backupId: jobId, ...(index === undefined ? {} : { index }) });
      const binary = atob(result.base64), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
      const link = document.createElement('a'); link.href = url; link.download = result.name.replaceAll('/', '_');
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }),
  };
};
