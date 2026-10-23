import { SaleError, documentId } from '../sales/domain/saleModel.js';
import { requireActiveTenant } from '../platform/access.js';
import { isWithinShift } from './shiftSchedule.js';

export function requireShift(actor, now = Date.now()) {
  if (!isWithinShift(actor, new Date(now))) throw new SaleError('outside-shift', 'Tu horario de turno ha terminado.');
}

export async function actorFor(transaction, database, uid, { operational = true } = {}) {
  if (!uid) throw new SaleError('unauthenticated', 'Inicia sesión para continuar.');
  const snapshot = await transaction.get(database.doc(`users/${documentId(uid)}`));
  const profile = snapshot.data();
  if (!profile || (profile.status ?? 'activo') !== 'activo'
    || !['dueño', 'cajero', 'superadmin'].includes(profile.role)) {
    throw new SaleError('permission-denied', 'Usuario sin permiso o suspendido.');
  }
  // Even platform operators submit financial operations only within their assigned tenant.
  const businessId = documentId(profile.businessId);
  if (operational) await requireActiveTenant(transaction, database, businessId);
  const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
    || profile.displayName || profile.email?.split('@')[0] || 'Cajero';
  return { uid, businessId, branchId: profile.branchId, role: profile.role, name, shiftStart: profile.shiftStart, shiftEnd: profile.shiftEnd };
}

export async function authorizeBranch(transaction, database, actor, branchId, businessId = actor.businessId, { requireActive = true } = {}) {
  documentId(branchId);
  if (businessId !== actor.businessId || branchId === 'global'
    || (actor.role === 'cajero' && actor.branchId !== branchId)) {
    throw new SaleError('permission-denied', 'Negocio o sede fuera de tus permisos.');
  }
  const branch = (await transaction.get(database.doc(`branches/${branchId}`))).data();
  if (!branch || branch.businessId !== actor.businessId || (requireActive && (branch.status ?? 'activo') !== 'activo')) {
    throw new SaleError('permission-denied', 'Sede inexistente, suspendida o de otro negocio.');
  }
}
