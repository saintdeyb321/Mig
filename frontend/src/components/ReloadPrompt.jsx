import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/ui';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hasPendingLocalWork } from '../features/pwa/localUpdateSafety.js';
import { registerPwa } from '../features/pwa/registerPwa.js';
import { activateWaitingWorker, watchPwaRegistration } from '../features/pwa/updateRegistration.js';

export default function ReloadPrompt({ isLogin, signingIn, updating, beginLoginAction, endLoginAction }) {
  const online = useNetworkStatus();
  const [waiting, setWaiting] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [issue, setIssue] = useState(null);
  const [check, setCheck] = useState(0);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [registrationAttempt, retryRegistration] = useState(0);
  const watch = useRef(null);

  useEffect(() => {
    const registration = registerPwa();
    if (!registration) return;
    let stopped = false;
    const reconnect = () => retryRegistration(value => value + 1);
    void registration.then(registered => {
      if (stopped) return;
      watch.current = watchPwaRegistration(registered, {
        onWaiting: setWaiting,
        onFailure: () => setIssue('load'),
        onCheck: worker => { if (worker) setCheck(value => value + 1); },
        onChecked: () => setIssue(previous => previous === 'load' ? null : previous),
        onVisibility: setVisible,
      });
    }, () => {
      if (stopped) return;
      setIssue('load');
      window.addEventListener('online', reconnect, { once: true });
    });
    return () => {
      stopped = true;
      window.removeEventListener('online', reconnect);
      watch.current?.stop();
      watch.current = null;
    };
  }, [registrationAttempt]);

  useEffect(() => {
    if (!isLogin || signingIn || !waiting || !online || !visible) return;
    let cancelled = false;
    async function applyIfSafe() {
      try {
        if (await hasPendingLocalWork()) {
          if (!cancelled) setIssue('pending');
          return;
        }
      } catch {
        if (!cancelled) setIssue('storage');
        return;
      }
      if (cancelled || !navigator.onLine || document.visibilityState !== 'visible' || !beginLoginAction('update')) return;
      try {
        if (await activateWaitingWorker(waiting)) {
          window.location.reload();
          return;
        }
        setIssue('tabs');
      } catch { setIssue('load'); }
      endLoginAction();
    }
    void applyIfSafe();
    return () => { cancelled = true; };
  }, [waiting, check, online, visible, isLogin, signingIn, beginLoginAction, endLoginAction]);

  if ((!waiting && issue !== 'load') || (waiting && waiting === dismissed && !updating)) return null;
  const message = !online ? 'Conéctate para comprobar la actualización.'
    : !isLogin || signingIn ? 'Termina tu trabajo y vuelve al inicio de sesión para actualizar.'
    : issue === 'pending' ? 'Revisa las operaciones pendientes de este dispositivo antes de actualizar.'
    : issue === 'tabs' ? 'Cierra las demás pestañas de MigaPOS y vuelve a intentarlo.'
    : issue === 'storage' ? 'No se pudo comprobar el estado de los datos locales. Vuelve a intentarlo.'
    : issue === 'load' ? 'No se pudo preparar la actualización. Reintenta o, al terminar tu trabajo, cierra MigaPOS y vuelve a abrirlo.'
    : 'Comprobando si es seguro actualizar…';
  const retry = () => {
    if (waiting) setCheck(value => value + 1);
    else if (watch.current) void watch.current.check();
    else retryRegistration(value => value + 1);
  };
  return <aside aria-label="Actualizaciones" className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 grid gap-2 rounded-xl border border-line bg-panel p-3 shadow-card sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-xs">
    <div role="status">
      <p className="text-sm font-bold text-brand-deep">{updating ? 'Actualizando MigaPOS…' : waiting ? 'Nueva actualización disponible' : 'Actualización pendiente'}</p>
      {!updating && <p className="text-xs leading-relaxed text-muted">{message}</p>}
    </div>
    {!updating && <div className="flex flex-wrap gap-2">
      {waiting && <Button onClick={() => setDismissed(waiting)} variant="ghost" size="sm">Más tarde</Button>}
      {isLogin && !signingIn && issue && <Button onClick={retry} disabled={!online} variant="secondary" size="sm">Reintentar</Button>}
    </div>}
  </aside>;
}
