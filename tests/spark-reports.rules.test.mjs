import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { before, after, it } from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createSparkAdministrationRepository } from '../frontend/src/features/licenses/infrastructure/sparkAdministrationRepository.js';
import { createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { createSparkContractsRepository } from '../frontend/src/features/contracts/infrastructure/sparkContractsRepository.js';
import { createSparkSummaryReader } from '../frontend/src/features/reports/infrastructure/sparkSummaryReader.js';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { canonicalNewSale } from '../frontend/src/features/sales/domain/saleModel.js';
import { buildSummaryView } from '../frontend/src/features/reports/application/summaryView.js';
import { buildSummaryWorkbook, managementSummaryReportHtml } from '../frontend/src/features/reports/application/summaryDocuments.js';
import { writeSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { assertWorkbookBorders, readOverview } from './helpers/reportWorkbook.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
sdk.setLogLevel('silent');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-migapos',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
after(async () => env?.cleanup());
const user = uid => ({ uid, email: uid + '@gmail.com' });
const dbFor = uid => env.authenticatedContext(uid, { email: uid + '@gmail.com', email_verified: true }).firestore();
const seedProfiles = async data => env.withSecurityRulesDisabled(async context => {
  for (const [path, value] of Object.entries(data)) await sdk.setDoc(sdk.doc(context.firestore(), path), value);
});
const metrics = { attempts: 0, reads: {}, writes: {} };
const measured = { ...sdk, runTransaction: (db, work) => sdk.runTransaction(db, async tx => {
  metrics.attempts++;
  return work({ get: ref => { metrics.reads[ref.path.split('/')[0]] = (metrics.reads[ref.path.split('/')[0]] ?? 0) + 1; return tx.get(ref); },
    set: (ref, data) => { metrics.writes[ref.path.split('/')[0]] = (metrics.writes[ref.path.split('/')[0]] ?? 0) + 1; return tx.set(ref, data); },
    update: (ref, data) => { metrics.writes[ref.path.split('/')[0]] = (metrics.writes[ref.path.split('/')[0]] ?? 0) + 1; return tx.update(ref, data); },
    delete: ref => tx.delete(ref) });
}) };

it('Spark creates real aggregates in the financial commit and reads them without original document queries', { timeout: 120000 }, async t => {
  let stage = 'provision';
  t.after(() => t.diagnostic('Last completed protocol stage: ' + stage));
  await env.clearFirestore();
  await seedProfiles({ 'users/admin': { role: 'superadmin', email: 'admin@gmail.com', businessId: 'platform-admin', status: 'activo' } });
  const created = await createSparkAdministrationRepository(dbFor('admin'), { currentUser: () => user('admin'), sdk }).createTenant({
    operationId: 'report_spark_real_123456789', businessName: 'Panadería Real', ownerEmail: 'owner@gmail.com',
    firstName: 'Dueña', lastName: 'Ensayo', months: 1 });
  const { businessId, branchId } = created, db = dbFor('owner');
  await seedProfiles({ 'users/owner': { role: 'dueño', businessId, status: 'activo' } });
  const cash = createSparkCashRepository(db, { currentUser: () => user('owner'), sdk: measured });
  stage = 'opening cash';
  await cash.open({ sessionId: 'report_cash_real_123456789', businessId, branchId, openingAmount: 100 });
  const sales = createSparkSalesRepository(db, { currentUser: () => user('owner'), sdk: measured });
  const products = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, name: 'Pan ' + i, category: '', price: i + 1.05, cost: 0,
    businessId, status: 'activo', stock: { [branchId]: 20 } }));
  // Catalog entries are ordinary, authorized owner writes, not report snapshots.
  for (const product of products) await sdk.setDoc(sdk.doc(db, 'products', product.id), product);
  const total = products.reduce((sum, row) => sum + Math.round(row.price * 100), 0) / 100;
  const input = canonicalNewSale({ localId: 'report_real_sale_123456789', businessId, branchId, userId: 'owner', sessionId: 'report_cash_real_123456789',
    items: products.map(product => ({ id: product.id, name: product.name, category: '', qty: 1, price: product.price, cost: 0 })),
    total, payment: 'mixto', splitPayments: { efectivo: 10.05, yape: Math.round((total - 10.05) * 100) / 100 }, amountPaid: total,
    change: 0, createdAt: new Date().toISOString() });
  stage = 'eight-line sale';
  await sales.submit(input);
  const period = reportPeriod('mes');
  const read = createSparkSummaryReader(db, { sdk: measured, currentUid: () => 'owner' });
  const get = async filter => { const resources = createSessionResources(); try {
    return await read({ resources, uid: 'owner', identityKey: 'owner-real', businessId, branchId: 'global', period: reportPeriod(filter) });
  } finally { resources.close(); } };
  stage = 'monthly summary read';
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, total);
  await sales.submit(input);
  const voids = createPosVoidRepository(db, { currentUser: () => user('owner'), sdk: measured });
  await voids.void({ saleId: input.saleId, reason: 'Prueba de anulación real', businessId, branchId });
  await voids.void({ saleId: input.saleId, reason: 'Prueba de anulación real', businessId, branchId });
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 0);
  const contracts = createSparkContractsRepository(db, { currentUser: () => user('owner'), sdk: measured });
  const orderId = 'aaaaaaa1-1111-4111-8111-000000000001';
  await contracts.create({ contractId: orderId, operationId: orderId, branchId, clientName: 'Cliente de ensayo', clientPhone: '987654321',
    details: 'Torta', deliveryType: 'recojo_local', deliveryDate: null, subtotal: 100, total: 100, deliveryCost: 0, referenceImages: [],
    initialPayment: { operationId: 'aaaaaaa2-1111-4111-8111-000000000001', amount: 20.05, method: 'efectivo' } });
  await contracts.addPayment({ contractId: orderId, branchId, operationId: 'aaaaaaa3-1111-4111-8111-000000000001', amount: 30.10, method: 'yape' });
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 50.15);
  await contracts.cancel({ contractId: orderId, branchId, operationId: 'aaaaaaa4-1111-4111-8111-000000000001', reason: 'Cancelación comprobada' });
  const snapshot = await get('mes'), view = buildSummaryView(snapshot, period);
  assert.equal(view.summary.netRevenue, 0);
  assert.equal(view.summary.cashRevenue, 0);
  assert.equal(view.summary.digitalRevenue, 0);
  const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
  mkdirSync('.release/qa-spark-incremental', { recursive: true });
  for (const filter of ['mes', 'todo']) {
    const data = await get(filter), p = reportPeriod(filter), model = buildSummaryView(data, p);
    const bytes = writeSalesWorkbook(XLSX, buildSummaryWorkbook(XLSX, model, { period: p, business: 'Panadería Real', branchesMap: { [branchId]: 'Centro' } }));
    const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
    assertWorkbookBorders(XLSX, workbook, bytes);
    assert.equal(readOverview(XLSX, workbook)['Total neto registrado (S/)'], 0);
    assert.ok(workbook.SheetNames.includes('Resumen_Cajas') && workbook.SheetNames.includes('Resumen_Pedidos'));
    assert.ok(workbook.SheetNames.every(name => !name.startsWith('Auditoría')));
    writeFileSync(`.release/qa-spark-incremental/${filter}.xlsx`, new Uint8Array(bytes));
    writeFileSync(`.release/qa-spark-incremental/${filter}.html`, managementSummaryReportHtml(model, { period: p, business: 'Panadería Real', branchesMap: { [branchId]: 'Centro' } }));
  }
  await assertFails(sdk.setDoc(sdk.doc(db, 'spark_report_months_v1', `${businessId}:${branchId}:${period.start.slice(0, 7)}`), {}));
  t.diagnostic('SPARK_REPORT_REAL ' + JSON.stringify(metrics));
});
