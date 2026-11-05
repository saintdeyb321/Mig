import * as lite from 'firebase/firestore/lite';
import { auth } from '../../../core/firebase/client.js';
import { getPlatformReadDatabase } from './remoteBackup.js';
import { createPlatformDataAccess } from './platformDataAccess.js';
import { validCleanupPath } from '../domain/cleanupPlan.js';

// Bounded absence check of previously inventoried paths, never traversal or deletion.
export async function verifyCleanupPaths(plan, { actorId, businessId, signal }) {
  if (plan?.format !== 'migapos-cleanup-dry-run' || plan.businessId !== businessId || !Array.isArray(plan.paths)
    || plan.paths.length > 5000 || plan.paths.some(path => !validCleanupPath(path, businessId))) throw new Error('Plan de rutas inválido.');
  const database = getPlatformReadDatabase();
  const active = () => { if (signal?.aborted || auth.currentUser?.uid !== actorId) throw new Error('Cambió la identidad o se canceló la verificación.'); };
  active(); const profile = (await lite.getDoc(lite.doc(database, 'users', actorId))).data(); active();
  if (profile?.role !== 'superadmin' || (profile.status ?? 'activo') !== 'activo') throw new Error('Solo SuperAdmin puede verificar rutas.');
  const withAccess = createPlatformDataAccess(database, { sdk: { ...lite, getDocFromServer: lite.getDoc }, currentUser: () => auth.currentUser });
  return withAccess({ actorId, businessId, purpose: 'inventory' }, async () => {
    const paths = [];
    for (const path of plan.paths.slice(0, 500)) {
      active();
      try {
        const saved = await lite.getDoc(lite.doc(database, path)); active();
        paths.push({ path, status: !saved.exists() ? 'absent-at-read' : saved.data().businessId != null && saved.data().businessId !== businessId ? 'foreign-unverified' : 'present' });
      } catch (error) { active(); paths.push({ path, status: 'unverifiable', error: error.message }); }
    }
    return { paths, notRead: Math.max(0, plan.paths.length - 500), exhaustive: false, businessWrites: 0,
      warnings: ['Lectura puntual de hasta 500 rutas anteriores. Una denegación no demuestra ausencia. No verifica cuentas Auth ni subcolecciones desconocidas, y nunca certifica una limpieza completa.'] };
  });
}
