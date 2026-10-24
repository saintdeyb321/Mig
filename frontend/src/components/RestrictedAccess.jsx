import { Button } from "../shared/ui";
// src/components/RestrictedAccess.jsx
import React, { memo, useCallback } from 'react';
import { auth } from '../core/firebase/client';
import { signOut } from 'firebase/auth';
import { brand } from '../config/brand';
const accessMessages = {
  'profile-not-found-confirmed': ['Perfil no encontrado', 'El servidor no devolvió un perfil de acceso para esta cuenta. Esto no significa que se haya eliminado tu cuenta Google. Solicita al administrador que revise el perfil o la invitación.'],
  'needs-invite': ['Invitación disponible', 'El servidor confirmó una invitación para tu cuenta Google. Puedes aceptarla para crear tu perfil de acceso; no se recreará automáticamente.'],
  'profile-incomplete': ['Perfil incompleto', 'El perfil no contiene un rol, negocio o sede válidos. Pide al administrador que revise la asignación; no se cambiarán permisos automáticamente.'],
  'license-missing-confirmed': ['Licencia no encontrada', 'El servidor no devolvió la licencia de este negocio. El registro del negocio está presente; consulta al administrador antes de realizar operaciones.'],
  'tenant-missing-confirmed': ['Configuración no encontrada', 'El servidor no devolvió los registros de negocio y licencia esperados. Esto no demuestra una eliminación: el administrador debe revisar la configuración y el proyecto.'],
  'permission-denied': ['Lectura no autorizada', 'Firestore rechazó la lectura de acceso. Revisa con el administrador el perfil, negocio y Rules realmente publicadas. Tu sesión Google sigue iniciada.'],
  'offline-unverified': ['Acceso sin verificar', 'Solo hay información local o cambios sin confirmar. Espera la conexión con el servidor o vuelve a comprobar. Los datos pendientes del dispositivo se conservan.'],
  'network-error': ['Conexión pendiente', 'No se pudo confirmar el acceso con Firestore. Revisa Internet y reintenta; no es una confirmación de que tu cuenta o negocio hayan desaparecido.'],
  'configuration-error': ['Configuración pendiente', 'El acceso no se pudo validar con la configuración recibida. Pide al administrador que revise perfil, negocio y licencia.'],
  'suspended': ['Acceso suspendido', 'El perfil, negocio o licencia tienen una suspensión confirmada. Contacta al administrador; puedes reintentar después de la regularización.'],
  'shift-denied': ['Fuera de horario', 'El turno configurado no permite operar ahora. Consulta al administrador si la asignación no corresponde.'],
};

const RestrictedAccess = memo(({
  licenseState,
  expirationDateStr,
  user, onRetry, onLogout, onAcceptInvitation
}) => {
  const handleSignOut = useCallback(async () => {
    try {
      if (onLogout) await onLogout(); else await signOut(auth);
    } catch (error) {
      console.error("Error al salir:", error);
    }
  }, [onLogout]);
  const [title, message] = licenseState === 'expired' ? ['Suscripción vencida', `Tu suscripción venció el ${expirationDateStr}. Comunícate con el administrador para renovarla.`] : accessMessages[licenseState] ?? ['Acceso sin verificar', 'No se pudo comprobar el acceso. Reintenta o consulta al administrador.'];
  return <div className="animate-enter motion-reduce:animate-none h-dvh w-screen flex flex-col justify-center items-center bg-ink text-panel p-5 text-center z-50">
      <span className="text-4xl mb-2.5">🛑</span>
      <h1 className="text-danger-soft mb-2.5">
        {title}
      </h1>

      <p className="text-lg w-full max-w-lg text-line mb-7.5 leading-relaxed">
        {message}
      </p>

      {user?.role === 'dueño' && (brand.billingUrl || brand.supportUrl) && <div className="bg-panel text-ink p-6 rounded-xl mb-7.5 max-w-80 w-full">
          <h3>Contacto de plataforma</h3>
          {brand.billingUrl && <p><a href={brand.billingUrl} target="_blank" rel="noopener noreferrer">Gestionar suscripción</a></p>}
          {brand.supportUrl && <p><a href={brand.supportUrl} target="_blank" rel="noopener noreferrer">Soporte</a></p>}
        </div>}

      {/* 🚀 Usamos la función blindada aquí */}
      {onAcceptInvitation && <Button onClick={onAcceptInvitation}>Aceptar mi invitación</Button>}
      {onRetry && <Button onClick={onRetry}>Volver a comprobar acceso</Button>}
      <Button onClick={handleSignOut} type="button" variant="secondary" className="bg-transparent border border-muted text-panel py-3 px-6 rounded-xl cursor-pointer font-bold">
        Salir Ahora
      </Button>
    </div>;
});
export default RestrictedAccess;
