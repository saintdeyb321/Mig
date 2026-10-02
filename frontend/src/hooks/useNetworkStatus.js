// src/hooks/useNetworkStatus.js
import { useSyncExternalStore } from 'react';

// 1. Definimos cómo suscribirnos a los eventos del navegador
const subscribe = (callback) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  
  // Limpieza automática
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
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