// src/hooks/useNetworkStatus.js
import { useSyncExternalStore } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';

// 1. Definimos cómo suscribirnos a los eventos del navegador
const subscribe = (callback) => {
  const changed = () => { reportDiagnostic('network', null, navigator.onLine ? 'confirmed' : 'offline'); callback(); };
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  
  // Limpieza automática
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};

// 2. Definimos de dónde sacar el dato actual
const getSnapshot = () => {
  return navigator.onLine;
};

// 3. El Hook definitivo
export const useNetworkStatus = () => {
  // useSyncExternalStore es la forma oficial de React para leer APIs del navegador
  return useSyncExternalStore(subscribe, getSnapshot);
};
