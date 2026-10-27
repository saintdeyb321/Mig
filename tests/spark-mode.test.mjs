import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { runtimeCapabilities } from '../frontend/src/config/runtimeCapabilities.js';
import { getSessionContext, getSessionModules, getSessionTab } from '../frontend/src/core/session/context.js';
import { callBackend } from '../frontend/src/core/firebase/callable.js';
import { readStorageBlob, uploadStorageBlob, deleteStorageObject, requireLocalImageSources } from '../frontend/src/core/firebase/storage.js';
import { validateWebEnvironment, environments } from '../frontend/src/config/environments.js';
import { brand } from '../frontend/src/config/brand.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';

it('retains historical product names and totals without inventing absent cost or profit', () => {
  const stats = salesToDailyStats([{ businessId: 'tenant', branchId: 'branch', createdAt: '2026-10-23T12:00:00.000Z',
    total: 3, payment: 'efectivo', items: [{ name: 'Pan', qty: 1, price: 1 }, { name: 'Torta', qty: 1, price: 2 }] }]);
  const report = aggregateReport({ stats });
  assert.equal(report.summary.posRevenue, 3);
  assert.deepEqual(report.topProducts.map(row => row.name).sort(), ['Pan', 'Torta']);
  assert.equal(stats[0].totalCost, undefined);
  assert.equal(stats[0].grossProfit, undefined);
});

it('fixes Spark capabilities independently of account, environment or browser flags', () => {
  assert.equal(runtimeCapabilities.mode, 'spark');
  assert.equal(runtimeCapabilities.repositoryStrategy, 'spark');
  for (const name of ['cloudFunctions', 'cloudStorage', 'cashReconciliation', 'offlineSync', 'platformJobs']) assert.equal(runtimeCapabilities[name], false, name);
  for (const name of ['authentication', 'firestore', 'hosting', 'localPersistence', 'localExports', 'tenantAdministration', 'tenantProvisioning', 'licenseAdministration', 'cashOpening', 'saleOnline', 'saleVoid', 'contractPayments', 'cashClosing']) assert.equal(runtimeCapabilities[name], true, name);
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


it('preserves larger drafts but refuses checkout above the verified eight-line bound before any transaction', async () => {
  const { canonicalSale } = await import('../functions/src/sales/domain/saleModel.js');
  const { checkoutBlockReason } = await import('../frontend/src/features/sales/domain/checkoutPolicy.js');
  const { createSparkSalesRepository } = await import('../frontend/src/features/sales/infrastructure/sparkSalesRepository.js');
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `Product ${i}`, category: '', qty: 1, price: 1.25, cost: 0.25 }));
  const sale = canonicalSale({ localId: 'multi-product-draft', userId: 'cashier', businessId: 'tenant', branchId: 'branch', sessionId: 'session', items, total: 25, payment: 'mixto', splitPayments: { efectivo: 10, yape: 15 }, amountPaid: 25, change: 0, createdAt: new Date() });
  assert.equal(sale.items.length, 20); assert.equal(sale.total, 25); assert.equal(sale.totalCost, 5);
  assert.match(checkoutBlockReason(sale.items), /sin cobrar/); assert.equal(checkoutBlockReason(items.slice(0, 8)), null);
  let writes = 0;
  const repository = createSparkSalesRepository({}, { currentUser: () => ({ uid: 'cashier' }), sdk: { runTransaction: () => { writes++; } } });
  await assert.rejects(repository.submit(sale), /no se divide el ticket/i); assert.equal(writes, 0);
});

it('Plan04 removes Agenda VIP navigation and contract lookups while retaining historical customer administration', () => {
  for (const role of ['dueño', 'cajero', 'superadmin']) {
    const user = { uid: 'person', role, businessId: 'tenant' };
    assert.equal(getSessionModules(user).includes('agenda'), false);
    assert.notEqual(getSessionTab(user, 'agenda'), 'agenda');
  }
  const form = readFileSync('frontend/src/modules/contracts/components/ContractFormModal.jsx', 'utf8');
  assert.doesNotMatch(form, /useCustomers|showAgendaModal|Buscar en agenda/);
  for (const field of ['clientName', 'clientPhone', 'deliveryAddress']) assert.ok(form.includes('name="' + field + '"'));
  for (const path of ['frontend/src/features/backups/infrastructure/backupRepository.js', 'frontend/src/features/backups/domain/cleanupPlan.js']) {
    assert.match(readFileSync(path, 'utf8'), /'customers'/);
  }
});
