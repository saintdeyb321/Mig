import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readTenantCache, syncTenantCache } from '../frontend/src/core/cache/tenantCache.js';
import { subscribeTenantCache } from '../frontend/src/core/cache/subscribeTenantCache.js';
import { createSubscriptionScope } from '../frontend/src/shared/utils/subscriptionScope.js';
import { getIdentityKey } from '../frontend/src/core/session/identity.js';
import { toDateSafe, toMillisSafe } from '../frontend/src/core/dates/dateValues.js';
import { getFirebaseErrorCode, isPermissionDenied } from '../frontend/src/core/errors/firebaseErrors.js';
import { getSafeStock } from '../frontend/src/features/sales/domain/cartStock.js';
import { mapDocuments } from '../frontend/src/core/firebase/documents.js';

function memoryDatabase(records) {
  const rows = new Map(records.map(row => [row.id, structuredClone(row)]));
  const table = {
    where(index) {
      assert.equal(index, 'businessId');
      return { equals(businessId) {
        const selected = () => [...rows.values()].filter(row => row.businessId === businessId);
        return {
          toArray: async () => structuredClone(selected()),
          primaryKeys: async () => selected().map(row => row.id),
        };
      } };
    },
    bulkDelete: async ids => { ids.forEach(id => rows.delete(id)); },
    bulkGet: async ids => ids.map(id => rows.get(id)),
    bulkPut: async data => { data.forEach(row => rows.set(row.id, structuredClone(row))); },
  };
  return { products: table, rows, transaction: async (_mode, _table, action) => action() };
}
const seed = [
  { id: 'a-old', businessId: 'a', name: 'A' },
  { id: 'a-kept', businessId: 'a', name: 'A2' },
  { id: 'b-kept', businessId: 'b', name: 'B' },
];
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

describe('Tenant cache isolation', () => {
  it('syncing A deletes stale A records while preserving every B record', async () => {
    const database = memoryDatabase(seed);
    await syncTenantCache(database, 'products', 'a', [{ id: 'a-kept', businessId: 'a', name: 'Updated' }]);
    assert.deepEqual([...database.rows.values()], [
      { id: 'a-kept', businessId: 'a', name: 'Updated' }, seed[2],
    ]);
  });
  it('an empty A snapshot leaves B cached and readable', async () => {
    const database = memoryDatabase(seed);
    await syncTenantCache(database, 'products', 'a', []);
    assert.deepEqual(await readTenantCache(database, 'products', 'a'), []);
    assert.deepEqual(await readTenantCache(database, 'products', 'b'), [seed[2]]);
  });
  it('foreign records and an absent tenant cannot mutate the cache', async () => {
    const database = memoryDatabase(seed);
    await assert.rejects(syncTenantCache(database, 'products', 'a', [seed[2]]));
    await assert.rejects(syncTenantCache(database, 'products', '', []));
    assert.deepEqual([...database.rows.values()], seed);
  });
  it('local reads always return only the requested tenant', async () => {
    const database = memoryDatabase(seed);
    assert.deepEqual(await readTenantCache(database, 'products', 'a'), seed.slice(0, 2));
    assert.deepEqual(await readTenantCache(database, 'products', 'missing'), []);
  });
  it('a colliding remote ID cannot overwrite another tenant cache', async () => {
    const database = memoryDatabase(seed);
    await assert.rejects(syncTenantCache(database, 'products', 'a', [
      { id: 'b-kept', businessId: 'a', name: 'Collision' },
    ]));
    assert.deepEqual([...database.rows.values()], seed);
  });
});

describe('Subscription lifecycle', () => {
  it('unsubscribing suppresses late snapshots and pending cache loads', async () => {
    const database = memoryDatabase(seed);
    const pending = deferred();
    database.products.where = () => ({ equals: () => ({ toArray: () => pending.promise }) });
    let callback, unsubscriptions = 0;
    const delivered = [];
    const stop = subscribeTenantCache(database, 'products', 'a', onData => {
      callback = onData;
      return () => { unsubscriptions++; };
    }, data => delivered.push(data), error => { throw error; });
    stop();
    pending.resolve(seed.slice(0, 2));
    await callback([{ id: 'late', businessId: 'a' }]);
    await flush();
    assert.equal(unsubscriptions, 1);
    assert.deepEqual(delivered, []);
    assert.deepEqual([...database.rows.values()], seed);
  });
  it('a late local read cannot overwrite a newer remote snapshot', async () => {
    const database = memoryDatabase(seed);
    const pending = deferred();
    const originalWhere = database.products.where;
    database.products.where = index => ({ equals: businessId => ({
      ...originalWhere(index).equals(businessId), toArray: () => pending.promise,
    }) });
    let callback;
    const delivered = [];
    const stop = subscribeTenantCache(database, 'products', 'a', onData => {
      callback = onData;
      return () => {};
    }, data => delivered.push(data), error => { throw error; });
    const remote = [{ id: 'new', businessId: 'a' }];
    await callback(remote);
    pending.resolve(seed.slice(0, 2));
    await flush();
    assert.deepEqual(delivered, [remote]);
    stop();
  });
  it('an older async projection cannot replace the newest data or cache', async () => {
    const database = memoryDatabase([seed[2]]);
    const first = deferred(), second = deferred();
    let callback;
    const delivered = [];
    const stop = subscribeTenantCache(database, 'products', 'a', onData => {
      callback = onData;
      return () => {};
    }, data => delivered.push(data), error => { throw error; }, records => records[0].id === 'old' ? first.promise : second.promise);
    const old = [{ id: 'old', businessId: 'a' }], latest = [{ id: 'latest', businessId: 'a' }];
    const firstRun = callback(old), secondRun = callback(latest);
    second.resolve(latest);
    await secondRun;
    first.resolve(old);
    await firstRun;
    assert.deepEqual(delivered, [latest]);
    assert.deepEqual(await readTenantCache(database, 'products', 'a'), latest);
    assert.deepEqual(await readTenantCache(database, 'products', 'b'), [seed[2]]);
    stop();
  });
  it('closed scopes reject callbacks and previous identity generations', () => {
    const scope = createSubscriptionScope();
    const old = scope.next(), latest = scope.next();
    assert.equal(scope.isCurrent(old), false);
    assert.equal(scope.isCurrent(latest), true);
    let count = 0;
    const notify = scope.guard(() => count++);
    notify();
    scope.close();
    notify();
    assert.equal(count, 1);
    assert.equal(scope.isCurrent(latest), false);
  });
  it('identity keys change for another UID, tenant or permission scope', () => {
    const user = { uid: 'u1', businessId: 'a', role: 'cajero', branchId: 'a1' };
    for (const patch of [{ uid: 'u2' }, { businessId: 'b' }, { role: 'dueño' }, { branchId: 'a2' }]) {
      assert.notEqual(getIdentityKey(user), getIdentityKey({ ...user, ...patch }));
    }
  });
});

describe('Shared adapters preserve supported values', () => {
  it('document IDs remain authoritative when the payload contains a different ID', () => {
    assert.deepEqual(mapDocuments({ docs: [{ id: 'actual', data: () => ({ id: 'wrong', businessId: 'a' }) }] }),
      [{ id: 'actual', businessId: 'a' }]);
  });
  it('dates accept Date, Timestamp, ISO and epoch without mutating input', () => {
    const original = new Date('2026-10-02T12:00:00Z');
    for (const value of [original, { toDate: () => original }, original.toISOString(), original.getTime()]) {
      assert.equal(toMillisSafe(value), original.getTime());
    }
    const clone = toDateSafe(original);
    clone.setUTCFullYear(2000);
    assert.equal(original.getUTCFullYear(), 2026);
  });
  it('invalid dates yield null/zero without throwing', () => {
    for (const value of [undefined, null, '', 'invalid', new Date(NaN), {}, false, Infinity, { toDate: () => { throw Error(); } }]) {
      assert.equal(toDateSafe(value), null);
      assert.equal(toMillisSafe(value), 0);
    }
  });
  it('Firebase error normalization supports plain and namespaced codes', () => {
    assert.equal(getFirebaseErrorCode({ code: 'firestore/aborted' }), 'aborted');
    assert.equal(isPermissionDenied({ code: 'permission-denied' }), true);
    assert.equal(isPermissionDenied({ code: 'firestore/permission-denied' }), true);
    assert.equal(isPermissionDenied({ code: 'unavailable' }), false);
    assert.equal(getFirebaseErrorCode(null), '');
  });
  it('POS stock interpretation preserves branch maps, rawStock and legacy global values', () => {
    const product = { stock: 9, rawStock: { a1: 2, a2: 7, a3: -1 } };
    assert.equal(getSafeStock(product, 'a1'), 2);
    assert.equal(getSafeStock(product, 'missing'), 0);
    assert.equal(getSafeStock(product, 'global'), 9);
    assert.equal(getSafeStock({ stock: 7 }, 'global'), 7);
    assert.equal(getSafeStock({ stock: 7 }, 'a1'), 0);
    assert.equal(getSafeStock(null, 'a1'), 0);
  });
});
