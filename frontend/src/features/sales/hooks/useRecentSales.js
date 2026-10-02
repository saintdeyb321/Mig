import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeRecentSales } from '../infrastructure/salesRepository';
import { subscribePendingSales } from '../infrastructure/pendingSalesCache';
import { mergeRecentSales } from '../application/recentSales';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';

export function useRecentSales(user) {
  const { activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const branchId = user?.role === 'cajero' ? user.branchId : activeBranchId;
  const subscribe = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let remote = [];
    let pending = [];
    const publish = scope.guard(() => onData(mergeRecentSales(pending, remote)));
    const stopRemote = subscribeRecentSales(businessId, branchId, sales => { remote = sales; publish(); }, scope.guard(onError));
    const stopPending = subscribePendingSales(user, branchId, sales => { pending = sales; publish(); }, scope.guard(onError));
    return () => { scope.close(); stopRemote(); stopPending(); };
  }, [businessId, branchId, user]);
  const result = useScopedSubscription(businessId && branchId ? `${identityKey}:${branchId}` : null, subscribe);
  return { sales: result.data, isLoading: result.isLoading, error: result.error };
}
