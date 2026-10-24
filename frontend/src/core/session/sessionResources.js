// In-memory only. One instance per authenticated identity; never authorizes a write.
export function createSessionResources({ idleMs = 120000, maxListeners = 8, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const cells = new Map(), listeners = new Map(), reads = new Map(), values = new Map();
  let active = true, leaseRevision = 0;
  const controller = new AbortController();
  const metrics = { starts: 0, stops: 0, serverRows: 0, cacheRows: 0, reused: 0 };
  const cell = (key, initial) => {
    if (!cells.has(key)) {
      let value = typeof initial === 'function' ? initial() : initial;
      const observers = new Set();
      cells.set(key, { get: () => value, set: next => {
        if (!active) return;
        value = typeof next === 'function' ? next(value) : next;
        observers.forEach(notify => notify());
      }, subscribe: notify => { observers.add(notify); return () => observers.delete(notify); } });
    }
    return cells.get(key);
  };
  const watch = (key, start, initial = [], { preserveOnError = false } = {}) => {
    if (listeners.has(key)) return listeners.get(key).api;
    const state = cell(`snapshot:${key}`, { data: initial, isLoading: true, error: null, isStale: true, updatedAt: null });
    let stop = null, timer, generation = 0, consumers = 0;
    const halt = () => { cancel(timer); generation++; if (stop) { stop(); metrics.stops++; stop = null; } state.set(previous => ({ ...previous, isStale: true })); };
    const begin = () => {
      if (stop || !active) return;
      const revision = ++generation;
      metrics.starts++;
      const fail = error => { if (active && revision === generation) state.set(previous => ({ data: preserveOnError ? previous.data : initial, isLoading: false, error, isStale: true, updatedAt: previous.updatedAt })); };
      try {
        stop = start((data, metadata) => {
          if (!active || revision !== generation) return;
          const isStale = metadata?.fromCache === true || metadata?.hasPendingWrites === true;
          metrics[isStale ? 'cacheRows' : 'serverRows'] += metadata?.observedDocumentCount ?? (Array.isArray(data) ? data.length : 0);
          state.set({ data, isLoading: false, error: null, isStale, updatedAt: now() });
        }, fail);
      } catch (error) { fail(error); }
    };
    const entry = { idle: () => consumers === 0, halt, api: {
      get: state.get,
      refresh() { halt(); state.set(previous => ({ ...previous, error: null, isLoading: true })); if (consumers) begin(); },
      subscribe(notify) {
        consumers++; cancel(timer);
        if (state.get().error) halt();
        if (stop) metrics.reused++;
        const off = state.subscribe(notify); begin();
        return () => { off(); consumers--; if (!consumers) timer = schedule(halt, idleMs); };
      },
    } };
    listeners.set(key, entry);
    // Only resources actually visited are started. Bound idle live listeners.
    if (listeners.size > maxListeners) for (const [otherKey, other] of listeners) {
      if (otherKey !== key && other.idle()) other.halt();
    }
    return entry.api;
  };
  const close = () => { active = false; controller.abort(); listeners.forEach(entry => entry.halt()); reads.clear(); values.clear(); cells.clear(); listeners.clear(); };
  return { cell, watch, signal: controller.signal,
    lease() { const revision = ++leaseRevision; return () => queueMicrotask(() => { if (revision === leaseRevision) close(); }); },
    value(key, factory) { if (!values.has(key)) values.set(key, factory()); return values.get(key); },
    clearValue(key) { values.get(key)?.clear?.(); },
    read(key, loader, ttl = 30000) {
      const cached = reads.get(key);
      if (cached && (cached.pending || now() - cached.loadedAt < ttl)) { metrics.reused++; return cached.promise; }
      const entry = { pending: true, loadedAt: Infinity };
      entry.promise = Promise.resolve().then(() => { if (!active) throw new Error('La sesión cambió.'); return loader(); }).then(data => {
        entry.pending = false; entry.loadedAt = now(); return data;
      }, error => { if (reads.get(key) === entry) reads.delete(key); throw error; });
      reads.set(key, entry);
      // Bound completed query payloads; never evict in-flight operations.
      if (reads.size > 12) for (const [oldKey, old] of reads) { if (oldKey !== key && !old.pending) { reads.delete(oldKey); break; } }
      return entry.promise;
    },
    invalidate(prefix) { for (const key of reads.keys()) if (key.startsWith(prefix)) reads.delete(key); },
    retryErrors() { for (const entry of listeners.values()) if (!entry.idle() && entry.api.get().error) entry.api.refresh(); },
    get active() { return active; },
    diagnostics: () => ({ ...metrics }),
    close,
  };
}
