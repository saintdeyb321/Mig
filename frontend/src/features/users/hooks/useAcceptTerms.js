import { useRef, useState } from 'react';
import { acceptTerms } from '../infrastructure/userRepository';
import { getFirebaseErrorCode } from '../../../core/errors/firebaseErrors.js';
import { withAccessDeadline } from '../../../core/session/accessDeadline.js';

export function useAcceptTerms(user) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const handleAccept = async () => {
    if (pending.current) return;
    pending.current = true;
    setIsAccepting(true);
    setError('');
    try {
      await withAccessDeadline(() => acceptTerms(user));
      // The existing server profile subscription dismisses the gate.
    } catch (failure) {
      const code = getFirebaseErrorCode(failure);
      setError(['permission-denied', 'unauthenticated'].includes(code)
        ? 'Tu cuenta no tiene permiso para registrar la aceptación. Comprueba tu acceso con el administrador.'
        : 'Aún no se pudo confirmar la aceptación. Comprueba la conexión y vuelve a intentarlo.');
      pending.current = false;
      setIsAccepting(false);
    }
  };
  return { isAccepting, handleAccept, error };
}
