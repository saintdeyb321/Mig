import { setProfileAuthority, resetAccessAuthority } from '../core/session/operationAccess.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../core/firebase/client';
import { acceptInvitedProfile, getInviteFromServer, getProfileFromServer, subscribeProfile } from '../features/users/infrastructure/userRepository';
import { createProfileSession } from '../core/session/profileSession.js';
import { isWithinShift } from '../core/auth/shiftAccess';

export const useAuthManager = () => {
  const [state, setState] = useState({ uid: null, status: 'loading', profile: null });
  const [attempt, setAttempt] = useState(0);
  const session = useRef(null);
  const status = useRef('loading');
  const retryAuth = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const stop = () => { session.current?.close(); session.current = null; };
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (!active) return;
      stop();
      if (!firebaseUser) { resetAccessAuthority(); status.current = 'anonymous'; setState({ uid: null, status: 'anonymous', profile: null }); return; }
      session.current = createProfileSession({ user: firebaseUser, subscribe: subscribeProfile,
        readInvite: getInviteFromServer, acceptInvite: acceptInvitedProfile, readProfile: getProfileFromServer,
        withinShift: userData => isWithinShift(userData), onState: next => {
          if (active && auth.currentUser?.uid === next.uid) {
            setProfileAuthority(next.profile, next.status === 'ready');
            status.current = next.status;
            setState(previous => next.status === 'loading' && previous.uid === next.uid
              && ['ready', 'offline-assisted'].includes(previous.status)
              && ['dueño', 'cajero'].includes(previous.profile?.role) && previous.profile.hasAcceptedTerms === true
              ? { ...previous, status: 'offline-assisted', profile: { ...previous.profile, accessVerified: false } } : next);
          }
        } });
    });
    const reconnect = () => {
      if (status.current !== 'anonymous') { setProfileAuthority(null, false); retryAuth(); }
    };
    window.addEventListener('online', reconnect);
    return () => { active = false; setProfileAuthority(null, false); stop(); unsubscribe(); window.removeEventListener('online', reconnect); };
  }, [attempt, retryAuth]);
  const handleLogout = useCallback(() => signOut(auth), []);
  const acceptProfileInvitation = useCallback(() => session.current?.accept(), []);
  const matches = state.uid === (auth.currentUser?.uid ?? null);
  return {
    user: matches && ['ready', 'offline-assisted'].includes(state.status) ? state.profile : null,
    authLoading: !matches || state.status === 'loading',
    authIssue: matches && !['ready', 'offline-assisted', 'anonymous', 'loading'].includes(state.status) ? state.status : null,
    invitation: matches ? state.invitation : null, retryAuth, handleLogout, acceptProfileInvitation,
  };
};
