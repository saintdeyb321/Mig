import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeRecentSales } from '../infrastructure/salesRepository';
import { subscribePendingSales } from '../infrastructure/pendingSalesCache';
import { mergeRecentSales } from '../application/recentSales';
import { useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';

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
    const fail = scope.guard(error => { failure = error; onError(error); });
    const publish = scope.guard((observedDocumentCount = 0) => {
      if (failure) { onError(failure); return; }
      onData(mergeRecentSales(pending, pendingOnly ? [] : remote), { ...metadata, observedDocumentCount });
    });
    const stopRemote = pendingOnly ? () => {} : subscribeRecentSales(businessId, branchId, (sales, source) => { remote = sales; metadata = source; publish(source.observedDocumentCount); }, fail);
    const stopPending = subscribePendingSales(user, branchId, sales => { pending = sales; publish(); }, fail);
    return () => { scope.close(); stopRemote(); stopPending(); };
  }, [businessId, branchId, user, pendingOnly]);
  const result = useSharedSubscription(`sales:${identityKey}:${branchId}:${pendingOnly}`, subscribe, undefined, { preserveOnError: true });
  return { sales: result.data, isLoading: result.isLoading, error: result.error, retry: result.retry, isStale: result.isStale, updatedAt: result.updatedAt };
}
