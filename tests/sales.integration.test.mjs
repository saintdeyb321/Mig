import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, after, describe, it } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { canonicalSale, saleDay } from '../frontend/src/features/sales/domain/saleModel.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const projectId = 'demo-migapos';
const admin = initializeAdmin({ projectId }, 'financial-tests');
const database = getFirestore(admin);
const actors = {};
const time = Date.now();
const at = offset => new Date(time + offset).toISOString();
const statsId = `tenant-a_${saleDay({ createdAt: at(-600000) })}_a-1`;
const input = (overrides = {}) => canonicalSale({ localId: 'sale-main', businessId: 'tenant-a', branchId: 'a-1', userId: actors.cashier.uid,
  sessionId: 'session-a', items: [{ id: 'product-a', name: 'Pan', category: 'pan', qty: 2, price: 10, cost: 3 }],
  total: 20, payment: 'mixto', amountPaid: 20, change: 0, splitPayments: { efectivo: 8, yape: 12 },
  createdAt: at(-600000), queuedAt: at(-600000), origin: 'online', ...overrides });
const rpc = (name, data, actor = 'cashier') => httpsCallable(actors[actor].functions, name)(data).then(result => result.data);
const submit = (data = input(), actor) => rpc('submitSale', data, actor);
const cancel = (data = { saleId: 'sale-main', reason: 'Error' }, actor) => rpc('voidSale', data, actor);
const rejects = (promise, code) => assert.rejects(promise, error => error.details?.saleCode === code);

before(async () => {
  for (const label of ['cashier', 'other', 'owner']) {
    const app = initializeApp({ projectId, apiKey: 'demo-only-key' }, `test-${label}`);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const credential = await createUserWithEmailAndPassword(auth, `${label}-${crypto.randomUUID()}@example.test`, 'local-fixture-password');
    const functions = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    actors[label] = { uid: credential.user.uid, app, functions };
  }
});

async function seed() {
  // Guarded demo emulator only; no production credentials or production URLs.
  assert.equal(database.projectId, projectId);
  const response = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
  const batch = database.batch();
  const fixtures = {
    [`users/${actors.cashier.uid}`]: { businessId: 'tenant-a', branchId: 'a-1', role: 'cajero', status: 'activo', firstName: 'Ana', lastName: 'Pérez' },
    [`users/${actors.other.uid}`]: { businessId: 'tenant-b', branchId: 'b-1', role: 'cajero', status: 'activo' },
    [`users/${actors.owner.uid}`]: { businessId: 'tenant-a', role: 'dueño', status: 'activo', firstName: 'Dueño' },
    'branches/a-1': { businessId: 'tenant-a', status: 'activo' },
    'branches/a-2': { businessId: 'tenant-a', status: 'activo' },
    'branches/b-1': { businessId: 'tenant-b', status: 'activo' },
    'products/product-a': { businessId: 'tenant-a', name: 'Pan', category: 'pan', price: 10, cost: 3, stock: { 'a-1': 20, 'a-2': 30 } },
    'products/product-b': { businessId: 'tenant-b', name: 'Torta', price: 10, stock: { 'b-1': 20 } },
    'cash_sessions/session-a': { businessId: 'tenant-a', branchId: 'a-1', userId: actors.cashier.uid, status: 'open',
      openedAt: at(-1200000), financialWindow: { start: Timestamp.fromDate(new Date(at(-1200000))),
        openedAt: Timestamp.fromDate(new Date(at(-1200000))), expiresAt: Timestamp.fromDate(new Date(at(18 * 3600000))) } },
  };
  for (const [path, data] of Object.entries(fixtures)) batch.set(database.doc(path), data);
  await batch.commit();
}
beforeEach(seed);
after(async () => {
  await Promise.all(Object.values(actors).map(actor => deleteApp(actor.app)));
  await deleteAdmin(admin);
});
async function snapshot() {
  const docs = await database.getAll(...['sales/sale-main', 'products/product-a', `daily_stats/${statsId}`].map(path => database.doc(path)));
  return { sale: docs[0].data(), product: docs[1].data(), stats: docs[2].data() };
}
async function closeSession() {
  await database.doc('cash_sessions/session-a').update({ status: 'closed', closedAt: at(-300000),
    'financialWindow.closedAt': Timestamp.fromDate(new Date(at(-300000))) });
}
function queueHarness(apply = sale => submit(sale)) {
  const rows = new Map(); let online = false, clock = time;
  const identity = { uid: actors.cashier.uid, businessId: 'tenant-a', branchId: 'a-1', role: 'cajero' };
  const store = { get: async id => rows.get(id), list: async () => [...rows.values()],
    insert: async (row, check) => rows.has(row.localId) ? check(rows.get(row.localId)) : rows.set(row.localId, row),
    update: async (id, changes) => Object.assign(rows.get(id), changes) };
  const queue = createSaleQueue({ store, encrypt, decrypt, apply, online: () => online,
    now: () => clock, syncSessions: async () => {}, withLock: callback => callback() });
  return { queue, rows, store, identity, reconnect: () => { online = true; }, advance: () => { clock += 10000; } };
}

describe('Financial callables through Functions/Auth/Firestore emulators', () => {
  it('valid online sale applies stock, mixed stats, costs and timestamps atomically once', async () => {
    assert.equal((await submit()).status, 'APPLIED');
    const saved = await snapshot();
    assert.deepEqual(saved.product.stock, { 'a-1': 18, 'a-2': 30 });
    assert.equal(saved.sale.totalCost, 6); assert.equal(saved.sale.grossProfit, 14);
    assert.equal(saved.sale.saleId, saved.sale.localId); assert.equal(saved.sale.saleId, saved.sale.idempotencyKey);
    for (const field of ['createdAt', 'queuedAt', 'syncedAt']) assert.ok(saved.sale[field] instanceof Timestamp);
    assert.equal(saved.stats.totalOrders, 1); assert.equal(saved.stats.totalRevenue, 20);
    assert.equal(saved.stats['paymentMethods.efectivo'], 8); assert.equal(saved.stats['paymentMethods.yape'], 12);
    assert.equal(saved.stats['paymentMethods.mixto'], undefined);
    assert.equal(saved.sale.stockVersions['product-a'], 1);
  });
  it('concurrent attempts and retries, even after closure, never repeat stock or stats', async () => {
    const results = await Promise.all([submit(), submit()]);
    assert.deepEqual(results.map(result => result.status).sort(), ['ALREADY_APPLIED', 'APPLIED']);
    const saved = await snapshot(); await closeSession();
    assert.equal((await submit()).status, 'ALREADY_APPLIED');
    assert.deepEqual(await snapshot(), saved);
  });
  it('same ID with different financial content or queue dates conflicts', async () => {
    await submit(); const saved = await snapshot();
    await rejects(submit(input({ payment: 'yape', splitPayments: undefined })), 'sale-conflict');
    await rejects(submit(input({ queuedAt: at(-599000) })), 'sale-conflict');
    assert.deepEqual(await snapshot(), saved);
  });
  it('stock shortage and concurrent competing sales reject without partial writes', async () => {
    const large = input({ items: [{ ...input().items[0], qty: 21 }], total: 210, amountPaid: 210, splitPayments: { efectivo: 210, yape: 0 } });
    await rejects(submit(large), 'insufficient-stock');
    assert.equal((await snapshot()).sale, undefined);
    const first = input({ items: [{ ...input().items[0], qty: 11 }], total: 110, amountPaid: 110, splitPayments: { efectivo: 110, yape: 0 } });
    const second = { ...first, saleId: 'other-sale', localId: 'other-sale', idempotencyKey: 'other-sale' };
    const results = await Promise.allSettled([submit(first), submit(second)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await snapshot()).product.stock['a-1'], 9);
  });
  it('forged tenant, branch, userId and client role cannot authorize a sale', async () => {
    await rejects(submit(input({ businessId: 'tenant-b' })), 'identity-mismatch');
    await rejects(submit(input({ branchId: 'a-2' })), 'permission-denied');
    await rejects(submit(input({ branchId: 'b-1' })), 'permission-denied');
    await rejects(submit(input({ userId: actors.owner.uid })), 'identity-mismatch');
    await rejects(submit({ ...input({ branchId: 'a-2' }), role: 'superadmin' }), 'permission-denied');
    assert.equal((await snapshot()).sale, undefined); assert.equal((await snapshot()).product.stock['a-1'], 20);
  });
  it('profile suspension and missing authentication revoke callable authority', async () => {
    await database.doc(`users/${actors.cashier.uid}`).update({ status: 'inactivo' });
    await rejects(submit(), 'permission-denied');
    const result = await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/submitSale`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: input() }),
    });
    assert.equal((await result.json()).error.status, 'UNAUTHENTICATED');
  });
  it('catalog cost, cashier name and role come from the server', async () => {
    const forged = input({ cashierName: 'Administrator', items: [{ ...input().items[0], cost: 0 }] });
    await submit({ ...forged, role: 'superadmin', totalCost: 0 });
    const saved = await snapshot(); assert.equal(saved.sale.cashierName, 'Ana Pérez'); assert.equal(saved.sale.totalCost, 6);
    assert.equal((await submit({ ...forged, role: 'superadmin', totalCost: 0 })).status, 'ALREADY_APPLIED');
  });
  it('closed online session rejects a new ticket', async () => {
    await closeSession(); await rejects(submit(), 'closed-session'); assert.equal((await snapshot()).sale, undefined);
  });
  it('offline ticket queued inside a subsequently closed session remains valid on reconnect', async () => {
    const h = queueHarness(); await h.queue.submit(input({ origin: 'offline' }), h.identity);
    assert.equal(h.rows.get('sale-main').status, 'pending'); assert.equal((await snapshot()).sale, undefined);
    await closeSession(); h.reconnect(); await h.queue.flush(h.identity);
    assert.equal(h.rows.get('sale-main').status, 'synced'); assert.equal((await snapshot()).stats.totalOrders, 1);
  });
  it('offline creation after closing, queue rewriting and unverified old windows reject', async () => {
    await closeSession();
    await rejects(submit(input({ origin: 'offline', createdAt: at(-200000), queuedAt: at(-200000) })), 'invalid-session');
    await rejects(submit(input({ origin: 'offline', queuedAt: at(-200000) })), 'invalid-session');
    await database.doc('cash_sessions/session-a').update({ financialWindow: null });
    await rejects(submit(input({ origin: 'offline' })), 'unverified-session');
  });
  it('lost local acknowledgement retries the same ID once', async () => {
    const h = queueHarness(); h.reconnect(); const original = h.store.update; let fail = true;
    h.store.update = async (id, changes) => {
      if (changes.status === 'synced' && fail) { fail = false; throw new Error('local acknowledgement lost'); }
      return original(id, changes);
    };
    await h.queue.submit(input(), h.identity); const saved = await snapshot();
    assert.equal(h.rows.get('sale-main').status, 'pending'); h.advance(); await h.queue.flush(h.identity);
    assert.equal(h.rows.get('sale-main').status, 'synced'); assert.deepEqual(await snapshot(), saved);
    assert.equal((await submit()).status, 'ALREADY_APPLIED');
  });
  it('lost callable response retries the committed receipt after session closure', async () => {
    let drop = true;
    const h = queueHarness(async sale => {
      const result = await submit(sale);
      if (drop) { drop = false; throw Object.assign(new Error('network acknowledgement lost'), { code: 'unavailable' }); }
      return result;
    });
    h.reconnect(); await h.queue.submit(input(), h.identity);
    const saved = await snapshot(); await closeSession(); h.advance(); await h.queue.flush(h.identity);
    assert.equal(h.rows.get('sale-main').status, 'synced'); assert.deepEqual(await snapshot(), saved);
  });
  it('receipt-only retry acknowledges existing legacy data but can never create a sale', async () => {
    await rejects(submit({ ...input(), receiptOnly: true }), 'pending-session');
    assert.equal((await snapshot()).sale, undefined);
    const legacy = input(); delete legacy.origin; delete legacy.queuedAt;
    await database.doc('sales/sale-main').set({ ...legacy, createdAt: Timestamp.fromDate(new Date(legacy.createdAt)), voided: false });
    await database.doc('cash_sessions/session-a').delete();
    assert.equal((await submit({ ...input(), receiptOnly: true })).status, 'ALREADY_APPLIED');
    assert.equal((await snapshot()).product.stock['a-1'], 20); assert.equal((await snapshot()).stats, undefined);
  });
  it('valid concurrent/repeated void restores stock and aggregates exactly once', async () => {
    await submit(); const results = await Promise.all([cancel(), cancel()]);
    assert.deepEqual(results.map(result => result.status).sort(), ['ALREADY_VOIDED', 'VOIDED']);
    const saved = await snapshot(); assert.equal(saved.sale.voidedByUid, actors.cashier.uid);
    assert.equal(saved.sale.voidedByName, 'Ana Pérez'); assert.equal(saved.sale.voidedByRole, 'cajero');
    assert.deepEqual(saved.product.stock, { 'a-1': 20, 'a-2': 30 });
    for (const key of ['totalRevenue', 'totalOrders', 'totalCost', 'grossProfit', 'paymentMethods.efectivo', 'paymentMethods.yape']) assert.equal(saved.stats[key], 0);
    assert.equal(saved.stats.voidedOrders, 1); assert.equal((await cancel()).status, 'ALREADY_VOIDED');
    assert.deepEqual(await snapshot(), saved);
    assert.equal((await database.collection('alerts').get()).size, 1);
    assert.equal((await database.doc('alerts/VOIDED_SALE_sale-main').get()).data().userId, actors.cashier.uid);
  });
  it('void refuses forged items/total/audit authority, wrong tenant and wrong branch', async () => {
    await submit();
    await rejects(cancel({ saleId: 'sale-main', reason: 'Error', total: 1, items: [], voidedByRole: 'superadmin' }), 'invalid-sale');
    await rejects(cancel(undefined, 'other'), 'permission-denied');
    await database.doc(`users/${actors.cashier.uid}`).update({ branchId: 'a-2' });
    await rejects(cancel(), 'permission-denied');
    assert.equal((await snapshot()).sale.voided, false);
  });
  it('legacy nested aggregates fold into the existing dotted schema once', async () => {
    await database.doc(`daily_stats/${statsId}`).set({ businessId: 'tenant-a', branchId: 'a-1', totalRevenue: 10, totalOrders: 1,
      paymentMethods: { efectivo: 4, yape: 6 }, categorySales: { pan: 10 }, productSales: { 'product-a': { name: 'Pan', qty: 1, revenue: 10 } } });
    await submit(); const stats = (await snapshot()).stats;
    assert.equal(stats['paymentMethods.efectivo'], 12); assert.equal(stats['paymentMethods.yape'], 18);
    assert.equal(stats['categorySales.pan'], 30); assert.equal(stats['productSales.product-a.qty'], 3); assert.equal(stats.paymentMethods, undefined);
  });
  it('an existing aggregate belonging to another tenant or branch aborts every financial write', async () => {
    const forged = { businessId: 'tenant-b', branchId: 'b-1', totalOrders: 99 };
    await database.doc(`daily_stats/${statsId}`).set(forged);
    await rejects(submit(), 'invalid-stats');
    const saved = await snapshot(); assert.equal(saved.sale, undefined); assert.equal(saved.product.stock['a-1'], 20);
    assert.deepEqual(saved.stats, forged);
  });
  it('voiding a historical receipt still works after its physical branch is deactivated', async () => {
    await submit(); await database.doc('branches/a-1').update({ status: 'inactivo' });
    await cancel(); assert.equal((await snapshot()).product.stock['a-1'], 20);
  });
  it('30 products still apply and void in one backend transaction', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ id: `line-${index}`, name: 'Pan', qty: 1, price: 1, cost: 0.25 }));
    const batch = database.batch();
    for (const item of items) batch.set(database.doc(`products/${item.id}`), { businessId: 'tenant-a', name: 'Pan', price: 1, cost: 0.25, stock: { 'a-1': 10 } });
    await batch.commit();
    await submit(input({ items, total: 30, amountPaid: 30, splitPayments: { efectivo: 10, yape: 20 } }));
    await cancel(); assert.equal((await snapshot()).stats.totalOrders, 0);
    for (const item of items) assert.equal((await database.doc(`products/${item.id}`).get()).data().stock['a-1'], 10);
  });
  it('different product quantities/costs keep branch maps and reversal values aligned', async () => {
    await database.doc('products/product-c').set({ businessId: 'tenant-a', name: 'Torta', category: 'pastelería',
      price: 20, cost: 4, stock: { 'a-1': 7, 'a-2': 3 } });
    const ticket = input({ items: [...input().items, { id: 'product-c', name: 'Torta', qty: 1, price: 20, cost: 4 }],
      total: 40, amountPaid: 40, splitPayments: { efectivo: 8, yape: 32 } });
    await submit(ticket);
    assert.equal((await snapshot()).sale.totalCost, 10); assert.equal((await snapshot()).sale.grossProfit, 30);
    assert.deepEqual((await database.doc('products/product-c').get()).data().stock, { 'a-1': 6, 'a-2': 3 });
    await cancel(); assert.deepEqual((await database.doc('products/product-c').get()).data().stock, { 'a-1': 7, 'a-2': 3 });
    assert.equal((await snapshot()).stats.totalCost, 0); assert.equal((await snapshot()).product.stock['a-1'], 20);
  });
  it('server session open/close is immutable, scoped and retryable', async () => {
    const payload = { action: 'open', sessionId: 'new-session', branchId: 'a-1', session: { openingAmount: 10, openedAt: at(-9999999), userId: actors.other.uid } };
    const session = await rpc('saveCashSession', payload);
    assert.equal(session.userId, actors.cashier.uid); assert.ok(new Date(session.openedAt).getTime() >= time);
    assert.equal((await rpc('saveCashSession', payload)).openedAt, session.openedAt);
    await submit(input({ sessionId: session.id, createdAt: new Date().toISOString(), queuedAt: new Date().toISOString() }));
    const closed = await rpc('saveCashSession', { action: 'close', sessionId: session.id, branchId: 'a-1', session: { status: 'closed' } });
    assert.ok(closed.financialWindow.closedAt);
    await rejects(rpc('saveCashSession', payload), 'closed-session');
    await rejects(rpc('saveCashSession', { ...payload, sessionId: 'foreign', branchId: 'b-1' }), 'permission-denied');
  });
  it('previously authorized offline opening/closure keeps the protected bounded window', async () => {
    const reserved = await rpc('saveCashSession', { action: 'reserve', sessionId: 'reserved', branchId: 'a-1' });
    const openedAt = new Date().toISOString();
    const opened = await rpc('saveCashSession', { action: 'open', sessionId: reserved.id, branchId: 'a-1', offline: true,
      session: { openedAt, openingAmount: 0, financialWindow: { start: at(-99999999), expiresAt: at(999999999) } } });
    assert.equal(opened.financialWindow.start, reserved.financialWindow.start);
    const ticket = input({ origin: 'offline', sessionId: reserved.id, createdAt: new Date().toISOString(), queuedAt: new Date().toISOString() });
    await rpc('saveCashSession', { action: 'close', sessionId: reserved.id, branchId: 'a-1', offline: true,
      session: { status: 'closed', closedAt: new Date().toISOString() } });
    await submit(ticket); assert.equal((await database.doc(`daily_stats/tenant-a_${saleDay(ticket)}_a-1`).get()).data().totalOrders, 1);
    await rejects(rpc('saveCashSession', { action: 'open', sessionId: 'unreserved', branchId: 'a-1', offline: true,
      session: { openedAt, openingAmount: 0 } }), 'unverified-session');
  });
});
