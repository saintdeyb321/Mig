// src/hooks/useAuthManager.js
import { useState, useEffect } from 'react';
import { auth } from '../core/firebase/client';
import { getUser, getInvite, createInvitedProfile, deleteInvite, subscribeProfile } from '../features/users/infrastructure/userRepository';
import { isPermissionDenied } from '../core/errors/firebaseErrors';
import { createSubscriptionScope } from '../shared/utils/subscriptionScope';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import { isWithinShift } from '../core/auth/shiftAccess';
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
  // Suscripción de autenticación y perfil.
  useEffect(() => {
    let unsubscribeProfile = null;
    const authScope = createSubscriptionScope();
    const retryTimers = new Set();

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const generation = authScope.next();
      const isCurrent = () => authScope.isCurrent(generation);
      unsubscribeProfile?.();
      retryTimers.forEach(clearTimeout);
      retryTimers.clear();
      setUser(null);
      if (!firebaseUser) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      try {
        const authenticatedEmail = firebaseUser.email;
        const profile = await getUser(firebaseUser.uid);
        if (!isCurrent()) return;

        // Si no existe, crear desde invitación
        if (!profile) {
          const inviteData = await getInvite(authenticatedEmail);
          if (!isCurrent()) return;

          if (inviteData) {
            await createInvitedProfile(firebaseUser.uid, {
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
            if (!isCurrent()) return;
            await deleteInvite(authenticatedEmail);
            if (!isCurrent()) return;
          } else {
            handleSecurityExit('Tu correo no está registrado en el sistema.');
            return;
          }
        }
        let profileRevision = 0;
        const subscribeToProfile = (retryCount = 0) => {
          if (!isCurrent()) return;
          if (unsubscribeProfile) unsubscribeProfile();

          unsubscribeProfile = subscribeProfile(firebaseUser.uid, async (userData) => {
            const revision = ++profileRevision;
            if (!isCurrent()) return;
            try {
              if (!userData) {
                handleSecurityExit('Tu cuenta ha sido eliminada.');
                return;
              }


              if (!userData.role || (!userData.businessId && userData.role !== 'superadmin')) return; // Faltan datos críticos

              if (userData.status === 'inactivo') {
                handleSecurityExit('Cuenta suspendida. Contacta al administrador.');
                return;
              }

              // Comprobación de horario UI; Rules y Functions conservan la autorización real.
              if (!isWithinShift(userData)) {
                handleSecurityExit(`Fuera de horario. Turno: ${userData.shiftStart} a ${userData.shiftEnd}`);
                return;
              }

              // Usuario válido, actualizamos estado y quitamos loader
              if (!isCurrent() || revision !== profileRevision) return;
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...userData });
              setAuthLoading(false);

            } catch (innerError) {
              if (!isCurrent() || revision !== profileRevision) return;
              console.error('Error en snapshot:', innerError);
              handleSecurityExit('Error al cargar perfil.');
            }
          },
          (error) => {
            if (!isCurrent()) return;
            if (isPermissionDenied(error)) {
              console.warn(`⏳ Permiso denegado por delay de Firebase (Intento ${retryCount + 1}). Reintentando...`);
              if (retryCount < 3) {
                // Si falla, esperamos medio segundo y volvemos a intentar conectarnos
                const timer = setTimeout(() => {
                  retryTimers.delete(timer);
                  subscribeToProfile(retryCount + 1);
                }, 500);
                retryTimers.add(timer);
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
        if (!isCurrent()) return;
        console.error('Error al configurar Auth:', error);
        handleSecurityExit('Error interno al iniciar sesión.');
      }
    });

    return () => {
      authScope.close();
      retryTimers.forEach(clearTimeout);
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);
  return { user, authLoading, handleLogout };
};
