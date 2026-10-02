import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeRecentSales } from '../infrastructure/salesRepository';
import { readPendingSales } from '../infrastructure/pendingSalesCache';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';

export function useRecentSales(user) {
  const { activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const branchId = user?.role === 'cajero' ? user.branchId : activeBranchId;
  const subscribe = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    const unsubscribe = subscribeRecentSales(businessId, branchId, async remoteSales => {
      const token = scope.next();
      try {
        const offlineSales = await readPendingSales(businessId, branchId);
        if (scope.isCurrent(token)) onData([...offlineSales, ...remoteSales]
          .sort((a, b) => toMillisSafe(b.createdAt || b.date) - toMillisSafe(a.createdAt || a.date)).slice(0, 50));
      } catch (error) { if (scope.isCurrent(token)) onError(error); }
    }, scope.guard(onError));
    return () => { scope.close(); unsubscribe(); };
  }, [businessId, branchId]);
  const result = useScopedSubscription(businessId && branchId ? `${identityKey}:${branchId}` : null, subscribe);
  return { sales: result.data, isLoading: result.isLoading, error: result.error };
}
