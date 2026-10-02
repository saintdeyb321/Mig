import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { canonicalSale } from '../frontend/src/features/sales/domain/saleModel.js';
import { applySaleOnce, voidSaleOnce } from '../frontend/src/features/sales/application/saleEngine.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { firestoreSalePort } from '../frontend/src/features/sales/infrastructure/firestoreSalePort.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
const projectId = 'demo-migapos';
sdk.setLogLevel('silent');
let env;
const identity = { uid: 'cashier-a', businessId: 'tenant-a', role: 'cajero', branchId: 'a-1' };
const input = (overrides = {}) => ({ localId: 'sale-main', businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a',
  sessionId: 'session-a', items: [{ id: 'product-a', name: 'Pan', category: 'pan', qty: 2, price: 10, cost: 3 }],
  total: 20, payment: 'mixto', amountPaid: 20, change: 0, splitPayments: { efectivo: 8, yape: 12 },
  createdAt: '2026-10-02T12:00:00.000Z', ...overrides });
const statsId = 'tenant-a_2026-10-02_a-1';
const db = uid => env.authenticatedContext(uid).firestore();
const port = () => firestoreSalePort(db('cashier-a'), sdk);
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore(); const batch = sdk.writeBatch(database);
    const fixtures = {
      'users/cashier-a': { ...identity, role: 'cajero', status: 'activo' },
      'users/cashier-b': { businessId: 'tenant-b', branchId: 'b-1', role: 'cajero', status: 'activo' },
      'users/owner-a': { businessId: 'tenant-a', role: 'dueño', status: 'activo' },
      'branches/a-1': { businessId: 'tenant-a', status: 'activo' },
      'branches/a-2': { businessId: 'tenant-a', status: 'activo' },
      'branches/b-1': { businessId: 'tenant-b', status: 'activo' },
      'products/product-a': { businessId: 'tenant-a', name: 'Pan', price: 10, cost: 3, stock: { 'a-1': 20, 'a-2': 30 } },
      'products/product-b': { businessId: 'tenant-b', name: 'Torta', price: 10, stock: { 'b-1': 20 } },
      'cash_sessions/session-a': { businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a', status: 'open' },
    };
    for (const [path, data] of Object.entries(fixtures)) batch.set(sdk.doc(database, path), data);
    await batch.commit();
  });
}
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(seed);
after(async () => { if (env) await env.cleanup(); });

async function snapshot() {
  const database = db('owner-a');
  const [sale, product, stats] = await Promise.all(['sales/sale-main', 'products/product-a', `daily_stats/${statsId}`]
    .map(path => sdk.getDoc(sdk.doc(database, path))));
  return { sale: sale.data(), product: product.data(), stats: stats.data() };
}
function queueHarness(remotePort = port()) {
  const rows = new Map(); let online = true; let time = 1000000;
  const store = { get: async id => rows.get(id), list: async () => [...rows.values()],
    insert: async (record, check) => rows.has(record.localId) ? check(rows.get(record.localId)) : rows.set(record.localId, record),
    update: async (id, data) => Object.assign(rows.get(id), data) };
  const queue = createSaleQueue({ store, encrypt, decrypt, apply: (sale, user) => applySaleOnce(sale, user, remotePort),
    syncSessions: async () => {}, online: () => online, withLock: callback => callback(), now: () => time });
  return { queue, store, rows, setOnline: value => { online = value; }, advance: ms => { time += ms; } };
}
const audit = { voidReason: 'Error', voidedByName: 'Cajera', voidedByRole: 'cajero' };

describe('Phase 4 real Firestore transactions', () => {
  it('T5/T6 sale writes only branch A and all canonical financial fields', async () => {
    const h = queueHarness(); const sale = canonicalSale(input());
    const result = await h.queue.submit(sale, identity); assert.equal(result.isOffline, false);
    const saved = await snapshot();
    assert.deepEqual(saved.product.stock, { 'a-1': 18, 'a-2': 30 });
    assert.equal(saved.sale.saleId, sale.saleId); assert.equal(saved.sale.idempotencyKey, sale.saleId);
    assert.equal(saved.sale.totalCost, 6); assert.equal(saved.sale.grossProfit, 14); assert.ok(saved.sale.createdAt instanceof sdk.Timestamp);
    assert.equal(saved.stats.totalRevenue, 20); assert.equal(saved.stats.totalOrders, 1);
    assert.equal(saved.stats['categorySales.pan'], 20); assert.equal(saved.stats['productSales.product-a.qty'], 2);
  });
  it('T7/T8/T12/T13 identical offline/reconnect and online inputs produce identical documents', async () => {
    const sale = canonicalSale(input()); const online = queueHarness(); await online.queue.submit(sale, identity);
    const expected = await snapshot(); await seed();
    const offline = queueHarness(); offline.setOnline(false);
    assert.equal((await offline.queue.submit(sale, identity)).isOffline, true);
    assert.equal((await sdk.getDoc(sdk.doc(db('cashier-a'), 'sales', sale.saleId))).exists(), false);
    offline.setOnline(true); await offline.queue.flush(identity);
    assert.deepEqual(await snapshot(), expected);
    assert.equal(expected.stats['paymentMethods.efectivo'], 8); assert.equal(expected.stats['paymentMethods.yape'], 12);
    assert.equal(expected.stats['paymentMethods.mixto'], undefined);
  });
  it('T9 repeated and concurrent same-ID attempts apply stock/stats exactly once', async () => {
    const sale = canonicalSale(input()); const adapter = port();
    const results = await Promise.all([applySaleOnce(sale, identity, adapter), applySaleOnce(sale, identity, adapter)]);
    assert.deepEqual(results.map(result => result.status).sort(), ['ALREADY_APPLIED', 'APPLIED']);
    const expected = await snapshot(); assert.equal((await applySaleOnce(sale, identity, adapter)).status, 'ALREADY_APPLIED');
    assert.deepEqual(await snapshot(), expected);
    assert.equal(expected.stats.totalOrders, 1); assert.equal(expected.product.stock['a-1'], 18);
  });
  it('same ID with a different payload conflicts without modifying any financial data', async () => {
    const sale = canonicalSale(input()); await applySaleOnce(sale, identity, port()); const expected = await snapshot();
    const different = canonicalSale(input({ payment: 'yape', splitPayments: undefined }));
    await assert.rejects(applySaleOnce(different, identity, port()), { code: 'sale-conflict' });
    assert.deepEqual(await snapshot(), expected);
  });
  it('T10 commit success/local acknowledgement failure/retry never duplicates remote effects', async () => {
    const h = queueHarness(); const update = h.store.update; let fail = true;
    h.store.update = async (id, changes) => {
      if (changes.status === 'synced' && fail) { fail = false; throw new Error('local acknowledgement failed'); }
      return update(id, changes);
    };
    await h.queue.submit(canonicalSale(input()), identity); const expected = await snapshot();
    assert.equal(h.rows.get('sale-main').status, 'pending'); h.advance(10000); await h.queue.flush(identity);
    assert.equal(h.rows.get('sale-main').status, 'synced'); assert.deepEqual(await snapshot(), expected);
  });
  it('T19/T20 concurrent and repeated voids reverse the remote receipt once and create one alert', async () => {
    await applySaleOnce(canonicalSale(input()), identity, port());
    const results = await Promise.all([voidSaleOnce('sale-main', { ...audit, total: 999, items: [] }, port()), voidSaleOnce('sale-main', audit, port())]);
    assert.deepEqual(results.map(result => result.status).sort(), ['ALREADY_VOIDED', 'VOIDED']);
    const expected = await snapshot(); assert.equal(expected.sale.voided, true);
    assert.deepEqual(expected.product.stock, { 'a-1': 20, 'a-2': 30 });
    for (const key of ['totalRevenue', 'totalCost', 'grossProfit', 'totalOrders', 'paymentMethods.efectivo', 'paymentMethods.yape', 'categorySales.pan', 'productSales.product-a.qty', 'productSales.product-a.revenue']) assert.equal(expected.stats[key], 0, key);
    assert.equal(expected.stats.voidedOrders, 1);
    assert.equal((await voidSaleOnce('sale-main', audit, port())).status, 'ALREADY_VOIDED');
    assert.deepEqual(await snapshot(), expected);
    const alerts = await sdk.getDocs(sdk.query(sdk.collection(db('owner-a'), 'alerts'), sdk.where('businessId', '==', 'tenant-a')));
    assert.equal(alerts.size, 1); assert.equal(alerts.docs[0].id, 'VOIDED_SALE_sale-main');
    assert.equal((await applySaleOnce(canonicalSale(input()), identity, port())).status, 'ALREADY_APPLIED');
    assert.deepEqual(await snapshot(), expected);
  });
  it('T23 cross-tenant receipt/product access and forged sale writes remain denied', async () => {
    await applySaleOnce(canonicalSale(input()), identity, port());
    await assertFails(sdk.getDoc(sdk.doc(db('cashier-b'), 'sales/sale-main')));
    await assertFails(sdk.getDoc(sdk.doc(db('cashier-a'), 'products/product-b')));
    const forged = canonicalSale(input({ localId: 'forged', businessId: 'tenant-b', branchId: 'b-1' }));
    await assertFails(sdk.setDoc(sdk.doc(db('cashier-a'), 'sales/forged'), { ...forged, createdAt: sdk.Timestamp.fromDate(new Date(forged.createdAt)) }));
  });
  it('T24 cashier can change only its own branch', async () => {
    await assertFails(sdk.updateDoc(sdk.doc(db('cashier-a'), 'products/product-a'), { 'stock.a-2': 29 }));
    await assertFails(sdk.updateDoc(sdk.doc(db('cashier-a'), 'products/product-a'), { stock: { 'a-1': 19, 'a-2': 29 } }));
    await assertSucceeds(sdk.updateDoc(sdk.doc(db('cashier-a'), 'products/product-a'), { 'stock.a-1': 19 }));
  });
  it('T25 overstock, concurrent competing sales and negative cashier stock are blocked', async () => {
    const oversized = canonicalSale(input({ items: [{ ...input().items[0], qty: 21 }], total: 210, amountPaid: 210, splitPayments: { efectivo: 210, yape: 0 } }));
    await assert.rejects(applySaleOnce(oversized, identity, port()), { code: 'insufficient-stock' });
    await assertFails(sdk.updateDoc(sdk.doc(db('cashier-a'), 'products/product-a'), { 'stock.a-1': -1 }));
    const first = canonicalSale(input({ items: [{ ...input().items[0], qty: 11 }], total: 110, amountPaid: 110, splitPayments: { efectivo: 110, yape: 0 } }));
    const second = canonicalSale({ ...first, saleId: 'other', localId: 'other', idempotencyKey: 'other' });
    const results = await Promise.allSettled([applySaleOnce(first, identity, port()), applySaleOnce(second, identity, port())]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'insufficient-stock');
    assert.equal((await snapshot()).product.stock['a-1'], 9);
  });
  it('Rules protect idempotency, payment metadata and receipt immutability', async () => {
    const sale = canonicalSale(input()); const data = { ...sale, createdAt: sdk.Timestamp.fromDate(new Date(sale.createdAt)) };
    for (const override of [{ idempotencyKey: 'other' }, { saleId: 'other' }, { localId: 'other' }, { version: 2 },
      { total: 0 }, { sessionId: '' }, { sessionId: 'missing-session' }, { payment: 'tarjeta' }, { amountPaid: 19 }, { splitPayments: { efectivo: 9, yape: 12 } },
      { splitPayments: { efectivo: -1, yape: 21 } }, { change: 1 }]) {
      await assertFails(sdk.setDoc(sdk.doc(db('cashier-a'), 'sales/sale-main'), { ...data, ...override }));
    }
    await applySaleOnce(sale, identity, port());
    for (const update of [{ idempotencyKey: 'other' }, { items: [] }, { total: 1 }, { amountPaid: 1 }, { totalCost: 0 }, { version: 2 }]) {
      await assertFails(sdk.updateDoc(sdk.doc(db('cashier-a'), 'sales/sale-main'), update));
    }
  });
  it('existing nested aggregates fold into the dotted schema without losing legacy revenue', async () => {
    await env.withSecurityRulesDisabled(context => sdk.setDoc(sdk.doc(context.firestore(), `daily_stats/${statsId}`), {
      businessId: 'tenant-a', branchId: 'a-1', date: '2026-10-02', totalRevenue: 10, totalOrders: 1,
      paymentMethods: { efectivo: 4, yape: 6 }, categorySales: { pan: 10 }, productSales: { 'product-a': { name: 'Pan', qty: 1, revenue: 10 } },
    }));
    await applySaleOnce(canonicalSale(input()), identity, port());
    const stats = (await snapshot()).stats;
    assert.equal(stats['paymentMethods.efectivo'], 12); assert.equal(stats['paymentMethods.yape'], 18);
    assert.equal(stats['categorySales.pan'], 30); assert.equal(stats['productSales.product-a.qty'], 3);
    assert.equal(stats.paymentMethods, undefined); assert.equal(stats.productSales, undefined);
  });
  it('more than 20 products work in the actual application and void transactions', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ id: `line-${index}`, name: 'Pan', category: 'pan', qty: 1, price: 1, cost: 0.25 }));
    await env.withSecurityRulesDisabled(async context => {
      const batch = sdk.writeBatch(context.firestore());
      for (const item of items) batch.set(sdk.doc(context.firestore(), 'products', item.id), { businessId: 'tenant-a', name: 'Pan', price: 1, stock: { 'a-1': 10 } });
      await batch.commit();
    });
    const sale = canonicalSale(input({ items, total: 30, amountPaid: 30, splitPayments: { efectivo: 10, yape: 20 } }));
    await applySaleOnce(sale, identity, port()); await voidSaleOnce(sale.saleId, audit, port());
    const stats = (await snapshot()).stats; assert.equal(stats.totalOrders, 0); assert.equal(stats.voidedOrders, 1);
  });
});
