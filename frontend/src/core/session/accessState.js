import { toDateSafe } from '../dates/dateValues.js';
import { getFirebaseErrorCode } from '../errors/firebaseErrors.js';

export const isServerSnapshot = metadata => metadata?.fromCache === false && metadata?.hasPendingWrites === false;

export function accessErrorState(error) {
  const code = getFirebaseErrorCode(error);
  if (code === 'permission-denied' || code === 'unauthenticated') return 'permission-denied';
  if (['unavailable', 'deadline-exceeded', 'network-request-failed', 'cancelled'].includes(code)) return 'network-error';
  return 'configuration-error';
}

export function profileAccess(data, metadata, withinShift) {
  if (!isServerSnapshot(metadata)) return 'offline-unverified';
  if (!data) return 'profile-not-found-confirmed';
  if (!['superadmin', 'dueño', 'cajero'].includes(data.role)
    || (data.role !== 'superadmin' && (!data.businessId || data.businessId === 'platform-admin'))
    || (data.role === 'cajero' && (!data.branchId || data.branchId === 'global'))) return 'profile-incomplete';
  if ((data.status ?? 'activo') !== 'activo') return 'suspended';
  return withinShift(data) ? 'ready' : 'shift-denied';
}

export function licenseAccess({ license, tenant, businessId, now = new Date() }) {
  if (license.error || tenant.error) return accessErrorState(license.error || tenant.error);
  if (!license.received || !tenant.received) return 'loading';
  if (!isServerSnapshot(license.metadata) || !isServerSnapshot(tenant.metadata)) return 'offline-unverified';
  if (!license.data) return tenant.data ? 'license-missing-confirmed' : 'tenant-missing-confirmed';
  const expiry = toDateSafe(license.data.expiry);
  if (license.data.businessId !== businessId || !expiry) return 'configuration-error';
  // Historical businesses may lack a tenants document, as permitted by Rules.
  // An absent license alone never proves that a business was deleted.
  if ((tenant.data && (tenant.data.status !== 'active' || tenant.data.maintenanceJobId))
    || license.data.status !== 'activa' || (license.data.tenantStatus ?? 'active') !== 'active'
    || license.data.maintenanceJobId) return 'suspended';
  return expiry <= now ? 'expired' : 'active';
}
