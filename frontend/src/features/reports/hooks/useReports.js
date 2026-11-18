import { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { reportPeriod, reportDay } from '../domain/reportPeriod.js';
import { emptyMetrics } from '../domain/reportTotals.js';
import { createReportCache, reportCacheKey, createReportResource, createSummaryReportResource, invalidateReportScope, reportRevision, REPORT_TTL } from '../application/reportResource.js';
import { isSummaryPeriod, reportSourceForPeriod } from '../application/reportSources.js';
import { readVerifiedSummary, prepareReportHistory } from '../infrastructure/summaryRepository.js';

import { useSessionResources, useSessionState } from '../../../core/session/sessionResourceHooks.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';
import { readViewPreference, writeViewPreference } from '../../../core/session/viewPreference.js';
const REPORT_FILTERS = ['hoy', 'semana', 'mes', 'todo'];
export const useReports = user => {
  const { activeBranchId, identityKey } = useTenantData();
  const resources = useSessionResources();
  const cache = resources.value('report:cache', createReportCache);
  const preferenceKey = `migapos:report-filter:${identityKey}:${activeBranchId}`;
  const initialFilter = useMemo(() => readViewPreference(preferenceKey, REPORT_FILTERS, 'hoy'), [preferenceKey]);
  const [timeFilter, selectFilter] = useSessionState(`report:filter:${activeBranchId}`, initialFilter);
  const setTimeFilter = filter => {
    if (!REPORT_FILTERS.includes(filter)) return;
    selectFilter(filter);
    writeViewPreference(preferenceKey, filter, REPORT_FILTERS);
  };
  const [day, setDay] = useState(() => reportDay(new Date()));
  const period = useMemo(() => reportPeriod(timeFilter, day + 'T12:00:00-05:00'), [timeFilter, day]);
  const key = reportCacheKey({ identityKey, businessId: user?.businessId, branchId: activeBranchId, period });
  const revisionCell = reportRevision(resources, user?.businessId);
  const revision = useSyncExternalStore(revisionCell.subscribe, revisionCell.get);
  const summaryRevision = isSummaryPeriod(period) ? revision : 0;
  const stateKey = isSummaryPeriod(period) ? JSON.stringify([key, user?.uid, summaryRevision]) : key;
  const historyScope = useRef(stateKey);
  historyScope.current = stateKey;
  const historyBusy = useRef(false);
  const [historyState, setHistoryState] = useState(null);
  const [state, setState] = useState({ key: null, isLoading: true });
  const resource = useRef(null);
  useEffect(() => {
    if (!user?.businessId || !activeBranchId) return;
    const reads = () => sessionReportReads(resources, user.businessId, activeBranchId, period);
    const source = reportSourceForPeriod(period, reads, { readSummary: ({ signal } = {}) => readVerifiedSummary({
      resources, uid: user.uid, identityKey, businessId: user.businessId, branchId: activeBranchId, period,
      revision: summaryRevision, includeProducts: false, signal,
    }) });
    const current = source.representation === 'snapshots'
      ? createSummaryReportResource({ key: stateKey, period, readSummary: source.readSummary, onState: setState })
      : createReportResource({ key: stateKey, businessId: user.businessId, branchId: activeBranchId, period, cache, ...source.dashboardReads, onState: setState });
    resource.current = current;
    const timer = setInterval(() => { setDay(reportDay(new Date())); }, REPORT_TTL);
    const refresh = () => { setDay(reportDay(new Date())); if (document.visibilityState === 'visible') void current.refresh(); };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { current.close(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [stateKey, summaryRevision, user?.businessId, user?.uid, identityKey, activeBranchId, period, cache, resources]);
  const current = state.key === stateKey ? state : { isLoading: true, error: null };
  const model = current.model;
  const refreshReport = useCallback(() => {
    invalidateReportScope(resources, user?.businessId, activeBranchId);
    cache.invalidate(key);
    if (!isSummaryPeriod(period)) return resource.current?.refresh(true);
  }, [resources, cache, user?.businessId, activeBranchId, key, period]);
  const prepareHistory = async () => {
    if (historyBusy.current || user?.role !== 'dueño' || !activeBranchId || activeBranchId === 'global') return;
    historyBusy.current = true;
    setHistoryState({ key: stateKey, busy: true });
    try {
      const result = await prepareReportHistory({ uid: user.uid, businessId: user.businessId, branchId: activeBranchId,
        maxDocuments: 100, signal: resources.signal });
      if (historyScope.current === stateKey) setHistoryState({ key: stateKey, busy: false, message: result.message });
    } catch (error) {
      if (historyScope.current === stateKey && !resources.signal.aborted) setHistoryState({ key: stateKey, busy: false, message: error.message });
    } finally { historyBusy.current = false; }
  };
  return { contractCounts: model?.contractCounts ?? { pending: 0, delivered: 0, cancelled: 0, withDebt: 0 }, summary: model?.summary ?? emptyMetrics(), topProducts: model?.topProducts ?? [], chartData: model?.chartData ?? [],
    hasData: Boolean(model), isRefreshing: current.isRefreshing === true, isLoading: current.isLoading, error: current.queryError ?? current.error, timeFilter, setTimeFilter, refreshReport, updatedAt: current.updatedAt,
    prepareHistory, canPrepareHistory: user?.role === 'dueño' && activeBranchId !== 'global',
    historyState: historyState?.key === stateKey ? historyState : null,
    warning: model?.view.warning, maxProductQty: Math.max(1, ...(model?.topProducts ?? []).map(row => row.qty)) };
};
