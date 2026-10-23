import { getContractsInPeriod } from '../../contracts/infrastructure/contractRepository.js';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getDailyStats } from '../infrastructure/dailyStatsRepository';
import { getPaymentsInPeriod } from '../../payments/infrastructure/paymentRepository';
import { useTenantData } from '../../branches/context/TenantContext';
import { reportPeriod, reportDay } from '../domain/reportPeriod.js';
import { emptyMetrics } from '../domain/reportTotals.js';
import { createReportCache, reportCacheKey, createReportResource, REPORT_TTL } from '../application/reportResource.js';

const cache = createReportCache();
export const useReports = user => {
  const { activeBranchId, identityKey } = useTenantData();
  const [timeFilter, setTimeFilter] = useState('hoy');
  const [day, setDay] = useState(() => reportDay(new Date()));
  const period = useMemo(() => reportPeriod(timeFilter, day + 'T12:00:00-05:00'), [timeFilter, day]);
  const key = reportCacheKey({ identityKey, businessId: user?.businessId, branchId: activeBranchId, period });
  const [state, setState] = useState({ key: null, isLoading: true });
  const resource = useRef(null);
  useEffect(() => {
    if (!user?.businessId || !activeBranchId) return;
    const current = createReportResource({ key, businessId: user.businessId, branchId: activeBranchId, period, cache,
      readStats: () => getDailyStats(user.businessId, activeBranchId, period.start, period.end),
      readContracts: () => getContractsInPeriod(user.businessId, period.startDate, period.endDate, activeBranchId),
      readPayments: () => getPaymentsInPeriod(user.businessId, period.startDate, period.endDate, activeBranchId, { requireMigrated: true, maxRows: 10000 }),
      onState: setState });
    resource.current = current;
    const timer = setInterval(() => { setDay(reportDay(new Date())); }, REPORT_TTL);
    const refresh = () => { setDay(reportDay(new Date())); void current.refresh(); };
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    return () => { current.close(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [key, user?.businessId, activeBranchId, period, timeFilter]);
  const current = state.key === key ? state : { isLoading: true, error: null };
  const model = current.model;
  const refreshReport = useCallback(() => resource.current?.refresh(true), []);
  return { contractCounts: model?.contractCounts ?? { pending: 0, delivered: 0, cancelled: 0, withDebt: 0 }, summary: model?.summary ?? emptyMetrics(), topProducts: model?.topProducts ?? [], chartData: model?.chartData ?? [],
    isLoading: current.isLoading, error: current.error, timeFilter, setTimeFilter, refreshReport, updatedAt: current.updatedAt,
    maxProductQty: Math.max(1, ...(model?.topProducts ?? []).map(row => row.qty)) };
};
