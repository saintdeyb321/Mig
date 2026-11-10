import { setProfileAuthority, resetAccessAuthority } from '../core/session/operationAccess.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../core/firebase/client';
import { acceptInvitedProfile, getInviteFromServer, getProfileFromServer, subscribeProfile } from '../features/users/infrastructure/userRepository';
import { createProfileSession } from '../core/session/profileSession.js';
import { isWithinShift } from '../core/auth/shiftAccess';

export const useAuthManager = () => {
  const [state, setState] = useState({ uid: null, status: 'loading', profile: null });
  const session = useRef(null);
  const recheckProfile = useCallback((refresh = false) => session.current?.recheck({ refresh }), []);
  const retryAuth = useCallback(() => recheckProfile(true), [recheckProfile]);
  useEffect(() => {
    let active = true;
    let businessGuard = false, lastReconnect = -Infinity;
    const stop = () => { session.current?.close(); session.current = null; };
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (!active) return;
      stop();
      businessGuard = false;
      lastReconnect = -Infinity;
      resetAccessAuthority();
      if (!firebaseUser) { setState({ uid: null, status: 'anonymous', profile: null }); return; }
      session.current = createProfileSession({ user: firebaseUser, subscribe: subscribeProfile,
        readInvite: getInviteFromServer, acceptInvite: acceptInvitedProfile, readProfile: getProfileFromServer,
        refreshCredentials: () => firebaseUser.getIdToken(true),
        withinShift: userData => isWithinShift(userData), onState: next => {
          if (active && auth.currentUser?.uid === next.uid) {
            setProfileAuthority(next.profile, next.status === 'ready');
            if (next.status !== 'loading') businessGuard = ['dueño', 'cajero'].includes(next.profile?.role) && next.profile.hasAcceptedTerms === true;
            setState(previous => next.status === 'loading' && previous.uid === next.uid
              && ['ready', 'offline-assisted'].includes(previous.status)
              && ['dueño', 'cajero'].includes(previous.profile?.role) && previous.profile.hasAcceptedTerms === true
              ? { ...previous, status: 'offline-assisted', profile: { ...previous.profile, accessVerified: false } } : next);
          }
        } });
    });
    const reconnect = () => {
      if (businessGuard || !session.current || Date.now() - lastReconnect < 30000) return;
      lastReconnect = Date.now();
      void recheckProfile();
    };
    window.addEventListener('online', reconnect);
    return () => { active = false; setProfileAuthority(null, false); stop(); unsubscribe(); window.removeEventListener('online', reconnect); };
  }, [recheckProfile]);
  const handleLogout = useCallback(() => signOut(auth), []);
  const acceptProfileInvitation = useCallback(() => session.current?.accept(), []);
  const matches = state.uid === (auth.currentUser?.uid ?? null);
  return {
    user: matches && ['ready', 'offline-assisted'].includes(state.status) ? state.profile : null,
    authLoading: !matches || state.status === 'loading',
    authIssue: matches && !['ready', 'offline-assisted', 'anonymous', 'loading'].includes(state.status) ? state.status : null,
    invitation: matches ? state.invitation : null, retryAuth, recheckProfile, handleLogout, acceptProfileInvitation,
  };
};
