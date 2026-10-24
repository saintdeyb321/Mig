import { BACKUP_COLLECTIONS } from '../../backups/infrastructure/backupRepository.js';
import * as lite from 'firebase/firestore/lite';
import { auth } from '../../../core/firebase/client.js';
import { getPlatformReadDatabase } from '../../backups/infrastructure/remoteBackup.js';
import { createPlatformDataAccess } from '../../backups/infrastructure/platformDataAccess.js';

export function createPlatformBusinessReader(database, { sdk = lite, currentUser } = {}) {
  const serverSDK = { ...sdk, getDocFromServer: sdk.getDocFromServer ?? sdk.getDoc };
  const withAccess = createPlatformDataAccess(database, { sdk: serverSDK, currentUser });
  return async ({ actorId, businessId, signal, includePeople = false }) => {
    const active = () => { if (signal?.aborted || currentUser()?.uid !== actorId) throw new Error('La sesión o el negocio cambió; lectura descartada.'); };
    if (!businessId || businessId === 'platform-admin' || !/^[A-Za-z0-9_-]{1,128}$/.test(businessId)) throw new Error('Negocio inválido.');
    active();
    const actor = (await sdk.getDoc(sdk.doc(database, 'users', actorId))).data(); active();
    if (actor?.role !== 'superadmin' || (actor.status ?? 'activo') !== 'activo') throw new Error('Detalle exclusivo de SuperAdmin.');
    return withAccess({ actorId, businessId, purpose: 'inventory' }, async () => {
      const page = await sdk.getDocs(sdk.query(sdk.collection(database, 'branches'), sdk.where('businessId', '==', businessId), sdk.limit(201))); active();
      if (page.docs.some(row => row.data().businessId !== businessId)) throw new Error('Respuesta fuera del negocio.');
      const branches = page.docs.slice(0, 200).map(row => ({ ...row.data(), id: row.id }));
      const result = { businessId, branches, complete: page.size < 201,
        warnings: page.size >= 201 ? ['Inventario de sedes limitado a 200; no permite regularizar.'] : [] };
      if (!includePeople) return result;
      result.sections = [];
      result.people = {};
      for (const name of ['users', 'invites']) {
        try {
          const rows = await sdk.getDocs(sdk.query(sdk.collection(database, name), sdk.where('businessId', '==', businessId), sdk.limit(51))); active();
          if (rows.docs.some(row => row.data().businessId !== businessId)) throw new Error('Respuesta fuera del negocio.');
          result.people[name] = rows.docs.slice(0, 50).map(row => {
            const data = row.data();
            return { id: row.id, email: data.email, role: data.role, status: data.status, branchId: data.branchId,
              firstName: data.firstName, lastName: data.lastName };
          });
          result.sections.push({ name, count: Math.min(rows.size, 50), status: rows.size > 50 ? 'limited' : 'complete' });
        } catch (error) { active(); result.sections.push({ name, count: null, status: 'inaccessible', error: error.message }); }
      }
      result.inventory = [];
      for (const name of BACKUP_COLLECTIONS) {
        active();
        try {
          if (['tenants', 'licenses', 'settings'].includes(name)) {
            const saved = await sdk.getDoc(sdk.doc(database, name, businessId)); active();
            if (saved.exists() && saved.data().businessId != null && saved.data().businessId !== businessId) throw new Error('Documento fuera del negocio.');
            if (name !== 'settings') result[name] = saved.exists() ? saved.data() : null;
            result.inventory.push({ name, status: 'complete', count: saved.exists() ? 1 : 0, paths: saved.exists() ? [`${name}/${businessId}`] : [] });
          } else if (['branches', 'users', 'invites'].includes(name)) {
            const known = name === 'branches' ? { count: branches.length, status: result.complete ? 'complete' : 'limited' } : result.sections.find(section => section.name === name);
            result.inventory.push({ name, ...known, paths: (name === 'branches' ? branches : result.people[name] ?? []).map(row => `${name}/${row.id}`) });
          } else {
            const rows = await sdk.getDocs(sdk.query(sdk.collection(database, name), sdk.where('businessId', '==', businessId), sdk.limit(1))); active();
            if (rows.docs.some(row => row.data().businessId !== businessId)) throw new Error('Respuesta fuera del negocio.');
            result.inventory.push({ name, status: rows.empty ? 'empty-at-read' : 'sample-only', count: rows.size, paths: rows.docs.map(row => `${name}/${row.id}`) });
          }
        } catch (error) { active(); result.inventory.push({ name, count: null, status: 'inaccessible', error: error.message, paths: [] }); }
      }
      result.warnings.push('Inventario inicial de presencia, no recursivo: muestra como máximo 1 ruta por colección financiera. No demuestra alcance exhaustivo ni enumera Authentication.');
      return result;
    });
  };
}
let reader;
export const readPlatformBusiness = options => {
  reader ??= createPlatformBusinessReader(getPlatformReadDatabase(), { currentUser: () => auth.currentUser });
  return reader(options);
};
