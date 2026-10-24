import { accessErrorState, profileAccess } from './accessState.js';

// A session owns its listener and outstanding invitation reads. Closing it makes
// every late callback inert; cache misses and errors never sign out Firebase.
export function createProfileSession({ user, subscribe, readInvite, acceptInvite, withinShift, onState }) {
  let active = true, revision = 0, accepting = false, currentState = 'loading';
  const publish = (status, extra = {}) => {
    if (!active) return;
    currentState = status;
    onState({ uid: user.uid, status, profile: null, ...extra });
  };
  publish('loading');
  const unsubscribe = subscribe(user.uid, (data, metadata) => {
    if (!active) return;
    const generation = ++revision;
    const status = profileAccess(data, metadata, withinShift);
    publish(status, status === 'ready' ? { profile: { ...data, uid: user.uid, email: user.email ?? data.email } } : {});
    if (status !== 'profile-not-found-confirmed' || !user.email || !user.emailVerified
      || !user.providerData?.some(provider => provider.providerId === 'google.com')) return;
    void readInvite(user.email).then(invite => {
      if (!active || revision !== generation) return;
      if (invite && invite.email === user.email && ['dueño', 'cajero'].includes(invite.role)
        && invite.businessId && invite.status !== 'inactivo') publish('needs-invite');
    }).catch(error => { if (active && revision === generation) publish(accessErrorState(error)); });
  }, error => { if (active) { revision++; publish(accessErrorState(error)); } });
  return {
    close() { active = false; revision++; unsubscribe(); },
    async accept() {
      if (!active || accepting || currentState !== 'needs-invite') return;
      accepting = true;
      publish('loading');
      try { await acceptInvite(user); }
      catch (error) { if (active && currentState !== 'ready') publish(accessErrorState(error)); }
      finally { accepting = false; }
    },
  };
}
