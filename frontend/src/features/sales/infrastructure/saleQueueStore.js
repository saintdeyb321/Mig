import { SYNC_LEASE_MS } from '../domain/queueState.js';

export function dexieSaleStore(database) {
  return {
    get: id => database.sales.get(id),
    list: () => database.sales.where('status').anyOf('pending', 'syncing').toArray(),
    update: (id, changes) => database.sales.update(id, changes),
    insert: async (record, checkExisting) => {
      // Encryption must finish outside IDB transactions, which auto-close across unrelated awaits.
      const existing = await database.sales.get(record.localId);
      if (existing) { await checkExisting(existing); return; }
      try { await database.sales.add(record); }
      catch (error) {
        if (error.name !== 'ConstraintError') throw error;
        await checkExisting(await database.sales.get(record.localId));
      }
    },
  };
}

export function createQueueLock(database, lockManager = globalThis.navigator?.locks) {
  let tail = Promise.resolve();
  async function lease(callback) {
    const id = 'migapos:sales-flush-lease';
    const owner = crypto.randomUUID();
    const acquired = await database.transaction('rw', database.settings, async () => {
      const existing = await database.settings.get(id);
      if (existing?.expiresAt > Date.now()) return false;
      await database.settings.put({ id, owner, expiresAt: Date.now() + SYNC_LEASE_MS });
      return true;
    });
    if (!acquired) return { pending: true };
    const renew = setInterval(() => database.transaction('rw', database.settings, async () => {
      const existing = await database.settings.get(id);
      if (existing?.owner === owner) await database.settings.update(id, { expiresAt: Date.now() + SYNC_LEASE_MS });
    }).catch(error => console.warn('Error renovando lease de ventas:', error)), 30000);
    try { return await callback(); }
    finally {
      clearInterval(renew);
      await database.transaction('rw', database.settings, async () => {
        if ((await database.settings.get(id))?.owner === owner) await database.settings.delete(id);
      });
    }
  }
  return callback => {
    const run = () => lockManager
      ? lockManager.request('migapos:sales-flush', () => lease(callback)) : lease(callback);
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
}
