import { Button } from "../shared/ui";
import { brand } from '../config/brand';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
const AUTO_RELOAD_DELAY = 60 * 60 * 1000; // 1 hora
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutos
const IGNORE_DURATION = 2 * 60 * 60 * 1000; // 2 horas

export default function ReloadPrompt({
  user
}) {
  // 🚀 FIX DE ESLINT (Lazy Initialization):
  // En lugar de usar un useEffect que renderiza doble, leemos el localStorage
  // al momento exacto de crear el estado. Es más rápido, seguro y elimina la advertencia.
  const [isIgnoredUI, setIsIgnoredUI] = useState(() => {
    try {
      const ignoredTimestamp = localStorage.getItem('ignoredUpdateTimestamp');
      if (ignoredTimestamp) {
        const elapsed = Date.now() - parseInt(ignoredTimestamp, 10);
        if (elapsed < IGNORE_DURATION) {
          return true; // Sigue ignorado
        } else {
          localStorage.removeItem('ignoredUpdateTimestamp'); // Ya pasó el castigo
        }
      }
    } catch (error) {
      console.warn("Error leyendo historial de actualizaciones", error);
    }
    return false;
  });
  const autoReloadTimerRef = useRef(null);
  const intervalRef = useRef(null);
  const visibilityHandlerRef = useRef(null);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      intervalRef.current = setInterval(() => {
        if (navigator.onLine) r.update();
      }, UPDATE_INTERVAL);
      visibilityHandlerRef.current = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          r.update();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandlerRef.current);
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    }
  });

  // Limpieza de memoria (Unmount)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      }
      if (autoReloadTimerRef.current) clearTimeout(autoReloadTimerRef.current);
    };
  }, []);

  // Recarga automática de seguridad (1 hora)
  useEffect(() => {
    if (needRefresh) {
      if (autoReloadTimerRef.current) clearTimeout(autoReloadTimerRef.current);
      autoReloadTimerRef.current = setTimeout(() => {
        console.log('Recarga automática ejecutada por actualización pendiente');
        updateServiceWorker(true);
      }, AUTO_RELOAD_DELAY);
    }
  }, [needRefresh, updateServiceWorker]);
  const handleIgnore = () => {
    setIsIgnoredUI(true);
    try {
      localStorage.setItem('ignoredUpdateTimestamp', Date.now().toString());
    } catch (error) {
      console.warn("Error guardando el estado", error);
    }
  };
  if (!user) return null;

  // Si no hay nada que actualizar, o si hay actualización pero el usuario le dio a "Ignorar"
  if (!needRefresh && !offlineReady || needRefresh && isIgnoredUI) {
    return null;
  }
  return <div className="animate-enter motion-reduce:animate-none fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-6 bg-panel border border-line rounded-xl shadow-card p-5 z-50 sm:max-w-sm">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="text-2xl">{needRefresh ? '🚀' : '📱'}</span>
        <h4 className="m-0 text-lg text-ink">
          {needRefresh ? 'Nueva actualización' : 'App lista sin conexión'}
        </h4>
      </div>

      <p className="mb-4 text-sm leading-snug text-muted">
        {needRefresh ? `Hay una nueva versión de ${brand.name} disponible. Actualiza para disfrutar las mejoras.` : 'La interfaz está disponible sin conexión. Las operaciones pendientes requieren un repositorio Spark habilitado para confirmarse.'}
      </p>

      <div className="flex gap-2.5">
        {needRefresh ? <>
            <Button onClick={handleIgnore} type="button" variant="secondary" className="min-w-0 flex-1 p-2 bg-transparent border border-line text-ink rounded-lg cursor-pointer text-sm font-bold">
              Ignorar (2h)
            </Button>
            <Button onClick={() => updateServiceWorker(true)} type="button" variant="primary" className="min-w-0 flex-1 p-2 border-0 rounded-lg cursor-pointer text-sm font-bold">
              Actualizar
            </Button>
          </> : <Button onClick={() => setOfflineReady(false)} type="button" variant="success" className="w-full p-2 border-0 rounded-lg cursor-pointer text-sm font-bold">
            Entendido
          </Button>}
      </div>
    </div>;
}
