import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeCustomers } from '../infrastructure/customerRepository';
import { useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';

export function useCustomers() {
  const { user, identityKey } = useTenantData();
  const businessId = user.businessId;
  const subscribe = useCallback((onData, onError) => subscribeCustomers(businessId, onData, onError), [businessId]);
  const result = useSharedSubscription(`customers:${identityKey}`, subscribe);
  return { customers: result.data, isLoading: result.isLoading, error: result.error, retry: result.retry, isStale: result.isStale };
}
