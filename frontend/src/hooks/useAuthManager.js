import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../core/firebase/client';
import { acceptInvitedProfile, getInviteFromServer, subscribeProfile } from '../features/users/infrastructure/userRepository';
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
      if (!firebaseUser) { status.current = 'anonymous'; setState({ uid: null, status: 'anonymous', profile: null }); return; }
      session.current = createProfileSession({ user: firebaseUser, subscribe: subscribeProfile,
        readInvite: getInviteFromServer, acceptInvite: acceptInvitedProfile,
        withinShift: userData => isWithinShift(userData), onState: next => {
          if (active && auth.currentUser?.uid === next.uid) { status.current = next.status; setState(next); }
        } });
    });
    const reconnect = () => { if (!['ready', 'anonymous'].includes(status.current)) retryAuth(); };
    window.addEventListener('online', reconnect);
    return () => { active = false; stop(); unsubscribe(); window.removeEventListener('online', reconnect); };
  }, [attempt, retryAuth]);
  const handleLogout = useCallback(() => signOut(auth), []);
  const acceptProfileInvitation = useCallback(() => session.current?.accept(), []);
  const matches = state.uid === (auth.currentUser?.uid ?? null);
  return {
    user: matches && state.status === 'ready' ? state.profile : null,
    authLoading: !matches || state.status === 'loading',
    authIssue: matches && !['ready', 'anonymous', 'loading'].includes(state.status) ? state.status : null,
    retryAuth, handleLogout, acceptProfileInvitation,
  };
};
