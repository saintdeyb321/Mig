import { useEffect, useRef, useState } from 'react';
import { db, auth } from '../../../core/firebase/client.js';
import offlineDB from '../../../offlineDB.js';
import { decrypt } from '../../../crypto.js';
import { createBackupRepository } from '../infrastructure/backupRepository.js';
import { readLocalBackup } from '../infrastructure/localBackup.js';
import { makeBackup, encodeBackup, verifyBackupFile } from '../domain/backupFile.js';
import { downloadBackup } from '../application/downloadBackup.js';

const readRemote = createBackupRepository(db, { currentUser: () => auth.currentUser });
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
      if ((options.pending || options.photos) && !options.password) throw new Error('Pendientes/fotos requieren consentimiento y exportación cifrada.');
      if (!options.consent) throw new Error('Confirma el alcance y la descarga.');
      assertActive();
      const startedAt = new Date().toISOString();
      const remote = options.localOnly ? { sections: [], warnings: ['Archivo separado solo del dispositivo; no incluye Firestore.'] }
        : await readRemote({ businessId, actorId: user.uid, maxRecords: options.maxRecords, signal,
          onProgress: progress => { if (!signal.aborted) setState(previous => ({ ...previous, progress })); } });
      const local = await readLocalBackup(offlineDB, { uid: user.uid, businessId, decrypt, pending: options.pending, photos: options.photos, assertActive });
      const backup = await makeBackup({ businessId, actorId: user.uid, startedAt, sections: [...remote.sections, ...local.sections], warnings: [...remote.warnings, ...local.warnings] });
      const text = await encodeBackup(backup, options.password); assertActive();
      await verifyBackupFile(text, options.password, businessId); assertActive();
      const filename = downloadBackup(text, businessId, !!options.password);
      return { filename, manifest: backup.manifest, writes: 0 };
    }),
    verifyFile: (file, password) => run(async assertActive => {
      if (!file || file.size > 36 * 1024 * 1024) throw new Error('Selecciona un archivo JSON de hasta 36 MiB.');
      const result = await verifyBackupFile(await file.text(), password, businessId); assertActive(); return result;
    }),
  };
}
