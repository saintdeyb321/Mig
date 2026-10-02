import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const AUTO_RELOAD_DELAY = 60 * 60 * 1000; // 1 hora
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutos
const IGNORE_DURATION = 2 * 60 * 60 * 1000; // 2 horas

export default function ReloadPrompt({ user }) {
  
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
    updateServiceWorker,
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
    },
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
  if ((!needRefresh && !offlineReady) || (needRefresh && isIgnoredUI)) {
    return null;
  }

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 12,
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        padding: 20,
        zIndex: 10000,
        maxWidth: 350,
        borderLeft: `5px solid ${needRefresh ? 'var(--primary, #2563eb)' : '#10b981'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: '1.5rem' }}>{needRefresh ? '🚀' : '📱'}</span>
        <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>
          {needRefresh ? 'Nueva actualización' : 'App lista sin conexión'}
        </h4>
      </div>

      <p style={{ marginBottom: 15, fontSize: '0.9rem', lineHeight: 1.4, color: 'var(--text-muted)' }}>
        {needRefresh
          ? 'Hay una nueva versión de MigaPOS disponible. Actualiza para disfrutar las mejoras.'
          : 'La aplicación ahora funciona incluso si se cae el internet.'}
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        {needRefresh ? (
          <>
            <button
              onClick={handleIgnore}
              style={{
                flex: 1,
                padding: 8,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}
            >
              Ignorar (2h)
            </button>
            <button
              onClick={() => updateServiceWorker(true)}
              style={{
                flex: 1,
                padding: 8,
                background: 'var(--primary)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}
            >
              Actualizar
            </button>
          </>
        ) : (
          <button
            onClick={() => setOfflineReady(false)}
            style={{
              width: '100%',
              padding: 8,
              background: '#10b981',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}
          >
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}