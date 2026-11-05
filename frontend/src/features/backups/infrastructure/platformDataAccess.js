import * as firestoreSDK from 'firebase/firestore';

// Explicit, short-lived platform read scope. Never grants business writes or deletion.
export function createPlatformDataAccess(database, { sdk = firestoreSDK, currentUser } = {}) {
  return async ({ actorId, businessId, purpose }, work) => {
    const accessId = crypto.randomUUID();
    const reference = sdk.doc(database, 'platform_data_access', actorId);
    if (currentUser()?.uid !== actorId) throw new Error('La identidad cambió antes de autorizar la lectura.');
    await sdk.setDoc(reference, { actorId, businessId, purpose, accessId, createdAt: sdk.serverTimestamp() });
    let result, releaseWarning, accessControlWrites = 1;
    try {
      const confirmed = await sdk.getDocFromServer(reference);
      if (currentUser()?.uid !== actorId || !confirmed.exists() || confirmed.data().accessId !== accessId
        || confirmed.data().businessId !== businessId || confirmed.data().purpose !== purpose) {
        throw new Error('El permiso temporal cambió; no se inició la lectura del negocio.');
      }
      result = await work();
    }
    finally {
      const warning = 'No se pudo revocar el permiso temporal; Rules lo caduca a los 10 minutos de su creación. No concede escrituras de negocio.';
      if (currentUser()?.uid !== actorId) releaseWarning = warning;
      else try {
        const removed = await sdk.runTransaction(database, async transaction => {
          const saved = await transaction.get(reference);
          // Another tab may already own a newer scope; never revoke its authorization.
          if (saved.exists() && saved.data().accessId === accessId) { transaction.delete(reference); return true; }
          return false;
        });
        if (removed) accessControlWrites++;
      } catch { releaseWarning = warning; }
    }
    return { ...result, accessControlWrites, warnings: [...result.warnings, ...(releaseWarning ? [releaseWarning] : [])] };
  };
}
