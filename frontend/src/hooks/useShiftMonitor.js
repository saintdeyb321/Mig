// src/hooks/useShiftMonitor.js
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth'; 
import { auth } from '../firebase'; 

export const useShiftMonitor = (user) => {
  // 🚀 OPTIMIZACIÓN 1: El candado de salida (useRef)
  // Nos permite saber si ya empezamos el proceso de cierre de sesión, 
  // reemplazando el uso de document.getElementById que es un anti-patrón en React.
  const isLoggingOut = useRef(false);

  useEffect(() => {
    // Extraemos las variables específicas para tener código más limpio
    const role = user?.role;
    const shiftStart = user?.shiftStart;
    const shiftEnd = user?.shiftEnd;

    if (!role || role === 'dueño' || role === 'superadmin') return;
    if (role === 'cajero' && (!shiftStart || !shiftEnd)) return;

    const checkShift = () => {
      // 🚀 Si ya estamos cerrando la sesión, abortamos para no lanzar doble Toast ni doble signOut
      if (isLoggingOut.current) return;

      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${currentHours}:${currentMinutes}`;

      let isWithinShift = false;

      if (shiftStart < shiftEnd) {
        isWithinShift = currentTime >= shiftStart && currentTime < shiftEnd;
      } else {
        isWithinShift = currentTime >= shiftStart || currentTime < shiftEnd;
      }

      if (!isWithinShift) {
        // Bloqueamos la puerta. El reloj de 10 segundos ya no podrá pasar de aquí.
        isLoggingOut.current = true; 

        // Al pasarle un 'id' fijo a react-hot-toast, la librería misma evita que se duplique
        toast.error('Sesión finalizada: Tu horario de turno ha terminado.', {
          duration: 4000,
          icon: '⏰',
          id: 'shift-toast' 
        });
        
        setTimeout(() => {
          signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
        }, 2000); 
      }
    };

    checkShift();
    const intervalId = setInterval(checkShift, 10000);

    return () => clearInterval(intervalId);
    
    // 🚀 OPTIMIZACIÓN 2: Dependencias Granulares Estrictas
    // En lugar de vigilar a TODO el usuario, solo vigilamos su rol y su horario.
    // Así, si el usuario cambia su foto de perfil o nombre, el reloj no se reinicia innecesariamente.
  }, [user?.role, user?.shiftStart, user?.shiftEnd]); 
};