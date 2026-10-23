import { SaleError, documentId } from '../sales/domain/saleModel.js';

export const blocked = message => { throw new SaleError('tenant-restricted', message ?? 'Servicio restringido. Conserva los pendientes para revisión administrativa.'); };

export async function requirePlatformAdmin(reader, database, uid) {
  if (!uid) throw new SaleError('unauthenticated', 'Inicia sesión.');
  const reference = database.doc(`users/${documentId(uid)}`);
  const profile = (await (typeof reader.get === 'function' ? reader.get(reference) : reference.get())).data();
  if (profile?.role !== 'superadmin' || (profile.status ?? 'activo') !== 'activo') {
    throw new SaleError('permission-denied', 'Se requiere administración de plataforma.');
  }
  return { uid };
}

export async function requireActiveTenant(reader, database, businessId, now = Date.now()) {
  documentId(businessId);
  const [tenant, license] = await Promise.all([
    reader.get(database.doc(`tenants/${businessId}`)), reader.get(database.doc(`licenses/${businessId}`)),
  ]);
  const state = tenant.data(), permit = license.data();
  // Legacy tenants use their protected license until new metadata is created by the backend.
  if (state && ((state.status ?? 'active') !== 'active' || state.maintenanceJobId)) blocked();
  if (!permit || permit.businessId !== businessId || permit.status !== 'activa'
    || (permit.tenantStatus ?? 'active') !== 'active' || permit.maintenanceJobId
    || typeof permit.expiry?.toMillis !== 'function' || permit.expiry.toMillis() <= now) blocked();
  return state;
}

export async function writableBackgroundTenant(reader, database, businessId) {
  const tenant = (await reader.get(database.doc(`tenants/${businessId}`))).data();
  return !tenant || ((tenant.status ?? 'active') === 'active' && !tenant.maintenanceJobId);
}
