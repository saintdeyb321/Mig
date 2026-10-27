import { canonicalSale, assertSaleIdentity, sameSaleOperation, SaleError } from '../domain/saleModel.js';
import { decodeQueuedSale, migrateSaleRecord, isDeterministicSaleError, isRetryableSaleError, hasVerifiedSaleReceipt, SYNC_LEASE_MS } from '../domain/queueState.js';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';

export function createSaleQueue({ store, encrypt, decrypt, apply, syncSessions, withLock, online, now = Date.now, currentIdentity = () => true,
  captureProjection = async () => ({}), verifyReceipt, afterFlush = async () => {} }) {
  async function enqueue(input, identity) {
    const sale = canonicalSale(input);
    assertSaleIdentity(sale, identity);
    const data = await encrypt(JSON.stringify(sale), identity.uid);
    await store.insert({ localId: sale.saleId, idempotencyKey: sale.saleId, data,
      businessId: sale.businessId, branchId: sale.branchId, userId: sale.userId,
      status: 'pending', sync: false, createdAt: sale.createdAt, queuedAt: sale.queuedAt, origin: sale.origin,
      projectionState: 'pending', version: sale.version,
      retries: 0, lastError: null, syncStartedAt: null, nextRetryAt: 0 }, async existing => {
      const decoded = await decodeQueuedSale(existing, identity, decrypt);
      if (!sameSaleOperation(decoded, sale)) throw new SaleError('sale-conflict', 'ID local reutilizado con otro payload.');
    });
    return sale;
  }

  async function flush(identity, { forceId, onlyId } = {}) {
    if (!identity?.uid || !identity.businessId || !online() || !currentIdentity(identity)) return { pending: true };
    return withLock(async () => {
      if (!online() || !currentIdentity(identity)) return { pending: true };
      const blockedSessions = onlyId ? new Map() : await syncSessions(identity);
      const records = await store.list();
      const report = { synced: 0, failed: 0, pending: false };
      for (const original of records) {
        if (!currentIdentity(identity)) return { ...report, pending: true };
        const record = migrateSaleRecord(original);
        if (onlyId && record.localId !== onlyId) continue;
        if (record.status === 'synced' || record.status === 'failed') continue;
        if (record.requiresReceiptReview && record.localId !== forceId) { report.pending = true; continue; }
        if (record.status === 'syncing' && now() - (record.syncStartedAt ?? 0) < SYNC_LEASE_MS) { report.pending = true; continue; }
        if (record.localId !== forceId && (record.nextRetryAt ?? 0) > now()) { report.pending = true; continue; }
        let sale;
        try { sale = canonicalSale(await decodeQueuedSale(record, identity, decrypt)); }
        catch (error) {
          if (['foreign-queue-record', 'unclaimed-legacy-record'].includes(error.code)
            || (error.code === 'identity-mismatch' && !record.userId)) continue;
          await store.update(record.localId, { status: 'failed', sync: 'failed', lastError: error.message, projectionState: null });
          report.failed++;
          continue;
        }
        if (!currentIdentity(identity)) return { ...report, pending: true };
        const acknowledge = async receipt => {
          if (!hasVerifiedSaleReceipt(receipt, sale)) throw new SaleError('receipt-unverified', 'El recibo remoto no acredita este ID y sus versiones de stock.');
          if (!currentIdentity(identity)) throw new SaleError('session-changed', 'La sesión cambió; conserva el pendiente.');
          await store.update(record.localId, { status: 'synced', sync: true, financialAck: true,
            stockVersions: receipt.stockVersions, syncedAt: receipt.syncedAt, lastError: null, lastErrorCode: null,
            requiresReceiptReview: false, syncStartedAt: null, nextRetryAt: 0 });
        };
        // After a lost response, establish whether the original ID already committed before any new write.
        if (record.attempted || record.status === 'syncing' || record.financialAck) {
          try {
            if (!verifyReceipt) throw new SaleError('receipt-unverified', 'Consulta remota del recibo requerida antes de reintentar.');
            await acknowledge(await verifyReceipt(sale, identity)); report.synced++; continue;
          } catch (error) {
            if (error.code !== 'receipt-not-found' || record.financialAck) {
              const manual = !isRetryableSaleError(error);
              await store.update(record.localId, { status: 'pending', sync: false, lastError: error.message, lastErrorCode: error.code,
                requiresReceiptReview: manual, syncStartedAt: null, nextRetryAt: manual ? 0 : now() + 60000 });
              report.pending = true; continue;
            }
          }
        }
        if (blockedSessions?.has(sale.sessionId)) {
          let restriction = blockedSessions.get?.(sale.sessionId);
          // A blocked legacy cash merge must not hide an already committed sale.
          // Verification can acknowledge an existing receipt, never create a new one.
          if (verifyReceipt) {
            try {
              const receipt = await verifyReceipt(sale, identity);
              if (hasVerifiedSaleReceipt(receipt, sale)) {
                await acknowledge(receipt);
                report.synced++; continue;
              }
            } catch (error) {
              if (error.code === 'tenant-restricted') restriction = error;
              await store.update(record.localId, { lastError: error.message });
            }
          }
          if (restriction?.code === 'tenant-restricted') {
            await store.update(record.localId, { status: 'failed', sync: 'failed', requiresFinancialReview: true,
              lastError: restriction.message, projectionState: null, syncStartedAt: null, nextRetryAt: 0 });
            report.failed++; continue;
          }
          report.pending = true; continue;
        }
        const projectionBase = record.projectionBase ?? await captureProjection(sale);
        await store.update(record.localId, { status: 'syncing', sync: false, syncStartedAt: now(), projectionBase, attempted: true,
          businessId: sale.businessId, branchId: sale.branchId, userId: sale.userId, version: sale.version,
          createdAt: sale.createdAt, idempotencyKey: sale.saleId, data: await encrypt(JSON.stringify(sale), sale.userId) });
        let committed = false, receipt;
        try {
          receipt = await apply(sale, identity);
          committed = hasVerifiedSaleReceipt(receipt, sale);
          await acknowledge(receipt);
          report.synced++;
          reportDiagnostic('sync', null, 'confirmed');
        } catch (error) {
          const failed = !committed && currentIdentity(identity) && !isRetryableSaleError(error) && isDeterministicSaleError(error);
          const retries = record.retries + 1;
          await store.update(record.localId, { status: failed ? 'failed' : 'pending', sync: failed ? 'failed' : false,
            ...(committed ? { financialAck: true, stockVersions: receipt?.stockVersions ?? {}, syncedAt: receipt?.syncedAt } : {}),
            ...(failed ? { projectionState: null } : {}),
            retries, lastError: error.message, lastErrorCode: error.code, requiresFinancialReview: failed && error.code === 'tenant-restricted', syncStartedAt: null,
            nextRetryAt: failed ? 0 : now() + Math.min(60000, 1000 * 2 ** Math.min(retries, 6)) });
          if (failed) report.failed++; else report.pending = true;
          reportDiagnostic('sync', error, failed ? error.code === 'tenant-restricted' ? 'review' : 'rejected' : 'pending');
        }
      }
      if (!onlyId && currentIdentity(identity)) {
        try { await afterFlush(identity); } catch (error) { console.warn('Reconciliación de caja pendiente:', error); }
      }
      return report;
    });
  }

  async function submit(input, identity, { isolated = false } = {}) {
    const sale = await enqueue(input, identity);
    if (online() && (!isolated || sale.origin === 'online')) {
      // If local acknowledgement fails after commit, the durable syncing record is recoverable.
      try { await flush(identity, { forceId: sale.saleId, ...(isolated ? { onlyId: sale.saleId } : {}) }); }
      catch (error) { console.warn('La venta queda en la cola durable:', error); }
    }
    let record;
    try { record = await store.get(sale.saleId); }
    catch { return { success: false, pending: true, isOffline: true, sale }; }
    if (!record) return { success: false, pending: true, isOffline: true, sale };
    if (record.status === 'failed') { reportDiagnostic('sale', { code: record.lastErrorCode }, record.requiresFinancialReview ? 'review' : 'rejected'); throw new SaleError('sale-failed', record.lastError); }
    reportDiagnostic('sale', null, record.status === 'synced' ? 'confirmed' : 'pending');
    const confirmed = record.status === 'synced' && record.financialAck === true;
    return { success: confirmed, pending: !confirmed, isOffline: !confirmed, sale: isolated && confirmed ? { ...sale, confirmedAt: record.syncedAt } : sale };
  }
  return { enqueue, flush, submit };
}
