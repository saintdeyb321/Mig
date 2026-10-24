import * as firestore from 'firebase/firestore';
import { cashLockId } from '../../cash-register/infrastructure/sparkCashRepository.js';
import { isBranchOperational, nextBranchInventory } from '../domain/branchPolicy.js';

export function createBranchWriter(database, { sdk = firestore, currentUser } = {}) {
  return async (id, data, { create = false } = {}) => {
    const uid = currentUser()?.uid;
    if (!uid || !data.businessId || !['activo', 'inactivo'].includes(data.status)) throw new Error('Sesión, negocio o estado de sede inválido.');
    const ref = sdk.doc(database, 'branches', id), licenseRef = sdk.doc(database, 'licenses', data.businessId);
    await sdk.runTransaction(database, async tx => {
      const [saved, license] = await Promise.all([tx.get(ref), tx.get(licenseRef)]);
      if (currentUser()?.uid !== uid) throw new Error('La sesión cambió.');
      const previous = saved.data();
      if (create && saved.exists()) {
        if (previous.businessId !== data.businessId || ['name', 'address', 'phone', 'status', 'yapeQrUrl'].some(key => (previous[key] ?? null) !== (data[key] ?? null))) throw new Error('El ID de sede ya corresponde a otra operación.');
        return;
      }
      if (!create && (!previous || previous.businessId !== data.businessId)) throw new Error('La sede no pertenece al negocio.');
      const wasActive = isBranchOperational(previous), willBeActive = isBranchOperational(data), changing = wasActive !== willBeActive;
      const inventory = create || changing ? nextBranchInventory(license.data(), id, { create, wasActive, willBeActive }) : null;
      if (wasActive && !willBeActive) {
        if (previous.branchLifecycleVersion !== 1) throw new Error('Sede histórica: requiere revisión administrativa de cajas y pendientes antes de inactivarla.');
        const lock = await tx.get(sdk.doc(database, 'active_cash_sessions', await cashLockId(data.businessId, id)));
        if (lock.exists()) throw new Error('Cierra la caja o reserva activa antes de inactivar esta sede.');
      }
      if (inventory) tx.update(licenseRef, { ...inventory,
        branchQuotaBranchId: id, branchQuotaUpdatedAt: sdk.serverTimestamp() });
      if (create) tx.set(ref, { ...data, sparkCashVersion: 1, branchLifecycleVersion: 1 });
      else tx.update(ref, data);
    });
    return id;
  };
}
