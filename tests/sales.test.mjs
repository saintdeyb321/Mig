import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalSale, paymentBreakdown, statsDelta, saleDay, SaleError } from '../frontend/src/features/sales/domain/saleModel.js';
import { migrateSaleRecord, migrateCachedProduct, pendingStockDeltas, decodeQueuedSale, isRetryableSaleError, SYNC_LEASE_MS } from '../frontend/src/features/sales/domain/queueState.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { mergeRecentSales } from '../frontend/src/features/sales/application/recentSales.js';
import { projectQueuedStock } from '../frontend/src/features/catalog/application/projectQueuedStock.js';
import { createQueueLock } from '../frontend/src/features/sales/infrastructure/saleQueueStore.js';
import { projectProducts } from '../frontend/src/features/catalog/application/projectProducts.js';
import { getSafeStock } from '../frontend/src/features/sales/domain/cartStock.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';

const identity = { uid: 'cashier-a', businessId: 'tenant-a', role: 'cajero', branchId: 'a-1' };
const input = (overrides = {}) => ({ localId: 'sale-1', businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a',
  sessionId: 'session-a', items: [{ id: 'product-a', name: 'Pan', category: 'pan', qty: 1, price: 10, cost: 3 }],
  total: 10, payment: 'efectivo', amountPaid: 10, change: 0, createdAt: '2026-10-02T12:00:00.000Z', ...overrides });

function memoryStore(records = []) {
  const rows = new Map(records.map(record => [record.localId, structuredClone(record)]));
  const states = [];
  return { rows, states, get: async id => structuredClone(rows.get(id)), list: async () => [...rows.values()].map(row => structuredClone(row)),
    insert: async (record, check) => {
      if (rows.has(record.localId)) return check(rows.get(record.localId));
      rows.set(record.localId, structuredClone(record)); states.push(record.status);
    },
    update: async (id, data) => { states.push(data.status); Object.assign(rows.get(id), structuredClone(data)); } };
}
function harness(options = {}) {
  let online = options.online ?? true;
  let clock = 1000000;
  const store = options.store ?? memoryStore();
  const applied = [];
  const events = [];
  const queue = createSaleQueue({ store, encrypt, decrypt, online: () => online, now: () => clock,
    currentIdentity: options.currentIdentity ?? (() => true),
    withLock: options.withLock ?? (callback => callback()), syncSessions: options.syncSessions ?? (async () => { events.push('sessions'); }),
    apply: options.apply ?? (async sale => { events.push('sale'); applied.push(sale); }) });
  return { queue, store, applied, events, goOnline: () => { online = true; }, advance: ms => { clock += ms; } };
}

describe('Phase 4 deterministic model', () => {
  it('T1 normalizes amounts, immutable identity, version, cost and profit', () => {
    const sale = canonicalSale(input({ items: [{ id: 'p', name: 'Pan', qty: 1, price: 10.123 }], total: 10.123, amountPaid: 12, change: 1.877 }), [{ id: 'p', cost: 2.125 }]);
    assert.equal(sale.saleId, sale.localId); assert.equal(sale.idempotencyKey, sale.saleId); assert.equal(sale.version, 1);
    assert.equal(sale.total, 10.12); assert.equal(sale.change, 1.88); assert.equal(sale.totalCost, 2.13); assert.equal(sale.grossProfit, 7.99);
    assert.deepEqual(canonicalSale(sale), sale);
  });
  it('T2 rejects zero, negative, fractional, nonnumeric and unsafe quantities', () => {
    for (const qty of [0, -1, 0.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => canonicalSale(input({ items: [{ ...input().items[0], qty }] })), /Cantidad/);
    }
  });
  it('T3 rejects negative, non-finite and nonnumeric prices or costs', () => {
    for (const price of [-1, NaN, Infinity, '10']) assert.throws(() => canonicalSale(input({ items: [{ ...input().items[0], price }] })));
    assert.throws(() => canonicalSale(input({ items: [{ ...input().items[0], cost: -1 }] })));
  });
  it('T4 rejects mixed payments with a wrong sum, missing or negative parts', () => {
    for (const splitPayments of [{ efectivo: 4, yape: 5 }, { efectivo: -1, yape: 11 }, { efectivo: 10 }, { efectivo: 5, yape: 5, tarjeta: 0 }]) {
      assert.throws(() => canonicalSale(input({ payment: 'mixto', splitPayments })));
    }
  });
  it('rejects invalid tenant, branch, session, duplicate IDs, totals, payment and change', () => {
    for (const override of [{ businessId: '' }, { userId: '' }, { sessionId: null }, { branchId: 'global' }, { items: [] },
      { items: [...input().items, ...input().items], total: 20, amountPaid: 20 }, { items: [{ ...input().items[0], id: 'a/b' }] },
      { total: 11 }, { total: 0 }, { payment: 'tarjeta' }, { amountPaid: 9 }, { change: 1 },
      { idempotencyKey: 'other' }, { saleId: 'other' }, { version: 2 }, { createdAt: 'bad-date' }]) {
      assert.throws(() => canonicalSale(input(override)));
    }
  });
  it('T12 mixed breakdown and stats have only efectivo/yape', () => {
    const sale = canonicalSale(input({ payment: 'mixto', splitPayments: { efectivo: 4, yape: 6 } }));
    assert.deepEqual(paymentBreakdown(sale), { efectivo: 4, yape: 6 });
    const stats = statsDelta(sale);
    assert.equal(stats['paymentMethods.efectivo'], 4); assert.equal(stats['paymentMethods.yape'], 6);
    assert.equal(stats['paymentMethods.mixto'], undefined);
  });
  it('uses the Peru business day across UTC midnight', () => {
    assert.equal(saleDay(input({ createdAt: '2026-10-03T02:00:00.000Z' })), '2026-10-02');
    const legacy = input({ createdAt: undefined, date: '2026-10-02T12:00:00.000Z' });
    assert.equal(canonicalSale(legacy).createdAt, '2026-10-02T12:00:00.000Z');
  });
  it('T14 pending deltas are isolated by tenant, product and branch', () => {
    const deltas = pendingStockDeltas([input(), input({ branchId: 'a-2', items: [{ ...input().items[0], qty: 2 }] }), input({ businessId: 'tenant-b' })], 'tenant-a');
    assert.deepEqual(deltas, { 'product-a': { 'a-1': 1, 'a-2': 2 } });
    const raw = { id: 'product-a', name: 'Pan', businessId: 'tenant-a', stock: { 'a-1': 10, 'a-2': 20 } };
    const projected = projectProducts([raw], deltas)[0];
    assert.equal(getSafeStock(projected, 'a-1'), 9); assert.equal(getSafeStock(projected, 'a-2'), 18);
    assert.equal(getSafeStock(projected, 'global'), 27); assert.deepEqual(raw.stock, { 'a-1': 10, 'a-2': 20 });
    assert.deepEqual(projectProducts([raw], deltas), projectProducts([raw], deltas));
  });
  it('stock never doubles a debit while acknowledgement and snapshots arrive in either order', () => {
    const sale = { ...canonicalSale(input()), queueStatus: 'pending', attempted: true,
      projectionBase: { 'product-a': { stock: 10, version: 0 } } };
    const old = { id: 'product-a', name: 'Pan', stock: { 'a-1': 10, 'a-2': 20 }, posStockVersion: { 'a-1': 0 } };
    const committed = { ...old, stock: { 'a-1': 9, 'a-2': 20 }, posStockVersion: { 'a-1': 1 } };
    const project = (raw, queued) => projectQueuedStock([raw], [queued], 'tenant-a');
    assert.equal(getSafeStock(project(old, sale).products[0], 'a-1'), 9);
    assert.equal(getSafeStock(project(committed, sale).products[0], 'a-1'), 9);
    const ack = { ...sale, queueStatus: 'synced', financialAck: true, stockVersions: { 'product-a': 1 } };
    assert.equal(getSafeStock(project(old, ack).products[0], 'a-1'), 9);
    assert.deepEqual(project(old, ack).settled, []);
    assert.equal(getSafeStock(project(committed, ack).products[0], 'a-1'), 9);
    assert.deepEqual(project(committed, ack).settled, [sale.saleId]);
    assert.deepEqual(project(committed, ack).products[0].remoteStock, committed.stock);
    assert.equal(getSafeStock(project(committed, { ...sale, queueStatus: 'failed' }).products[0], 'a-1'), 9);
  });
  it('multiple queued tickets retain prior acknowledged debits until a later ambiguous attempt resolves', () => {
    const raw = { id: 'product-a', name: 'Pan', stock: { 'a-1': 8 }, posStockVersion: { 'a-1': 2 } };
    const first = { ...canonicalSale(input()), queueStatus: 'synced', financialAck: true, stockVersions: { 'product-a': 1 } };
    const second = { ...canonicalSale(input({ localId: 'sale-2' })), queueStatus: 'pending', attempted: true,
      projectionBase: { 'product-a': { stock: 10, version: 0 } } };
    const before = projectQueuedStock([raw], [first, second], 'tenant-a');
    assert.equal(getSafeStock(before.products[0], 'a-1'), 8); assert.deepEqual(before.settled, []);
    const after = projectQueuedStock([raw], [first, { ...second, queueStatus: 'synced', financialAck: true, stockVersions: { 'product-a': 2 } }], 'tenant-a');
    assert.equal(getSafeStock(after.products[0], 'a-1'), 8); assert.deepEqual(after.settled, ['sale-1', 'sale-2']);
  });
  it('T21 remote receipt replaces the same local identity in history', () => {
    const local = { ...input(), id: 'sale-1', isOffline: true };
    const remote = { ...local, isOffline: false, voided: true };
    assert.deepEqual(mergeRecentSales([local], [remote]), [remote]);
  });
  it('T22 v2 migration preserves all ciphertext, IDs and legacy state', () => {
    for (const [sync, status] of [[false, 'pending'], [true, 'synced'], ['failed', 'failed']]) {
      const old = { localId: 'legacy-id', data: 'ciphertext-unchanged', sync, retries: 4, error: 'old-error', createdAt: new Date(0) };
      const migrated = migrateSaleRecord(old);
      assert.equal(migrated.localId, old.localId); assert.equal(migrated.data, old.data);
      assert.equal(migrated.status, status); assert.equal(migrated.retries, 4); assert.equal(migrated.lastError, 'old-error');
      assert.deepEqual(migrateSaleRecord(migrated), migrated); assert.deepEqual(migrated.createdAt, old.createdAt);
    }
    assert.deepEqual(migrateCachedProduct({ id: 'p', stock: 5, rawStock: { 'a-1': 10 } }), { id: 'p', stock: { 'a-1': 10 } });
  });
});

describe('Phase 4 durable queue', () => {
  it('T6 online submission persists first, then syncing/synced, sessions first', async () => {
    const h = harness(); const result = await h.queue.submit(canonicalSale(input()), identity);
    assert.equal(result.isOffline, false); assert.deepEqual(h.store.states, ['pending', 'syncing', 'synced']);
    assert.deepEqual(h.events, ['sessions', 'sale']); assert.equal(h.applied[0].saleId, 'sale-1');
  });
  it('T7 queues offline with the exact payload and identity metadata', async () => {
    const h = harness({ online: false }); const sale = canonicalSale(input());
    const result = await h.queue.submit(sale, identity); assert.equal(result.isOffline, true); assert.equal(h.applied.length, 0);
    const row = await h.store.get(sale.saleId);
    assert.equal(row.status, 'pending'); assert.equal(row.businessId, sale.businessId); assert.equal(row.branchId, sale.branchId); assert.equal(row.userId, sale.userId);
    assert.deepEqual(JSON.parse(await decrypt(row.data, identity.uid)), sale);
  });
  it('T8 reconnect uses the queued ID and payload', async () => {
    const h = harness({ online: false }); const sale = canonicalSale(input());
    await h.queue.submit(sale, identity); h.goOnline(); await h.queue.flush(identity);
    assert.deepEqual(h.applied, [sale]); assert.equal((await h.store.get(sale.saleId)).status, 'synced');
  });
  it('queue identity cannot be overwritten or reused with a changed payload', async () => {
    const h = harness({ online: false }); const sale = canonicalSale(input());
    await h.queue.enqueue(sale, identity); await h.queue.enqueue(sale, identity);
    await assert.rejects(h.queue.enqueue(canonicalSale(input({ payment: 'yape' })), identity), { code: 'sale-conflict' });
    assert.equal(h.store.rows.size, 1);
  });
  it('T10 a failed local acknowledgement retains the same operation for retry', async () => {
    const store = memoryStore(); const update = store.update; let failOnce = true;
    store.update = async (id, changes) => {
      if (changes.status === 'synced' && failOnce) { failOnce = false; throw new Error('IndexedDB acknowledgement failed'); }
      return update(id, changes);
    };
    const ids = [];
    const h = harness({ store, apply: async sale => { ids.push(sale.saleId); } });
    await h.queue.submit(canonicalSale(input()), identity);
    assert.equal((await store.get('sale-1')).status, 'pending');
    h.advance(10000); await h.queue.flush(identity);
    assert.deepEqual(ids, ['sale-1', 'sale-1']); assert.equal((await store.get('sale-1')).status, 'synced');
  });
  it('T11 recovers stale syncing records after a crash', async () => {
    const h = harness(); const sale = canonicalSale(input()); await h.queue.enqueue(sale, identity);
    await h.store.update(sale.saleId, { status: 'syncing', syncStartedAt: 1000000 });
    await h.queue.flush(identity); assert.equal(h.applied.length, 0);
    h.advance(SYNC_LEASE_MS + 1); await h.queue.flush(identity); assert.deepEqual(h.applied, [sale]);
  });
  it('T15 decryption awaits AES with the recorded UID; wrong UID fails', async () => {
    const data = await encrypt(JSON.stringify(input()), identity.uid);
    await assert.rejects(decrypt(data, 'wrong-uid'));
    const decoded = await decodeQueuedSale({ data, localId: 'sale-1', userId: identity.uid, businessId: identity.businessId }, identity, decrypt);
    assert.equal(decoded.userId, identity.uid);
  });
  it('T16 other users/tenants and unclaimed legacy ciphertext never synchronize', async () => {
    const records = [];
    for (const payload of [input({ userId: 'other-user' }), input({ businessId: 'tenant-b' })]) {
      records.push(migrateSaleRecord({ localId: payload.localId + records.length, data: await encrypt(JSON.stringify(payload), payload.userId), sync: false }));
    }
    records.push({ ...migrateSaleRecord({ localId: 'foreign', sync: false }), userId: 'other-user', businessId: 'tenant-b', data: 'unreadable' });
    const h = harness({ store: memoryStore(records) }); await h.queue.flush(identity); assert.equal(h.applied.length, 0);
    assert.equal([...h.store.rows.values()].every(record => record.status === 'pending'), true);
    await assert.rejects(h.queue.enqueue(canonicalSale(input({ businessId: 'tenant-b' })), identity), { code: 'identity-mismatch' });
  });
  it('T17 network errors remain retryable beyond three retries with backoff', async () => {
    const h = harness({ apply: async () => { throw Object.assign(new Error('temporary outage'), { code: 'firestore/unavailable' }); } });
    await h.queue.enqueue(canonicalSale(input()), identity);
    for (let i = 0; i < 5; i++) { h.advance(70000); await h.queue.flush(identity); }
    const row = await h.store.get('sale-1'); assert.equal(row.status, 'pending'); assert.equal(row.retries, 5); assert.equal(row.nextRetryAt > 0, true);
    await h.queue.flush(identity); assert.equal((await h.store.get('sale-1')).retries, 5);
    for (const code of ['unavailable', 'deadline-exceeded', 'timeout', 'network-request-failed', 'aborted']) assert.equal(isRetryableSaleError({ code }), true);
  });
  it('T18 invalid durable payload or insufficient stock become failed without deleting data', async () => {
    const bad = input({ items: [{ ...input().items[0], qty: 0 }] });
    const store = memoryStore([{ ...migrateSaleRecord({ localId: bad.localId, sync: false }), userId: identity.uid, businessId: identity.businessId,
      data: await encrypt(JSON.stringify(bad), identity.uid) }]);
    const h = harness({ store }); await h.queue.flush(identity);
    assert.equal((await store.get(bad.localId)).status, 'failed'); assert.equal(h.applied.length, 0); assert.ok((await store.get(bad.localId)).data);
    const stock = harness({ apply: async () => { throw new SaleError('insufficient-stock', 'Sin stock'); } });
    await assert.rejects(stock.queue.submit(canonicalSale(input()), identity), /Sin stock/);
    assert.equal((await stock.store.get('sale-1')).status, 'failed');
  });
  it('claims a valid legacy record only after confirming its encrypted identity', async () => {
    const sale = input(); const store = memoryStore([migrateSaleRecord({ localId: sale.localId, sync: false, data: await encrypt(JSON.stringify(sale), identity.uid) })]);
    const h = harness({ store }); await h.queue.flush(identity);
    assert.equal(h.applied.length, 1); const row = await store.get(sale.localId);
    assert.equal(row.userId, identity.uid); assert.equal(row.businessId, identity.businessId); assert.equal(row.status, 'synced');
  });
  it('a failed cash-session sync delays its sales without blocking other sessions', async () => {
    const h = harness({ syncSessions: async () => new Set(['session-a']) });
    await h.queue.enqueue(canonicalSale(input()), identity);
    await h.queue.enqueue(canonicalSale(input({ localId: 'sale-2', sessionId: 'session-ready' })), identity);
    await h.queue.flush(identity);
    assert.deepEqual(h.applied.map(sale => sale.saleId), ['sale-2']);
    assert.equal((await h.store.get('sale-1')).status, 'pending');
  });
  it('a session identity change prevents an old flush from applying more sales', async () => {
    const h = harness({ currentIdentity: () => false });
    await h.queue.enqueue(canonicalSale(input()), identity); await h.queue.flush(identity);
    assert.equal(h.applied.length, 0); assert.equal((await h.store.get('sale-1')).status, 'pending');
    let active = true;
    const delayed = harness({ currentIdentity: () => active, withLock: callback => { active = false; return callback(); } });
    await delayed.queue.enqueue(canonicalSale(input()), identity); await delayed.queue.flush(identity);
    assert.deepEqual(delayed.events, []); assert.equal(delayed.applied.length, 0);
  });
});

it('F4-15 separate queue instances share an atomic local lease', async () => {
  const rows = new Map(); let chain = Promise.resolve();
  const settings = { get: async id => structuredClone(rows.get(id)), put: async row => rows.set(row.id, structuredClone(row)),
    update: async (id, changes) => Object.assign(rows.get(id), changes), delete: async id => rows.delete(id) };
  const database = { settings, transaction: (_mode, _table, callback) => {
    const next = chain.then(callback); chain = next.catch(() => {}); return next;
  } };
  const first = createQueueLock(database, null); const second = createQueueLock(database, null);
  let release; const barrier = new Promise(resolve => { release = resolve; });
  let entered = 0; const running = first(async () => { entered++; await barrier; });
  await new Promise(resolve => setTimeout(resolve, 10));
  const blocked = await second(async () => { entered++; });
  assert.equal(blocked.pending, true); assert.equal(entered, 1);
  release(); await running; await second(async () => { entered++; }); assert.equal(entered, 2); assert.equal(rows.size, 0);
});
