import { assertSaleIdentity, SaleError } from './saleModel.js';

export const SYNC_LEASE_MS = 120000;
export function migrateSaleRecord(record) {
  const status = record.status ?? (record.sync === true ? 'synced' : record.sync === 'failed' ? 'failed' : 'pending');
  return { ...record, idempotencyKey: record.idempotencyKey ?? record.localId, status,
    retries: record.retries ?? 0, lastError: record.lastError ?? record.error ?? null,
    version: record.version ?? 1, syncStartedAt: record.syncStartedAt ?? null };
}
export function migrateCachedProduct(product) {
  const { rawStock, remoteStock: _remoteStock, ...raw } = product;
  if (typeof raw.stock !== 'object' && rawStock && typeof rawStock === 'object') raw.stock = rawStock;
  return raw;
}
export function isRetryableSaleError(error) {
  const code = String(error?.code ?? '').replace(/^firestore\//, '');
  return ['unavailable', 'deadline-exceeded', 'network-request-failed', 'timeout', 'aborted', 'cancelled', 'offline', 'local-state'].includes(code)
    || /timeout|network|offline/i.test(error?.message ?? '');
}
export function isDeterministicSaleError(error) {
  return ['invalid-sale', 'identity-mismatch', 'product-tenant-mismatch', 'invalid-stock', 'insufficient-stock',
    'sale-conflict', 'permission-denied', 'decryption-failed'].includes(String(error?.code).replace(/^firestore\//, ''));
}
export async function decodeQueuedSale(record, identity, decrypt) {
  if ((record.userId && record.userId !== identity.uid) || (record.businessId && record.businessId !== identity.businessId)) {
    throw new SaleError('foreign-queue-record', 'Registro de otra sesión.');
  }
  let sale;
  try { sale = JSON.parse(await decrypt(record.data, record.userId || identity.uid)); }
  catch { throw new SaleError(record.userId ? 'decryption-failed' : 'unclaimed-legacy-record', 'No se pudo descifrar la venta.'); }
  assertSaleIdentity(sale, identity);
  if (sale.localId !== record.localId || (sale.saleId && sale.saleId !== record.localId)) throw new SaleError('sale-conflict', 'ID local diferente del payload.');
  return sale;
}
export function pendingStockDeltas(sales, businessId) {
  const result = {};
  for (const sale of sales) {
    if (sale.businessId !== businessId || sale.voided) continue;
    for (const item of sale.items) {
      const branches = result[item.id] ??= {};
      branches[sale.branchId] = (branches[sale.branchId] ?? 0) + item.qty;
    }
  }
  return result;
}
