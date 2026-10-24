import * as lite from 'firebase/firestore/lite';
import { auth } from '../../../core/firebase/client.js';
import { getPlatformReadDatabase } from '../../backups/infrastructure/remoteBackup.js';
import { createPlatformDataAccess } from '../../backups/infrastructure/platformDataAccess.js';

export function createPlatformBusinessReader(database, { sdk = lite, currentUser } = {}) {
  const serverSDK = { ...sdk, getDocFromServer: sdk.getDocFromServer ?? sdk.getDoc };
  const withAccess = createPlatformDataAccess(database, { sdk: serverSDK, currentUser });
  return async ({ actorId, businessId, signal }) => {
    const active = () => { if (signal?.aborted || currentUser()?.uid !== actorId) throw new Error('La sesión o el negocio cambió; lectura descartada.'); };
    if (!businessId || businessId === 'platform-admin' || !/^[A-Za-z0-9_-]{1,128}$/.test(businessId)) throw new Error('Negocio inválido.');
    active();
    const actor = (await sdk.getDoc(sdk.doc(database, 'users', actorId))).data(); active();
    if (actor?.role !== 'superadmin' || (actor.status ?? 'activo') !== 'activo') throw new Error('Detalle exclusivo de SuperAdmin.');
    return withAccess({ actorId, businessId, purpose: 'inventory' }, async () => {
      const page = await sdk.getDocs(sdk.query(sdk.collection(database, 'branches'), sdk.where('businessId', '==', businessId), sdk.limit(201))); active();
      if (page.docs.some(row => row.data().businessId !== businessId)) throw new Error('Respuesta fuera del negocio.');
      return { businessId, branches: page.docs.slice(0, 200).map(row => ({ ...row.data(), id: row.id })),
        complete: page.size < 201, warnings: page.size >= 201 ? ['Inventario de sedes limitado a 200; no permite regularizar.'] : [] };
    });
  };
}
let reader;
export const readPlatformBusiness = options => {
  reader ??= createPlatformBusinessReader(getPlatformReadDatabase(), { currentUser: () => auth.currentUser });
  return reader(options);
};
