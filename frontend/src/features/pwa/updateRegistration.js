const CHECK_INTERVAL = 30 * 60_000;
const MIN_CHECK_INTERVAL = 60_000;
export function watchPwaRegistration(registration, { onWaiting, onFailure, onCheck, onChecked, onVisibility }, {
  page = window, visibility = document, isOnline = () => navigator.onLine, now = () => performance.now(),
} = {}) {
  let lastCheck = -Infinity, checking = false, stopped = false, observed = null, trailing = null;
  function inspect() {
    const worker = observed;
    onWaiting(registration.active ? registration.waiting : null);
    if (!worker || !['activated', 'redundant'].includes(worker.state)) return;
    worker.removeEventListener('statechange', inspect);
    observed = null;
    if (worker.state === 'redundant' && !registration.waiting) onFailure();
  }
  function observe() {
    observed?.removeEventListener('statechange', inspect);
    observed = registration.installing || registration.waiting;
    observed?.addEventListener('statechange', inspect);
    inspect();
  }
  async function check() {
    if (stopped || checking || registration.installing || !isOnline() || visibility.visibilityState !== 'visible') return;
    const remaining = MIN_CHECK_INTERVAL - (now() - lastCheck);
    if (remaining > 0) {
      trailing ??= page.setTimeout(() => { trailing = null; void check(); }, remaining);
      return;
    }
    if (trailing !== null) page.clearTimeout(trailing);
    trailing = null;
    lastCheck = now();
    checking = true;
    onCheck(registration.waiting);
    try { await registration.update(); if (!stopped) onChecked(); }
    catch { if (!stopped && isOnline()) onFailure(); }
    finally { checking = false; }
  }
  function handleVisibility() {
    onVisibility(visibility.visibilityState === 'visible');
    void check();
  }

  observe();
  registration.addEventListener('updatefound', observe);
  page.addEventListener('online', check);
  visibility.addEventListener('visibilitychange', handleVisibility);
  const timer = page.setInterval(check, CHECK_INTERVAL);
  void check();
  return {
    check,
    stop() {
      stopped = true;
      page.clearInterval(timer);
      if (trailing !== null) page.clearTimeout(trailing);
      page.removeEventListener('online', check);
      visibility.removeEventListener('visibilitychange', handleVisibility);
      registration.removeEventListener('updatefound', observe);
      observed?.removeEventListener('statechange', inspect);
    },
  };
}

export function activateWaitingWorker(registration, worker, { serviceWorkers = navigator.serviceWorker, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    if (registration.waiting !== worker) { reject(new Error('La versión en espera cambió.')); return; }
    const previouslyControlled = Boolean(serviceWorkers.controller);
    const { port1, port2 } = new MessageChannel();
    let settled = false;
    const finish = (activated, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('statechange', inspect);
      serviceWorkers.removeEventListener('controllerchange', inspect);
      signal?.removeEventListener('abort', cancel);
      port1.close();
      port2.close();
      if (error) reject(error);
      else resolve(activated);
    };
    const cancel = () => finish(false, signal.reason);
    const controlsPage = () => worker.state === 'activated' && (serviceWorkers.controller === worker
      || (!previouslyControlled && !serviceWorkers.controller && registration.active === worker));
    const inspect = () => {
      if (controlsPage()) finish(true);
      else if (worker.state === 'redundant') finish(false, new Error('La versión preparada ya no está disponible.'));
    };
    // A suspended client can miss the event even after its controller has switched.
    const timer = setTimeout(() => {
      if (controlsPage()) finish(true);
      else finish(false, new Error('La actualización no se confirmó.'));
    }, 10_000);
    worker.addEventListener('statechange', inspect);
    serviceWorkers.addEventListener('controllerchange', inspect);
    signal?.addEventListener('abort', cancel, { once: true });
    port1.onmessage = ({ data }) => {
      if (data === false) finish(false);
      else if (data !== true) finish(false, new Error('Falló la activación del service worker.'));
    };
    try { worker.postMessage({ type: 'MIGAPOS_ACTIVATE_UPDATE' }, [port2]); inspect(); }
    catch (error) { finish(false, error); }
  });
}
