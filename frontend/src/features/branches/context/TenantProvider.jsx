import { LicenseContext } from '../../licenses/context/LicenseContext';
import { resolveOperationalBranch } from '../domain/branchPolicy';
import { useState, useCallback, useContext } from 'react';
import { TenantContext } from './TenantContext';
import { subscribeBranches } from '../infrastructure/branchRepository';
import { subscribeSettings } from '../../settings/infrastructure/settingsRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';
import offlineDB from '../../../offlineDB';
import { isBusinessSession } from '../../../core/session/context.js';

export function TenantProvider({ user, children }) {
  if (!isBusinessSession(user)) return children;
  return <BusinessTenantProvider key={getIdentityKey(user)} user={user}>{children}</BusinessTenantProvider>;
}

function BusinessTenantProvider({ user, children }) {
  const identityKey = getIdentityKey(user);
  const businessId = user.businessId;
  const branchQuota = useContext(LicenseContext);
  const [requestedBranchId, requestBranch] = useState(null);
  const watchBranches = useCallback((onData, onError) => subscribeBranches(businessId, onData, onError), [businessId]);
  const branches = useScopedSubscription(identityKey, watchBranches);
  const activeBranchId = resolveOperationalBranch(user, branches.data, requestedBranchId);
  const setActiveBranchId = value => {
    if (user.role === 'dueño' && resolveOperationalBranch(user, branches.data, value) === value) requestBranch(value);
  };

  const watchSettings = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let receivedSnapshot = false;
    offlineDB.settings.get(businessId).then(cached => {
      if (!receivedSnapshot && cached && (!cached.businessId || cached.businessId === businessId)) {
        scope.guard(onData)(cached);
      }
    }).catch(error => console.warn('Error leyendo settings locales:', error));
    const unsubscribe = subscribeSettings(businessId, scope.guard(data => {
      receivedSnapshot = true;
      scope.guard(onData)(data);
      const write = data
        ? offlineDB.settings.put({ ...data, id: businessId, businessId })
        : offlineDB.settings.delete(businessId);
      write.catch(error => console.warn('Error guardando settings locales:', error));
    }), scope.guard(onError));
    return () => { scope.close(); unsubscribe(); };
  }, [businessId]);
  const settings = useScopedSubscription(identityKey, watchSettings, null);

  return <TenantContext.Provider value={{
    user, identityKey, businessBranches: branches.data,
    activeBranchId, setActiveBranchId, branchQuota, branchesError: branches.error, retryBranches: branches.retry, settings: settings.data,
    isLoading: branches.isLoading || settings.isLoading,
    error: branches.error || settings.error,
  }}>{children}</TenantContext.Provider>;
}
