import { useCallback } from 'react';
import { subscribeUsers, subscribeInvites } from '../infrastructure/userRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { subscribeTenantCache } from '../../../core/cache/subscribeTenantCache';
import offlineDB from '../../../offlineDB';

export function useUsersData(user) {
  const businessId = user?.businessId;
  const role = user?.role;
  const scopeKey = businessId && ['dueño', 'superadmin'].includes(role) ? getIdentityKey(user) : null;
  const watchUsers = useCallback((onData, onError) => subscribeTenantCache(
    offlineDB, 'users', businessId,
    (next, error) => subscribeUsers(businessId, role, next, error), onData, onError,
    users => users.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '')),
  ), [businessId, role]);
  const watchInvites = useCallback((onData, onError) => subscribeInvites(businessId, onData, onError), [businessId]);
  const users = useScopedSubscription(scopeKey, watchUsers);
  const invites = useScopedSubscription(scopeKey, watchInvites);
  return {
    users: users.data.filter(member => role === 'superadmin' || member.role !== 'superadmin'),
    invites: invites.data, isLoading: users.isLoading || invites.isLoading,
    error: users.error || invites.error,
  };
}
