import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from '../core/firebase/client';
import { watchShift } from '../core/auth/shiftAccess';

export const useShiftMonitor = user => {
  const { uid, role, shiftStart, shiftEnd } = user || {};
  useEffect(() => {
    let logoutTimer;
    const stop = watchShift({ role, shiftStart, shiftEnd }, () => {
      toast.error('Sesión finalizada: Tu horario de turno ha terminado.', { duration: 4000, icon: '⏰', id: 'shift-toast' });
      logoutTimer = setTimeout(() => {
        if (auth.currentUser?.uid === uid) signOut(auth).catch(() => toast.error('No se pudo cerrar la sesión.'));
      }, 2000);
    });
    return () => { stop(); clearTimeout(logoutTimer); };
  }, [uid, role, shiftStart, shiftEnd]);
};
