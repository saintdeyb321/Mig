import { DEFAULT_MAX_ACTIVE_BRANCHES, DEFAULT_MAX_REGISTERED_BRANCHES, validateBranchQuotas } from '../../branches/domain/branchPolicy.js';
import * as firestore from 'firebase/firestore';
import { toMillisSafe } from '../../../core/dates/dateValues.js';
import { addLicenseMonths, validateLicenseMonths } from '../domain/licenseTerm.js';

const fail = (message, code = 'invalid-administration') => { throw Object.assign(new Error(message), { code }); };
const text = (value, label, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label}: valor requerido o demasiado largo.`);
  return value.trim();
};
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
  const { doc, collection, query, where, orderBy, documentId, limit, startAfter, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp, Timestamp } = sdk;
  const actor = expectedId => {
    const user = currentUser?.();
    if (!user?.uid || (expectedId && user.uid !== expectedId)) fail('La sesión cambió. Inicia sesión de nuevo.', 'unauthenticated');
    return user;
  };
  const licenseRow = snapshot => {
    const businessId = snapshot.id, data = snapshot.data();
    if (!data || (data.businessId != null && data.businessId !== businessId)) fail('Licencia no verificable.');
    const { businessName, status, tenantStatus, maintenanceJobId, expiry, branchQuotaVersion, registeredBranchQuotaVersion,
      maxActiveBranches, maxRegisteredBranches, activeBranchIds, registeredBranchIds } = data;
    return { id: businessId, businessName: businessName || 'Negocio sin nombre registrado', status, tenantStatus: tenantStatus ?? 'active',
      maintenanceJobId, expiry, branchQuotaVersion, registeredBranchQuotaVersion, maxActiveBranches, maxRegisteredBranches,
      activeBranchIds, registeredBranchIds };
  };
  const administrationPage = async ({ actorId, cursor, limit: pageLimit = 25 } = {}) => {
    const user = actor(actorId);
    if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 50) fail('Página inválida.');
    const page = await getDocsFromServer(query(collection(database, 'licenses'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(pageLimit)));
    actor(user.uid);
    if (page.metadata?.fromCache || page.metadata?.hasPendingWrites) fail('La página no fue confirmada por el servidor.', 'unavailable');
    return { rows: page.docs.map(licenseRow), cursor: page.size === pageLimit ? page.docs.at(-1).id : null };
  };
  const administrationLicense = async ({ actorId, businessId }) => {
    const user = actor(actorId);
    const saved = await getDocFromServer(doc(database, 'licenses', tenantId(businessId)));
    actor(user.uid);
    if (saved.metadata?.fromCache || saved.metadata?.hasPendingWrites) fail('La licencia no fue confirmada por el servidor.', 'unavailable');
    return licenseRow(saved);
  };
  const administrationContact = async ({ actorId, businessId }) => {
    const user = actor(actorId), id = tenantId(businessId);
    const ownerQuery = name => getDocsFromServer(query(collection(database, name), where('businessId', '==', id), where('role', '==', 'dueño'), limit(1)));
    const [tenant, owners] = await Promise.all([getDocFromServer(doc(database, 'tenants', id)), ownerQuery('users')]);
    actor(user.uid);
    const contactPage = owners.empty ? await ownerQuery('invites') : owners;
    actor(user.uid);
    const contact = contactPage.docs[0]?.data(), tenantData = tenant.data();
    if ([tenant, owners, contactPage].some(result => result.metadata?.fromCache || result.metadata?.hasPendingWrites)
      || (contact && contact.businessId !== id) || (tenantData?.businessId != null && tenantData.businessId !== id)) fail('Contacto no verificable.');
    return { businessName: tenantData?.businessName, ownerFirstName: contact?.firstName ?? '', ownerLastName: contact?.lastName ?? '',
      ownerEmail: contact?.email ?? tenantData?.ownerEmail ?? '' };
  };
  const createTenant = async raw => {
    const user = actor(raw.actorId), operationId = identifier(raw.operationId), businessId = operationId, branchId = `main_${operationId}`;
    const ownerEmail = text(raw.ownerEmail, 'Correo', 254).toLowerCase();
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail)) fail('Correo de propietario inválido.');
    if (ownerEmail === user.email?.toLowerCase()) fail('Usa una cuenta de propietario distinta del SuperAdmin.');
    const limits = validateBranchQuotas(raw.maxActiveBranches ?? DEFAULT_MAX_ACTIVE_BRANCHES, raw.maxRegisteredBranches ?? Math.max(DEFAULT_MAX_REGISTERED_BRANCHES, raw.maxActiveBranches ?? DEFAULT_MAX_ACTIVE_BRANCHES));
    const input = { operationId, actorId: user.uid, operation: 'createTenant', businessId, branchId, ownerEmail,
      businessName: text(raw.businessName, 'Negocio'), firstName: text(raw.firstName, 'Nombres'), lastName: text(raw.lastName, 'Apellidos'), months: validateLicenseMonths(raw.months), ...limits };
    const opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`);
    const claimRef = doc(database, 'owner_email_claims', ownerEmail), inviteRef = doc(database, 'invites', ownerEmail);
    // Rules cannot query historical users by email. Existing profiles are checked here;
    // permanent claims protect every new provisioning atomically, including concurrent admins.
    const previous = replay(await getDocFromServer(opRef), input);
    if (previous) return previous;
    const registered = await getDocsFromServer(query(collection(database, 'users'), where('email', '==', ownerEmail), limit(1)));
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
      tx.set(doc(database, 'licenses', businessId), { businessId, businessName: input.businessName, status: 'activa', tenantStatus: 'active', expiry, ...limits, activeBranchIds: [branchId], registeredBranchIds: [branchId], branchQuotaVersion: 1, registeredBranchQuotaVersion: 1, operationId, createdAt });
      tx.set(doc(database, 'branches', branchId), { businessId, name: 'Sede Principal', address: 'Dirección por definir', phone: '', status: 'activo', sparkCashVersion: 1, branchLifecycleVersion: 1, operationId, createdAt });
      tx.set(doc(database, 'settings', businessId), { businessId, operationId, companyData: { razonSocial: input.businessName, ruc: '', direccion: 'Dirección por definir', telefono: '' } });
      tx.set(inviteRef, { businessId, email: ownerEmail, firstName: input.firstName, lastName: input.lastName, role: 'dueño', branchId: 'global',
        shiftStart: null, shiftEnd: null, status: 'activo', createdAt, operationId });
      tx.set(claimRef, { businessId, email: ownerEmail, operationId, createdAt });
      return { businessId, branchId, status: 'active' };
    });
  };
  const changeLicense = async (operation, raw) => {
    const user = actor(raw.actorId), businessId = tenantId(raw.businessId), operationId = identifier(raw.operationId);
    const input = { operationId, actorId: user.uid, operation, businessId,
      ...(operation === 'extendTenantLicense' ? { months: validateLicenseMonths(raw.months) } : { newStatus: raw.status }) };
    if (operation === 'setTenantLicenseStatus' && !['activa', 'inactiva'].includes(raw.status)) fail('Estado de licencia inválido.');
    const opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`), licenseRef = doc(database, 'licenses', businessId);
    const commit = () => runTransaction(database, async tx => {
      const prior = replay(await tx.get(opRef), input);
      if (prior) return prior;
      const [license, tenant] = await Promise.all([tx.get(licenseRef), tx.get(doc(database, 'tenants', businessId))]);
      const l = license.data(), t = tenant.data();
      if (!l || l.businessId !== businessId) fail('La licencia no existe.');
      if ((t?.status ?? l.tenantStatus ?? 'active') !== 'active' || t?.maintenanceJobId || l.maintenanceJobId) fail('El negocio tiene mantenimiento o eliminación pendiente.');
      if (raw.expected && (raw.expected.status !== l.status || raw.expected.expiry !== toMillisSafe(l.expiry))) {
        fail('La licencia cambió. Actualiza la lista y revisa la vigencia antes de confirmar.', 'license-changed');
      }
      actor(user.uid);
      const updatedAt = serverTimestamp();
      const changes = operation === 'extendTenantLicense' ? { status: 'activa', expiry: Timestamp.fromMillis(addLicenseMonths(Math.max(now(), l.expiry?.toMillis?.() ?? 0), input.months)) } : { status: raw.status };
      tx.update(licenseRef, { ...changes, updatedAt, operationId });
      tx.set(opRef, { ...input, newStatus: changes.status, ...(changes.expiry ? { expiry: changes.expiry } : {}), createdAt: updatedAt });
      return { businessId, status: changes.status };
    });
    try {
      return await commit();
    } catch (failure) {
      // A concurrent commit may win before Rules evaluate this attempt.
      // Only a matching server receipt can turn an ambiguous response into success.
      if (!['permission-denied', 'aborted', 'unavailable', 'deadline-exceeded'].includes(failure.code)) throw failure;
      actor(user.uid);
      const receipt = await getDocFromServer(opRef).catch(() => null);
      actor(user.uid);
      if (receipt && !receipt.metadata?.fromCache && !receipt.metadata?.hasPendingWrites) {
        const confirmed = replay(receipt, input);
        if (confirmed) return confirmed;
      }
      throw failure;
    }
  };
  const setTenantBranchQuota = async raw => {
    const user = actor(raw.actorId), businessId = tenantId(raw.businessId), operationId = identifier(raw.operationId);
    const limits = validateBranchQuotas(raw.maxActiveBranches, raw.maxRegisteredBranches);
    const licenseRef = doc(database, 'licenses', businessId), opRef = doc(database, 'platform_operations', `${user.uid}_${operationId}`);
    return runTransaction(database, async tx => {
      const [prior, saved] = await Promise.all([tx.get(opRef), tx.get(licenseRef)]);
      const expected = { actorId: user.uid, businessId, operationId, operation: 'setTenantBranchQuota', ...limits };
      if (prior.exists()) { replay(prior, expected); return { businessId }; }
      if (!saved.exists() || saved.data().businessId !== businessId) fail('Licencia inexistente.');
      const existing = saved.data();
      if (raw.expected && (raw.expected.active !== (existing.maxActiveBranches ?? null) || raw.expected.registered !== (existing.maxRegisteredBranches ?? null))) {
        fail('El cupo cambió. Actualiza la lista antes de confirmar.', 'quota-changed');
      }
      const regularization = existing.branchQuotaVersion !== 1 || existing.registeredBranchQuotaVersion !== 1;
      if (regularization && raw.confirmHistoricalReview !== true) fail('Confirma el inventario completo de sedes registradas y activas para regularizar el negocio histórico.');
      const activeBranchIds = existing.branchQuotaVersion === 1 ? existing.activeBranchIds : raw.activeBranchIds;
      const registeredBranchIds = existing.registeredBranchQuotaVersion === 1 ? existing.registeredBranchIds : raw.registeredBranchIds;
      const validIds = (ids, maximum) => Array.isArray(ids) && ids.length >= 1 && ids.length <= maximum
        && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id));
      if (!validIds(activeBranchIds, limits.maxActiveBranches) || !validIds(registeredBranchIds, limits.maxRegisteredBranches)
        || !activeBranchIds.every(id => registeredBranchIds.includes(id))) fail('El cupo no puede ser menor que las sedes inventariadas; el inventario registrado debe incluir todas las activas.');
      if (currentUser()?.uid !== user.uid) fail('La sesión cambió.', 'unauthenticated');
      const createdAt = serverTimestamp();
      tx.update(licenseRef, { ...limits, activeBranchIds, registeredBranchIds, branchQuotaVersion: 1, registeredBranchQuotaVersion: 1, quotaOperationId: operationId, branchQuotaUpdatedAt: createdAt });
      tx.set(opRef, { ...expected, activeBranchIds, registeredBranchIds, regularization, createdAt });
      return { businessId, ...limits };
    });
  };
  return { administrationPage, administrationLicense, administrationContact, createTenant, setTenantBranchQuota,
    extendTenantLicense: data => changeLicense('extendTenantLicense', data),
    setTenantLicenseStatus: data => changeLicense('setTenantLicenseStatus', data) };
}
