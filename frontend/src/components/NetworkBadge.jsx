// src/components/NetworkBadge.jsx
import React, { memo } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// 🚀 OPTIMIZACIÓN: React.memo
// Blindamos este indicador. Pase lo que pase en el resto de la aplicación o en la barra de navegación,
// esta pastilla solo gastará procesador en el instante exacto en que se vaya o vuelva el WiFi.
const NetworkBadge = memo(() => {
  const isOnline = useNetworkStatus();

  return (
    <div 
      className={`network-status-pill ${isOnline ? 'online' : 'offline'}`} 
      title={isOnline ? 'Sistema en línea' : 'Trabajando sin conexión'}
    >
      <span className="pulse-dot"></span>
      {/* 🚀 MAGIA: Solo mostramos texto cuando se cae el internet */}
      {!isOnline && <span className="status-text">Sin wifi</span>}
    </div>
  );
});

export default NetworkBadge;