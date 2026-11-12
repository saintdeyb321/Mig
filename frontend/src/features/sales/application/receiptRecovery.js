// Bounded, read-only recovery on mount/reconnection. Connectivity only schedules a server check.
export function startReceiptRecovery({ verify, isCurrent, events = window, schedule = setTimeout, cancel = clearTimeout,
  online = () => globalThis.navigator?.onLine !== false }) {
  let closed = false, running = false, queued = false, generation = 0;
  const timers = new Set();
  const active = () => !closed && online() && isCurrent();
  const clear = () => {
    generation++;
    for (const timer of timers) cancel(timer);
    timers.clear();
  };
  const cycle = () => {
    if (!active()) return;
    if (running) { queued = true; return; }
    clear();
    const token = generation;
    for (const delay of [0, 2000, 8000]) {
      const timer = schedule(async () => {
        timers.delete(timer);
        if (!active() || token !== generation || running) return;
        running = true;
        try { await verify(() => active() && token === generation); }
        catch { /* The durable original records retain the failure for manual review. */ }
        finally {
          running = false;
          if (queued) { queued = false; cycle(); }
        }
      }, delay);
      timers.add(timer);
    }
  };
  const disconnected = () => { queued = false; clear(); };
  events.addEventListener('online', cycle);
  events.addEventListener('offline', disconnected);
  cycle();
  return {
    refresh: () => { if (!timers.size && !running) cycle(); },
    stop: () => { closed = true; disconnected(); events.removeEventListener('online', cycle); events.removeEventListener('offline', disconnected); },
  };
}
