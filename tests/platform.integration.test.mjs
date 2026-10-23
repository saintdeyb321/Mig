import assert from 'node:assert/strict';
import { beforeEach, afterEach, after, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { createAdministrationHandlers, addLicenseMonths } from '../functions/src/platform/administration.js';
import { createPlatformJobs } from '../functions/src/platform/jobs.js';
import { SCOPED_COLLECTIONS, checksum, dryRunPart } from '../functions/src/platform/backupFormat.js';
import { canonicalSale, SaleError } from '../frontend/src/features/sales/domain/saleModel.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { restoreTenantDryRun, restoreOptions } from '../functions/scripts/restoreTenantDryRun.mjs';

for (const [variable, host] of Object.entries({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' })) assert.equal(process.env[variable], host);
const projectId = 'demo-migapos', uuid = () => crypto.randomUUID();
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const admin = initAdmin({ projectId, storageBucket: projectId + '.appspot.com' }, 'platform-tests');
const db = getFirestore(admin), bucket = getStorage(admin).bucket(), auth = getAdminAuth(admin);
// The real worker is tested through callables as well. Fault-injection fixtures use a separate job
// namespace so a deployed emulator trigger cannot steal the intentionally interrupted unit.
const manualDb = { projectId, doc: path => db.doc(path.replace(/^platform_jobs\//, 'fixture_platform_jobs/')),
  collection: path => db.collection(path === 'platform_jobs' ? 'fixture_platform_jobs' : path.replace(/^platform_jobs\//, 'fixture_platform_jobs/')),
  runTransaction: callback => db.runTransaction(callback) };
let actors, clock;
const rpc = (name, data, who = 'admin') => httpsCallable(actors[who].functions, name)(data).then(result => result.data);
const request = data => ({ auth: { uid: actors.admin.uid }, data });
const operation = data => ({ operationId: uuid(), ...data });
const administration = options => createAdministrationHandlers(manualDb, { now: () => clock, recoveryHours: 1, ...options });
const workers = options => createPlatformJobs(manualDb, bucket, auth, { now: () => clock, ...options });
const jobDoc = id => manualDb.doc('platform_jobs/' + id);
const failure = (promise, code = 'permission-denied') => assert.rejects(promise, error => (error.details?.saleCode ?? error.code) === code);
const createInput = () => operation({ businessName: 'Negocio de prueba', ownerEmail: uuid() + '@example.test', firstName: 'Ana', lastName: 'Prueba', months: 1 });
async function drain(id, worker, max = 300) {
  let captured;
  worker ??= workers({ onError: error => { captured = error; } });
  for (let unit = 0; unit < max; unit++) {
    const current = (await jobDoc(id).get()).data();
    if (['failed', 'completed'].includes(current.status)) { assert.equal(current.status, 'completed', captured?.stack ?? JSON.stringify(current)); return current; }
    await worker.runUnit(id);
  }
  assert.fail('Job did not finish within its bounded test budget');
}
async function waitRealJob(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = await rpc('getPlatformJob', { jobId: id });
    if (['failed', 'completed'].includes(job.status)) { assert.equal(job.status, 'completed', JSON.stringify(job)); return job; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Emulator worker did not complete');
}
beforeEach(async () => {
  assert.equal(db.projectId, projectId);
  clock = Date.now(); actors = {};
  assert.equal((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })).ok, true);
  for (const name of ['admin', 'owner', 'other']) {
    const app = initializeApp({ projectId, apiKey: 'demo-only-key' }, 'platform-' + uuid());
    const clientAuth = getAuth(app); connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const credential = await createUserWithEmailAndPassword(clientAuth, uuid() + '@example.test', 'emulator-only-password');
    const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    actors[name] = { app, functions, uid: credential.user.uid };
  }
  const batch = db.batch();
  for (const [name, actor] of Object.entries(actors)) batch.set(db.doc('users/' + actor.uid), {
    businessId: name === 'admin' ? 'platform' : name === 'owner' ? 'tenant-a' : 'tenant-b',
    role: name === 'admin' ? 'superadmin' : 'dueño', status: 'activo', email: `${name}@example.test`, branchId: 'global', firstName: name,
  });
  for (const businessId of ['tenant-a', 'tenant-b']) {
    batch.set(db.doc('licenses/' + businessId), { businessId, status: 'activa', expiry: Timestamp.fromMillis(clock + 365 * 86400000) });
    batch.set(db.doc('settings/' + businessId), { companyData: { razonSocial: businessId } });
    batch.set(db.doc('branches/' + (businessId === 'tenant-a' ? 'a-1' : 'b-1')), { businessId, status: 'activo' });
  }
  batch.set(db.doc('products/product-a'), { businessId: 'tenant-a', name: 'Pan', price: 10, stock: { 'a-1': 100 } });
  batch.set(db.doc('cash_sessions/session-a'), { businessId: 'tenant-a', branchId: 'a-1', userId: actors.owner.uid, status: 'open', openedAt: new Date(clock - 10000).toISOString(),
    financialWindow: { start: Timestamp.fromMillis(clock - 10000), openedAt: Timestamp.fromMillis(clock - 10000), expiresAt: Timestamp.fromMillis(clock + 3600000) } });
  await batch.commit();
  for (const businessId of ['tenant-a', 'tenant-b']) {
    await bucket.deleteFiles({ prefix: `contracts/${businessId}/`, force: true });
    await bucket.file(`contracts/${businessId}/fixture/image.jpg`).save(Buffer.from('synthetic-image'), { metadata: { contentType: 'image/jpeg' } });
  }
});
afterEach(async () => { await Promise.all(Object.values(actors).map(actor => deleteApp(actor.app))); });
after(async () => deleteAdmin(admin));
const ticket = overrides => canonicalSale({ localId: uuid(), businessId: 'tenant-a', userId: actors.owner.uid, branchId: 'a-1', sessionId: 'session-a',
  items: [{ id: 'product-a', name: 'Pan', qty: 1, price: 10 }], total: 10, payment: 'efectivo', amountPaid: 10, change: 0,
  createdAt: new Date(clock - 1000).toISOString(), queuedAt: new Date(clock - 1000).toISOString(), origin: 'offline', ...overrides });

describe('Phase 8 platform boundary and licenses (demo emulators only)', () => {
  it('only a protected active superadmin can provision; forged payload identities and claims confer no privilege', async () => {
    await failure(rpc('createTenant', createInput(), 'owner'));
    await failure(rpc('createTenant', { ...createInput(), role: 'superadmin', uid: actors.admin.uid }, 'owner'), 'invalid-administration');
    assert.equal((await db.collection('tenants').get()).size, 0);
    const result = await rpc('createTenant', createInput());
    assert.match(result.businessId, /^[a-f0-9-]{36}$/);
    assert.equal((await db.doc('branches/' + result.branchId).get()).data().businessId, result.businessId);
  });
  it('provisioning retries and simultaneous duplicate requests produce one consistent tenant and owner invitation', async () => {
    const data = createInput(), results = await Promise.all([rpc('createTenant', data), rpc('createTenant', data)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await db.collection('tenants').get()).size, 1);
    for (const collection of ['licenses', 'settings', 'tenants']) assert.equal((await db.doc(collection + '/' + results[0].businessId).get()).exists, true);
    assert.equal((await db.doc('invites/' + data.ownerEmail).get()).data().role, 'dueño');
    await failure(rpc('createTenant', { ...data, businessName: 'Changed' }), 'invalid-administration');
  });
  it('failure before the transaction commit leaves no partial tenant; retry with the same operation recovers', async () => {
    const data = createInput(); let stop = true;
    const handler = administration({ beforeCommit: async () => { if (stop) throw new Error('injected-failure'); } });
    await assert.rejects(handler.createTenant(request(data)), /injected/);
    assert.equal((await db.collection('tenants').get()).size, 0);
    assert.equal((await db.doc('invites/' + data.ownerEmail).get()).exists, false);
    stop = false; const result = await handler.createTenant(request(data));
    assert.equal((await handler.createTenant(request(data))).businessId, result.businessId);
  });
  it('end-of-month renewal uses server time; concurrency extends once per distinct operation and duplicate retries once', async () => {
    assert.equal(new Date(addLicenseMonths(Date.parse('2028-01-31T23:15:00-05:00'), 1)).toISOString(), '2028-03-01T04:15:00.000Z');
    const expiry = Date.parse('2028-01-31T12:00:00-05:00');
    await db.doc('licenses/tenant-a').update({ expiry: Timestamp.fromMillis(expiry), status: 'inactiva' });
    const same = operation({ businessId: 'tenant-a', months: 1 });
    await Promise.all([rpc('extendTenantLicense', same), rpc('extendTenantLicense', same)]);
    assert.equal((await db.doc('licenses/tenant-a').get()).data().expiry.toDate().toISOString(), '2028-02-29T17:00:00.000Z');
    await Promise.all([rpc('extendTenantLicense', operation({ businessId: 'tenant-a', months: 1 })), rpc('extendTenantLicense', operation({ businessId: 'tenant-a', months: 1 }))]);
    assert.equal((await db.doc('licenses/tenant-a').get()).data().expiry.toDate().toISOString(), '2028-04-29T17:00:00.000Z');
  });
  it('suspension, expiration and forged old timestamps block new financial operations while receipts remain acknowledgeable', async () => {
    const applied = ticket(); await rpc('submitSale', applied, 'owner');
    await rpc('setTenantLicenseStatus', operation({ businessId: 'tenant-a', status: 'inactiva' }));
    assert.equal((await rpc('submitSale', applied, 'owner')).status, 'ALREADY_APPLIED');
    await failure(rpc('submitSale', { ...ticket(), licenseStatus: 'activa', expiry: '2099-01-01' }, 'owner'), 'tenant-restricted');
    await failure(rpc('addContractPayment', { contractId: 'fixture', operationId: uuid(), branchId: 'a-1', amount: 1, method: 'yape' }, 'owner'), 'tenant-restricted');
    await failure(rpc('openCashSession', { sessionId: uuid(), branchId: 'a-1', openingAmount: 0 }, 'owner'), 'tenant-restricted');
    await failure(rpc('closeCashSession', { sessionId: 'session-a', declaredAmount: 0 }, 'owner'), 'tenant-restricted');
    await rpc('setTenantLicenseStatus', operation({ businessId: 'tenant-a', status: 'activa' }));
    await db.doc('licenses/tenant-a').update({ expiry: Timestamp.fromMillis(clock - 1) });
    await failure(rpc('submitSale', ticket(), 'owner'), 'tenant-restricted');
    await rpc('extendTenantLicense', operation({ businessId: 'tenant-a', months: 1 }));
    assert.equal((await rpc('submitSale', ticket(), 'owner')).status, 'APPLIED');
  });
  it('restricted offline tickets remain durable, failed and explicitly marked for review', async () => {
    const rows = new Map(), identity = { uid: actors.owner.uid, businessId: 'tenant-a', role: 'dueño' };
    let online = false;
    const queue = createSaleQueue({ store: { get: async id => rows.get(id), list: async () => [...rows.values()], insert: async row => rows.set(row.localId, row), update: async (id, patch) => Object.assign(rows.get(id), patch) },
      encrypt: async value => value, decrypt: async value => value, online: () => online, syncSessions: async () => new Set(), withLock: work => work(),
      apply: async data => { try { return await rpc('submitSale', data, 'owner'); } catch (error) { throw new SaleError(error.details.saleCode, error.message); } } });
    const data = ticket(); await queue.submit(data, identity);
    await db.doc('licenses/tenant-a').update({ status: 'inactiva' }); online = true;
    await queue.flush(identity);
    assert.equal(rows.get(data.localId).status, 'failed'); assert.equal(rows.get(data.localId).requiresFinancialReview, true);
    assert.ok(rows.get(data.localId).data); assert.equal((await db.doc('sales/' + data.localId).get()).exists, false);
  });
  it('legacy tenant without new metadata uses its real license, but missing or mismatched licenses fail closed', async () => {
    assert.equal((await db.doc('tenants/tenant-a').get()).exists, false);
    assert.equal((await rpc('submitSale', ticket(), 'owner')).status, 'APPLIED');
    await db.doc('licenses/tenant-a').delete();
    await failure(rpc('submitSale', ticket(), 'owner'), 'tenant-restricted');
    await db.doc('licenses/tenant-a').set({ businessId: 'tenant-b', status: 'activa', expiry: Timestamp.fromMillis(clock + 86400000) });
    await failure(rpc('submitSale', ticket(), 'owner'), 'tenant-restricted');
  });
  it('React privileged flows import callables and contain no direct license/provisioning writes or browser purge', () => {
    for (const path of ['frontend/src/hooks/useSuperAdmin.js', 'frontend/src/hooks/useAdminBackup.js']) {
      const source = readFileSync(path, 'utf8');
      assert.doesNotMatch(source, /firebase\/firestore|setDoc\(|updateDoc\(|deleteDoc\(|getDocs\(|wipeTenantData|deleteQueryBatch|Math\.random/);
      assert.match(source, /adminCall/);
    }
  });
  it('administration uses bounded pages and scoped owner queries, and ordinary users cannot list the platform', async () => {
    await failure(rpc('getTenantAdministration', {}, 'owner'));
    const first = await rpc('getTenantAdministration', { limit: 1 }); assert.equal(first.rows.length, 1); assert.ok(first.cursor);
    const second = await rpc('getTenantAdministration', { limit: 1, cursor: first.cursor }); assert.notEqual(first.rows[0].id, second.rows[0].id);
    await failure(rpc('getTenantAdministration', { limit: 10000 }), 'invalid-administration');
  });
  it('only platform admins start backups or access job results; actual Firestore trigger completes a private backup', async () => {
    await failure(rpc('startTenantBackup', operation({ businessId: 'tenant-a' }), 'owner'));
    const started = await rpc('startTenantBackup', operation({ businessId: 'tenant-a' }));
    await failure(rpc('getPlatformJob', { jobId: started.jobId }, 'other'));
    await failure(rpc('getBackupDownload', { backupId: started.jobId }, 'owner'));
    const job = await waitRealJob(started.jobId); assert.equal(job.verified, true);
    const manifest = await rpc('getBackupDownload', { backupId: started.jobId });
    const manifestBytes = Buffer.from(manifest.base64, 'base64'); assert.equal(checksum(manifestBytes), manifest.sha256);
    assert.equal(JSON.parse(manifestBytes.toString()).businessId, 'tenant-a'); assert.equal(manifest.url, undefined);
    const part = await rpc('getBackupDownload', { backupId: started.jobId, index: 0 });
    const bytes = Buffer.from(part.base64, 'base64'); assert.equal(checksum(bytes), part.descriptor.sha256);
    assert.equal(dryRunPart(bytes, part.descriptor, { businessId: 'tenant-a', projectId }).documents, 1);
    await failure(rpc('getBackupDownload', { backupId: started.jobId }, 'owner'));
    assert.equal((await db.doc('tenants/tenant-a').get()).data().maintenanceJobId, null);
  });
});

async function fullFixture() {
  const batch = db.batch();
  for (let index = 0; index < 25; index++) batch.set(db.doc('customers/tenant-a-page-' + String(index).padStart(3, '0')), { businessId: 'tenant-a', name: 'Synthetic fixture' });
  for (const collection of SCOPED_COLLECTIONS.filter(name => !['users', 'licenses', 'tenants', 'settings', 'branches'].includes(name))) {
    for (const businessId of ['tenant-a', 'tenant-b']) {
      const id = collection === 'contract_migrations' ? businessId : businessId + '-fixture';
      batch.set(db.doc(`${collection}/${id}`), { businessId, branchId: businessId === 'tenant-a' ? 'a-1' : 'b-1', value: 17, occurredAt: new Timestamp(1500000000, 123456789) });
    }
  }
  batch.set(db.doc('customers/tenant-a-fixture/details/nested'), { businessId: 'tenant-a', timestamp: new Timestamp(1500000000, 999999999),
    bytes: Buffer.from([0, 255, 128]), geo: new GeoPoint(-12, -77), reference: db.doc('products/product-a'), big: 9007199254740993n, map: { items: [null, NaN, Infinity, true, 'test'] } });
  batch.set(db.doc('customers/tenant-a-fixture/details/missing-parent/deeper/child'), { businessId: 'tenant-a', empty: [], nested: { okay: true } });
  batch.set(db.doc('settings/tenant-a/preferences/missing-parent/deeper/child'), { businessId: 'tenant-a', restored: true });
  await batch.commit();
}
describe('Private backups, restore verification and recoverable tenant deletion', () => {
  it('backup contains every scoped collection, nested IDs, exact wire types and Storage; corruption is rejected', async () => {
    await fullFixture(); const started = await administration().startTenantBackup(request(operation({ businessId: 'tenant-a' })));
    const job = await drain(started.jobId); assert.ok(job.verifiedAt); assert.equal(job.storageCount, 1);
    for (const collection of SCOPED_COLLECTIONS.filter(name => name !== 'tenants')) assert.ok(job.counts[collection] > 0, collection);
    const worker = workers(), records = []; let asset = false;
    for (let index = 0; index < job.partCount; index++) {
      const { descriptor } = await worker.readPart(job, index);
      const [bytes] = await bucket.file(`platform-backups/tenant-a/${job.id}/${descriptor.object}`).download();
      if (descriptor.kind === 'documents') records.push(...JSON.parse(bytes.toString())); else asset = true;
      assert.throws(() => dryRunPart(Buffer.from('corrupt'), descriptor, { businessId: 'tenant-a', projectId }), /checksum/);
    }
    assert.equal(asset, true); assert.equal(records.some(record => record.path.includes('tenant-b')), false);
    const nested = records.find(record => record.path.endsWith('/details/nested')); assert.ok(nested);
    const stored = (await db.doc('customers/tenant-a-fixture/details/nested').get()).data();
    assert.equal(nested.document.fields.timestamp.timestampValue.nanos, stored.timestamp.nanoseconds);
    assert.equal(nested.document.fields.big.integerValue, '9007199254740993');
    assert.deepEqual(nested.document.fields.bytes.bytesValue, { $bytes: 'AP+A' });
    assert.match(nested.document.fields.reference.referenceValue, /products\/product-a$/);
    assert.ok(records.some(record => record.path.endsWith('/missing-parent/deeper/child')));
    const [manifestBytes] = await bucket.file(`platform-backups/tenant-a/${job.id}/manifest.json`).download();
    assert.equal(checksum(manifestBytes), job.manifestHash);
    assert.equal(JSON.parse(manifestBytes.toString()).schemaVersion, 1);
  });
  it('restore dry-run verifies every artifact with zero business, Auth or Storage writes', async () => {
    await fullFixture(); const started = await administration().startTenantBackup(request(operation({ businessId: 'tenant-a' })));
    const backup = await drain(started.jobId), before = await db.doc('customers/tenant-a-fixture/details/nested').get();
    const [filesBefore] = await bucket.getFiles({ prefix: 'contracts/' });
    const worker = workers(), dry = await worker.startRestoreDryRun(request({ backupId: backup.id }));
    const result = await drain(dry.jobId, worker);
    assert.equal(result.dryRun, true); assert.equal(result.writes, 0);
    assert.equal((await db.doc(before.ref.path).get()).updateTime.isEqual(before.updateTime), true);
    assert.equal((await bucket.getFiles({ prefix: 'contracts/' }))[0].length, filesBefore.length);
    assert.equal((await auth.getUser(actors.owner.uid)).uid, actors.owner.uid);
    let reads = 0;
    const standalone = await restoreTenantDryRun({ businessId: 'tenant-a', backupId: backup.id, projectId,
      expectedManifestHash: backup.manifestHash, readObject: async path => { reads++; return (await bucket.file(path).download())[0]; } });
    assert.equal(standalone.restorable, true); assert.equal(standalone.writes, 0); assert.ok(reads > backup.partCount);
    assert.throws(() => restoreOptions(['--apply']), /dry-run/);
    assert.throws(() => restoreOptions(['--project=demo-migapos', '--business=tenant-a', '--backup=test']), /confirmación/);
  });
  it('interrupted backup unit retries without duplicate parts, and expired process leases resume after restart', async () => {
    let failOnce = true;
    const start = await administration().startTenantBackup(request(operation({ businessId: 'tenant-a' })));
    const broken = workers({ beforeCheckpoint: async () => { if (failOnce) { failOnce = false; throw new Error('injected-interruption'); } } });
    await broken.runUnit(start.jobId); assert.equal((await jobDoc(start.jobId).get()).data().status, 'failed');
    await workers().retryPlatformJob(request({ jobId: start.jobId }));
    await jobDoc(start.jobId).update({ status: 'running', leaseToken: uuid(), leaseUntil: Timestamp.fromMillis(clock + 1000) });
    assert.equal(await workers().runUnit(start.jobId), false); clock += 1001;
    const result = await drain(start.jobId); assert.ok(result.verifiedAt);
    const [indexes] = await bucket.getFiles({ prefix: `platform-backups/tenant-a/${result.id}/index/` });
    assert.equal(indexes.length, result.partCount);
  });
  it('deletion request blocks operations, requires exact confirmation, retains a recovery period and can be canceled', async () => {
    const handler = administration();
    await failure(handler.requestTenantDeletion(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-b' }))), 'invalid-administration');
    const requestData = operation({ businessId: 'tenant-a', confirmation: 'tenant-a' });
    const deletion = await handler.requestTenantDeletion(request(requestData));
    assert.deepEqual(await handler.requestTenantDeletion(request(requestData)), deletion);
    await failure(rpc('submitSale', ticket(), 'owner'), 'tenant-restricted');
    await failure(handler.startTenantPurge(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' }))), 'invalid-administration');
    await drain(deletion.backupId);
    await failure(handler.startTenantPurge(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' }))), 'invalid-administration');
    await handler.cancelTenantDeletion(request(operation({ businessId: 'tenant-a' })));
    assert.equal((await rpc('submitSale', ticket(), 'owner')).status, 'APPLIED');
  });
  it('unprivileged deletion, cancellation and purge are rejected even with a forged actor/business payload', async () => {
    for (const name of ['requestTenantDeletion', 'cancelTenantDeletion', 'startTenantPurge']) await failure(rpc(name, operation({ businessId: 'tenant-a', ...(name !== 'cancelTenantDeletion' ? { confirmation: 'tenant-a' } : {}) }), 'owner'));
  });
  it('cancelling a pending deletion invalidates its backup lease; a cancelled worker cannot certify or keep the tenant blocked', async () => {
    const handler = administration(), deletion = await handler.requestTenantDeletion(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' })));
    await jobDoc(deletion.backupId).update({ status: 'running', leaseToken: 'old-worker', leaseUntil: Timestamp.fromMillis(clock + 60000) });
    await handler.cancelTenantDeletion(request(operation({ businessId: 'tenant-a' })));
    assert.equal((await jobDoc(deletion.backupId).get()).data().status, 'cancelled');
    assert.equal(await workers().runUnit(deletion.backupId), false);
    assert.equal((await rpc('submitSale', ticket(), 'owner')).status, 'APPLIED');
  });
  it('purge re-verifies backup before deleting; tampered artifact blocks irreversible work', async () => {
    const handler = administration(), deletion = await handler.requestTenantDeletion(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' })));
    const backup = await drain(deletion.backupId); clock += 3600001;
    const [firstIndex] = await bucket.file(`platform-backups/tenant-a/${backup.id}/index/000000000.json`).download();
    const descriptor = JSON.parse(firstIndex.toString());
    await bucket.file(`platform-backups/tenant-a/${backup.id}/${descriptor.object}`).save(Buffer.from('corrupt'));
    const purge = await handler.startTenantPurge(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' })));
    await workers().runUnit(purge.jobId);
    assert.equal((await jobDoc(purge.jobId).get()).data().status, 'failed');
    assert.equal((await db.doc('products/product-a').get()).exists, true);
    assert.equal((await auth.getUser(actors.owner.uid)).uid, actors.owner.uid);
  });
  it('paged purge retries after partial deletion; all new collections/subtrees disappear and neighbors/platform Auth survive', async () => {
    await fullFixture();
    // Even an old platform profile incorrectly assigned to the target tenant must survive.
    await db.doc('users/' + actors.admin.uid).update({ businessId: 'tenant-a' });
    const handler = administration(), deletion = await handler.requestTenantDeletion(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' })));
    await drain(deletion.backupId); clock += 3600001;
    const started = await handler.startTenantPurge(request(operation({ businessId: 'tenant-a', confirmation: 'tenant-a' })));
    let interrupted = false;
    const worker = workers({ beforeCheckpoint: async job => { if (job.phase === 'purge-documents' && job.collectionIndex > 2 && !interrupted) { interrupted = true; throw new Error('injected-purge-interruption'); } } });
    for (let step = 0; step < 100 && !interrupted; step++) await worker.runUnit(started.jobId);
    assert.equal(interrupted, true); await workers().retryPlatformJob(request({ jobId: started.jobId }));
    await drain(started.jobId);
    for (const collection of SCOPED_COLLECTIONS.filter(name => !['tenants', 'users'].includes(name))) {
      assert.equal((await db.collection(collection).where('businessId', '==', 'tenant-a').get()).empty, true, collection);
      if (['settings', 'licenses', 'contract_migrations'].includes(collection)) assert.equal((await db.doc(collection + '/tenant-a').get()).exists, false);
    }
    assert.equal((await db.doc('customers/tenant-a-fixture/details/nested').get()).exists, false);
    assert.equal((await db.doc('customers/tenant-a-fixture/details/missing-parent/deeper/child').get()).exists, false);
    assert.equal((await db.doc('settings/tenant-a/preferences/missing-parent/deeper/child').get()).exists, false);
    assert.equal((await db.doc('tenants/tenant-a').get()).data().status, 'deleted');
    assert.equal((await db.doc('licenses/tenant-b').get()).exists, true);
    assert.equal((await db.doc('customers/tenant-b-fixture').get()).exists, true);
    assert.equal((await auth.getUser(actors.admin.uid)).uid, actors.admin.uid);
    assert.equal((await auth.getUser(actors.other.uid)).uid, actors.other.uid);
    await assert.rejects(auth.getUser(actors.owner.uid), { code: 'auth/user-not-found' });
    assert.equal((await bucket.getFiles({ prefix: 'contracts/tenant-a/' }))[0].length, 0);
    assert.equal((await bucket.getFiles({ prefix: 'contracts/tenant-b/' }))[0].length, 1);
    assert.equal((await db.doc('platform_audit/' + started.jobId).get()).data().result, 'completed');
    assert.equal(await workers().runUnit(started.jobId), false);
  });
});
