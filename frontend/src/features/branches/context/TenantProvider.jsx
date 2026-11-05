import { isServerSnapshot } from '../../../core/session/accessState.js';
import { LicenseContext } from '../../licenses/context/LicenseContext';
import { resolveOperationalBranch } from '../domain/branchPolicy';
import { useState, useCallback, useContext } from 'react';
import { TenantContext } from './TenantContext';
import { subscribeBranches } from '../infrastructure/branchRepository';
import { subscribeSettings } from '../../settings/infrastructure/settingsRepository';
import { EMPTY_LIST, useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
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
  const preferenceKey = `migapos:branch:${identityKey}`;
  const [requestedBranchId, requestBranch] = useState(() => {
    try { return sessionStorage.getItem(preferenceKey); } catch { return null; }
  });
  const watchBranches = useCallback((onData, onError) => subscribeBranches(businessId, onData, onError), [businessId]);
  const branches = useScopedSubscription(identityKey, watchBranches, EMPTY_LIST, { preserveOnError: true, allowCachedData: true });
  const activeBranchId = resolveOperationalBranch(user, branches.data, requestedBranchId);
  const setActiveBranchId = value => {
    if (user.role === 'dueño' && resolveOperationalBranch(user, branches.data, value) === value) {
      requestBranch(value);
      try { sessionStorage.setItem(preferenceKey, value); } catch { /* Selection still works without storage. */ }
    }
  };

  const watchSettings = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let receivedSnapshot = false;
    const local = offlineDB.settings.get(businessId).then(cached => {
      const scoped = cached && (!cached.businessId || cached.businessId === businessId) ? cached : null;
      if (!receivedSnapshot && scoped) scope.guard(onData)(scoped, { fromCache: true, hasPendingWrites: false });
      return scoped;
    }).catch(error => { console.warn('Error leyendo settings locales:', error); return null; });
    const fail = error => { receivedSnapshot = true; scope.next(); scope.guard(onError)(error); };
    const unsubscribe = subscribeSettings(businessId, scope.guard(async (data, metadata) => {
      const confirmed = isServerSnapshot(metadata);
      if (confirmed || data) receivedSnapshot = true;
      const token = scope.next();
      const displayed = !confirmed && !data ? await local : data;
      if (!scope.isCurrent(token)) return;
      onData(displayed, metadata);
      if (!confirmed) return;
      const write = data
        ? offlineDB.settings.put({ ...data, id: businessId, businessId })
        : offlineDB.settings.delete(businessId);
      write.catch(error => console.warn('Error guardando settings locales:', error));
    }), fail);
    return () => { scope.close(); unsubscribe(); };
  }, [businessId]);
  const settings = useScopedSubscription(identityKey, watchSettings, null, { preserveOnError: true, allowCachedData: true });

  return <TenantContext.Provider value={{
    user, identityKey, businessBranches: branches.data,
    activeBranchId, setActiveBranchId, branchQuota, branchesLoading: branches.isLoading,
    branchSelectionNotice: !branches.isLoading && requestedBranchId && requestedBranchId !== 'global' && requestedBranchId !== activeBranchId
      ? 'La sede elegida ya no está disponible. Selecciona una sede operativa o consulta la vista global.' : null, branchesError: branches.error, retryBranches: branches.retry, settings: settings.data,
    isLoading: branches.isLoading || settings.isLoading,
    error: branches.error || settings.error,
  }}>{children}</TenantContext.Provider>;
}
