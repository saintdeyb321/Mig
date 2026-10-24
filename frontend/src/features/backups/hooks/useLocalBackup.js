import { prepareCleanupPlan } from '../domain/cleanupPlan.js';
import { useEffect, useRef, useState } from 'react';
import { auth } from '../../../core/firebase/client.js';
import offlineDB from '../../../offlineDB.js';
import { decrypt } from '../../../crypto.js';
import { readRemoteBackup } from '../infrastructure/remoteBackup.js';
import { readLocalBackup } from '../infrastructure/localBackup.js';
import { makeBackup, encodeBackup, verifyBackupFile } from '../domain/backupFile.js';
import { inventorySections } from '../domain/tenantInventory.js';
import { downloadBackup } from '../application/downloadBackup.js';

export function useLocalBackup(user, businessId) {
  const [state, setState] = useState({ busy: false, progress: null, error: null, result: null });
  const operation = useRef(null);
  useEffect(() => { setState({ busy: false, progress: null, error: null, result: null }); return () => { operation.current?.abort(); operation.current = null; }; }, [user?.uid, user?.role, user?.businessId, businessId]);
  const run = async work => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    const assertActive = () => { if (controller.signal.aborted || auth.currentUser?.uid !== user?.uid) throw new Error('Operación cancelada: cambió la identidad.'); };
    setState({ busy: true, progress: null, error: null, result: null });
    try { const result = await work(assertActive, controller.signal); assertActive(); setState({ busy: false, progress: null, error: null, result }); }
    catch (error) { if (!controller.signal.aborted) setState({ busy: false, progress: null, error: error.message, result: null }); }
    finally { if (operation.current === controller) operation.current = null; }
  };
  return { ...state, cancel: () => { operation.current?.abort(); operation.current = null; setState({ busy: false, error: 'Exportación cancelada; no se modificó ningún registro.', result: null, progress: null }); },
    exportBackup: options => run(async (assertActive, signal) => {
      if (user?.role !== 'superadmin') throw new Error('Solo SuperAdmin puede iniciar la exportación o el inventario empresarial.');
      if ((options.pending || options.photos) && !options.password) throw new Error('Pendientes/fotos requieren consentimiento y exportación cifrada.');
      if (!options.consent) throw new Error('Confirma el alcance y la descarga.');
      assertActive();
      const startedAt = new Date().toISOString();
      const remote = options.localOnly ? { sections: [], warnings: ['Archivo separado solo del dispositivo; no incluye Firestore.'] }
        : await readRemoteBackup({ businessId, actorId: user.uid, maxRecords: options.maxRecords, signal, purpose: options.inventory ? 'inventory' : 'export',
          onProgress: progress => { if (!signal.aborted) setState(previous => ({ ...previous, progress })); } });
      const local = await readLocalBackup(offlineDB, { uid: user.uid, businessId, decrypt, pending: options.pending, photos: options.photos, assertActive });
      const backup = await makeBackup({ businessId, actorId: user.uid, startedAt, purpose: options.localOnly ? 'local-device' : options.inventory ? 'inventory' : 'data-export', sections: [...(options.inventory ? inventorySections(remote.sections, businessId) : remote.sections), ...local.sections], warnings: [...remote.warnings, ...local.warnings] });
      const text = await encodeBackup(backup, options.password); assertActive();
      await verifyBackupFile(text, options.password, businessId); assertActive();
      const filename = downloadBackup(text, businessId, !!options.password);
      return { filename, manifest: backup.manifest, businessWrites: 0, accessControlWrites: remote.accessControlWrites ?? 0 };
    }),
    prepareCleanupFile: (file, password) => run(async assertActive => {
      if (user?.role !== 'superadmin' || !password || !file || file.size > 36 * 1024 * 1024) throw new Error('Inventario local y contraseña de cifrado requeridos para SuperAdmin.');
      const verified = await verifyBackupFile(await file.text(), password, businessId, { includeSections: true }); assertActive();
      const cleanupPlan = prepareCleanupPlan(verified, businessId);
      const backup = await makeBackup({ businessId, actorId: user.uid, startedAt: new Date().toISOString(), purpose: 'inventory',
        sections: [{ name: 'cleanup_dry_run', records: [cleanupPlan], status: 'not-read', warning: 'Plan local de revisión, sin autorización ni ejecución de eliminación.' }] });
      const text = await encodeBackup(backup, password); assertActive();
      const filename = downloadBackup(text, businessId, true);
      return { filename, manifest: backup.manifest, cleanupPlan, businessWrites: 0, accessControlWrites: 0 };
    }),
    verifyCleanup: (file, password) => run(async (assertActive, signal) => {
      if (user?.role !== 'superadmin' || !file || file.size > 36 * 1024 * 1024) throw new Error('Selecciona el plan dry-run cifrado de este negocio.');
      const verified = await verifyBackupFile(await file.text(), password, businessId, { includeSections: true }); assertActive();
      const plan = verified.sections.find(section => section.name === 'cleanup_dry_run')?.records?.[0];
      const { verifyCleanupPaths } = await import('../infrastructure/cleanupVerification.js');
      const verification = await verifyCleanupPaths(plan, { actorId: user.uid, businessId, signal }); assertActive();
      return { manifest: verified.manifest, cleanupVerification: verification, accessControlWrites: verification.accessControlWrites, businessWrites: 0 };
    }),
    verifyFile: (file, password) => run(async assertActive => {
      if (!file || file.size > 36 * 1024 * 1024) throw new Error('Selecciona un archivo JSON de hasta 36 MiB.');
      const result = await verifyBackupFile(await file.text(), password, businessId); assertActive(); return result;
    }),
  };
}
