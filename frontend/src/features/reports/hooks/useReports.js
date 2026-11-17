import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { reportPeriod, reportDay } from '../domain/reportPeriod.js';
import { emptyMetrics } from '../domain/reportTotals.js';
import { createReportCache, reportCacheKey, createReportResource, createSummaryReportResource, invalidateReportScope, reportRevision, REPORT_TTL } from '../application/reportResource.js';
import { isSummaryPeriod, reportSourceForPeriod, reportSummariesEnabled } from '../application/reportSources.js';
import { readVerifiedSummary } from '../infrastructure/summaryRepository.js';

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
  const [state, setState] = useState({ key: null, isLoading: true });
  const [historicalKey, allowHistorical] = useState(null);
  const blocked = isSummaryPeriod(period) && !reportSummariesEnabled && historicalKey !== key;
  const requestHistorical = () => {
    if (blocked && window.confirm('La consulta histórica puede recuperar miles de movimientos. ¿Continuar?')) allowHistorical(key);
  };
  const resource = useRef(null);
  useEffect(() => {
    if (!user?.businessId || !activeBranchId || blocked) return;
    const reads = () => sessionReportReads(resources, user.businessId, activeBranchId, period);
    const source = reportSourceForPeriod(period, reads, { readSummary: reportSummariesEnabled ? () => readVerifiedSummary({
      resources, uid: user.uid, identityKey, businessId: user.businessId, branchId: activeBranchId, period,
      revision: reportRevision(resources, user.businessId).get(),
    }) : null });
    const current = source.representation === 'snapshots'
      ? createSummaryReportResource({ key, period, readSummary: source.readSummary, onState: setState })
      : createReportResource({ key, businessId: user.businessId, branchId: activeBranchId, period, cache, ...source.dashboardReads, onState: setState });
    resource.current = current;
    const timer = setInterval(() => { setDay(reportDay(new Date())); }, REPORT_TTL);
    const refresh = () => { setDay(reportDay(new Date())); if (document.visibilityState === 'visible') void current.refresh(); };
    const stopRevision = source.representation === 'snapshots' ? reportRevision(resources, user.businessId).subscribe(refresh) : () => {};
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { current.close(); stopRevision(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [key, user?.businessId, user?.uid, identityKey, activeBranchId, period, cache, resources, blocked]);
  const current = blocked ? { isLoading: false, error: { code: 'report-summary-disabled' } }
    : state.key === key ? state : { isLoading: true, error: null };
  const model = current.model;
  const refreshReport = useCallback(() => { invalidateReportScope(resources, user?.businessId, activeBranchId); cache.invalidate(key); return resource.current?.refresh(true); }, [resources, cache, user?.businessId, activeBranchId, key]);
  return { contractCounts: model?.contractCounts ?? { pending: 0, delivered: 0, cancelled: 0, withDebt: 0 }, summary: model?.summary ?? emptyMetrics(), topProducts: model?.topProducts ?? [], chartData: model?.chartData ?? [],
    hasData: Boolean(model), isRefreshing: current.isRefreshing === true, isLoading: current.isLoading, error: current.queryError ?? current.error, timeFilter, setTimeFilter, refreshReport, updatedAt: current.updatedAt,
    requestHistorical, verifiedSummary: model?.verified === true, cashSummary: model?.verified ? model.values : null,
    warning: model?.view.warning, maxProductQty: Math.max(1, ...(model?.topProducts ?? []).map(row => row.qty)) };
};
