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

const RestrictedAccess = memo(({ licenseState, expirationDateStr, user, onRetry, onLogout, onAcceptInvitation }) => {
  
  const handleSignOut = useCallback(async () => {
    try {
      if (onLogout) await onLogout(); else await signOut(auth);
    } catch (error) {
      console.error("Error al salir:", error);
    }
  }, [onLogout]);
  const [title, message] = licenseState === 'expired'
    ? ['Suscripción vencida', `Tu suscripción venció el ${expirationDateStr}. Comunícate con el administrador para renovarla.`]
    : accessMessages[licenseState] ?? ['Acceso sin verificar', 'No se pudo comprobar el acceso. Reintenta o consulta al administrador.'];

  return (
    <div className="fade-in" style={{ 
      height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', 
      justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: 'white', padding: '20px', textAlign: 'center', zIndex: 9999
    }}>
      <span style={{ fontSize: '4rem', marginBottom: '10px' }}>🛑</span>
      <h1 style={{ color: '#f87171', marginBottom: '10px' }}>
        {title}
      </h1>
      
      <p style={{ fontSize: '1.1rem', maxWidth: '450px', color: '#cbd5e1', marginBottom: '30px', lineHeight: '1.5' }}>
        {message}
      </p>

      {user?.role === 'dueño' && (brand.billingUrl || brand.supportUrl) && (
        <div style={{ background: 'white', color: 'black', padding: '25px', borderRadius: '16px', marginBottom: '30px', maxWidth: '320px', width: '100%' }}>
          <h3>Contacto de plataforma</h3>
          {brand.billingUrl && <p><a href={brand.billingUrl} target="_blank" rel="noopener noreferrer">Gestionar suscripción</a></p>}
          {brand.supportUrl && <p><a href={brand.supportUrl} target="_blank" rel="noopener noreferrer">Soporte</a></p>}
        </div>
      )}

      {/* 🚀 Usamos la función blindada aquí */}
      {onAcceptInvitation && <button type="button" onClick={onAcceptInvitation} className="btn-primary">Aceptar mi invitación</button>}
      {onRetry && <button type="button" onClick={onRetry} className="btn-primary">Volver a comprobar acceso</button>}
      <button onClick={handleSignOut} style={{ 
        background: 'transparent', border: '1px solid #475569', color: 'white', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' 
      }}>
        Salir Ahora
      </button>
    </div>
  );
});

export default RestrictedAccess;
