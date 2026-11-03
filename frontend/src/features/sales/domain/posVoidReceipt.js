import { sameSaleOperation } from './saleModel.js';
import { hasVerifiedSaleReceipt } from './queueState.js';

export function matchesPosVoidReceipt(data, source, expected = {}) {
  if (!data || source?.atomicProtocol !== 2 || source.status !== 'confirmed' || !Array.isArray(source.items)) return false;
  const id = source.saleId ?? source.id;
  const cash = source.payment === 'efectivo' ? source.total : source.payment === 'mixto' ? source.splitPayments?.efectivo : 0;
  return data.saleId === id && data.authority === 'pos-compensation' && data.protocol === 1
    && data.businessId === source.businessId && data.branchId === source.branchId
    && (!expected.userId || data.userId === expected.userId) && (!expected.reason || data.reason === expected.reason.trim())
    && sameSaleOperation({ ...source, items: data.items }, source)
    && data.amount === -source.total && data.cashAmount === -cash
    && data.digitalAmount === -(Math.round(source.total * 100) - Math.round(cash * 100)) / 100
    && typeof data.occurredAt?.toDate === 'function'
    && hasVerifiedSaleReceipt({ status: 'ALREADY_APPLIED', saleId: id, stockVersions: data.stockVersions,
      syncedAt: data.occurredAt.toDate().toISOString() }, { ...source, saleId: id });
}
