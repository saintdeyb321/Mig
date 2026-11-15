import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../shared/ui';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hasPendingLocalWork } from '../features/pwa/localUpdateSafety.js';
import { registerPwa } from '../features/pwa/registerPwa.js';
import { activateWaitingWorker, watchPwaRegistration } from '../features/pwa/updateRegistration.js';

const messages = {
  waiting: 'La nueva versión está lista para aplicarse.',
  checking: 'Comprobando el estado de la sesión y los datos locales…',
  activating: 'Activando la nueva versión…',
  done: 'Versión activada. Volviendo a cargar…',
  offline: 'Conéctate para actualizar.',
  google: 'Termina el inicio de sesión con Google y vuelve a intentarlo.',
  work: 'Termina la operación, guarda los formularios y cierra la caja si está abierta. También puedes actualizar desde el inicio de sesión.',
  foreground: 'Vuelve a esta pestaña para continuar.',
  pending: 'Revisa las operaciones pendientes de este dispositivo antes de actualizar.',
  tabs: 'Cierra las demás pestañas de MigaPOS y vuelve a intentarlo.',
  storage: 'No se pudo comprobar el estado de los datos locales. Vuelve a intentarlo.',
  worker: 'No se pudo preparar la actualización. Reintenta o, al terminar, cierra todas las pestañas y ventanas de MigaPOS y vuelve a abrir la app.',
};

export default function ReloadPrompt({ isLogin, signingIn, updating, beginLoginAction, endLoginAction, canUpdateSession }) {
  const online = useNetworkStatus();
  const [waiting, setWaiting] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [discovery, setDiscovery] = useState('idle');
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [registrationAttempt, retryRegistration] = useState(0);
  const watch = useRef(null);
  const registration = useRef(null);
  const policy = useRef(null);
  const lifetime = useRef(null);
  useLayoutEffect(() => { policy.current = { isLogin, signingIn, canUpdateSession }; });

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const pendingRegistration = registerPwa();
    if (!pendingRegistration) return;
    let stopped = false;
    const reconnect = () => retryRegistration(value => value + 1);
    void pendingRegistration.then(registered => {
      if (stopped) return;
      registration.current = registered;
      watch.current = watchPwaRegistration(registered, {
        onWaiting: setWaiting,
        onFailure: () => setDiscovery('error'),
        onCheck: () => setDiscovery('checking'),
        onChecked: () => setDiscovery('idle'),
        onVisibility: setVisible,
      });
    }, () => {
      if (stopped) return;
      setDiscovery('error');
      window.addEventListener('online', reconnect, { once: true });
    });
    return () => {
      stopped = true;
      window.removeEventListener('online', reconnect);
      watch.current?.stop();
      watch.current = null;
      registration.current = null;
    };
  }, [registrationAttempt]);

  const apply = useCallback(async automatic => {
    const registered = registration.current;
    const worker = registered?.waiting;
    if (!worker) {
      if (!automatic) {
        setWaiting(null);
        if (watch.current) void watch.current.check();
        else retryRegistration(value => value + 1);
      }
      return;
    }
    const { signal } = lifetime.current;
    const publish = (phase, reason) => { if (!signal.aborted) setAttempt({ worker, phase, reason }); };
    const blockReason = () => {
      const current = policy.current;
      if (!navigator.onLine) return 'offline';
      if (current.signingIn) return 'google';
      if (document.visibilityState !== 'visible') return 'foreground';
      if (!current.isLogin && (automatic || !current.canUpdateSession())) return 'work';
      return null;
    };
    const reason = blockReason();
    if (reason) { if (!automatic || reason !== 'work') publish('blocked', reason); return; }
    if (!beginLoginAction('update')) return;
    let willReload = false;
    publish('checking');
    try {
      let pending;
      try { pending = await hasPendingLocalWork(); }
      catch { publish('blocked', 'storage'); return; }
      if (signal.aborted) return;
      const rechecked = blockReason();
      if (rechecked || pending) { publish('blocked', rechecked || 'pending'); return; }
      publish('activating');
      if (!await activateWaitingWorker(registered, worker, { signal })) { publish('blocked', 'tabs'); return; }
      if (signal.aborted) return;
      publish('done');
      window.location.reload();
      willReload = true;
    } catch { publish('error', 'worker'); }
    finally { if (!willReload && !signal.aborted) endLoginAction(); }
  }, [beginLoginAction, endLoginAction]);

  useEffect(() => {
    if (!isLogin || signingIn || !waiting || !online || !visible) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void apply(true); });
    return () => { cancelled = true; };
  }, [isLogin, signingIn, waiting, online, visible, apply]);

  const current = waiting && attempt?.worker === waiting ? attempt : null;
  const offline = waiting && !online && !updating;
  const phase = updating ? attempt?.phase ?? 'checking'
    : offline ? 'blocked' : waiting ? current?.phase ?? 'waiting' : discovery;
  const reason = offline ? 'offline' : current?.reason || (phase === 'error' ? 'worker' : phase);
  if (phase === 'idle' || (!waiting && phase === 'checking' && !updating)) return null;
  const canRetry = !updating && (phase === 'error' || phase === 'blocked' || reason === 'offline');

  return <aside aria-label="Actualizaciones" data-update-phase={phase} className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 grid gap-2 rounded-xl border border-line bg-panel p-3 shadow-card sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-xs">
    {waiting && dismissed === waiting && !updating
      ? <Button size="sm" variant="secondary" onClick={() => setDismissed(null)}>Ver actualización disponible</Button>
      : <>
          <div role="status">
            <p className="text-sm font-bold text-brand-deep">{waiting || updating ? 'Nueva actualización disponible' : 'Actualización pendiente'}</p>
            <p className="text-xs leading-relaxed text-muted">{messages[reason]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {waiting && <Button onClick={() => setDismissed(waiting)} disabled={updating} variant="ghost" size="sm">Más tarde</Button>}
            {waiting && <Button onClick={() => void apply(false)} loading={updating} size="sm">Actualizar ahora</Button>}
            {canRetry && <Button onClick={() => void apply(false)} disabled={!online} variant="secondary" size="sm">Reintentar</Button>}
          </div>
        </>}
  </aside>;
}
