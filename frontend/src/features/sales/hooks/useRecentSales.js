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
    let metadata = { fromCache: !pendingOnly };
    const publish = scope.guard(() => onData(mergeRecentSales(pending, pendingOnly ? [] : remote), metadata));
    const stopRemote = pendingOnly ? () => {} : subscribeRecentSales(businessId, branchId, (sales, source) => { remote = sales; metadata = source; publish(); }, scope.guard(onError));
    const stopPending = subscribePendingSales(user, branchId, sales => { pending = sales; publish(); }, scope.guard(onError));
    return () => { scope.close(); stopRemote(); stopPending(); };
  }, [businessId, branchId, user, pendingOnly]);
  const result = useSharedSubscription(`sales:${identityKey}:${branchId}:${pendingOnly}`, subscribe);
  return { sales: result.data, isLoading: result.isLoading, error: result.error, isStale: result.isStale, updatedAt: result.updatedAt };
}
