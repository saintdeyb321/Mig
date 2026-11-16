// In-memory only. One instance per authenticated identity; never authorizes a write.
export function createSessionResources({ idleMs = 120000, maxListeners = 8, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const cells = new Map(), listeners = new Map(), reads = new Map(), values = new Map();
  let active = true, leaseRevision = 0;
  const controller = new AbortController();
  const metrics = { starts: 0, stops: 0, serverRows: 0, cacheRows: 0, reused: 0 };
  const buildCell = initial => {
    let value = typeof initial === 'function' ? initial() : initial;
    const observers = new Set();
    return { get: () => value, set: next => {
      if (!active) return;
      value = typeof next === 'function' ? next(value) : next;
      observers.forEach(notify => notify());
    }, subscribe: notify => { observers.add(notify); return () => observers.delete(notify); } };
  };
  const cell = (key, initial) => {
    if (!cells.has(key)) cells.set(key, buildCell(initial));
    return cells.get(key);
  };
  const remember = (key, entry) => {
    listeners.delete(key);
    listeners.set(key, entry);
    for (const [oldKey, old] of listeners) {
      if (listeners.size <= maxListeners) break;
      if (oldKey !== key && old.idle()) old.evict();
    }
  };
  const watch = (key, start, initial = [], { preserveOnError = false } = {}) => {
    const known = listeners.get(key);
    if (known) { remember(key, known); return known.api; }
    const state = buildCell({ data: initial, isLoading: true, error: null, isStale: true, updatedAt: null });
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
    const entry = { state, idle: () => consumers === 0, halt,
      evict() {
        if (consumers || listeners.get(key) !== entry) return;
        halt();
        listeners.delete(key);
      }, api: {
      get: () => (listeners.get(key)?.state ?? state).get(),
      refresh() {
        const current = listeners.get(key);
        if (current && current !== entry) { current.api.refresh(); return; }
        halt(); state.set(previous => ({ ...previous, error: null, isLoading: true })); if (consumers) begin();
      },
      subscribe(notify, { retain = true } = {}) {
        if (!active) return () => {};
        const current = listeners.get(key);
        if (current && current !== entry) return current.api.subscribe(notify, { retain });
        consumers++;
        remember(key, entry);
        cancel(timer);
        if (state.get().error) halt();
        if (stop) metrics.reused++;
        const off = state.subscribe(notify); begin();
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          off();
          consumers--;
          if (!consumers && active) {
            if (!retain || listeners.size > maxListeners) entry.evict();
            else timer = schedule(entry.evict, idleMs);
          }
        };
      },
    } };
    remember(key, entry);
    return entry.api;
  };
  const trimReads = () => {
    let completed = [...reads.values()].filter(entry => !entry.pending).length;
    for (const [key, entry] of reads) {
      if (completed <= 12) break;
      if (!entry.pending) { reads.delete(key); completed--; }
    }
  };
  const close = () => { active = false; controller.abort(); listeners.forEach(entry => entry.halt()); reads.clear(); values.clear(); cells.clear(); listeners.clear(); };
  return { cell, watch, signal: controller.signal,
    peekWatch: key => listeners.get(key)?.api.get(),
    readLoadedAt: key => reads.get(key)?.loadedAt,
    lease() { const revision = ++leaseRevision; return () => queueMicrotask(() => { if (revision === leaseRevision) close(); }); },
    value(key, factory) { if (!values.has(key)) values.set(key, factory()); return values.get(key); },
    clearValue(key) { values.get(key)?.clear?.(); },
    read(key, loader, ttl = 30000) {
      const cached = reads.get(key);
      if (cached && (cached.pending || now() - cached.loadedAt < ttl)) {
        reads.delete(key); reads.set(key, cached);
        metrics.reused++;
        return cached.promise;
      }
      const entry = { pending: true, loadedAt: Infinity };
      entry.promise = Promise.resolve().then(() => { if (!active) throw new Error('La sesión cambió.'); return loader(); }).then(data => {
        entry.pending = false; entry.loadedAt = now(); trimReads(); return data;
      }, error => { if (reads.get(key) === entry) reads.delete(key); throw error; });
      reads.delete(key);
      reads.set(key, entry);
      return entry.promise;
    },
    invalidateWhere(matches) { for (const key of reads.keys()) if (matches(key)) reads.delete(key); },
    invalidate(prefix) { for (const key of reads.keys()) if (key.startsWith(prefix)) reads.delete(key); },
    retryErrors() { for (const entry of listeners.values()) if (!entry.idle() && entry.api.get().error) entry.api.refresh(); },
    get active() { return active; },
    diagnostics: () => ({ ...metrics }),
    close,
  };
}
