// src/hooks/useAuthManager.js
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { getOfficialTime } from '../utils/security';

// 🚀 OPTIMIZACIÓN GLOBAL: Caché de la hora oficial (Válido por 60 segundos)
let cachedTime = null;
let lastTimeFetch = 0;

const getCachedOfficialTime = async () => {
  const now = Date.now();
  if (cachedTime && (now - lastTimeFetch < 60000)) {
    return cachedTime; 
  }
  cachedTime = await getOfficialTime();
  lastTimeFetch = now;
  return cachedTime;
};

export const useAuthManager = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const handleSecurityExit = async (message) => {
    toast.error(message, { id: 'auth-security-error', duration: 6000 });
    await signOut(auth);
    setUser(null);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  // =========================================================
  // 1️⃣ FLUJO DE AUTENTICACIÓN Y SNAPSHOT
  // =========================================================
  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (unsubscribeProfile) unsubscribeProfile();
        setUser(null);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      try {
        const emailLower = firebaseUser.email.toLowerCase().trim();
        const userRef = doc(db, 'users', firebaseUser.uid);

        // Verificar si el documento existe
        const userSnap = await getDoc(userRef);

        // Si no existe, crear desde invitación
        if (!userSnap.exists()) {
          const inviteRef = doc(db, 'invites', emailLower);
          const inviteSnap = await getDoc(inviteRef);
          
          if (inviteSnap.exists()) {
            const inviteData = inviteSnap.data();
            await setDoc(userRef, {
              email: inviteData.email,
              firstName: inviteData.firstName || '',
              lastName: inviteData.lastName || '',
              role: inviteData.role,
              businessId: inviteData.businessId,
              branchId: inviteData.branchId || null,
              shiftStart: inviteData.shiftStart || null,
              shiftEnd: inviteData.shiftEnd || null,
              status: inviteData.status || 'activo',
              createdAt: new Date().toISOString(),
            });
            await deleteDoc(inviteRef);
          } else {
            handleSecurityExit('Tu correo no está registrado en el sistema.');
            return;
          }
        }

        // 🚀 FIX: Envolvemos la suscripción en una función para poder reintentar
        const subscribeToProfile = (retryCount = 0) => {
          if (unsubscribeProfile) unsubscribeProfile();

          unsubscribeProfile = onSnapshot(userRef, async (docSnap) => {
            try {
              if (!docSnap.exists()) {
                handleSecurityExit('Tu cuenta ha sido eliminada.');
                return;
              }

              const userData = docSnap.data();

              if (!userData.businessId || !userData.role) return; // Faltan datos críticos

              if (userData.status === 'inactivo') {
                handleSecurityExit('Cuenta suspendida. Contacta al administrador.');
                return;
              }

              // VALIDACIÓN BLOQUEANTE OPTIMIZADA (Gatekeeper)
              if (userData.role === 'cajero' && userData.shiftStart && userData.shiftEnd) {
                const horaActual = await getCachedOfficialTime(); 
                if (horaActual < userData.shiftStart || horaActual > userData.shiftEnd) {
                  handleSecurityExit(`Fuera de horario. Turno: ${userData.shiftStart} a ${userData.shiftEnd}`);
                  return;
                }
              }

              // Usuario válido, actualizamos estado y quitamos loader
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...userData });
              setAuthLoading(false);
              
            } catch (innerError) {
              console.error('Error en snapshot:', innerError);
              handleSecurityExit('Error al cargar perfil.');
            }
          }, 
          // 🚀 FIX: Manejador de Errores del Snapshot
          (error) => {
            if (error.code === 'permission-denied') {
              console.warn(`⏳ Permiso denegado por delay de Firebase (Intento ${retryCount + 1}). Reintentando...`);
              if (retryCount < 3) {
                // Si falla, esperamos medio segundo y volvemos a intentar conectarnos
                setTimeout(() => subscribeToProfile(retryCount + 1), 500);
              } else {
                handleSecurityExit('Problemas de permisos con el servidor. Por favor, recarga la página.');
              }
            } else {
              console.error('Error de conexión en el perfil:', error);
              handleSecurityExit('Se perdió la conexión con tu perfil.');
            }
          });
        };

        // Iniciamos la suscripción la primera vez
        subscribeToProfile();

      } catch (error) {
        console.error('Error al configurar Auth:', error);
        handleSecurityExit('Error interno al iniciar sesión.');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // =========================================================
  // 2️⃣ EL "WATCHDOG" DE SEGURIDAD (Cronómetro en vivo)
  // =========================================================
  useEffect(() => {
    if (!user || user.role !== 'cajero' || !user.shiftStart || !user.shiftEnd) return;

    const interval = setInterval(async () => {
      const horaActual = await getOfficialTime(); 
      if (horaActual > user.shiftEnd) {
        handleSecurityExit(`Tu turno ha terminado (${user.shiftEnd}). Sesión cerrada por seguridad.`);
      }
    }, 60000); // 1 minuto

    return () => clearInterval(interval);
  }, [user]); 

  return { user, authLoading, handleLogout };
};