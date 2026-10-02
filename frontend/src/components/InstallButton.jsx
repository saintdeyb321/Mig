// src/components/InstallButton.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function InstallButton() {
  const [deviceInfo] = useState(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return { isStandalone, isApple };
  });

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(deviceInfo.isStandalone);

  useEffect(() => {
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', () => setIsInstalled(true));
    };
  }, [isInstalled]);

  const handleInstallClick = async () => {
    // 1. iOS: Única excepción porque Apple bloquea la instalación programática.
    if (deviceInfo.isApple) {
      toast('En iPhone/iPad:\n1. Toca "Compartir" ⬆️\n2. Toca "Agregar a inicio" ➕', {
        icon: '📱', 
        duration: 6000,
        style: { maxWidth: '350px', background: '#312e81', color: '#fff' }
      });
      return;
    }

    // 2. PC / Android: Disparamos el modal nativo de instalación.
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    }
  };

  // 🚀 UX HEURÍSTICA ESTRICTA:
  // Si ya está instalado, o si Chrome NO nos entrega el evento nativo, 
  // EL BOTÓN SE OCULTA. Cero botones falsos. Cero acciones manuales frustrantes.
  if (isInstalled) return null;
  if (!deferredPrompt && !deviceInfo.isApple) return null;

  return (
    <button onClick={handleInstallClick} className="btn-pwa-install fade-in">
      {deviceInfo.isApple ? 'Instalar App (iOS)' : 'Instalar ahora'}
    </button>
  );
}