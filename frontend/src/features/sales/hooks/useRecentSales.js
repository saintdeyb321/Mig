import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeRecentSales } from '../infrastructure/salesRepository';
import { subscribePendingSales } from '../infrastructure/pendingSalesCache';
import { mergeRecentSales, salesHistoryPresentation } from '../application/recentSales';
import { useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';
import { db } from '../../../core/firebase/client.js';
import { createPosVoidReader } from '../infrastructure/posVoidQueryRepository.js';
const compensations = createPosVoidReader(db);

export function useRecentSales(user, { pendingOnly = false } = {}) {
  const { activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const branchId = user?.role === 'cajero' ? user.branchId : activeBranchId;
  const subscribe = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let remote = [];
    let pending = [];
    let failure = null;
    let metadata = { fromCache: !pendingOnly };
    let voids = [], voidKey = null, voidRevision = 0, stopVoids = () => {}, voidMetadata = { fromCache: !pendingOnly };
    const fail = scope.guard(error => { failure = error; onError(error); });
    const publish = scope.guard((observedDocumentCount = 0) => {
      if (failure) { onError(failure); return; }
      const byId = new Map(voids.map(row => [row.saleId, row]));
      const decorated = remote.map(sale => byId.has(sale.id) ? { ...sale, voided: true, voidReason: byId.get(sale.id).reason, posVoid: byId.get(sale.id) } : sale);
      onData(salesHistoryPresentation(pending, decorated, pendingOnly), { ...metadata, fromCache: metadata.fromCache || voidMetadata.fromCache, observedDocumentCount });
    });
    const stopRemote = pendingOnly ? () => {} : subscribeRecentSales(businessId, branchId, (sales, source) => {
      remote = sales; metadata = source;
      const ids = mergeRecentSales([], remote).filter(sale => sale.atomicProtocol === 2).map(sale => sale.id).sort(), key = JSON.stringify(ids);
      if (key !== voidKey) {
        voidKey = key; stopVoids(); voids = []; voidMetadata = { fromCache: true };
        const revision = ++voidRevision;
        stopVoids = compensations.subscribeIds(businessId, branchId, ids, scope.guard((rows, meta) => {
          if (revision !== voidRevision) return;
          voids = rows; voidMetadata = meta; publish(meta.observedDocumentCount);
        }), error => { if (revision === voidRevision) fail(error); });
      }
      publish(source.observedDocumentCount);
    }, fail);
    const stopPending = subscribePendingSales(user, branchId, sales => { pending = sales; publish(); }, fail);
    return () => { scope.close(); voidRevision++; stopVoids(); stopRemote(); stopPending(); };
  }, [businessId, branchId, user, pendingOnly]);
  const result = useSharedSubscription(`sales:${identityKey}:${branchId}:${pendingOnly}`, subscribe, undefined, { preserveOnError: true });
  return { sales: result.data?.rows ?? [], localCount: result.data?.localCount ?? 0, rejectedCount: result.data?.rejectedCount ?? 0,
    uncertainCount: result.data?.uncertainCount ?? 0, isLoading: result.isLoading, error: result.error, retry: result.retry, isStale: result.isStale, updatedAt: result.updatedAt };
}
