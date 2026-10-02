// src/components/MaintenanceScreen.jsx
import React from 'react';

export default function MaintenanceScreen({ message }) {
  return (
    <div className="maintenance-screen fade-in">
      <div className="maintenance-content">
        
        {/* Sección de medios (GIF) */}
        <div className="maintenance-media-container">
          <img 
            src="/img/Mantenimiento.gif" 
            alt="Mantenimiento en progreso" 
            className="maintenance-gif"
          />
        </div>

        {/* Título más amigable y con el color de la marca */}
        <h1 style={{ color: '#43278e', marginBottom: '15px', marginTop: '10px' }}>
          Actualizando MigaPOS
        </h1>
        
        {/* Mensaje fijo: Corto, directo y tranquilizador */}
        <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '10px' }}>
          Estamos aplicando mejoras rápidas. <strong>Tus ventas y datos están 100% a salvo.</strong>
        </p>
        
        {/* Mensaje dinámico de Firebase (Solo se muestra si escribiste algo) */}
        {message && (
          <p style={{ fontSize: '1rem', color: 'var(--primary)', fontWeight: '600', padding: '10px', background: 'rgba(67, 39, 142, 0.05)', borderRadius: '8px' }}>
            💬 {message}
          </p>
        )}
        
        {/* Footer sutil */}
        <p className="maintenance-footer">Gracias por tu paciencia. Regresamos en unos minutos.</p>
        
        {/* Botón centralizado */}
        <button 
          onClick={() => window.location.reload()} 
          className="maintenance-btn"
        >
          Revisar si ya volvió
        </button>
      </div>
    </div>
  );
}