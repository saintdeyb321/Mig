const CHECK_INTERVAL = 30 * 60_000;
const MIN_CHECK_INTERVAL = 60_000;
export function watchPwaRegistration(registration, { onWaiting, onFailure, onCheck, onChecked, onVisibility }, {
  page = window, visibility = document, isOnline = () => navigator.onLine, now = Date.now,
} = {}) {
  let lastCheck = -Infinity, checking = false, stopped = false, observed = null;
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
    if (stopped || checking || registration.installing || !isOnline() || visibility.visibilityState !== 'visible'
      || now() - lastCheck < MIN_CHECK_INTERVAL) return;
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
      page.removeEventListener('online', check);
      visibility.removeEventListener('visibilitychange', handleVisibility);
      registration.removeEventListener('updatefound', observe);
      observed?.removeEventListener('statechange', inspect);
    },
  };
}

export function activateWaitingWorker(worker) {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();
    const finish = (activated, error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', inspect);
      port1.close();
      port2.close();
      if (error) reject(error);
      else resolve(activated);
    };
    const inspect = () => {
      if (worker.state === 'activated') finish(true);
      if (worker.state === 'redundant') finish(false, new Error('La versión preparada ya no está disponible.'));
    };
    const timer = setTimeout(() => finish(false, new Error('La actualización no se confirmó.')), 10_000);
    worker.addEventListener('statechange', inspect);
    port1.onmessage = ({ data }) => { if (data !== true) finish(false); };
    try { worker.postMessage({ type: 'MIGAPOS_ACTIVATE_UPDATE' }, [port2]); }
    catch (error) { finish(false, error); }
  });
}
