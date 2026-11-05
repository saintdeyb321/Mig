import { setLicenseAuthority, isAccessCacheDenied, recordAccessDenial, wasTenantAbsent, rememberTenantAbsence } from '../../../core/session/operationAccess.js';
import { useState, useEffect, useCallback } from 'react';
import { subscribeLicense, subscribeTenant } from '../infrastructure/licenseRepository';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getIdentityKey } from '../../../core/session/identity';
import { licenseAccess, cachedLicenseAccess, isServerSnapshot } from '../../../core/session/accessState';

export function useLicenseAccess(user) {
  const identityKey = getIdentityKey(user);
  const [state, setState] = useState({ key: null, licenseState: 'loading', expirationDateStr: '' });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${identityKey}:${attempt}`;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (user?.role === 'superadmin' || !user?.businessId) return;
    setLicenseAuthority(identityKey, false);
    let active = true;
    let confirmationExpired = false;
    const records = { license: {}, tenant: {}, businessId: user.businessId, knownTenantAbsent: wasTenantAbsent(identityKey) };
    const publish = () => {
      if (!active) return;
      const expiry = toDateSafe(records.license.data?.expiry);
      const access = licenseAccess(records);
      const denialScope = `license:${identityKey}`;
      if (access === 'active') recordAccessDenial(denialScope, false);
      else if (['permission-denied', 'suspended', 'expired', 'license-missing-confirmed', 'tenant-missing-confirmed', 'configuration-error'].includes(access)) recordAccessDenial(denialScope, true);
      const assisted = !isAccessCacheDenied(denialScope) && access !== 'active' && cachedLicenseAccess(records);
      setLicenseAuthority(identityKey, access === 'active');
      const next = { key: requestKey, licenseState: assisted ? 'offline-assisted' : !confirmationExpired && ['loading', 'offline-unverified'].includes(access) ? 'loading' : access === 'loading' && confirmationExpired ? 'offline-unverified' : access,
        licenseData: records.license.data, expirationDateStr: expiry?.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) ?? '',
        tenantPresence: records.tenant.received ? records.tenant.data ? 'present' : 'absent' : 'unverified',
      };
      setState(previous => next.licenseState === 'loading' && previous.key === requestKey && ['active', 'offline-assisted'].includes(previous.licenseState)
        ? { ...previous, licenseState: 'offline-assisted' }
        : Object.keys(next).every(key => Object.is(next[key], previous[key])) ? previous : next);
    };
    const listen = (name, subscribe) => subscribe(user.businessId, (data, metadata) => {
      if (!active) return;
      records[name] = { received: true, data, metadata };
      if (name === 'tenant' && isServerSnapshot(metadata)) { records.knownTenantAbsent = !data; rememberTenantAbsence(identityKey, !data); }
      publish();
    }, error => { if (active) { records[name] = { ...records[name], received: true, error }; publish(); } });
    const confirmation = setTimeout(() => { confirmationExpired = true; publish(); }, 10000);
    const stopLicense = listen('license', subscribeLicense), stopTenant = listen('tenant', subscribeTenant);
    const timer = setInterval(publish, 10000);
    const reconnect = () => { if (licenseAccess(records) !== 'active') retry(); };
    window.addEventListener('online', reconnect);
    return () => { active = false; setLicenseAuthority(identityKey, false); stopLicense(); stopTenant(); clearTimeout(confirmation); clearInterval(timer); window.removeEventListener('online', reconnect); };
  }, [requestKey, identityKey, user?.role, user?.businessId, user?.accessVerified, retry]);
  if (user?.role === 'superadmin') return { licenseState: 'active', expirationDateStr: '', retry };
  if (!user?.businessId) return { licenseState: 'configuration-error', expirationDateStr: '', retry };
  return { ...(state.key === requestKey ? state : { licenseState: 'loading', expirationDateStr: '' }), retry };
}
