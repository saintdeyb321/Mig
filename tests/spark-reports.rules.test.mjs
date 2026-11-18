import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { before, after, it } from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createSparkAdministrationRepository } from '../frontend/src/features/licenses/infrastructure/sparkAdministrationRepository.js';
import { createBranchWriter } from '../frontend/src/features/branches/infrastructure/branchWrites.js';
import { createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createSalesSessionReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createPosVoidReader, voidCashPayments } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { createSparkContractsRepository } from '../frontend/src/features/contracts/infrastructure/sparkContractsRepository.js';
import { createSparkSummaryReader } from '../frontend/src/features/reports/infrastructure/sparkSummaryReader.js';
import { createSparkReportMigration } from '../frontend/src/features/reports/infrastructure/sparkReportMigration.js';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { reportDay, reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { get as metric } from '../functions/src/reports/summaryModel.js';
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
const metrics = { attempts: 0, reads: {}, writes: {}, attemptedWrites: {}, pointReads: {}, originalQueries: 0, queryDocuments: 0 };
const count = (bag, ref) => { const name = ref.path.split('/')[0]; bag[name] = (bag[name] ?? 0) + 1; };
const measured = { ...sdk,
  getDocFromServer: ref => { count(metrics.pointReads, ref); return sdk.getDocFromServer(ref); },
  getDocsFromServer: async request => { metrics.originalQueries++; const result = await sdk.getDocsFromServer(request); metrics.queryDocuments += result.size; return result; },
  async runTransaction(db, work) {
    let committed;
    const result = await sdk.runTransaction(db, async tx => {
      metrics.attempts++; const attempted = {}; committed = attempted;
      const write = (kind, ref, data) => { count(metrics.attemptedWrites, ref); count(attempted, ref); return kind === 'delete' ? tx.delete(ref) : tx[kind](ref, data); };
      return work({ get: ref => { count(metrics.reads, ref); return tx.get(ref); },
        set: (ref, data) => write('set', ref, data), update: (ref, data) => write('update', ref, data), delete: ref => write('delete', ref) });
    });
    for (const [name, total] of Object.entries(committed)) metrics.writes[name] = (metrics.writes[name] ?? 0) + total;
    return result;
  } };

it('contract map validators compile and preserve creation, update and photo scope checks', async () => {
  await env.clearFirestore();
  const businessId = 'map-contract-tenant', branchId = 'map-contract-branch';
  await seedProfiles({ 'users/map-owner': { businessId, role: 'dueño', status: 'activo' },
    [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: sdk.Timestamp.fromMillis(Date.now() + 86400000) },
    [`tenants/${businessId}`]: { businessId, status: 'active' },
    [`branches/${branchId}`]: { businessId, status: 'activo', sparkCashVersion: 1 } });
  const db = dbFor('map-owner'), contractId = 'ddddddd1-1111-4111-8111-000000000001';
  const repo = createSparkContractsRepository(db, { sdk, currentUser: () => user('map-owner') });
  await repo.create({ contractId, operationId: contractId, branchId, clientName: 'Cliente', subtotal: 20, deliveryCost: 0, total: 20 });
  await repo.update(contractId, { subtotal: 21, total: 21, details: 'Cambio permitido' });
  assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'contracts', contractId))).data().total, 21);
  await assertFails(sdk.updateDoc(sdk.doc(db, 'contracts', contractId), { referenceImages: ['local-image:foreign:bad:bad'], updatedAt: sdk.serverTimestamp() }));
  await assertFails(sdk.updateDoc(sdk.doc(db, 'contracts', contractId), { total: 0, updatedAt: sdk.serverTimestamp() }));
});

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
  stage = 'authorized catalog writes';
  for (const { id, ...product } of products) await sdk.setDoc(sdk.doc(db, 'products', id), product);
  const total = products.reduce((sum, row) => sum + Math.round(row.price * 100), 0) / 100;
  const input = canonicalNewSale({ localId: 'report_real_sale_123456789', businessId, branchId, userId: 'owner', sessionId: 'report_cash_real_123456789',
    items: products.map(product => ({ id: product.id, name: product.name, category: '', qty: 1, price: product.price, cost: 0 })),
    total, payment: 'mixto', splitPayments: { efectivo: 10.05, yape: Math.round((total - 10.05) * 100) / 100 }, amountPaid: total,
    change: 0, createdAt: new Date().toISOString() });
  const tampered = mutate => ({ ...measured, runTransaction: (database, work) => measured.runTransaction(database, tx => work({ ...tx,
    set: (ref, data) => { const changed = mutate(ref, data); if (changed !== null) return tx.set(ref, changed); },
  })) });
  // The real source/product transaction must reject forged values, omissions
  // and metadata before any receipt or stock change is committed.
  stage = 'tamper rejection';
  const mutations = [
    (ref, data) => ref.path.startsWith('spark_report_days_v1/') ? { ...data, rows: Object.fromEntries(Object.entries(data.rows).map(([day, values]) => [day, values.map((n, i) => i === 0 ? n + 1 : n)])) } : data,
    (ref, data) => ref.path.startsWith('spark_report_months_v1/') ? { ...data, products: { ...data.products, p7: ['Pan 7', 1, 999999] } } : data,
    (ref, data) => ref.path.startsWith('spark_report_months_v1/') ? null : data,
    (ref, data) => ref.path.startsWith('spark_report_months_v1/') ? { ...data, rows: Object.fromEntries(Object.entries(data.rows).map(([day, values]) => [day, values.map((n, i) => i === 0 ? n + 1 : n)])) } : data,
    (ref, data) => ref.path.startsWith('sales/') ? { ...data, reporting: { ...data.reporting, rows: [{ day: '2025-01-01' }, { day: '2025-01-01' }] } } : data,
  ];
  for (const mutate of mutations) {
    await assertFails(createSparkSalesRepository(db, { currentUser: () => user('owner'), sdk: tampered(mutate) }).submit(input));
    assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'sales', input.saleId))).exists(), false);
  }
  stage = 'eight-line sale';
  const beforeSale = structuredClone(metrics);
  await sales.submit(input);
  const saleCost = { reads: Object.fromEntries(Object.entries(metrics.reads).map(([name, n]) => [name, n - (beforeSale.reads[name] ?? 0)]).filter(([, n]) => n)),
    pointReads: Object.fromEntries(Object.entries(metrics.pointReads).map(([name, n]) => [name, n - (beforeSale.pointReads[name] ?? 0)]).filter(([, n]) => n)),
    writes: Object.fromEntries(Object.entries(metrics.writes).map(([name, n]) => [name, n - (beforeSale.writes[name] ?? 0)]).filter(([, n]) => n)) };
  const period = reportPeriod('mes');
  const read = createSparkSummaryReader(db, { sdk: measured, currentUid: () => 'owner' });
  const get = async filter => { const resources = createSessionResources(); try {
    return await read({ resources, uid: 'owner', identityKey: 'owner-real', businessId, branchId: 'global', period: reportPeriod(filter) });
  } finally { resources.close(); } };
  stage = 'monthly summary read';
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, total);
  await sales.submit(input);
  stage = 'void transaction';
  const voids = createPosVoidRepository(db, { currentUser: () => user('owner'), sdk: measured });
  await voids.void({ saleId: input.saleId, reason: 'Prueba de anulación real', businessId, branchId });
  await voids.void({ saleId: input.saleId, reason: 'Prueba de anulación real', businessId, branchId });
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 0);
  for (const { id } of products) {
    const saved = (await sdk.getDocFromServer(sdk.doc(db, 'products', id))).data();
    assert.equal(saved.stock[branchId], 20); assert.equal(saved.posStockVersion[branchId], 2);
  }
  stage = 'contract creation';
  const contracts = createSparkContractsRepository(db, { currentUser: () => user('owner'), sdk: measured });
  const orderId = 'aaaaaaa1-1111-4111-8111-000000000001';
  await contracts.create({ contractId: orderId, operationId: orderId, branchId, clientName: 'Cliente de ensayo', clientPhone: '987654321',
    details: 'Torta', deliveryType: 'recojo_local', deliveryDate: null, subtotal: 100, total: 100, deliveryCost: 0, referenceImages: [],
    initialPayment: { operationId: 'aaaaaaa2-1111-4111-8111-000000000001', amount: 20.05, method: 'efectivo' } });
  stage = 'contract installment';
  await contracts.addPayment({ contractId: orderId, branchId, operationId: 'aaaaaaa3-1111-4111-8111-000000000001', amount: 30.10, method: 'yape' });
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 50.15);
  await contracts.addPayment({ contractId: orderId, branchId, operationId: 'aaaaaaa5-1111-4111-8111-000000000001', amount: 1.01, method: 'plin' });
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 51.16);
  stage = 'contract edit and delivery';
  await contracts.update(orderId, { details: 'Detalle actualizado sin otro cobro' });
  await contracts.deliver(orderId);
  assert.equal(buildSummaryView(await get('mes'), period).contractCounts.delivered, 1);
  stage = 'contract refund';
  await contracts.cancel({ contractId: orderId, branchId, operationId: 'aaaaaaa4-1111-4111-8111-000000000001', reason: 'Cancelación comprobada' });
  const snapshot = await get('mes'), view = buildSummaryView(snapshot, period);
  assert.equal(view.summary.netRevenue, 0);
  assert.equal(view.summary.cashRevenue, 0);
  assert.equal(view.summary.digitalRevenue, 0);
  stage = 'nonzero final sale and concurrent retry';
  const finalSale = canonicalNewSale({ ...input, localId: 'report_real_final_123456789', saleId: 'report_real_final_123456789',
    idempotencyKey: 'report_real_final_123456789',
    items: [input.items[0]], total: 1.05, payment: 'efectivo', splitPayments: null, amountPaid: 2, change: 0.95 });
  await Promise.all([sales.submit(finalSale), sales.submit(finalSale)]);
  assert.equal(buildSummaryView(await get('mes'), period).summary.netRevenue, 1.05);
  stage = 'cash close';
  let ledgerSales, ledgerPayments, ledgerVoids;
  const closing = createSparkCashClosingRepository(db, { sdk: measured, currentUser: () => user('owner'),
    readSales: async session => (ledgerSales = await createSalesSessionReader(db, { sdk: measured })(session)),
    readPayments: async session => {
      ledgerPayments = await createPaymentRepository(db, { sdk: measured }).getPaymentsBySession(businessId, session.id, branchId);
      ledgerVoids = await createPosVoidReader(db, { sdk: measured }).bySession(session);
      return [...ledgerPayments, ...voidCashPayments(ledgerVoids)];
    } });
  await closing.close('report_cash_real_123456789', 101.05);
  const oracle = aggregateReport({ sales: ledgerSales.map(row => ({ ...row, createdAt: row.confirmedAt })),
    payments: ledgerPayments, voids: ledgerVoids, businessId, branchId, period });
  const readsBeforeExport = structuredClone(metrics);
  stage = 'real monthly and annual export';
  const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
  mkdirSync('.release/qa-spark-incremental', { recursive: true });
  for (const filter of ['mes', 'todo']) {
    const data = await get(filter), p = reportPeriod(filter), model = buildSummaryView(data, p);
    const bytes = writeSalesWorkbook(XLSX, buildSummaryWorkbook(XLSX, model, { period: p, business: 'Panadería Real', branchesMap: { [branchId]: 'Centro' } }));
    const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
    assertWorkbookBorders(XLSX, workbook, bytes);
    assert.equal(readOverview(XLSX, workbook)['Total neto registrado (S/)'], 1.05);
    assert.equal(model.summary.cashRevenue, 1.05); assert.equal(model.summary.digitalRevenue, 0);
    assert.equal(model.contractCounts.cancelled, 1);
    for (const field of ['netRevenue', 'posRevenue', 'contractRevenue', 'cashRevenue', 'digitalRevenue', 'posTicketCount',
      'voidedTicketCount', 'contractPaymentCount', 'refundCount', 'posAverageTicket', 'channels']) {
      assert.deepEqual(model.summary[field], oracle.summary[field], `${filter}: ${field} must match the original document oracle`);
    }
    assert.equal(metric(model.values, 'openings'), 1); assert.equal(metric(model.values, 'closings'), 1);
    assert.equal(metric(model.values, 'unverified'), 1); assert.equal(metric(model.values, 'balanced'), 0);
    assert.equal(model.topProducts[0].name, 'Pan 0'); assert.equal(model.topProducts[0].qty, 1);
    assert.ok(workbook.SheetNames.includes('Resumen_Cajas') && workbook.SheetNames.includes('Resumen_Pedidos'));
    assert.ok(workbook.SheetNames.every(name => !name.startsWith('Auditoría')));
    writeFileSync(`.release/qa-spark-incremental/${filter}.xlsx`, new Uint8Array(bytes));
    writeFileSync(`.release/qa-spark-incremental/${filter}.html`, managementSummaryReportHtml(model, { period: p, business: 'Panadería Real', branchesMap: { [branchId]: 'Centro' } }));
  }
  assert.equal(metrics.originalQueries, readsBeforeExport.originalQueries, 'Exports perform no original collection queries');
  for (const name of ['sales', 'payments', 'contracts', 'cash_sessions', 'pos_voids']) {
    assert.equal(metrics.reads[name], readsBeforeExport.reads[name], `No original ${name} transaction reads during exports`);
    assert.equal(metrics.pointReads[name], readsBeforeExport.pointReads[name], `No original ${name} receipt reads during exports`);
  }
  t.diagnostic('EXPORT_READS ' + JSON.stringify(Object.fromEntries(Object.entries(metrics.reads).map(([name, value]) => [name, value - (readsBeforeExport.reads[name] ?? 0)]).filter(([, n]) => n))));
  stage = 'standalone replay and foreign access rejection';
  const monthRef = sdk.doc(db, 'spark_report_months_v1', `${businessId}:${branchId}:${period.start.slice(0, 7)}`);
  const savedMonth = (await sdk.getDocFromServer(monthRef)).data();
  await assertFails(sdk.setDoc(monthRef, { ...savedMonth, updatedAt: sdk.serverTimestamp() }));
  await assertFails(sdk.getDocFromServer(sdk.doc(dbFor('intruder'), monthRef.path)));
  await assertFails(sdk.setDoc(sdk.doc(db, 'spark_report_months_v1', `${businessId}:${branchId}:${period.start.slice(0, 7)}`), {}));
  t.diagnostic('SPARK_REPORT_REAL ' + JSON.stringify(metrics));
  writeFileSync('.release/qa-spark-incremental/metrics.json', JSON.stringify({ note: 'Observed SDK operations in demo-migapos; includes rejected attempts. Not production billing or Rules dependent reads.',
    successfulEightLineSale: saleCost, all: metrics }, null, 2));
});

it('historical inventory remains pending, resumable, budgeted and cannot forge coverage', async t => {
  await env.clearFirestore();
  const businessId = 'history-tenant', branchId = 'history-branch';
  await seedProfiles({ 'users/history-owner': { businessId, role: 'dueño', status: 'activo' },
    [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: sdk.Timestamp.fromMillis(Date.now() + 86400000),
      registeredBranchIds: [branchId], registeredBranchQuotaVersion: 1 },
    [`tenants/${businessId}`]: { businessId, status: 'active' },
    [`branches/${branchId}`]: { businessId, status: 'activo', sparkCashVersion: 1 } });
  const db = dbFor('history-owner'), migrate = createSparkReportMigration(db, { sdk, currentUid: () => 'history-owner' });
  const contracts = createSparkContractsRepository(db, { sdk, currentUser: () => user('history-owner') });
  const historicalId = 'bbbbbbb1-1111-4111-8111-000000000001';
  for (const id of [historicalId, 'bbbbbbb2-1111-4111-8111-000000000001']) {
    await contracts.create({ contractId: id, operationId: id, branchId, clientName: 'Pedido anterior', subtotal: 50, total: 50, deliveryCost: 0 });
  }
  // An actual legacy contract is aged only in the fixture to represent last
  // year's source. No summary or coverage certificate is ever preloaded.
  const year = +reportPeriod('mes').start.slice(0, 4) - 1;
  const oldDate = sdk.Timestamp.fromDate(new Date(`${year}-12-31T12:00:00-05:00`));
  await seedProfiles({ [`contracts/${historicalId}`]: { ...(await sdk.getDocFromServer(sdk.doc(db, 'contracts', historicalId))).data(),
    createdAt: oldDate, startDate: oldDate } });
  const args = { uid: 'history-owner', businessId, branchId, maxDocuments: 1, pageSize: 1 };
  const first = await migrate(args), second = await migrate(args), third = await migrate(args);
  assert.deepEqual([first.processed, second.processed, third.processed], [1, 2, 2]);
  assert.equal(third.source, 'complete'); assert.equal(third.status, 'pending'); assert.equal(third.verified, false);
  assert.equal(first.metrics.documents, 1); assert.equal(second.metrics.documents, 1);
  await createSparkCashRepository(db, { sdk, currentUser: () => user('history-owner') }).open({
    businessId, branchId, sessionId: 'historical_payment_cash_123456789', openingAmount: 10 });
  const installment = { contractId: historicalId, branchId, operationId: 'bbbbbbb3-1111-4111-8111-000000000001', amount: 5.25, method: 'efectivo' };
  await contracts.addPayment(installment);
  await contracts.addPayment(installment);
  const oldMonth = (await sdk.getDocFromServer(sdk.doc(db, 'spark_report_months_v1', `${businessId}:${branchId}:${year}-12`))).data();
  const currentMonth = (await sdk.getDocFromServer(sdk.doc(db, 'spark_report_months_v1', `${businessId}:${branchId}:${reportPeriod('mes').start.slice(0, 7)}`))).data();
  assert.equal(metric(oldMonth.rows[`${year}-12-31`], 'created'), 1);
  assert.equal(metric(currentMonth.rows[reportDay(new Date())], 'paymentCash'), 525);
  assert.equal(metric(currentMonth.rows[reportDay(new Date())], 'payments'), 1);
  await assertFails(sdk.updateDoc(sdk.doc(db, 'branches', branchId), { reportHistory: 'new-branch' }));
  await assertFails(sdk.updateDoc(sdk.doc(db, 'spark_report_migrations_v1', `${businessId}:${branchId}:history`), { status: 'verified' }));
  const resources = createSessionResources();
  const originalQueries = metrics.originalQueries;
  try {
    await assert.rejects(createSparkSummaryReader(db, { sdk: measured, currentUid: () => 'history-owner' })({ resources,
      uid: 'history-owner', identityKey: 'history-owner', businessId, branchId: 'global', period: reportPeriod('mes') }),
    { code: 'report-history-unverified' });
    assert.equal(metrics.originalQueries, originalQueries, 'Missing history must never trigger original document queries');
  } finally { resources.close(); }
  t.diagnostic('HISTORY_INVENTORY ' + JSON.stringify([first.metrics, second.metrics, third.metrics]));
});

it('incremental contracts preserve P17 pickup privacy and refund authority across branches', async () => {
  await env.clearFirestore();
  await seedProfiles({ 'users/admin': { role: 'superadmin', email: 'admin@gmail.com', businessId: 'platform-admin', status: 'activo' } });
  const { businessId, branchId } = await createSparkAdministrationRepository(dbFor('admin'), { sdk, currentUser: () => user('admin') }).createTenant({
    operationId: 'report_pickup_real_123456789', businessName: 'Panadería Recojo', ownerEmail: 'pickup-owner@gmail.com',
    firstName: 'Dueña', lastName: 'Prueba', months: 1, maxActiveBranches: 2, maxRegisteredBranches: 2 });
  const db = dbFor('pickup-owner'), pickupBranch = 'report-pickup-other';
  await seedProfiles({ 'users/pickup-owner': { businessId, role: 'dueño', status: 'activo' } });
  await createBranchWriter(db, { sdk, currentUser: () => user('pickup-owner') })(pickupBranch,
    { businessId, name: 'Recojo', address: 'Sede de ensayo', phone: '', status: 'activo' }, { create: true });
  await seedProfiles({ 'users/pickup-cashier': { businessId, branchId: pickupBranch, role: 'cajero', status: 'activo' } });
  await createSparkCashRepository(db, { sdk, currentUser: () => user('pickup-owner') }).open({
    sessionId: 'report_pickup_cash_123456789', businessId, branchId, openingAmount: 20 });
  const contracts = createSparkContractsRepository(db, { sdk, currentUser: () => user('pickup-owner') });
  const id = 'eeeeeee1-1111-4111-8111-000000000001';
  await contracts.create({ contractId: id, operationId: id, branchId, clientName: 'Cliente de recojo', subtotal: 50,
    total: 50, deliveryCost: 0, deliveryType: pickupBranch,
    initialPayment: { operationId: 'eeeeeee2-1111-4111-8111-000000000001', amount: 5.05, method: 'efectivo' } });
  const cashier = dbFor('pickup-cashier');
  await assertFails(sdk.getDocFromServer(sdk.doc(cashier, 'contracts', id)));
  const logistics = (await sdk.getDocFromServer(sdk.doc(cashier, 'contract_pickups', id))).data();
  assert.equal(logistics.pickupBranchId, pickupBranch); assert.equal(logistics.originBranchId, branchId);
  assert.equal(logistics.clientName, undefined); assert.equal(logistics.paidTotal, undefined);
  await assertFails(sdk.updateDoc(sdk.doc(cashier, 'contracts', id), { total: 1, updatedAt: sdk.serverTimestamp() }));
  await contracts.addPayment({ contractId: id, branchId, operationId: 'eeeeeee3-1111-4111-8111-000000000001', amount: 2.02, method: 'yape' });
  await contracts.deliver(id);
  assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'contract_pickups', id))).data().pickupBranchId, null);
  await contracts.cancel({ contractId: id, branchId, operationId: 'eeeeeee4-1111-4111-8111-000000000001', reason: 'Reembolso de ensayo' });
  const resources = createSessionResources();
  try {
    const period = reportPeriod('mes');
    const data = await createSparkSummaryReader(db, { sdk, currentUid: () => 'pickup-owner' })({ resources,
      uid: 'pickup-owner', identityKey: 'pickup-owner', businessId, branchId: 'global', period });
    assert.equal(buildSummaryView(data, period).summary.netRevenue, 0);
    assert.equal(buildSummaryView(data, period).contractCounts.cancelled, 1);
    assert.equal(data.branchIds.length, 2);
  } finally { resources.close(); }
});
