import { isAccessCacheDenied, recordAccessDenial } from './operationAccess.js';
import { accessErrorState, profileAccess, cachedProfileAccess, isServerSnapshot } from './accessState.js';
import { withAccessDeadline } from './accessDeadline.js';
import { reportDiagnostic } from '../errors/diagnostics.js';
import { legalConfirmationComplete } from '../../features/legal/publication.js';

// This per-tab hint only budgets a server check. Write authority remains in memory.
export function createAccessRecovery(scope, now = Date.now) {
  const key = `migapos:access-recovery:${scope}`;
  let confirmed = false, attempted = false, last = -Infinity;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    confirmed = saved?.confirmed === true;
    if (Number.isFinite(saved?.last)) last = saved.last;
  } catch { /* Storage is optional. */ }
  const persist = () => {
    try { sessionStorage.setItem(key, JSON.stringify({ confirmed, last })); } catch { /* In-memory budget remains available. */ }
  };
  return {
    confirm() {
      attempted = false;
      if (!confirmed) { confirmed = true; persist(); }
    },
    take() {
      const time = now();
      if (!confirmed || attempted || time - last < 30000) return false;
      attempted = true;
      last = time;
      persist();
      return true;
    },
  };
}

// Cache supports presentation only. A bounded neutral wait avoids F5 restriction flashes.
export function createProfileSession({ user, subscribe, readInvite, acceptInvite, readProfile, refreshCredentials, withinShift, onState,
  schedule = setTimeout, cancel = clearTimeout, confirmationMs = 10000, project }) {
  const denialScope = `profile:${user.uid}`;
  const recovery = createAccessRecovery(JSON.stringify([project, 'profile', user.uid]));
  let cached = null;
  let active = true, revision = 0, accepting = false, currentState = 'loading', currentProfile = null, timer = null, expired = false;
  let checking = null, watchFailed = false, stop = () => {}, watchGeneration = 0, invitation = null;
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
  const receive = (data, metadata, fromWatch = false) => {
    if (!active) return;
    const generation = ++revision;
    if (accepting && (!isServerSnapshot(metadata) || !data)) return;
    cached = cachedProfileAccess(data, metadata, user, withinShift) ? data : null;
    const status = profileAccess(data, metadata, withinShift);
    if (status === 'offline-unverified') {
      if (cached && !isAccessCacheDenied(denialScope)) { clearWait(); publish('offline-assisted', { profile: { ...cached, uid: user.uid, email: user.email ?? cached.email, accessVerified: false } }); }
      else wait();
      return;
    }
    clearWait();
    recordAccessDenial(denialScope, status !== 'ready');
    if (status === 'ready') recovery.confirm();
    if (status !== 'profile-not-found-confirmed') {
      publish(status, status === 'ready' ? { profile: { ...data, uid: user.uid, email: user.email ?? data.email, accessVerified: true } } : {});
      return;
    }
    if (fromWatch && !checking && readProfile && globalThis.navigator?.onLine !== false && recovery.take()) {
      publish('loading');
      queueMicrotask(() => { if (active && revision === generation) void recheck({ refresh: true }); });
      return;
    }
    // Invitation discovery/acceptance is part of onboarding, never an interim error.
    if (!user.email || !user.emailVerified || !user.providerData?.some(provider => provider.providerId === 'google.com')) {
      publish(status); return;
    }
    wait();
    void readInvite(user.email).then(invite => {
      if (!active || revision !== generation || accepting) return;
      clearWait();
      if (invite && invite.email === user.email && ['dueño', 'cajero'].includes(invite.role)
        && invite.businessId && invite.status !== 'inactivo') {
        invitation = { businessId: invite.businessId, businessName: invite.businessName,
          role: invite.role, firstName: invite.firstName, email: invite.email, branchId: invite.branchId ?? null };
        publish('needs-invite', { invitation });
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
      if (active && generation === watchGeneration && (!checking || isServerSnapshot(metadata))) receive(data, metadata, true);
    }, error => {
      if (!active || generation !== watchGeneration) return;
      watchFailed = true;
      fail(error);
    });
  };
  const recheck = ({ refresh = false } = {}) => {
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
  };
  wait();
  listen();
  return {
    close() { active = false; revision++; clearWait(); stop(); },
    recheck,
    async accept(confirmation) {
      if (!active || accepting || currentState !== 'needs-invite') return;
      if (!legalConfirmationComplete(confirmation)) throw new Error('Confirma ambos documentos para activar tu cuenta.');
      accepting = true;
      clearWait();
      try {
        await acceptInvite(user, confirmation, invitation);
        if (active && readProfile && currentState === 'needs-invite') {
          const snapshot = await withAccessDeadline(() => readProfile(user.uid), confirmationMs);
          if (!snapshot.data || !isServerSnapshot(snapshot.metadata)) {
            throw new Error('Aún no se pudo confirmar la activación. Comprueba la conexión y vuelve a intentarlo.');
          }
          receive(snapshot.data, snapshot.metadata);
        }
      } catch (error) { if (active && currentState !== 'ready') throw error; }
      finally { accepting = false; }
    },
  };
}
