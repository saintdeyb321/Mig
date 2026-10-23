import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { runtimeCapabilities } from '../frontend/src/config/runtimeCapabilities.js';
import { getSessionContext, getSessionModules, getSessionTab } from '../frontend/src/core/session/context.js';
import { callBackend } from '../frontend/src/core/firebase/callable.js';
import { readStorageBlob, uploadStorageBlob, deleteStorageObject, requireLocalImageSources } from '../frontend/src/core/firebase/storage.js';
import { validateWebEnvironment, environments } from '../frontend/src/config/environments.js';
import { brand } from '../frontend/src/config/brand.js';

it('fixes Spark capabilities independently of account, environment or browser flags', () => {
  assert.equal(runtimeCapabilities.mode, 'spark');
  assert.equal(runtimeCapabilities.repositoryStrategy, 'spark');
  for (const name of ['cloudFunctions', 'cloudStorage', 'tenantAdministration', 'financialOperations', 'offlineSync', 'platformJobs']) assert.equal(runtimeCapabilities[name], false, name);
  for (const name of ['authentication', 'firestore', 'hosting', 'localPersistence', 'localExports']) assert.equal(runtimeCapabilities[name], true, name);
  assert.throws(() => { runtimeCapabilities.cloudFunctions = true; }, TypeError);
});

it('keeps platform profiles outside business modules even with stale navigation or a tenant ID', () => {
  const platform = { uid: 'admin', role: 'superadmin', businessId: 'platform-admin' };
  for (const businessId of ['platform-admin', 'existing-tenant', undefined]) {
    const user = { ...platform, businessId };
    assert.equal(getSessionContext(user), 'platform-admin');
    assert.deepEqual(getSessionModules(user), ['superadmin']);
    for (const tab of ['pos', 'contracts', 'history', 'agenda', 'products', 'categories', 'reports', 'users', 'settings']) assert.equal(getSessionTab(user, tab), 'superadmin');
  }
  assert.deepEqual(getSessionModules({ ...platform, role: 'dueño' }), []);
  for (const role of ['constructor', '__proto__', 'admin']) assert.deepEqual(getSessionModules({ uid: 'invalid-profile', role, businessId: 'tenant' }), []);
  assert.equal(getSessionTab({ uid: 'owner', role: 'dueño', businessId: 'tenant' }, 'superadmin'), 'pos');
  assert.equal(getSessionTab({ uid: 'cashier', role: 'cajero', businessId: 'tenant' }, 'products'), 'pos');
  assert.equal(getSessionContext(null), 'anonymous');
});

it('rejects every unmigrated callable explicitly without a Firebase client or network', async () => {
  const operations = ['createTenant', 'getTenantAdministration', 'extendTenantLicense', 'setTenantLicenseStatus',
    'requestTenantDeletion', 'cancelTenantDeletion', 'startTenantPurge', 'getPlatformJob', 'startTenantBackup',
    'retryPlatformJob', 'cancelPlatformBackup', 'startRestoreDryRun', 'getBackupDownload', 'reserveOfflineCashSession',
    'openCashSession', 'previewCashSessionClose', 'closeCashSession', 'forceCloseCashSession', 'reconcileCashSession',
    'submitSale', 'voidSale', 'createContract', 'updateContract', 'addContractPayment', 'cancelContract',
    'markContractDelivered', 'getLegacyContractPayments', 'unknownFutureOperation'];
  for (const operation of operations) await assert.rejects(callBackend(operation, { operationId: 'local-test' }), error =>
    error.code === 'capability-unavailable' && error.operation === operation && /no disponible en modo Spark/.test(error.message));
});

it('blocks Storage operations and remote references while preserving local image sources', async () => {
  for (const operation of [readStorageBlob, uploadStorageBlob, deleteStorageObject]) await assert.rejects(operation('contracts/tenant/order/image.jpg'), { code: 'capability-unavailable' });
  const legacy = [{ storagePath: 'contracts/tenant/order/image.jpg' }];
  assert.throws(() => requireLocalImageSources(legacy), { code: 'capability-unavailable' });
  assert.deepEqual(legacy, [{ storagePath: 'contracts/tenant/order/image.jpg' }]);
  assert.throws(() => requireLocalImageSources(['https://firebasestorage.googleapis.com/v0/b/migapos/o/image']), { code: 'capability-unavailable' });
  assert.doesNotThrow(() => requireLocalImageSources(['data:image/png;base64,iVBORw0KGgo=', 'blob:http://localhost/local']));
});

it('retains migapos/Hosting configuration and no longer requires a Storage bucket', () => {
  const env = { VITE_FIREBASE_API_KEY: 'local-fixture', VITE_FIREBASE_PROJECT_ID: 'migapos', VITE_FIREBASE_AUTH_DOMAIN: 'migapos.firebaseapp.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: '1:123:web:fixture' };
  assert.equal(validateWebEnvironment(env).projectId, 'migapos');
  assert.equal(environments.production.hostingSite, 'migapos-peru');
  assert.equal(validateWebEnvironment({ ...env, VITE_FIREBASE_STORAGE_BUCKET: 'migapos.firebasestorage.app' }).projectId, 'migapos');
  assert.throws(() => validateWebEnvironment({ ...env, VITE_FIREBASE_STORAGE_BUCKET: 'other.appspot.com' }));
});

it('keeps Firebase Functions/Storage SDKs outside every frontend entry point', () => {
  const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
  for (const path of walk('frontend/src').filter(path => /\.[jt]sx?$/.test(path))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /['"]firebase\/(functions|storage)['"]|\bhttpsCallable\s*\(/, path);
  }
});

it('serves valid local branding/PWA PNGs and retains persistent caches without a data reset', () => {
  for (const [path, size] of [[brand.logo, null], [brand.icon192, 192], [brand.icon512, 512]]) {
    const png = readFileSync(`frontend/public${path}`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    if (size) { assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size); }
  }
  const client = readFileSync('frontend/src/core/firebase/client.js', 'utf8');
  assert.match(client, /persistentLocalCache/);
  const sw = readFileSync('frontend/src/components/ReloadPrompt.jsx', 'utf8');
  assert.match(sw, /updateServiceWorker\(true\)/);
  assert.doesNotMatch(sw + client, /deleteDatabase|clearIndexedDbPersistence|indexedDB\.delete|offlineDB\.delete/);
});
