// Scoped to one mounted export panel and one authorized identity/business/branch revision.
export function createReportExportCache({ now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const entries = new Map();
  const drop = key => {
    cancel(entries.get(key)?.timer);
    entries.delete(key);
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (entry && entry.expiresAt > now()) return entry;
      drop(key);
      return null;
    },
    put(key, snapshot, expiresAt) {
      drop(key);
      const entry = { snapshot, expiresAt, artifacts: new Map() };
      if (expiresAt > now()) {
        entry.timer = schedule(() => drop(key), expiresAt - now());
        entries.set(key, entry);
        if (entries.size > 4) drop(entries.keys().next().value);
      }
      return entry;
    },
    drop,
    clear() { for (const key of entries.keys()) drop(key); },
  };
}
