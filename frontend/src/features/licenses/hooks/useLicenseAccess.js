import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../../../core/firebase/client';
import { setLicenseAuthority, isAccessCacheDenied, recordAccessDenial, wasTenantAbsent, rememberTenantAbsence } from '../../../core/session/operationAccess.js';
import { subscribeLicense, subscribeTenant, getLicenseFromServer, getTenantFromServer } from '../infrastructure/licenseRepository';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getIdentityKey } from '../../../core/session/identity';
import { licenseAccess, cachedLicenseAccess, isServerSnapshot } from '../../../core/session/accessState';
import { withAccessDeadline } from '../../../core/session/accessDeadline.js';
import { reportAccessDiagnostic } from '../../../core/errors/diagnostics.js';

const confirmationMs = 10000;
const resumeAgeMs = 30 * 60000;
const automaticGapMs = 30000;
const blocked = new Set(['permission-denied', 'auth-unverified', 'suspended', 'expired', 'license-missing-confirmed', 'tenant-missing-confirmed', 'configuration-error']);
const retryable = new Set(['offline-unverified', 'network-error', 'license-missing-confirmed', 'tenant-missing-confirmed']);
const loading = { licenseState: 'loading', expirationDateStr: '' };

export function useLicenseAccess(user, recheckProfile) {
  const identityKey = getIdentityKey(user);
  const { uid, role, businessId } = user ?? {};
  const [state, setState] = useState({ key: null, ...loading });
  const control = useRef(null);
  const retry = useCallback(() => control.current?.revalidate('manual'), []);
  useEffect(() => {
    if (!uid || role === 'superadmin' || !businessId) return;
    let active = true, generation = 0, pending = null, stop = () => {};
    let confirmation, expiryTimer, reconnectTimer, confirmationExpired = false, lastEvidence = -Infinity, lastAutomatic = -Infinity;
    let needsReconnect = !navigator.onLine;
    const current = () => active && auth.currentUser?.uid === uid;
    const denialScope = `license:${identityKey}`;
    const empty = () => ({ license: {}, tenant: {}, businessId, knownTenantAbsent: wasTenantAbsent(identityKey) });
    let records = empty();
    const project = auth.app?.options.projectId;
    const environment = import.meta.env?.VITE_APP_ENV || ({ 'demo-migapos': 'emulator', migapos: 'production' })[project];
    setLicenseAuthority(identityKey, false);

    const publish = (source = 'watch', fresh = false) => {
      if (!current()) return;
      const expiry = toDateSafe(records.license.data?.expiry);
      const verdict = licenseAccess(records);
      const access = (needsReconnect || !navigator.onLine) && ['active', 'loading'].includes(verdict) ? 'offline-unverified' : verdict;
      if (fresh && access === 'active') lastEvidence = Date.now();
      if (access === 'active') recordAccessDenial(denialScope, false);
      else if (blocked.has(access)) recordAccessDenial(denialScope, true);
      const assisted = !isAccessCacheDenied(denialScope) && access !== 'active' && cachedLicenseAccess(records);
      setLicenseAuthority(identityKey, access === 'active', expiry?.getTime());
      const unverified = ['loading', 'offline-unverified'].includes(access);
      const next = { key: identityKey, licenseState: assisted ? 'offline-assisted'
        : unverified ? confirmationExpired ? 'offline-unverified' : 'loading' : access,
        licenseData: records.license.data, expirationDateStr: expiry?.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) ?? '',
        tenantPresence: isServerSnapshot(records.tenant.metadata) && !records.tenant.error ? records.tenant.data ? 'present' : 'absent' : 'unverified',
      };
      setState(previous => Object.keys(next).every(key => Object.is(next[key], previous[key])) ? previous : next);
      reportAccessDiagnostic(source, access, { ...records, identityMatches: true, environment });
      clearTimeout(expiryTimer);
      const untilExpiry = expiry?.getTime() - Date.now();
      if (untilExpiry > 0) expiryTimer = setTimeout(() => publish(), Math.min(untilExpiry, 2147483647));
    };
    const record = (name, snapshot) => {
      records[name] = { received: true, ...snapshot };
      if (name === 'tenant' && !snapshot.error && isServerSnapshot(snapshot.metadata)) {
        records.knownTenantAbsent = !snapshot.data;
        rememberTenantAbsence(identityKey, !snapshot.data);
      }
    };
    const listen = (seeded = false) => {
      const watchGeneration = ++generation;
      const watches = [['license', subscribeLicense], ['tenant', subscribeTenant]].map(([name, subscribe]) => {
        let initial = true;
        return subscribe(businessId, (data, metadata) => {
          if (!current() || watchGeneration !== generation) return;
          const initialCache = initial && seeded && navigator.onLine && !needsReconnect
            && metadata?.fromCache === true && metadata?.hasPendingWrites === false;
          initial = false;
          if (initialCache) return; // Fresh direct proof already exists for this document.
          record(name, { data, metadata });
          publish('watch', isServerSnapshot(metadata));
        }, error => {
          if (!current() || watchGeneration !== generation) return;
          records[name] = { ...records[name], error };
          publish();
        });
      });
      stop = () => watches.forEach(unsubscribe => unsubscribe());
    };

    const revalidate = source => {
      if (pending || !current()) return pending;
      if (!navigator.onLine) {
        needsReconnect = true;
        confirmationExpired = true;
        publish(source);
        return null;
      }
      const manual = source === 'manual';
      const remaining = automaticGapMs - (Date.now() - lastAutomatic);
      if (!manual && remaining > 0) {
        if (source === 'online' && !reconnectTimer) reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          online();
        }, remaining);
        return null;
      }
      clearTimeout(reconnectTimer); reconnectTimer = null;
      if (!manual) lastAutomatic = Date.now();
      const requestGeneration = ++generation;
      stop();
      setLicenseAuthority(identityKey, false);
      clearTimeout(confirmation); clearTimeout(expiryTimer);
      records = empty();
      const valid = () => current() && requestGeneration === generation;
      setState(previous => previous.key === identityKey && ['active', 'offline-assisted'].includes(previous.licenseState)
        ? { ...previous, licenseState: 'offline-assisted' } : { key: identityKey, ...loading });
      pending = withAccessDeadline(async signal => {
        const profile = await recheckProfile?.(manual);
        if (!valid() || signal.aborted) return null;
        if (!profile) throw Object.assign(new Error('Perfil pendiente de comprobar.'), { code: 'unavailable' });
        if (profile.accessVerified !== true || getIdentityKey(profile) !== identityKey) {
          reportAccessDiagnostic(source, 'configuration-error', { ...records, identityMatches: false, environment });
          return null;
        }
        return Promise.allSettled([getLicenseFromServer(businessId), getTenantFromServer(businessId)]);
      }, 2 * confirmationMs).then(result => {
        if (!valid()) return;
        confirmationExpired = true;
        if (!result) { publish(source); return; }
        result.forEach((value, index) => record(index === 0 ? 'license' : 'tenant',
          value.status === 'fulfilled' ? value.value : { error: value.reason }));
        needsReconnect = !navigator.onLine;
        publish(source, true);
        if (!needsReconnect && licenseAccess(records) === 'active') listen(true);
      }, error => {
        if (!valid()) return;
        confirmationExpired = true;
        record('license', { error });
        publish(source);
      }).finally(() => {
        pending = null;
        if (!valid() && needsReconnect && navigator.onLine) online();
      });
      return pending;
    };
    const offline = () => {
      if (pending) generation++;
      clearTimeout(reconnectTimer); reconnectTimer = null;
      needsReconnect = true; confirmationExpired = true;
      publish();
    };
    const needsVerification = verdict => needsReconnect || retryable.has(verdict) || verdict === 'loading' && confirmationExpired;
    const online = () => {
      if (needsVerification(licenseAccess(records))) void revalidate('online');
    };
    const resume = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      const verdict = licenseAccess(records);
      if (needsVerification(verdict) || verdict === 'active' && Date.now() - lastEvidence >= resumeAgeMs) void revalidate('resume');
    };
    control.current = { revalidate, profileChanged() { if (!pending) publish(); } };
    confirmation = setTimeout(() => { confirmationExpired = true; publish(); }, confirmationMs);
    listen();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false; generation++;
      control.current = null;
      setLicenseAuthority(identityKey, false);
      stop(); clearTimeout(confirmation); clearTimeout(expiryTimer); clearTimeout(reconnectTimer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [identityKey, uid, role, businessId, recheckProfile]);
  useEffect(() => { control.current?.profileChanged(); }, [user?.accessVerified]);
  if (role === 'superadmin') return { licenseState: 'active', expirationDateStr: '', retry };
  if (!businessId) return { licenseState: 'configuration-error', expirationDateStr: '', retry };
  return { ...(state.key === identityKey ? state : loading), retry };
}
