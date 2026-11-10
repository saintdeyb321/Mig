import { isAccessCacheDenied, recordAccessDenial } from './operationAccess.js';
import { accessErrorState, profileAccess, cachedProfileAccess, isServerSnapshot } from './accessState.js';
import { withAccessDeadline } from './accessDeadline.js';
import { reportDiagnostic } from '../errors/diagnostics.js';

// Cache supports presentation only. A bounded neutral wait avoids F5 restriction flashes.
export function createProfileSession({ user, subscribe, readInvite, acceptInvite, readProfile, refreshCredentials, withinShift, onState,
  schedule = setTimeout, cancel = clearTimeout, confirmationMs = 10000 }) {
  const denialScope = `profile:${user.uid}`;
  let cached = null;
  let active = true, revision = 0, accepting = false, currentState = 'loading', currentProfile = null, timer = null, expired = false;
  let checking = null, watchFailed = false, stop = () => {}, watchGeneration = 0;
  const clearWait = () => { if (timer !== null) cancel(timer); timer = null; expired = false; };
  const publish = (status, extra = {}) => {
    if (!active) return;
    currentState = status;
    currentProfile = status === 'ready' ? extra.profile : null;
    onState({ uid: user.uid, status, profile: null, ...extra });
  };
  const wait = () => {
    publish(expired ? 'offline-unverified' : 'loading');
    if (timer === null && !expired) timer = schedule(() => { timer = null; expired = true; publish('offline-unverified'); }, confirmationMs);
  };
  const receive = (data, metadata) => {
    if (!active) return;
    const generation = ++revision;
    cached = cachedProfileAccess(data, metadata, user, withinShift) ? data : null;
    const status = profileAccess(data, metadata, withinShift);
    if (status === 'offline-unverified') {
      if (cached && !isAccessCacheDenied(denialScope)) { clearWait(); publish('offline-assisted', { profile: { ...cached, uid: user.uid, email: user.email ?? cached.email, accessVerified: false } }); }
      else wait();
      return;
    }
    clearWait();
    recordAccessDenial(denialScope, status !== 'ready');
    if (status !== 'profile-not-found-confirmed') {
      publish(status, status === 'ready' ? { profile: { ...data, uid: user.uid, email: user.email ?? data.email, accessVerified: true } } : {});
      return;
    }
    // Invitation discovery/acceptance is part of onboarding, never an interim error.
    if (accepting) { wait(); return; }
    if (!user.email || !user.emailVerified || !user.providerData?.some(provider => provider.providerId === 'google.com')) {
      publish(status); return;
    }
    wait();
    void readInvite(user.email).then(invite => {
      if (!active || revision !== generation || accepting) return;
      clearWait();
      if (invite && invite.email === user.email && ['dueño', 'cajero'].includes(invite.role)
        && invite.businessId && invite.status !== 'inactivo') {
        publish('needs-invite', { invitation: { businessId: invite.businessId, businessName: invite.businessName,
          role: invite.role, firstName: invite.firstName, email: invite.email } });
      } else publish(status);
    }).catch(error => { if (active && revision === generation) { clearWait(); publish(accessErrorState(error)); } });
  };
  const fail = error => {
    revision++; clearWait();
    const status = accessErrorState(error);
    reportDiagnostic('profile', error);
    if (cached && !isAccessCacheDenied(denialScope) && status === 'network-error') {
      publish('offline-assisted', { profile: { ...cached, uid: user.uid, email: user.email ?? cached.email, accessVerified: false } });
    } else {
      if (['permission-denied', 'suspended', 'auth-unverified'].includes(status)) recordAccessDenial(denialScope, true);
      cached = null;
      publish(status);
    }
  };
  const listen = () => {
    const generation = ++watchGeneration;
    watchFailed = false;
    stop = subscribe(user.uid, (data, metadata) => {
      if (active && generation === watchGeneration && (!checking || isServerSnapshot(metadata))) receive(data, metadata);
    }, error => {
      if (!active || generation !== watchGeneration) return;
      watchFailed = true;
      fail(error);
    });
  };
  wait();
  listen();
  return {
    close() { active = false; revision++; clearWait(); stop(); },
    recheck({ refresh = false } = {}) {
      if (!active || !readProfile || accepting) return Promise.resolve(null);
      if (checking) return checking;
      const generation = ++revision;
      clearWait();
      publish('loading');
      checking = withAccessDeadline(async signal => {
        if (refresh) await refreshCredentials?.();
        if (!active || signal.aborted) return null;
        return readProfile(user.uid);
      }, confirmationMs).then(snapshot => {
        if (active && snapshot && generation === revision) receive(snapshot.data, snapshot.metadata);
        if (active && currentProfile && watchFailed) { stop(); listen(); }
        return active ? currentProfile : null;
      }, error => {
        if (active && generation === revision) fail(error);
        return null;
      }).finally(() => { checking = null; });
      return checking;
    },
    async accept() {
      if (!active || accepting || currentState !== 'needs-invite') return;
      accepting = true;
      wait();
      try {
        await acceptInvite(user);
        if (active && readProfile) { const snapshot = await readProfile(user.uid); receive(snapshot.data, snapshot.metadata); }
      } catch (error) { if (active && currentState !== 'ready') { clearWait(); publish(accessErrorState(error)); } }
      finally { accepting = false; }
    },
  };
}
