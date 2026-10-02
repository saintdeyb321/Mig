import { useState, useCallback } from 'react';
import { TenantContext } from './TenantContext';
import { subscribeBranches } from '../infrastructure/branchRepository';
import { subscribeSettings } from '../../settings/infrastructure/settingsRepository';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { getIdentityKey } from '../../../core/session/identity';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';
import offlineDB from '../../../offlineDB';

export function TenantProvider({ user, children }) {
  const identityKey = getIdentityKey(user);
  const businessId = user.businessId;
  const [activeBranchId, setActiveBranchId] = useState(user.role === 'cajero' ? user.branchId : null);
  const watchBranches = useCallback((onData, onError) => subscribeBranches(businessId, branches => {
    onData(branches);
    setActiveBranchId(previous => previous ?? (branches.length === 1 ? branches[0].id : 'global'));
  }, onError), [businessId]);
  const branches = useScopedSubscription(identityKey, watchBranches);

  const watchSettings = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let receivedSnapshot = false;
    offlineDB.settings.get(businessId).then(cached => {
      if (!receivedSnapshot && cached && (!cached.businessId || cached.businessId === businessId)) {
        scope.guard(onData)(cached);
      }
    }).catch(error => console.warn('Error leyendo settings locales:', error));
    const unsubscribe = subscribeSettings(businessId, data => {
      receivedSnapshot = true;
      scope.guard(onData)(data);
      const write = data
        ? offlineDB.settings.put({ ...data, id: businessId, businessId })
        : offlineDB.settings.delete(businessId);
      write.catch(error => console.warn('Error guardando settings locales:', error));
    }, scope.guard(onError));
    return () => { scope.close(); unsubscribe(); };
  }, [businessId]);
  const settings = useScopedSubscription(identityKey, watchSettings, null);

  return <TenantContext.Provider value={{
    user, identityKey, businessBranches: branches.data,
    activeBranchId, setActiveBranchId, settings: settings.data,
    isLoading: branches.isLoading || settings.isLoading,
    error: branches.error || settings.error,
  }}>{children}</TenantContext.Provider>;
}
