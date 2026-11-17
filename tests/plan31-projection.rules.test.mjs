import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { after, before, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocFromServer, getDocsFromServer, setDoc } from 'firebase/firestore';
import { createProjectionStore } from '../functions/src/reports/projectionStore.js';
import { createConsolidation } from '../functions/src/reports/consolidation.js';
import { createReportBackfill } from '../functions/src/reports/backfill.js';
import { collections, financial, keyOf } from '../functions/src/reports/summaryModel.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-migapos' }, 'p31-projection-test');
const admin = getFirestore(app);
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-migapos',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
});
after(async () => { await env?.cleanup(); await deleteApp(app); });

const tenant = 'p31-shop', branch = 'p31-center', second = 'p31-workshop', month = '2025-10';
const baseSale = (businessId, branchId, amount = 1.05) => ({
  businessId, branchId, confirmedAt: new Date('2025-10-05T12:00:00-05:00'), status: 'confirmed',
  total: amount, payment: 'efectivo', items: [{ id: 'pan', name: 'Pan', price: amount, qty: 1 }],
});
const point = (uid, name, id) => doc(env.authenticatedContext(uid).firestore(), name, id);
const scope = (businessId = tenant) => ({ businessId, periodKey: month, maxDocuments: 5000 });

it('P31 Rules protects direct summary and product IDs, and measures 100 authoritative writer transactions', async t => {
  const batch = admin.batch();
  const set = (name, id, data) => batch.set(admin.collection(name).doc(id), data);
  set('licenses', tenant, { businessId: tenant, status: 'activa', expiry: new Date('2099-01-01') });
  set('tenants', tenant, { businessId: tenant, status: 'active' });
  set('branches', branch, { businessId: tenant, status: 'activo' });
  set('branches', second, { businessId: tenant, status: 'activo' });
  for (const [uid, role, businessId, branchId, status] of [
    ['owner', 'dueño', tenant, null, 'activo'], ['other-owner', 'dueño', 'unrelated', null, 'activo'],
    ['cashier', 'cajero', tenant, branch, 'activo'], ['second-cashier', 'cajero', tenant, second, 'activo'],
    ['inactive', 'dueño', tenant, null, 'inactivo'], ['unlicensed', 'dueño', 'missing-license', null, 'activo'],
  ]) set('users', uid, { role, businessId, branchId, status });
  for (let i = 0; i < 100; i++) set('sales', 'p31-volume-' + i, baseSale(tenant, i % 2 ? branch : second));
  await batch.commit();
  const writer = createProjectionStore(admin);
  const started = Date.now();
  const pair = await Promise.all([writer.sync('sales', 'p31-volume-0'), writer.sync('sales', 'p31-volume-0')]);
  assert.equal(pair.reduce((sum, row) => sum + row.writes, 0), 3);
  let writes = 3, writerPointReads = pair.reduce((sum, row) => sum + row.pointReads, 0);
  let writerAttempts = pair.reduce((sum, row) => sum + row.attempts, 0);
  for (let i = 1; i < 100; i++) {
    const applied = await writer.sync('sales', 'p31-volume-' + i);
    writes += applied.writes;
    writerPointReads += applied.pointReads;
    writerAttempts += applied.attempts;
  }
  assert.equal(writes, 300);
  assert.ok(writerPointReads >= 402);
  const publishers = createConsolidation(admin);
  const published = await publishers.consolidate(scope(), { manual: true });
  assert.equal(published.status, 'verified');
  assert.equal((await publishers.consolidate(scope(), { manual: true })).writes, 0);
  const global = keyOf(tenant, 'global', month), local = keyOf(tenant, branch, month), localB = keyOf(tenant, second, month);
  const owner = await assertSucceeds(getDocFromServer(point('owner', collections.months, global)));
  assert.equal(financial(owner.data().values).net, 10500);
  const own = await assertSucceeds(getDocFromServer(point('cashier', collections.months, local)));
  assert.equal(financial(own.data().values).net, 5250);
  await assertSucceeds(getDocFromServer(point('second-cashier', collections.months, localB)));
  await assertSucceeds(getDocFromServer(point('cashier', collections.products, local + ':0')));
  for (const uid of ['cashier', 'second-cashier', 'inactive', 'other-owner']) await assertFails(getDocFromServer(point(uid, collections.months, global)));
  await assertFails(getDocFromServer(point('cashier', collections.months, localB)));
  await assertFails(getDocFromServer(point('cashier', collections.products, global + ':0')));
  await assertFails(getDocsFromServer(collection(env.authenticatedContext('owner').firestore(), collections.months)));
  for (const name of Object.values(collections)) await assertFails(setDoc(point('owner', name, 'forged'), { businessId: tenant }));
  await assertFails(getDocFromServer(point('owner', collections.state, keyOf(tenant, month))));
  await assertFails(getDocFromServer(point('owner', collections.days, keyOf(tenant, branch, '2025-10-05'))));
  await admin.collection(collections.state).doc('missing-license:' + month)
    .set({ status: 'verified', revision: 'rev', businessId: 'missing-license', periodKey: month, validUntil: Date.now() + 60000 });
  await admin.collection(collections.months).doc('missing-license:global:' + month).set({
    ...owner.data(), businessId: 'missing-license', revision: 'rev', stateId: 'missing-license:' + month,
  });
  await assertFails(getDocFromServer(point('unlicensed', collections.months, 'missing-license:global:' + month)));

  // A delayed trigger reads the newest authoritative document, and removes the prior contribution.
  await admin.collection('sales').doc('p31-volume-0').set(baseSale(tenant, second, 2.05));
  const corrected = await writer.sync('sales', 'p31-volume-0');
  assert.equal(corrected.writes, 3);
  assert.equal((await writer.sync('sales', 'p31-volume-0')).writes, 0);
  await assertFails(getDocFromServer(point('owner', collections.months, global)));
  const race = await Promise.allSettled([publishers.consolidate(scope()), publishers.consolidate(scope())]);
  assert.equal(race.filter(row => row.status === 'fulfilled' && row.value.writes > 0).length, 1);
  assert.equal(financial((await getDocFromServer(point('owner', collections.months, global))).data().values).net, 10600);

  // A missed trigger must be detected from a fresh authoritative scan before republishing.
  await admin.collection('sales').doc('p31-omitted').set(baseSale(tenant, second));
  await assert.rejects(publishers.consolidate(scope()), { code: 'report-checkpoint-drift' });
  await assertFails(getDocFromServer(point('owner', collections.months, global)));
  t.diagnostic('P31_WRITER ' + JSON.stringify({ sales: 100, contributionWrites: writes, publicationWrites: published.writes,
    writerPointReads, writerAttempts,
    sourceOperations: published.budget.operations, sourceDocuments: published.budget.documents, sourcePointReads: published.budget.pointReads,
    elapsedMs: Date.now() - started }));
});

it('P31 publishes the closed annual product catalog from every monthly page and fences a stale revision', async () => {
  const businessId = 'p31-year', branchId = 'year-site', year = '2024';
  await admin.collection('branches').doc(branchId).set({ businessId, status: 'activo' });
  const writer = createProjectionStore(admin), publisher = createConsolidation(admin);
  for (let i = 1; i <= 12; i++) {
    const periodKey = year + '-' + String(i).padStart(2, '0'), id = 'annual-' + i;
    const items = [...Array.from({ length: 5 }, (_, place) => ({ id: `${i}-${place}`, name: `${i}-${place}`, price: 1, qty: 6 })),
      { id: 'common', name: 'Pan común', price: 1, qty: 5 }];
    await admin.collection('sales').doc(id).set({ ...baseSale(businessId, branchId, 35), confirmedAt: new Date(periodKey + '-05T12:00:00-05:00'), items });
    await writer.sync('sales', id);
    await publisher.consolidate({ businessId, periodKey, maxDocuments: 500 }, { manual: true });
    const monthDoc = (await admin.collection(collections.months).doc(keyOf(businessId, 'global', periodKey)).get()).data();
    assert.ok(monthDoc.top.every(product => product.name !== 'Pan común'));
  }
  assert.equal((await publisher.publishYearProducts({ businessId, year })).writes, 3);
  const manifest = await admin.collection(collections.products).doc(keyOf(businessId, 'global', 'year-' + year, 0)).get();
  assert.equal(manifest.data().productCount, 61);
  assert.deepEqual(manifest.data().top[0], { name: 'Pan común', qty: 60, cents: 6000 });
  assert.equal((await publisher.publishYearProducts({ businessId, year })).writes, 0);
  await admin.collection('sales').doc('annual-late').set({ ...baseSale(businessId, branchId), confirmedAt: new Date('2024-07-05T12:00:00-05:00') });
  await writer.sync('sales', 'annual-late');
  await assert.rejects(publisher.publishYearProducts({ businessId, year }), { code: 'report-summary-pending' });
});

it('P31 backfill pauses and resumes idempotently with an explicit dry-run and source budget', async () => {
  const businessId = 'p31-replay';
  await admin.collection('branches').doc('replay-site').set({ businessId, status: 'activo' });
  for (const id of ['resume-a', 'resume-b']) await admin.collection('sales').doc(id).set(baseSale(businessId, 'replay-site'));
  const backfill = createReportBackfill(admin);
  const plan = scope(businessId);
  assert.equal((await backfill.resume(plan)).writes, 0);
  await assert.rejects(backfill.resume({ ...plan, maxDocuments: 1 }), { code: 'report-budget' });
  const first = await backfill.resume(plan, { dryRun: false, limit: 1, maxWrites: 1500 });
  assert.deepEqual([first.status, first.processed], ['paused', 1]);
  const second = await backfill.resume(plan, { dryRun: false, limit: 1, maxWrites: 1500 });
  assert.deepEqual([second.status, second.processed], ['verified', 1]);
  const monthDoc = admin.collection(collections.months).doc(keyOf(businessId, 'global', month));
  const published = (await monthDoc.get()).data();
  assert.equal(financial(published.values).net, 210);
  const repeated = await backfill.resume(plan, { dryRun: false, limit: 2, maxWrites: 1500 });
  assert.equal(repeated.status, 'verified');
  assert.equal((await monthDoc.get()).data().revision, published.revision);
  await backfill.resume(plan, { dryRun: false, limit: 2, maxWrites: 1500, manual: false });
  assert.equal((await monthDoc.get()).data().mode, 'automatic');
});
