import { isAccessCacheDenied, recordAccessDenial } from './operationAccess.js';
import { accessErrorState, profileAccess, cachedProfileAccess } from './accessState.js';

// Cache supports presentation only. A bounded neutral wait avoids F5 restriction flashes.
export function createProfileSession({ user, subscribe, readInvite, acceptInvite, readProfile, withinShift, onState,
  schedule = setTimeout, cancel = clearTimeout, confirmationMs = 10000 }) {
  const denialScope = `profile:${user.uid}`;
  let cached = null;
  let active = true, revision = 0, accepting = false, currentState = 'loading', timer = null, expired = false;
  const clearWait = () => { if (timer !== null) cancel(timer); timer = null; expired = false; };
  const publish = (status, extra = {}) => {
    if (!active) return;
    currentState = status;
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
  wait();
  const unsubscribe = subscribe(user.uid, receive, error => {
    if (active) {
      revision++; clearWait();
      if (cached && !isAccessCacheDenied(denialScope) && accessErrorState(error) === 'network-error') publish('offline-assisted', { profile: { ...cached, uid: user.uid, email: user.email ?? cached.email, accessVerified: false } });
      else { if (accessErrorState(error) === 'permission-denied') recordAccessDenial(denialScope, true); cached = null; publish(accessErrorState(error)); }
    }
  });
  return {
    close() { active = false; revision++; clearWait(); unsubscribe(); },
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
