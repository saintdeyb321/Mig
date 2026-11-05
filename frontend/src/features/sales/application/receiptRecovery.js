// Bounded, read-only recovery on mount/reconnection. Connectivity only schedules a server check.
export function startReceiptRecovery({ verify, isCurrent, events = window, schedule = setTimeout, cancel = clearTimeout }) {
  let closed = false, running = false, generation = 0;
  const timers = new Set();
  const active = () => !closed && isCurrent();
  const cycle = () => {
    if (closed || running || !isCurrent()) return;
    for (const timer of timers) cancel(timer);
    timers.clear();
    const token = ++generation;
    for (const delay of [0, 2000, 8000]) {
      const timer = schedule(async () => {
        timers.delete(timer);
        if (!active() || token !== generation || running) return;
        running = true;
        try { await verify(() => active() && token === generation); }
        catch { /* The durable original records retain the failure for manual review. */ }
        finally { running = false; }
      }, delay);
      timers.add(timer);
    }
  };
  events.addEventListener('online', cycle);
  cycle();
  return { refresh: cycle, stop: () => { closed = true; generation++; events.removeEventListener('online', cycle); for (const timer of timers) cancel(timer); timers.clear(); } };
}
