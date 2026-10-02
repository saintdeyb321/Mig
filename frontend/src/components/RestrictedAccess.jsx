// src/components/RestrictedAccess.jsx
import React, { memo, useCallback } from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

// 🚀 OPTIMIZACIÓN 1: React.memo
// Congela toda esta pantalla. Solo se redibujará si cambia el estado de la licencia.
const RestrictedAccess = memo(({ licenseState, expirationDateStr, user }) => {
  
  // 🚀 OPTIMIZACIÓN 2: useCallback
  // Congelamos la función de cerrar sesión para que no se recree en cada renderizado.
  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al salir:", error);
    }
  }, []);

  return (
    <div className="fade-in" style={{ 
      height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', 
      justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: 'white', padding: '20px', textAlign: 'center', zIndex: 9999
    }}>
      <span style={{ fontSize: '4rem', marginBottom: '10px' }}>🛑</span>
      <h1 style={{ color: '#f87171', marginBottom: '10px' }}>
        {licenseState === 'inactive' ? 'Servicio Suspendido' : 'Acceso Restringido'}
      </h1>
      
      <p style={{ fontSize: '1.1rem', maxWidth: '450px', color: '#cbd5e1', marginBottom: '30px', lineHeight: '1.5' }}>
        {licenseState === 'missing' 
          ? 'Este negocio ya no existe en la base de datos de MigaPOS.'
          : licenseState === 'inactive'
          ? 'La cuenta de este negocio ha sido suspendida temporalmente.'
          : `Tu suscripción expiró el ${expirationDateStr}.`
        }
        <br/><br/>
        {user?.role === 'cajero' 
          ? 'Comunícate de inmediato con el administrador.' 
          : 'Renueva tu suscripción para seguir utilizando MigaPOS.'}
      </p>

      {user?.role === 'dueño' && (
        <div style={{ background: 'white', color: 'black', padding: '25px', borderRadius: '16px', marginBottom: '30px', maxWidth: '320px', width: '100%' }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--primary)' }}>Renueva con Yape</h3>
          <p style={{ margin: '0 0 5px 0', fontWeight: '900', fontSize: '1.8rem' }}>975 108 337</p>
          <p style={{ margin: '0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Titular: Deyvid Pariona</p>
        </div>
      )}

      {/* 🚀 Usamos la función blindada aquí */}
      <button onClick={handleSignOut} style={{ 
        background: 'transparent', border: '1px solid #475569', color: 'white', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' 
      }}>
        Salir Ahora
      </button>
    </div>
  );
});

export default RestrictedAccess;