import { canonicalSale, assertSaleIdentity, sameSaleOperation, SaleError } from '../domain/saleModel.js';
import { decodeQueuedSale, migrateSaleRecord, isDeterministicSaleError, isRetryableSaleError, SYNC_LEASE_MS } from '../domain/queueState.js';

export function createSaleQueue({ store, encrypt, decrypt, apply, syncSessions, withLock, online, now = Date.now, currentIdentity = () => true }) {
  async function enqueue(input, identity) {
    const sale = canonicalSale(input);
    assertSaleIdentity(sale, identity);
    const data = await encrypt(JSON.stringify(sale), identity.uid);
    await store.insert({ localId: sale.saleId, idempotencyKey: sale.saleId, data,
      businessId: sale.businessId, branchId: sale.branchId, userId: sale.userId,
      status: 'pending', sync: false, createdAt: sale.createdAt, version: sale.version,
      retries: 0, lastError: null, syncStartedAt: null, nextRetryAt: 0 }, async existing => {
      const decoded = await decodeQueuedSale(existing, identity, decrypt);
      if (!sameSaleOperation(decoded, sale)) throw new SaleError('sale-conflict', 'ID local reutilizado con otro payload.');
    });
    return sale;
  }

  async function flush(identity, { forceId } = {}) {
    if (!identity?.uid || !identity.businessId || !online() || !currentIdentity(identity)) return { pending: true };
    return withLock(async () => {
      if (!online() || !currentIdentity(identity)) return { pending: true };
      const blockedSessions = await syncSessions(identity);
      const records = await store.list();
      const report = { synced: 0, failed: 0, pending: false };
      for (const original of records) {
        if (!currentIdentity(identity)) return { ...report, pending: true };
        const record = migrateSaleRecord(original);
        if (record.status === 'synced' || record.status === 'failed') continue;
        if (record.status === 'syncing' && now() - (record.syncStartedAt ?? 0) < SYNC_LEASE_MS) { report.pending = true; continue; }
        if (record.localId !== forceId && (record.nextRetryAt ?? 0) > now()) { report.pending = true; continue; }
        let sale;
        try { sale = canonicalSale(await decodeQueuedSale(record, identity, decrypt)); }
        catch (error) {
          if (['foreign-queue-record', 'unclaimed-legacy-record'].includes(error.code)
            || (error.code === 'identity-mismatch' && !record.userId)) continue;
          await store.update(record.localId, { status: 'failed', sync: 'failed', lastError: error.message });
          report.failed++;
          continue;
        }
        if (!currentIdentity(identity)) return { ...report, pending: true };
        if (blockedSessions?.has(sale.sessionId)) { report.pending = true; continue; }
        await store.update(record.localId, { status: 'syncing', sync: false, syncStartedAt: now(),
          businessId: sale.businessId, branchId: sale.branchId, userId: sale.userId, version: sale.version,
          createdAt: sale.createdAt, idempotencyKey: sale.saleId, data: await encrypt(JSON.stringify(sale), sale.userId) });
        let committed = false;
        try {
          await apply(sale, identity);
          committed = true;
          await store.update(record.localId, { status: 'synced', sync: true, syncStartedAt: null, lastError: null, nextRetryAt: 0 });
          report.synced++;
        } catch (error) {
          const failed = !committed && currentIdentity(identity) && !isRetryableSaleError(error) && isDeterministicSaleError(error);
          const retries = record.retries + 1;
          await store.update(record.localId, { status: failed ? 'failed' : 'pending', sync: failed ? 'failed' : false,
            retries, lastError: error.message, syncStartedAt: null,
            nextRetryAt: failed ? 0 : now() + Math.min(60000, 1000 * 2 ** Math.min(retries, 6)) });
          if (failed) report.failed++; else report.pending = true;
        }
      }
      return report;
    });
  }

  async function submit(input, identity) {
    const sale = await enqueue(input, identity);
    if (online()) {
      // If local acknowledgement fails after commit, the durable syncing record is recoverable.
      try { await flush(identity, { forceId: sale.saleId }); }
      catch (error) { console.warn('La venta queda en la cola durable:', error); }
    }
    let record;
    try { record = await store.get(sale.saleId); }
    catch { return { success: true, isOffline: true, sale }; }
    if (record.status === 'failed') throw new SaleError('sale-failed', record.lastError);
    return { success: true, isOffline: record.status !== 'synced', sale };
  }
  return { enqueue, flush, submit };
}
