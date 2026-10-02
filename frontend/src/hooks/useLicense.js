// src/hooks/useLicense.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';

export const useLicense = (user) => {
  const [active, setActive] = useState(false); 
  const [daysLeft, setDaysLeft] = useState(0);
  const [isFetching, setIsFetching] = useState(true);

  const isLoading = !user?.businessId ? false : isFetching;
  const expiryRef = useRef(null);

  useEffect(() => {
    if (!user?.businessId) {
      return;
    }

    const licenseRef = doc(db, 'licenses', user.businessId);

    // 🚀 BLINDAJE 1: Este onSnapshot ahora SÓLO se ejecutará 1 vez al iniciar sesión.
    // Cero reconexiones fantasma a Firebase.
    const unsubscribe = onSnapshot(licenseRef, (licenseSnap) => {
      if (licenseSnap.exists()) {
        const data = licenseSnap.data();
        const now = new Date();
        const expiry = data.expiry?.toDate ? data.expiry.toDate() : new Date(data.expiry);
        
        expiryRef.current = expiry;
        
        const isTimeValid = expiry > now;
        const isManuallyActive = data.status !== 'inactiva'; 
        const isActive = isTimeValid && isManuallyActive;
        
        setActive(isActive);
        
        const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        setDaysLeft(diff);

        if (isActive && diff <= 5 && diff > 0) {
          toast(`Tu licencia vencerá en ${diff} días`, { icon: '⏳', duration: 5000, id: 'license-warning' });
        }
      } else {
        setActive(false);
        setDaysLeft(0);
        expiryRef.current = null;
      }
      
      setIsFetching(false);
    });

    // 🚀 BLINDAJE 2: Temporizador inteligente.
    // Usamos 'prevActive' internamente para evitar meter 'active' en las dependencias.
    const intervalId = setInterval(() => {
      if (expiryRef.current) {
        const now = new Date();
        if (now > expiryRef.current) {
          setActive(prevActive => {
            // Solo disparamos el error si antes ESTABA activa y acaba de expirar
            if (prevActive) {
              toast.error('Tu licencia acaba de expirar en este instante.', { id: 'license-expired' });
              return false;
            }
            return prevActive;
          }); 
        }
      }
    }, 10000); 

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [user?.businessId]); // 🚀 PERFECTO: Ya no depende de 'active'.

  // 🚀 OPTIMIZACIÓN 3: Congelamos el cierre de sesión (useCallback)
  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  }, []);

  return { active, daysLeft, isLoading, handleSignOut };
};