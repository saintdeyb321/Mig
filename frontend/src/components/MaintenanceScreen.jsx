import { Button, Card } from "../shared/ui";
import { brand } from '../config/brand';
// src/components/MaintenanceScreen.jsx
import React from 'react';
export default function MaintenanceScreen({
  message
}) {
  return <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 animate-enter motion-reduce:animate-none">
      <Card className="grid w-full max-w-lg gap-4 p-6 text-center" as="div">

        {/* Sección de medios (GIF) */}
        <div className="flex justify-center">
          <img src="/img/Mantenimiento.gif" alt="Mantenimiento en progreso" className="w-full max-w-52 rounded-xl object-contain" />
        </div>

        {/* Título más amigable y con el color de la marca */}
        <h1 className="text-accent mb-4 mt-2.5">
          Actualizando {brand.name}
        </h1>

        {/* Mensaje fijo: Corto, directo y tranquilizador */}
        <p className="text-lg text-ink leading-relaxed mb-2.5">
          Estamos aplicando mejoras rápidas. <strong>Tus ventas y datos están 100% a salvo.</strong>
        </p>

        {/* Mensaje dinámico de Firebase (Solo se muestra si escribiste algo) */}
        {message && <p className="text-base text-primary font-semibold p-2.5 bg-accent-soft rounded-xl">
            💬 {message}
          </p>}

        {/* Footer sutil */}
        <p className="text-sm text-muted">Gracias por tu paciencia. Regresamos en unos minutos.</p>

        {/* Botón centralizado */}
        <Button onClick={() => window.location.reload()} type="button" variant="secondary">
          Revisar si ya volvió
        </Button>
      </Card>
    </div>;
}
