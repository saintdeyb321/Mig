import { useState, useEffect, useCallback } from 'react';
import { subscribeLicense, subscribeTenant } from '../infrastructure/licenseRepository';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getIdentityKey } from '../../../core/session/identity';
import { licenseAccess } from '../../../core/session/accessState';

export function useLicenseAccess(user) {
  const identityKey = getIdentityKey(user);
  const [state, setState] = useState({ key: null, licenseState: 'loading', expirationDateStr: '' });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${identityKey}:${attempt}`;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (user?.role === 'superadmin' || !user?.businessId) return;
    let active = true;
    let confirmationExpired = false;
    const records = { license: {}, tenant: {}, businessId: user.businessId };
    const publish = () => {
      if (!active) return;
      const expiry = toDateSafe(records.license.data?.expiry);
      setState({ key: requestKey, licenseState: !confirmationExpired && ['loading', 'offline-unverified'].includes(licenseAccess(records)) ? 'loading' : licenseAccess(records) === 'loading' && confirmationExpired ? 'offline-unverified' : licenseAccess(records),
        licenseData: records.license.data, expirationDateStr: expiry?.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) ?? '',
        tenantPresence: records.tenant.received ? records.tenant.data ? 'present' : 'absent' : 'unverified',
      });
    };
    const listen = (name, subscribe) => subscribe(user.businessId, (data, metadata) => {
      if (!active) return;
      records[name] = { received: true, data, metadata }; publish();
    }, error => { if (active) { records[name] = { received: true, error }; publish(); } });
    const confirmation = setTimeout(() => { confirmationExpired = true; publish(); }, 10000);
    const stopLicense = listen('license', subscribeLicense), stopTenant = listen('tenant', subscribeTenant);
    const timer = setInterval(publish, 10000);
    const reconnect = () => { if (licenseAccess(records) !== 'active') retry(); };
    window.addEventListener('online', reconnect);
    return () => { active = false; stopLicense(); stopTenant(); clearTimeout(confirmation); clearInterval(timer); window.removeEventListener('online', reconnect); };
  }, [requestKey, user?.role, user?.businessId, retry]);
  if (user?.role === 'superadmin') return { licenseState: 'active', expirationDateStr: '', retry };
  if (!user?.businessId) return { licenseState: 'configuration-error', expirationDateStr: '', retry };
  return { ...(state.key === requestKey ? state : { licenseState: 'loading', expirationDateStr: '' }), retry };
}
