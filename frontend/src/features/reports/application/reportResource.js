import { aggregateReport } from '../domain/reportTotals.js';

export const REPORT_TTL = 30000;
export const reportCacheKey = ({ identityKey, businessId, branchId, period }) => JSON.stringify([identityKey, businessId, branchId, period.key]);
export function createReportCache({ ttl = REPORT_TTL, max = 12, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) { const item = entries.get(key); if (!item || now() - item.loadedAt >= ttl) { entries.delete(key); return null; } return item; },
    set(key, item) { entries.delete(key); entries.set(key, item); while (entries.size > max) entries.delete(entries.keys().next().value); },
    invalidate(key) { entries.delete(key); },
    clear() { entries.clear(); },
    get size() { return entries.size; },
  };
}
export function createReportResource({ key, businessId, branchId, period, cache, readStats, readPayments, subscribeStats, onState, now = Date.now }) {
  const cached = cache.get(key);
  let active = true, stats = cached?.stats ?? null, payments = cached?.payments ?? null, loadedAt = cached?.loadedAt ?? -Infinity;
  let pending = null, generation = 0, stop = () => {};
  const emit = () => {
    if (!active || stats === null || payments === null) return;
    try {
      const model = aggregateReport({ stats, payments, businessId, branchId, period });
      cache.set(key, { stats, payments, loadedAt });
      onState({ key, model, isLoading: false, error: null, updatedAt: loadedAt });
    } catch (error) { fail(error); }
  };
  const fail = error => { if (active) { cache.invalidate(key); onState({ key, model: null, isLoading: false, error: error.message }); } };
  async function refresh(force = false) {
    if (!active) return;
    if (pending) return pending;
    if (!force && now() - loadedAt < REPORT_TTL) return;
    const revision = ++generation;
    pending = (async () => {
      try {
        const [nextStats, nextPayments] = await Promise.all([subscribeStats && stats !== null ? stats : readStats(), readPayments()]);
        if (!active || revision !== generation) return;
        // A live snapshot may have advanced while the payment query was pending.
        if (!subscribeStats || stats === null) stats = nextStats;
        payments = nextPayments; loadedAt = now(); emit();
      } catch (error) { if (revision === generation) { payments = null; fail(error); } }
      finally { if (revision === generation) pending = null; }
    })();
    return pending;
  }
  if (cached) emit();
  else onState({ key, model: null, isLoading: true, error: null });
  if (subscribeStats) stop = subscribeStats(rows => { if (active) { stats = rows; emit(); } }, error => { stats = null; fail(error); });
  const ready = refresh();
  return { ready, refresh, close() { active = false; generation++; stop(); } };
}
