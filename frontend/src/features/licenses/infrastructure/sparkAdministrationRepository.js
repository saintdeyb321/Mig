import { DEFAULT_MAX_ACTIVE_BRANCHES, validateBranchQuota } from '../../branches/domain/branchPolicy.js';
import * as firestore from 'firebase/firestore';

const fail = (message, code = 'invalid-administration') => { throw Object.assign(new Error(message), { code }); };
const text = (value, label, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label}: valor requerido o demasiado largo.`);
  return value.trim();
};
const monthsValue = value => {
  if (!Number.isInteger(value) || value < 1 || value > 120) fail('La duración debe ser de 1 a 120 meses.');
  return value;
};
export function addLicenseMonths(ms, count) {
  const date = new Date(ms - 5 * 3600000), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + monthsValue(count));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, end));
  return date.getTime() + 5 * 3600000;
}
const identifier = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail('ID de operación inválido.');
  return value;
};
const tenantId = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value) || value === 'platform-admin') fail('ID de negocio inválido.');
  return value;
};
const replay = (snapshot, expected) => {
  if (!snapshot.exists()) return null;
  const previous = snapshot.data();
  if (Object.entries(expected).some(([key, value]) => previous[key] !== value)) fail('Este ID ya corresponde a otra operación.', 'operation-conflict');
  return { businessId: previous.businessId, branchId: previous.branchId, status: previous.newStatus ?? 'active' };
};

export function createSparkAdministrationRepository(database, { currentUser, sdk = firestore, now = Date.now } = {}) {
  const { doc, collection, query, where, orderBy, documentId, limit, startAfter, getDoc, getDocs, runTransaction, serverTimestamp, Timestamp } = sdk;
  const actor = () => {
    const user = currentUser?.();
    if (!user?.uid) fail('Inicia sesión de nuevo.', 'unauthenticated');
    return user;
  };
  const administrationPage = async ({ cursor, limit: pageLimit = 25 } = {}) => {
    if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 50) fail('Página inválida.');
    const page = await getDocs(query(collection(database, 'licenses'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(pageLimit)));
    const rows = await Promise.all(page.docs.map(async license => {
      const businessId = license.id;
      const [tenant, owners] = await Promise.all([getDoc(doc(database, 'tenants', businessId)),
        getDocs(query(collection(database, 'users'), where('businessId', '==', businessId), where('role', '==', 'dueño'), limit(1)))]);
      const invites = owners.empty ? await getDocs(query(collection(database, 'invites'), where('businessId', '==', businessId), where('role', '==', 'dueño'), limit(1))) : null;
      const owner = owners.docs[0]?.data() ?? invites?.docs[0]?.data() ?? {}, t = tenant.data() ?? {}, l = license.data();
      return { ...l, id: businessId, businessId, businessName: t.businessName ?? l.businessName ?? businessId,
        tenantStatus: t.status ?? l.tenantStatus ?? 'active', maintenanceJobId: t.maintenanceJobId ?? l.maintenanceJobId ?? null,
        ownerFirstName: owner.firstName ?? '', ownerLastName: owner.lastName ?? '', ownerEmail: owner.email ?? t.ownerEmail ?? '' };
    }));
    return { rows, cursor: page.size === pageLimit ? page.docs.at(-1).id : null };
  };
  const createTenant = async raw => {
    const user = actor(), operationId = identifier(raw.operationId), businessId = operationId, branchId = `main_${operationId}`;
    const ownerEmail = text(raw.ownerEmail, 'Correo', 254).toLowerCase();
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail)) fail('Correo de propietario inválido.');
    if (ownerEmail === user.email?.toLowerCase()) fail('Usa una cuenta de propietario distinta del SuperAdmin.');
    const input = { operationId, actorId: user.uid, operation: 'createTenant', businessId, branchId, ownerEmail,
      businessName: text(raw.businessName, 'Negocio'), firstName: text(raw.firstName, 'Nombres'), lastName: text(raw.lastName, 'Apellidos'), months: monthsValue(raw.months), maxActiveBranches: validateBranchQuota(raw.maxActiveBranches ?? DEFAULT_MAX_ACTIVE_BRANCHES) };
    const opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`);
    const claimRef = doc(database, 'owner_email_claims', ownerEmail), inviteRef = doc(database, 'invites', ownerEmail);
    // Rules cannot query historical users by email. Existing profiles are checked here;
    // permanent claims protect every new provisioning atomically, including concurrent admins.
    const previous = replay(await getDoc(opRef), input);
    if (previous) return previous;
    const registered = await getDocs(query(collection(database, 'users'), where('email', '==', ownerEmail), limit(1)));
    if (!registered.empty) fail('El correo ya pertenece a un usuario. Usa otro Gmail de propietario.', 'email-in-use');
    return runTransaction(database, async tx => {
      const prior = replay(await tx.get(opRef), input);
      if (prior) return prior;
      const [claim, invitation] = await Promise.all([tx.get(claimRef), tx.get(inviteRef)]);
      if (claim.exists() || invitation.exists()) fail('El correo ya tiene un negocio o invitación.', 'email-in-use');
      if (currentUser()?.uid !== user.uid) fail('La sesión cambió.', 'unauthenticated');
      const createdAt = serverTimestamp(), expiry = Timestamp.fromMillis(addLicenseMonths(now(), input.months));
      tx.set(opRef, { ...input, expiry, createdAt });
      tx.set(doc(database, 'tenants', businessId), { businessId, businessName: input.businessName, ownerEmail, status: 'active', schemaVersion: 1, operationId, createdAt });
      tx.set(doc(database, 'licenses', businessId), { businessId, businessName: input.businessName, status: 'activa', tenantStatus: 'active', expiry, maxActiveBranches: input.maxActiveBranches, activeBranchIds: [branchId], branchQuotaVersion: 1, operationId, createdAt });
      tx.set(doc(database, 'branches', branchId), { businessId, name: 'Sede Principal', address: 'Dirección por definir', phone: '', status: 'activo', sparkCashVersion: 1, branchLifecycleVersion: 1, operationId, createdAt });
      tx.set(doc(database, 'settings', businessId), { businessId, operationId, companyData: { razonSocial: input.businessName, ruc: '', direccion: 'Dirección por definir', telefono: '' } });
      tx.set(inviteRef, { businessId, email: ownerEmail, firstName: input.firstName, lastName: input.lastName, role: 'dueño', branchId: 'global',
        shiftStart: null, shiftEnd: null, status: 'activo', createdAt, operationId });
      tx.set(claimRef, { businessId, email: ownerEmail, operationId, createdAt });
      return { businessId, branchId, status: 'active' };
    });
  };
  const changeLicense = async (operation, raw) => {
    const user = actor(), businessId = tenantId(raw.businessId), operationId = identifier(raw.operationId);
    const input = { operationId, actorId: user.uid, operation, businessId,
      ...(operation === 'extendTenantLicense' ? { months: monthsValue(raw.months) } : { newStatus: raw.status }) };
    if (operation === 'setTenantLicenseStatus' && !['activa', 'inactiva'].includes(raw.status)) fail('Estado de licencia inválido.');
    const opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`), licenseRef = doc(database, 'licenses', businessId);
    return runTransaction(database, async tx => {
      const prior = replay(await tx.get(opRef), input);
      if (prior) return prior;
      const [license, tenant] = await Promise.all([tx.get(licenseRef), tx.get(doc(database, 'tenants', businessId))]);
      const l = license.data(), t = tenant.data();
      if (!l || l.businessId !== businessId) fail('La licencia no existe.');
      if ((t?.status ?? l.tenantStatus ?? 'active') !== 'active' || t?.maintenanceJobId || l.maintenanceJobId) fail('El negocio tiene mantenimiento o eliminación pendiente.');
      const updatedAt = serverTimestamp();
      const changes = operation === 'extendTenantLicense' ? { status: 'activa', expiry: Timestamp.fromMillis(addLicenseMonths(Math.max(now(), l.expiry?.toMillis?.() ?? 0), input.months)) } : { status: raw.status };
      tx.update(licenseRef, { ...changes, updatedAt, operationId });
      tx.set(opRef, { ...input, newStatus: changes.status, ...(changes.expiry ? { expiry: changes.expiry } : {}), createdAt: updatedAt });
      return { businessId, status: changes.status };
    });
  };
  const setTenantBranchQuota = async raw => {
    const user = actor(), businessId = tenantId(raw.businessId), operationId = identifier(raw.operationId);
    const maxActiveBranches = validateBranchQuota(raw.maxActiveBranches);
    const licenseRef = doc(database, 'licenses', businessId), opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`);
    return runTransaction(database, async tx => {
      const [prior, saved] = await Promise.all([tx.get(opRef), tx.get(licenseRef)]);
      const expected = { actorId: user.uid, businessId, operationId, operation: 'setTenantBranchQuota', maxActiveBranches };
      if (prior.exists()) { replay(prior, expected); return { businessId }; }
      if (!saved.exists() || saved.data().businessId !== businessId) fail('Licencia inexistente.');
      const regularization = saved.data().branchQuotaVersion !== 1;
      if (regularization && raw.confirmHistoricalReview !== true) fail('Confirma el inventario actual de sedes para regularizar el negocio histórico.');
      const activeBranchIds = regularization ? raw.activeBranchIds : saved.data().activeBranchIds;
      if (!Array.isArray(activeBranchIds) || activeBranchIds.length < 1 || activeBranchIds.length > maxActiveBranches
        || new Set(activeBranchIds).size !== activeBranchIds.length || activeBranchIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) fail('El cupo no puede ser menor que las sedes activas inventariadas.');
      if (currentUser()?.uid !== user.uid) fail('La sesión cambió.', 'unauthenticated');
      const createdAt = serverTimestamp();
      tx.update(licenseRef, { maxActiveBranches, activeBranchIds, branchQuotaVersion: 1, quotaOperationId: operationId, branchQuotaUpdatedAt: createdAt });
      tx.set(opRef, { ...expected, activeBranchIds, regularization, createdAt });
      return { businessId, maxActiveBranches };
    });
  };
  return { administrationPage, createTenant, setTenantBranchQuota,
    extendTenantLicense: data => changeLicense('extendTenantLicense', data),
    setTenantLicenseStatus: data => changeLicense('setTenantLicenseStatus', data) };
}
