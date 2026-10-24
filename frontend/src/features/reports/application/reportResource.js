import { contractCounts } from '../domain/sparkReport.js';
import { aggregateReport } from '../domain/reportTotals.js';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';

export const REPORT_TTL = 30000;
export const reportTTL = period => ['mes', 'todo'].includes(period.filter ?? period.key?.split(':')[0]) ? 15 * 60 * 1000 : 2 * 60 * 1000;
export const reportCacheKey = ({ identityKey, businessId, branchId, period }) => JSON.stringify([identityKey, businessId, branchId, period.key]);
export function createReportCache({ ttl = REPORT_TTL, max = 12, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) { const item = entries.get(key); if (!item || now() - item.loadedAt >= (item.ttl ?? ttl)) return null; return item; },
    peek(key) { return entries.get(key) ?? null; },
    invalidateScope(businessId, branchId) { for (const key of entries.keys()) { const [, business, branch] = JSON.parse(key); if (business === businessId && (branchId === 'global' || branch === branchId || branch === 'global')) entries.delete(key); } },
    set(key, item) { entries.delete(key); entries.set(key, item); while (entries.size > max) entries.delete(entries.keys().next().value); },
    invalidate(key) { entries.delete(key); },
    clear() { entries.clear(); },
    get size() { return entries.size; },
  };
}
export function createReportResource({ key, businessId, branchId, period, cache, readStats, readPayments, readContracts = async () => [], subscribeStats, onState, now = Date.now }) {
  const ttl = reportTTL(period);
  const cached = cache.peek?.(key) ?? cache.get(key);
  let active = true, stats = cached?.stats ?? null, payments = cached?.payments ?? null, loadedAt = cached?.loadedAt ?? -Infinity;
  let contracts = cached?.contracts ?? [];
  let pending = null, generation = 0, lastModel = null, stop = () => {};
  const emit = () => {
    if (!active || stats === null || payments === null) return;
    try {
      const model = aggregateReport({ stats, payments, businessId, branchId, period });
      model.contractCounts = contractCounts(contracts);
      lastModel = model;
      cache.set(key, { stats, payments, contracts, loadedAt, ttl });
      onState({ key, model, isLoading: false, isRefreshing: false, error: null, updatedAt: loadedAt });
    } catch (error) { fail(error); }
  };
  const fail = error => { if (active) {
    reportDiagnostic('report', error); cache.invalidate(key);
    const transient = ['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(error.code ?? error.cause?.code);
    onState({ key, model: transient ? lastModel : null, isLoading: false, isRefreshing: false, error: error.message, queryError: error, updatedAt: loadedAt });
  } };
  async function refresh(force = false) {
    if (!active) return;
    if (pending) return pending;
    if (!force && now() - loadedAt < ttl) return;
    const revision = ++generation;
    if (lastModel) onState({ key, model: lastModel, isLoading: false, isRefreshing: true, error: null, updatedAt: loadedAt });
    pending = (async () => {
      try {
        const [nextStats, nextPayments, nextContracts] = await Promise.all([subscribeStats && stats !== null ? stats : readStats(), readPayments(), readContracts()]);
        if (!active || revision !== generation) return;
        // A live snapshot may have advanced while the payment query was pending.
        if (!subscribeStats || stats === null) stats = nextStats;
        contracts = nextContracts; payments = nextPayments; loadedAt = now(); emit();
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

export function invalidateReportScope(resources, businessId, branchId) {
  if (!businessId || !branchId) return;
  resources.invalidateWhere(key => {
    if (!key.startsWith('report:') || !key.includes('[')) return false;
    const [business, branch] = JSON.parse(key.slice(key.indexOf('[')));
    return business === businessId && (branchId === 'global' || branch === branchId || branch === 'global');
  });
  resources.value('report:cache', createReportCache).invalidateScope(businessId, branchId);
}
