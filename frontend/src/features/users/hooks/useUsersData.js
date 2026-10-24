import { useCallback } from 'react';
import { subscribeUsers, subscribeInvites } from '../infrastructure/userRepository';
import { useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';
import { getIdentityKey } from '../../../core/session/identity';

// Sensitive personnel is retained in this UID/tenant session only, never hydrated
// from another user's tenant-wide IndexedDB cache and never used as authorization.
export function useUsersData(user) {
  const { businessId, role } = user;
  const identity = getIdentityKey(user);
  const watchUsers = useCallback((next, error) => subscribeUsers(businessId, role, next, error), [businessId, role]);
  const watchInvites = useCallback((next, error) => subscribeInvites(businessId, next, error), [businessId]);
  const users = useSharedSubscription(`personnel:users:${identity}`, watchUsers, undefined, { preserveOnError: true });
  const invites = useSharedSubscription(`personnel:invites:${identity}`, watchInvites, undefined, { preserveOnError: true });
  return { users: users.data.filter(member => member.role !== 'superadmin'), invites: invites.data,
    isLoading: users.isLoading || invites.isLoading, error: users.error || invites.error,
    isStale: users.isStale || invites.isStale, retry: () => { users.retry(); invites.retry(); } };
}
