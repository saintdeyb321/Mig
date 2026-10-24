import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { reportPeriod, reportDay } from '../domain/reportPeriod.js';
import { emptyMetrics } from '../domain/reportTotals.js';
import { createReportCache, reportCacheKey, createReportResource, invalidateReportScope, REPORT_TTL } from '../application/reportResource.js';

import { useSessionResources, useSessionState } from '../../../core/session/sessionResourceHooks.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';
export const useReports = user => {
  const { activeBranchId, identityKey } = useTenantData();
  const resources = useSessionResources();
  const cache = resources.value('report:cache', createReportCache);
  const [timeFilter, selectFilter] = useSessionState(`report:filter:${activeBranchId}`, 'hoy');
  const setTimeFilter = filter => {
    if (['mes', 'todo'].includes(filter) && !window.confirm('Este período consulta movimientos individuales y contratos históricos; puede consumir miles de lecturas Spark. ¿Continuar?')) return;
    selectFilter(filter);
  };
  const [day, setDay] = useState(() => reportDay(new Date()));
  const period = useMemo(() => reportPeriod(timeFilter, day + 'T12:00:00-05:00'), [timeFilter, day]);
  const key = reportCacheKey({ identityKey, businessId: user?.businessId, branchId: activeBranchId, period });
  const [state, setState] = useState({ key: null, isLoading: true });
  const resource = useRef(null);
  useEffect(() => {
    if (!user?.businessId || !activeBranchId) return;
    const reads = sessionReportReads(resources, user.businessId, activeBranchId, period);
    const current = createReportResource({ key, businessId: user.businessId, branchId: activeBranchId, period, cache,
      readStats: reads.stats, readContracts: reads.contracts, readPayments: reads.payments,
      onState: setState });
    resource.current = current;
    const timer = setInterval(() => { setDay(reportDay(new Date())); }, REPORT_TTL);
    const refresh = () => { setDay(reportDay(new Date())); if (document.visibilityState === 'visible') void current.refresh(); };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { current.close(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [key, user?.businessId, activeBranchId, period, timeFilter, cache, resources]);
  const current = state.key === key ? state : { isLoading: true, error: null };
  const model = current.model;
  const refreshReport = useCallback(() => { invalidateReportScope(resources, user?.businessId, activeBranchId); cache.invalidate(key); return resource.current?.refresh(true); }, [resources, cache, user?.businessId, activeBranchId, key]);
  return { contractCounts: model?.contractCounts ?? { pending: 0, delivered: 0, cancelled: 0, withDebt: 0 }, summary: model?.summary ?? emptyMetrics(), topProducts: model?.topProducts ?? [], chartData: model?.chartData ?? [],
    hasData: Boolean(model), isRefreshing: current.isRefreshing === true, isLoading: current.isLoading, error: current.queryError ?? current.error, timeFilter, setTimeFilter, refreshReport, updatedAt: current.updatedAt,
    maxProductQty: Math.max(1, ...(model?.topProducts ?? []).map(row => row.qty)) };
};
