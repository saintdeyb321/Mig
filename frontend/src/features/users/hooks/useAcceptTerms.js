import { useState } from 'react';
import toast from 'react-hot-toast';
import { acceptTerms } from '../infrastructure/userRepository';

export function useAcceptTerms(user, onAccepted) {
  const [isAccepting, setIsAccepting] = useState(false);
  const handleAccept = async () => {
    setIsAccepting(true);
    const loadId = toast.loading('Registrando aceptación...');
    try {
      await acceptTerms(user.uid);
      toast.success('¡Bienvenido a MigaPOS!', { id: loadId });
      onAccepted?.();
    } catch (error) {
      console.error('Error al aceptar términos:', error);
      toast.error('Hubo un problema. Intenta de nuevo.', { id: loadId });
      setIsAccepting(false);
    }
  };
  return { isAccepting, handleAccept };
}
