import { randomUUID, createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { requirePlatformAdmin } from './access.js';
import { documentId, SaleError } from '../sales/domain/saleModel.js';

export const fail = message => { throw new SaleError('invalid-administration', message); };
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function inputOnly(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !keys.includes(key))) fail('Datos administrativos no permitidos.');
  return value;
}
const text = (value, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail('Texto requerido o demasiado largo.');
  return value.trim();
};
const months = value => { if (!Number.isInteger(value) || value < 1 || value > 120) fail('Duración inválida (1–120 meses).'); return value; };
export function addLicenseMonths(ms, count) {
  // Business calendar: Peru (UTC-5). Clamp Jan 31 + 1 month to Feb's final day.
  const date = new Date(ms - 5 * 3600000), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months(count));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, end));
  return date.getTime() + 5 * 3600000;
}
export function platformAudit(tx, db, id, actorId, operation, businessId, result, now) {
  tx.set(db.doc(`platform_audit/${id}`), { actorId, operation, targetTenant: businessId, result, occurredAt: Timestamp.fromMillis(now) });
}
export function newJob({ id, kind, businessId, actorId, now, deletionRequestId = null }) {
  return { id, kind, businessId, actorId, status: 'queued', phase: kind === 'backup' ? 'documents' : 'verify',
    unit: 0, collectionIndex: 0, cursor: null, queue: [], partCount: 0, counts: {}, storageCount: 0,
    attempts: 0, leaseUntil: null, createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now), deletionRequestId };
}

export function createAdministrationHandlers(db, { now = Date.now, recoveryHours = Number(process.env.TENANT_DELETION_RECOVERY_HOURS ?? 168), beforeCommit = async () => {} } = {}) {
  if (!Number.isFinite(recoveryHours) || recoveryHours < (process.env.FIRESTORE_EMULATOR_HOST ? 0 : 24) || recoveryHours > 2160) throw new Error('Invalid deletion recovery configuration');
  async function operate(request, name, keys, work) {
    const data = inputOnly(request.data, ['operationId', ...keys]);
    const operationId = text(data.operationId, 100);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(operationId)) fail('ID de operación inválido.');
    const fingerprint = hash([name, data]), id = hash([request.auth?.uid ?? '', operationId]);
    return db.runTransaction(async tx => {
      const actor = await requirePlatformAdmin(tx, db, request.auth?.uid);
      const ref = db.doc(`platform_operations/${id}`), previous = (await tx.get(ref)).data();
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('El ID ya identifica otra operación.');
        return previous.result;
      }
      const result = await work(tx, data, actor);
      await beforeCommit(name);
      tx.create(ref, { actorId: actor.uid, fingerprint, operation: name, businessId: result.businessId, result, createdAt: Timestamp.fromMillis(now()) });
      platformAudit(tx, db, id, actor.uid, name, result.businessId, 'accepted', now());
      return result;
    });
  }
  async function target(tx, data, { mutable = true } = {}) {
    const businessId = documentId(data.businessId);
    const [t, l] = await tx.getAll(db.doc(`tenants/${businessId}`), db.doc(`licenses/${businessId}`));
    const tenant = t.data() ?? { businessId, status: 'active', schemaVersion: 1 }, license = l.data();
    if (!l.exists || license.businessId !== businessId || tenant.status === 'deleted') fail('Tenant inexistente o eliminado.');
    if (mutable && (tenant.status !== 'active' || tenant.maintenanceJobId)) fail('Tenant restringido por una operación administrativa.');
    return { businessId, tenant, license, ref: t.ref, licenseRef: l.ref };
  }
  const createTenant = request => {
    const businessId = randomUUID(), branchId = randomUUID();
    return operate(request, 'createTenant', ['businessName', 'ownerEmail', 'firstName', 'lastName', 'months'], async (tx, data) => {
      const businessName = text(data.businessName), firstName = text(data.firstName), lastName = text(data.lastName);
      const email = text(data.ownerEmail, 254).toLowerCase();
      if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) fail('Correo inválido.');
      const expiry = Timestamp.fromMillis(addLicenseMonths(now(), months(data.months)));
      const inviteRef = db.doc(`invites/${email}`);
      const invite = await tx.get(inviteRef);
      const users = await tx.get(db.collection('users').where('email', '==', email).limit(1));
      if (invite.exists || !users.empty) fail('El correo ya pertenece a una invitación o usuario.');
      const timestamp = Timestamp.fromMillis(now());
      tx.create(db.doc(`tenants/${businessId}`), { businessId, businessName, status: 'active', schemaVersion: 1, createdAt: timestamp });
      tx.create(db.doc(`licenses/${businessId}`), { businessId, businessName, status: 'activa', tenantStatus: 'active', expiry, createdAt: timestamp });
      tx.create(inviteRef, { businessId, email, firstName, lastName, role: 'dueño', branchId: 'global',
        shiftStart: null, shiftEnd: null, status: 'activo', createdAt: timestamp.toDate().toISOString() });
      tx.create(db.doc(`branches/${branchId}`), { businessId, name: 'Sede Principal', address: 'Dirección por definir', phone: '', status: 'activo', createdAt: timestamp.toDate().toISOString() });
      tx.create(db.doc(`settings/${businessId}`), { businessId, companyData: { razonSocial: businessName, ruc: '', direccion: 'Dirección por definir', telefono: '' } });
      return { businessId, branchId, status: 'active', expiry: expiry.toDate().toISOString() };
    });
  };
  const extendTenantLicense = request => operate(request, 'extendTenantLicense', ['businessId', 'months'], async (tx, data) => {
    const t = await target(tx, data);
    const expiry = Timestamp.fromMillis(addLicenseMonths(Math.max(now(), t.license.expiry?.toMillis?.() ?? 0), months(data.months)));
    tx.update(t.licenseRef, { expiry, status: 'activa', updatedAt: Timestamp.fromMillis(now()) });
    return { businessId: t.businessId, expiry: expiry.toDate().toISOString(), status: 'activa' };
  });
  const setTenantLicenseStatus = request => operate(request, 'setTenantLicenseStatus', ['businessId', 'status'], async (tx, data) => {
    if (!['activa', 'inactiva'].includes(data.status)) fail('Estado de licencia inválido.');
    const t = await target(tx, data);
    tx.update(t.licenseRef, { status: data.status, updatedAt: Timestamp.fromMillis(now()) });
    return { businessId: t.businessId, status: data.status };
  });
  const startTenantBackup = request => {
    const id = randomUUID();
    return operate(request, 'startTenantBackup', ['businessId'], async (tx, data, actor) => {
      const t = await target(tx, data, { mutable: false });
      if (t.tenant.maintenanceJobId || !['active', 'deletion_requested'].includes(t.tenant.status)) fail('Ya hay un job o eliminación en curso.');
      tx.set(t.ref, { ...t.tenant, maintenanceJobId: id, ...(t.tenant.status === 'deletion_requested' ? { deletionBackupId: id } : {}) });
      tx.update(t.licenseRef, { maintenanceJobId: id, tenantStatus: t.tenant.status });
      tx.create(db.doc(`platform_jobs/${id}`), newJob({ id, kind: 'backup', businessId: t.businessId, actorId: actor.uid, now: now(), deletionRequestId: t.tenant.deletionRequestId ?? null }));
      return { businessId: t.businessId, jobId: id };
    });
  };
  const requestTenantDeletion = request => {
    const id = randomUUID(), backupId = randomUUID();
    return operate(request, 'requestTenantDeletion', ['businessId', 'confirmation'], async (tx, data, actor) => {
      const t = await target(tx, data);
      if (data.confirmation !== t.businessId) fail('Confirma el ID exacto del tenant.');
      const purgeAfter = Timestamp.fromMillis(now() + recoveryHours * 3600000);
      tx.set(t.ref, { ...t.tenant, status: 'deletion_requested', deletionRequestId: id, deletionRequestedBy: actor.uid,
        deletionRequestedAt: Timestamp.fromMillis(now()), purgeAfter, maintenanceJobId: backupId, deletionBackupId: backupId });
      tx.update(t.licenseRef, { tenantStatus: 'deletion_requested', maintenanceJobId: backupId });
      tx.create(db.doc(`platform_jobs/${backupId}`), newJob({ id: backupId, kind: 'backup', businessId: t.businessId, actorId: actor.uid, now: now(), deletionRequestId: id }));
      return { businessId: t.businessId, status: 'deletion_requested', backupId, purgeAfter: purgeAfter.toDate().toISOString() };
    });
  };
  const cancelTenantDeletion = request => operate(request, 'cancelTenantDeletion', ['businessId'], async (tx, data) => {
    const t = await target(tx, data, { mutable: false });
    if (t.tenant.status !== 'deletion_requested') fail('Solo se puede cancelar antes de la purga.');
    if (t.tenant.maintenanceJobId) {
      const ref = db.doc(`platform_jobs/${documentId(t.tenant.maintenanceJobId)}`), job = (await tx.get(ref)).data();
      if (!job || job.kind !== 'backup' || job.businessId !== t.businessId) fail('Job administrativo incompatible.');
      tx.update(ref, { status: 'cancelled', leaseToken: null, leaseUntil: null, updatedAt: Timestamp.fromMillis(now()) });
    }
    tx.set(t.ref, { businessId: t.businessId, businessName: t.tenant.businessName ?? t.license.businessName ?? t.businessId,
      status: 'active', schemaVersion: 1, createdAt: t.tenant.createdAt ?? Timestamp.fromMillis(now()) });
    tx.update(t.licenseRef, { tenantStatus: 'active', maintenanceJobId: null });
    return { businessId: t.businessId, status: 'active' };
  });
  const startTenantPurge = request => {
    const id = randomUUID();
    return operate(request, 'startTenantPurge', ['businessId', 'confirmation'], async (tx, data, actor) => {
      const t = await target(tx, data, { mutable: false });
      if (data.confirmation !== t.businessId || t.tenant.status !== 'deletion_requested'
        || t.tenant.maintenanceJobId || t.tenant.purgeAfter?.toMillis?.() > now()) fail('Confirmación, backup o período recuperable pendientes.');
      const backup = t.tenant.deletionBackupId && (await tx.get(db.doc(`platform_jobs/${documentId(t.tenant.deletionBackupId)}`))).data();
      if (!backup || backup.businessId !== t.businessId || backup.kind !== 'backup' || backup.status !== 'completed'
        || !backup.verifiedAt || backup.deletionRequestId !== t.tenant.deletionRequestId) fail('Se requiere backup verificado de esta solicitud de eliminación.');
      tx.update(t.ref, { status: 'deleting', purgeJobId: id });
      tx.update(t.licenseRef, { tenantStatus: 'deleting' });
      tx.create(db.doc(`platform_jobs/${id}`), { ...newJob({ id, kind: 'purge', businessId: t.businessId, actorId: actor.uid, now: now(), deletionRequestId: t.tenant.deletionRequestId }), backupId: backup.id, verifyIndex: 0 });
      return { businessId: t.businessId, jobId: id, status: 'deleting' };
    });
  };
  const getTenantAdministration = async request => {
    await requirePlatformAdmin(db, db, request.auth?.uid);
    const data = inputOnly(request.data ?? {}, ['cursor', 'limit', 'businessId']);
    const limit = data.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('Página inválida.');
    let query = db.collection('licenses').orderBy(FieldPath.documentId()).limit(limit);
    if (data.cursor) query = query.startAfter(documentId(data.cursor));
    const docs = data.businessId ? [await db.doc(`licenses/${documentId(data.businessId)}`).get()] : (await query.get()).docs;
    const rows = await Promise.all(docs.filter(d => d.exists).map(async license => {
      const businessId = license.id, [tenant, owners] = await Promise.all([
        db.doc(`tenants/${businessId}`).get(), db.collection('users').where('businessId', '==', businessId).where('role', '==', 'dueño').limit(1).get(),
      ]);
      const invites = owners.empty ? await db.collection('invites').where('businessId', '==', businessId).where('role', '==', 'dueño').limit(1).get() : null;
      const owner = owners.docs[0]?.data() ?? invites?.docs[0]?.data() ?? {}, t = tenant.data() ?? {};
      return { id: businessId, businessId, businessName: t.businessName ?? license.data().businessName ?? businessId,
        status: license.data().status, expiry: license.data().expiry?.toDate?.().toISOString() ?? null,
        tenantStatus: t.status ?? 'active', purgeAfter: t.purgeAfter?.toDate?.().toISOString() ?? null,
        backupId: t.deletionBackupId ?? t.lastBackupId ?? null, maintenanceJobId: t.maintenanceJobId ?? null, purgeJobId: t.purgeJobId ?? null,
        ownerFirstName: owner.firstName ?? '', ownerLastName: owner.lastName ?? '', ownerEmail: owner.email ?? '' };
    }));
    return { rows, cursor: !data.businessId && docs.length === limit ? docs.at(-1).id : null };
  };
  return { createTenant, extendTenantLicense, setTenantLicenseStatus, getTenantAdministration, startTenantBackup, requestTenantDeletion, cancelTenantDeletion, startTenantPurge };
}
