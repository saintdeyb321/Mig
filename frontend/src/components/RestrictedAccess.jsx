import { Button } from "../shared/ui";
// src/components/RestrictedAccess.jsx
import React, { memo, useCallback } from 'react';
import { auth } from '../core/firebase/client';
import { signOut } from 'firebase/auth';
import { brand } from '../config/brand';
const RestrictedAccess = memo(({
  licenseState,
  expirationDateStr,
  user
}) => {
  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al salir:", error);
    }
  }, []);
  return <div className="animate-enter motion-reduce:animate-none h-dvh w-screen flex flex-col justify-center items-center bg-ink text-panel p-5 text-center z-50">
      <span className="text-4xl mb-2.5">🛑</span>
      <h1 className="text-danger-soft mb-2.5">
        {licenseState === 'inactive' ? 'Servicio Suspendido' : 'Acceso Restringido'}
      </h1>

      <p className="text-lg w-full max-w-lg text-line mb-7.5 leading-relaxed">
        {licenseState === 'missing' ? `Este negocio ya no existe en la base de datos de ${brand.name}.` : licenseState === 'inactive' ? 'La cuenta de este negocio ha sido suspendida temporalmente.' : `Tu suscripción expiró el ${expirationDateStr}.`}
        <br /><br />
        {user?.role === 'cajero' ? 'Comunícate de inmediato con el administrador.' : `Renueva tu suscripción para seguir utilizando ${brand.name}.`}
      </p>

      {user?.role === 'dueño' && (brand.billingUrl || brand.supportUrl) && <div className="bg-panel text-ink p-6 rounded-xl mb-7.5 max-w-80 w-full">
          <h3>Contacto de plataforma</h3>
          {brand.billingUrl && <p><a href={brand.billingUrl} target="_blank" rel="noopener noreferrer">Gestionar suscripción</a></p>}
          {brand.supportUrl && <p><a href={brand.supportUrl} target="_blank" rel="noopener noreferrer">Soporte</a></p>}
        </div>}

      {/* 🚀 Usamos la función blindada aquí */}
      <Button onClick={handleSignOut} type="button" variant="secondary" className="bg-transparent border border-muted text-panel py-3 px-6 rounded-xl cursor-pointer font-bold">
        Salir Ahora
      </Button>
    </div>;
});
export default RestrictedAccess;
