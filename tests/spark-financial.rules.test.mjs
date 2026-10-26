import { planLegacyPayments } from '../functions/src/contracts/domain/legacyPaymentPlan.js';
import { createContractPeriodReader } from '../frontend/src/features/contracts/infrastructure/contractPeriodRepository.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import * as sdk from 'firebase/firestore';
import { createSalesPeriodReader, createSalesSessionReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createSparkLegacyPaymentReader } from '../frontend/src/features/payments/infrastructure/sparkLegacyPayments.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createSparkContractsRepository } from '../frontend/src/features/contracts/infrastructure/sparkContractsRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createRequire } from 'node:module';
import { buildSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { updateProductTransaction } from '../frontend/src/features/catalog/infrastructure/productWrites.js';
import { canonicalSale, sameSaleOperation } from '../functions/src/sales/domain/saleModel.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
setLogLevel('silent');
let env;
const uid = 'cashier', businessId = 'prototype-tenant', branchId = 'prototype-branch', sessionId = 'prototype-session';
const products = ['bread', 'cake', 'milk', 'tea', 'extra'].map((id, index) => ({ id, businessId, name: id, category: 'Prueba', price: index + 1.25, cost: 0.25, stock: { [branchId]: 10, other: 7 }, posStockVersion: { other: 41 }, status: 'activo' }));
const database = () => env.authenticatedContext(uid).firestore();
const inspect = async path => { let result; await env.withSecurityRulesDisabled(async ctx => { result = await getDoc(doc(ctx.firestore(), path)); }); return result; };
const payload = (id, count = 4, qty = 1) => {
  const items = products.slice(0, count).map(product => ({ id: product.id, name: product.name, category: product.category, price: product.price, cost: product.cost, qty }));
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return canonicalSale({ localId: id, businessId, branchId, userId: uid, sessionId, items, total, payment: 'efectivo', amountPaid: total, change: 0, createdAt: '2026-10-23T12:00:00.000Z' }, products);
};
async function commit(data, { mutate = value => value, omitProduct = null, receipt = true } = {}) {
  const db = database();
  return runTransaction(db, async tx => {
    const ref = doc(db, 'sales', data.saleId), existing = await tx.get(ref);
    if (existing.exists()) { if (!sameSaleOperation(data, existing.data())) throw new Error('operation-conflict'); return existing.data(); }
    const rows = await Promise.all(data.items.map(item => tx.get(doc(db, 'products', item.id))));
    const sale = mutate({ ...data, productIds: data.items.map(item => item.id), stockVersions: Object.fromEntries(rows.map((row, i) => [data.items[i].id, (row.data().posStockVersion?.[data.branchId] ?? 0) + 1])), confirmedAt: serverTimestamp(), status: 'confirmed' });
    if (receipt) tx.set(ref, sale);
    for (const [index, item] of data.items.entries()) if (item.id !== omitProduct) {
      const product = rows[index].data();
      tx.update(doc(db, 'products', item.id), { stock: { ...product.stock, [data.branchId]: product.stock[data.branchId] - item.qty }, posLastSaleId: data.saleId, posStockVersion: { ...product.posStockVersion, [data.branchId]: (product.posStockVersion?.[data.branchId] ?? 0) + 1 } });
    }
    return sale;
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-migapos', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), batch = writeBatch(db);
    const entries = { [`users/${uid}`]: { role: 'cajero', businessId, branchId, status: 'activo' }, [`tenants/${businessId}`]: { businessId, status: 'active' },
      [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) },
      [`branches/${branchId}`]: { businessId, status: 'activo', sparkCashVersion: 1 },
      [`cash_sessions/${sessionId}`]: { businessId, branchId, userId: uid, status: 'open', openingAmount: 10, runtime: 'spark', openedAt: Timestamp.fromMillis(Date.now() - 1000) },
      [`active_cash_sessions/${createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex')}`]: { businessId, branchId, userId: uid, sessionId, status: 'open', runtime: 'spark' } };
    for (const product of products) entries[`products/${product.id}`] = product;
    for (const [path, value] of Object.entries(entries)) batch.set(doc(db, path), value);
    await batch.commit();
  });
});
after(async () => env?.cleanup());

describe('SPARK-4 integrated financial Rules', () => {
  it('confirms a complete two-product ticket within Rules limits and retries without a second debit', async () => {
    const sale = payload('ticket-two', 2); await commit(sale); const first = (await inspect('sales/ticket-two')).data();
    assert.ok(first.confirmedAt instanceof Timestamp);
    await commit(sale);
    for (const product of products.slice(0, 2)) { const saved = (await inspect(`products/${product.id}`)).data(); assert.equal(saved.stock[branchId], 9); assert.equal(saved.stock.other, 7); assert.equal(saved.posStockVersion.other, 41); assert.equal(saved.posStockVersion[branchId], 1); }
    await assert.rejects(commit({ ...sale, cashierName: 'Different operation' }), /operation-conflict/);
  });
  it('rejects manipulated price, cost, total, payment and extra/inconsistent lines', async () => {
    const sale = payload('bad-ticket', 2);
    for (const mutate of [d => ({ ...d, items: d.items.map((item, i) => i ? item : { ...item, price: 0.25 }) }),
      d => ({ ...d, items: d.items.map(item => ({ ...item, cost: 0 })) }), d => ({ ...d, total: 0.25 }), d => ({ ...d, amountPaid: 0 }),
      d => ({ ...d, productIds: ['bread', 'bread'] }), d => ({ ...d, items: d.items.slice(0, 1) }), d => ({ ...d, origin: 'offline' })]) await assertFails(commit(sale, { mutate }));
    await assertFails(commit(payload('too-many', 3)));
    const db = database(), batch = writeBatch(db);
    batch.update(doc(db, 'products', 'bread'), { price: 0.25, stock: { [branchId]: 9 }, posLastSaleId: sale.saleId, posStockVersion: 1 });
    batch.set(doc(db, 'sales', sale.saleId), { ...sale, productIds: ['bread', 'cake'], confirmedAt: serverTimestamp(), status: 'confirmed' });
    await assertFails(batch.commit());
  });
  it('validates canonical cents, costs and cash/change, Yape and mixed payments on bounded tickets', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 0.29 }));
    const base = payload('decimal-cash', 2);
    base.items[0].price = 0.29;
    base.total = 2.54; base.amountPaid = 5; base.change = 2.46; base.grossProfit = 2.04;
    await commit(base);
    const yape = { ...base, saleId: 'decimal-yape', localId: 'decimal-yape', idempotencyKey: 'decimal-yape', payment: 'yape', amountPaid: 2.54, change: 0 };
    await commit(yape);
    const mixed = { ...yape, saleId: 'decimal-mixed', localId: 'decimal-mixed', idempotencyKey: 'decimal-mixed', payment: 'mixto', splitPayments: { efectivo: 1.25, yape: 1.29 } };
    await commit(mixed);
    await assertFails(commit({ ...mixed, saleId: 'bad-mixed', localId: 'bad-mixed', idempotencyKey: 'bad-mixed', splitPayments: { efectivo: 1, yape: 1 } }));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 7);
  });
  it('rejects foreign tenant/branch/session and a revoked license', async () => {
    const sale = payload('foreign-ticket', 2);
    for (const value of [{ businessId: 'foreign' }, { branchId: 'other' }, { sessionId: 'other-session' }, { userId: 'other-user' }]) await assertFails(commit({ ...sale, ...value }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'licenses', businessId), { status: 'inactiva' }));
    await assertFails(commit(sale));
  });
  it('rejects partial writes and negative stock atomically, leaving every product and receipt intact', async () => {
    const sale = payload('partial-ticket', 2);
    await assertFails(commit(sale, { omitProduct: 'cake' }));
    await assertFails(commit(sale, { receipt: false }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'cake'), { stock: { [branchId]: 0, other: 7 } }));
    await assertFails(commit(sale));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
    assert.equal((await inspect('products/cake')).data().stock[branchId], 0);
    assert.equal((await inspect('sales/partial-ticket')).exists(), false);
  });
  it('serializes concurrent tickets on the last units with no oversell or duplicate receipts', async () => {
    await env.withSecurityRulesDisabled(async ctx => { for (const product of products.slice(0, 2)) await updateDoc(doc(ctx.firestore(), 'products', product.id), { stock: { [branchId]: 1, other: 7 } }); });
    const results = await Promise.allSettled([commit(payload('race-one', 2)), commit(payload('race-two', 2))]);
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    for (const product of products.slice(0, 2)) assert.equal((await inspect(`products/${product.id}`)).data().stock[branchId], 0);
    const receipts = await Promise.all(['race-one', 'race-two'].map(id => inspect(`sales/${id}`)));
    assert.equal(receipts.filter(snapshot => snapshot.exists()).length, 1);
  });
  it('confirms through the native repository; replay, foreign identity and changed input cannot debit twice', async () => {
    const repository = createSparkSalesRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const sale = payload('native-ticket', 2);
    const ack = await repository.submit(sale); assert.deepEqual(ack.stockVersions, { bread: 1, cake: 1 });
    await repository.submit(sale);
    await assert.rejects(repository.submit({ ...sale, total: 99 }));
    await assert.rejects(repository.submit({ ...sale, userId: 'foreign' }));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
  });
  it('links contract advance, later payment, delivery and aggregate-method refunds atomically with idempotence', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const contracts = createSparkContractsRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const contractId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const command = { contractId, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', branchId,
      clientName: 'Cliente sintético', subtotal: 20, deliveryCost: 0, total: 20,
      initialPayment: { operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', amount: 5, method: 'efectivo' } };
    await contracts.create(command); await contracts.create(command);
    await assert.rejects(contracts.create({ ...command, contractId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
    const installment = { contractId, branchId, operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', amount: 3, method: 'yape' };
    await contracts.addPayment(installment); await contracts.addPayment(installment);
    await assert.rejects(contracts.addPayment({ ...installment, amount: 4 }));
    await contracts.deliver(contractId);
    assert.equal((await inspect(`contracts/${contractId}`)).data().status, 'entregado_con_deuda');
    const cancel = { contractId, branchId, operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', reason: 'Prueba de devolución' };
    await contracts.cancel(cancel); await contracts.cancel(cancel);
    const saved = (await inspect(`contracts/${contractId}`)).data();
    assert.equal(saved.paidTotal, 0); assert.equal(saved.balance, 0); assert.equal(saved.status, 'cancelado');
    const periodContracts = await createContractPeriodReader(database(), { sdk })(businessId, new Date(Date.now() - 60000), new Date(Date.now() + 60000), branchId);
    assert.equal(periodContracts.length, 1); assert.equal(periodContracts[0].status, 'cancelado');
    assert.equal((await inspect(`payments/${cancel.operationId}_efectivo`)).data().amount, -5);
    assert.equal((await inspect(`payments/${cancel.operationId}_yape`)).data().amount, -3);
    await assertFails(updateDoc(doc(database(), 'payments', installment.operationId), { amount: 99 }));
    await assertFails(updateDoc(doc(database(), 'contracts', contractId), { paidTotal: 100 }));
  });
  it('closes a Spark session operationally, releases only its lock and bars subsequent sales and repeated changes', async () => {
    const closing = createSparkCashClosingRepository(database(), { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [] });
    const result = await closing.close(sessionId, 12, 'Diferencia declarada');
    assert.equal(result.status, 'closed_with_discrepancy'); assert.equal(result.reconciliationPending, true);
    assert.equal(result.closeEstimate.authority, 'client-estimate');
    await closing.close(sessionId, 12, 'Diferencia declarada');
    await assert.rejects(closing.close(sessionId, 13, 'Otro cierre'));
    await assertFails(commit(payload('closed-ticket', 2)));
    const lock = createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex');
    assert.equal((await inspect(`active_cash_sessions/${lock}`)).exists(), false);
  });

  it('blocks forged receipts/catalog markers, another branch version and an atomic close-and-sale bypass', async () => {
    const db = database();
    await assertFails(updateDoc(doc(db, 'products', 'bread'), { posLastSaleId: 'fake' }));
    await assertFails(updateDoc(doc(db, 'products', 'bread'), { posStockVersion: { other: 0 } }));
    const batch = writeBatch(db), sale = payload('atomic-close', 1);
    batch.update(doc(db, 'cash_sessions', sessionId), { status: 'closed', closedBy: uid, closedAt: serverTimestamp(),
      declaredAmount: 10, closingNote: '', reconciliationPending: true,
      closeEstimate: { authority: 'client-estimate', reconciliationPending: true, declaredAmount: 10, expectedCash: 10, difference: 0 } });
    batch.delete(doc(db, 'active_cash_sessions', createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex')));
    batch.set(doc(db, 'sales', sale.saleId), { ...sale, productIds: ['bread'], stockVersions: { bread: 1 }, status: 'confirmed', confirmedAt: serverTimestamp() });
    batch.update(doc(db, 'products', 'bread'), { stock: { [branchId]: 9, other: 7 }, posStockVersion: { [branchId]: 1, other: 41 }, posLastSaleId: sale.saleId });
    await assertFails(batch.commit());
    assert.equal((await inspect(`cash_sessions/${sessionId}`)).data().status, 'open');
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { posStockVersion: { [branchId]: Number.MAX_SAFE_INTEGER, other: 41 } }));
    await assertFails(commit(payload('unsafe-version', 1)));
    assert.equal((await inspect('products/bread')).data().posStockVersion[branchId], Number.MAX_SAFE_INTEGER);
  });
  it('serializes concurrent installments, rejects aggregate forgery, partial ledgers and historical writes; refunds three methods once', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = '11111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: '22222222-2222-4222-8222-222222222222', branchId, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' });
    await contracts.update(id, { details: 'Edición permitida', subtotal: 10, total: 10 });
    const command = (op, amount, method = 'efectivo') => ({ contractId: id, branchId, operationId: op, amount, method });
    await contracts.addPayment(command('33333333-3333-4333-8333-333333333333', 2));
    await contracts.addPayment(command('44444444-4444-4444-8444-444444444444', 2, 'yape'));
    await contracts.addPayment(command('55555555-5555-4555-8555-555555555555', 2, 'plin'));
    const race = await Promise.allSettled([
      contracts.addPayment(command('66666666-6666-4666-8666-666666666666', 3)),
      contracts.addPayment(command('77777777-7777-4777-8777-777777777777', 3))]);
    assert.equal(race.filter(value => value.status === 'fulfilled').length, 1);
    await assertFails(updateDoc(doc(db, 'contracts', id), { paidTotal: 10, balance: 0, paidByMethod: { efectivo: 6, yape: 2, plin: 2 }, ledgerVersion: 5, lastPaymentId: 'fake', updatedAt: serverTimestamp() }));
    const saved = (await inspect(`contracts/${id}`)).data(); assert.equal(saved.paidTotal, 9);
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contracts', 'legacy-contract'), { ...saved, sparkContractVersion: 0 }));
    await assertFails(updateDoc(doc(db, 'contracts', 'legacy-contract'), { details: 'Forbidden', updatedAt: serverTimestamp() }));
    await contracts.cancel({ contractId: id, branchId, operationId: '88888888-8888-4888-8888-888888888888', reason: 'Tres métodos' });
    assert.equal((await inspect(`contracts/${id}`)).data().paidTotal, 0);
    const payments = await createPaymentRepository(db, { sdk }).getPaymentsByContract(businessId, id, branchId);
    assert.equal(payments.filter(row => row.type === 'refund').length, 3);
    assert.equal(payments.reduce((sum, row) => sum + row.amount, 0), 0);
  });
  it('uses confirmed server dates for paginated reports, deterministic historical reads and protected informational notices', async () => {
    const db = database(), repository = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const sale = { ...payload('report-ticket', 2), createdAt: '2001-01-01T00:00:00.000Z', queuedAt: '2001-01-01T00:00:00.000Z' };
    await repository.submit(sale);
    const rows = await createSalesPeriodReader(db, { sdk })(businessId, new Date(Date.now() - 60000), new Date(Date.now() + 60000), { branchId });
    assert.equal(rows.length, 1); assert.equal(rows[0].id, sale.saleId);
    assert.equal(aggregateReport({ stats: salesToDailyStats(rows) }).summary.posRevenue, sale.total);
    const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
    const workbook = buildSalesWorkbook(XLSX, { sales: rows, businessId, branchId, period: reportPeriod('hoy'), detailed: true }).workbook;
    assert.ok(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }).length > 1000);
    const notice = (await inspect(`notifications/sale_${sale.saleId}`)).data(); assert.equal(notice.authority, 'informational');
    await assertFails(setDoc(doc(db, 'notifications', 'sale_fake'), { ...notice, sourceId: 'fake', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'notifications', `sale_${sale.saleId}`), { message: 'Certificado falso' }));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contracts', 'old-readonly'), {
      businessId, branchId, createdBy: uid, total: 9,
      payments: [{ amount: 2, method: 'yape', type: 'adelanto', branchId, date: '2026-10-23T12:00:00.000Z' }] }));
    const legacy = createSparkLegacyPaymentReader(db, { sdk });
    const first = await legacy(businessId, { contractId: 'old-readonly', branchId });
    const second = await legacy(businessId, { contractId: 'old-readonly', branchId });
    assert.equal(first[0].id, second[0].id); assert.equal(first[0].amount, 2);
    const old = (await inspect('contracts/old-readonly')).data();
    const serverPlan = planLegacyPayments('old-readonly', old, { timestampFromDate: Timestamp.fromDate, digest: value => createHash('sha256').update(JSON.stringify(value)).digest('hex') });
    assert.equal(first[0].id, serverPlan[0].id);
    assert.ok((await inspect('contracts/old-readonly')).data().payments);
  });

  it('rejects cross-tenant/branch payments, cashier refunds, missing payment writes and out-of-shift financial operations', async () => {
    const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = 'a1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: 'a2222222-2222-4222-8222-222222222222', branchId, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' });
    await assert.rejects(contracts.addPayment({ contractId: id, branchId: 'foreign', operationId: 'a3333333-3333-4333-8333-333333333333', amount: 2, method: 'yape' }));
    await assert.rejects(contracts.cancel({ contractId: id, branchId, operationId: 'a4444444-4444-4444-8444-444444444444', reason: 'Solo dueño' }));
    await assertFails(updateDoc(doc(db, 'contracts', id), { paidTotal: 2, balance: 8, paidByMethod: { efectivo: 2, yape: 0, plin: 0 },
      ledgerVersion: 1, lastPaymentId: 'missing-payment', updatedAt: serverTimestamp() }));
    const foreign = env.authenticatedContext('foreign').firestore();
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'foreign'), { role: 'dueño', businessId: 'other-tenant', status: 'activo' }));
    await assertFails(getDoc(doc(foreign, 'contracts', id)));
    await assertFails(updateDoc(doc(foreign, 'contracts', id), { details: 'Cruce de tenant', updatedAt: serverTimestamp() }));
    const minute = ((new Date().getUTCHours() * 60 + new Date().getUTCMinutes()) + 1140) % 1440;
    const hhmm = n => `${String(Math.floor((n % 1440) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { shiftStart: hhmm(minute + 5), shiftEnd: hhmm(minute + 6) }));
    await assertFails(commit(payload('outside-server-shift', 2)));
    assert.equal((await inspect(`contracts/${id}`)).data().paidTotal, 0);
  });
  it('handles a sale racing a catalog edit or cash close without stale stock writes or post-close acceptance', async () => {
    const db = database();
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const repository = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const results = await Promise.allSettled([
      repository.submit(payload('catalog-race', 1)),
      updateProductTransaction(db, 'bread', { name: 'bread', price: 2.25, cost: 0.25, businessId, stock: { [branchId]: 10, other: 7 }, category: 'Prueba', status: 'activo' }, { [branchId]: 10, other: 7 }, { sdk }),
    ]);
    assert.ok(results.some(row => row.status === 'fulfilled'));
    const applied = (await inspect('sales/catalog-race')).exists();
    assert.equal((await inspect('products/bread')).data().stock[branchId], applied ? 9 : 10);
    const closing = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [] });
    const race = await Promise.allSettled([repository.submit(payload('close-race', 1)), closing.close(sessionId, 10, 'Cierre operativo')]);
    assert.equal(race[1].status, 'fulfilled');
    assert.equal((await inspect(`cash_sessions/${sessionId}`)).data().reconciliationPending, true);
    await assertFails(commit(payload('after-racing-close', 1)));
  });

  it('closes the real confirmed sale/contract book with exact opening, cash, mixed and Yape amounts', async () => {
    const db = database();
    const sales = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const mixed = { ...payload('full-flow-mixed', 2), payment: 'mixto', amountPaid: 3.5, change: 0, splitPayments: { efectivo: 1.5, yape: 2 } };
    await sales.submit(mixed); await sales.submit(payload('full-flow-cash', 1));
    const contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = 'b1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: 'b2222222-2222-4222-8222-222222222222', branchId, clientName: 'Flujo completo', total: 20, subtotal: 20, deliveryCost: 0,
      initialPayment: { operationId: 'b3333333-3333-4333-8333-333333333333', amount: 5, method: 'efectivo' } });
    await contracts.addPayment({ contractId: id, branchId, operationId: 'b4444444-4444-4444-8444-444444444444', amount: 3, method: 'yape' });
    const ledger = createPaymentRepository(db, { sdk });
    const close = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }),
      readSales: createSalesSessionReader(db, { sdk }), readPayments: session => ledger.getPaymentsBySession(businessId, session.id, branchId) });
    const estimate = await close.preview(sessionId, 17.75);
    assert.equal(estimate.openingAmount, 10); assert.equal(estimate.posCash, 2.75);
    assert.equal(estimate.contractCash, 5); assert.equal(estimate.digitalTotal, 5); assert.equal(estimate.difference, 0);
    const saved = await close.close(sessionId, 17.75);
    assert.equal(saved.status, 'closed'); assert.equal(saved.reconciliationPending, true);
    await assert.rejects(contracts.addPayment({ contractId: id, branchId, operationId: 'b5555555-5555-4555-8555-555555555555', amount: 1, method: 'yape' }));
    const noCash = 'c1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: noCash, operationId: 'c2222222-2222-4222-8222-222222222222', branchId, clientName: 'Sin cobro', subtotal: 10, deliveryCost: 0, total: 10 });
    await contracts.update(noCash, { details: 'Edición sin alterar el libro' });
    await contracts.deliver(noCash);
    assert.equal((await inspect(`contracts/${noCash}`)).data().status, 'entregado_con_deuda');
  });

});


it('Plan03 rejects sales and new contracts on an inactive or unknown-status branch without touching receipts or stock', async () => {
  const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
  for (const status of ['inactivo', 'unknown']) {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'branches', branchId), { status }));
    const sale = payload(`blocked-${status}`, 2);
    await assertFails(commit(sale));
    await assert.rejects(contracts.create({ contractId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222', branchId, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' }), /Sede inactiva/);
    assert.equal((await inspect(`sales/${sale.saleId}`)).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
  }
});

it('Plan04 expires new ten-hour cash sessions using server time, refuses financial writes and permits authorized late closing', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
  const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
  const contractId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const paymentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await contracts.create({ contractId, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', branchId, clientName: 'Prueba',
    total: 20, subtotal: 20, deliveryCost: 0, initialPayment: { operationId: paymentId, amount: 2, method: 'efectivo' } });
  const expiredOpening = Date.now() - 10 * 3600000 - 60000;
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), {
    durationHours: 10, openedAt: Timestamp.fromMillis(expiredOpening),
  }));
  // A forged client date inside the old window cannot override request.time in Rules.
  await assertFails(commit({ ...payload('expired-cash-sale', 2), createdAt: new Date(expiredOpening + 1000).toISOString() }));
  const rejectedContractId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await assert.rejects(contracts.create({ contractId: rejectedContractId, operationId: '99999999-9999-4999-8999-999999999999',
    branchId, clientName: 'Anticipo vencido', total: 10, subtotal: 10, deliveryCost: 0,
    initialPayment: { operationId: '88888888-8888-4888-8888-888888888888', amount: 1, method: 'efectivo' } }));
  await assert.rejects(contracts.addPayment({ contractId, branchId, operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', amount: 1, method: 'efectivo' }));
  await assert.rejects(contracts.cancel({ contractId, branchId, operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', reason: 'Reembolso bloqueado' }));
  await assertFails(updateDoc(doc(db, 'cash_sessions', sessionId), { durationHours: 12 }));
  await assertFails(updateDoc(doc(db, 'cash_sessions', sessionId), { openedAt: serverTimestamp() }));
  assert.equal((await inspect('sales/expired-cash-sale')).exists(), false);
  assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
  assert.equal((await inspect('contracts/' + contractId)).data().paidTotal, 2);
  assert.equal((await inspect('contracts/' + rejectedContractId)).exists(), false);
  assert.equal((await inspect('payments/88888888-8888-4888-8888-888888888888')).exists(), false);
  const payment = (await inspect('payments/' + paymentId)).data();
  const closing = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [payment] });
  assert.equal((await closing.close(sessionId, 12)).status, 'closed');
  assert.equal((await inspect('payments/' + paymentId)).data().amount, 2);
});
it('Plan04 preserves old-session policy and accepts new sessions before expiry; no-advance orders do not need cash', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { openedAt: Timestamp.fromMillis(Date.now() - 12 * 3600000) }));
  await commit(payload('historical-cash-sale', 1));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 9 * 3600000) }));
  await commit(payload('valid-cash-sale', 1));
  for (const durationHours of ['10', 12, 0, null]) {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours }));
    await assertFails(commit(payload('invalid-duration-sale', 1)));
    assert.equal((await inspect('sales/invalid-duration-sale')).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 8);
  }
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 11 * 3600000) }));
  const contracts = createSparkContractsRepository(database(), { sdk, currentUser: () => ({ uid }) });
  await contracts.create({ contractId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222',
    branchId, clientName: 'Pedido sin anticipo', total: 10, subtotal: 10, deliveryCost: 0 });
  assert.equal((await inspect('contracts/11111111-1111-4111-8111-111111111111')).data().paidTotal, 0);
});
