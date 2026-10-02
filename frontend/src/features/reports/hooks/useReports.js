import { getDailyStats, subscribeDailyStats } from '../infrastructure/dailyStatsRepository';
import { getContractsForReport } from '../../contracts/infrastructure/contractRepository';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';
import { toMillisSafe } from '../../../core/dates/dateValues';
// src/hooks/useReports.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';

const reportsCache = {};

export const useReports = (user) => {
  const { activeBranchId, identityKey } = useTenantData();

  const [summary, setSummary] = useState({ total: 0, cash: 0, yape: 0, totalSales: 0 });
  const [topProducts, setTopProducts] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('hoy');

  const handleTimeFilterChange = useCallback((newFilter) => {
    if (newFilter !== timeFilter) setTimeFilter(newFilter);
  }, [timeFilter]);

  useEffect(() => {
    if (!user?.businessId || !activeBranchId) return;

    const cacheKey = `${identityKey}:${timeFilter}:${activeBranchId}`;
    const scope = createSubscriptionScope();
    let isCached = false;

    if (reportsCache[cacheKey]) {
      isCached = true;
      Promise.resolve().then(scope.guard(() => {
        const cached = reportsCache[cacheKey];
        setSummary(cached.summary);
        setChartData(cached.chartData);
        setTopProducts(cached.topProducts);
        setIsLoading(false);
      }));
      if (timeFilter !== 'hoy') return () => scope.close();
    }

    if (!isCached) Promise.resolve().then(scope.guard(() => setIsLoading(true)));

    const getLocalDateStr = (dateObj) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let skeletonEndDate = new Date(startDate);

    if (timeFilter === 'todo') {
      startDate = new Date(now.getFullYear(), 0, 1);
      skeletonEndDate = new Date(now.getFullYear(), 11, 31);
    } else if (timeFilter === 'mes') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      skeletonEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (timeFilter === 'semana') {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startDate.setDate(now.getDate() + diffToMonday);
      skeletonEndDate = new Date(startDate);
      skeletonEndDate.setDate(startDate.getDate() + 6);
    }

    const startDateStr = getLocalDateStr(startDate);
    const endDateStr = getLocalDateStr(now);

    const processData = async (posDocsArray) => {
      const revision = scope.next();
      const groupedChart = {};
      let iteratorDate = new Date(startDate.getTime());

      if (timeFilter === 'todo') {
        for (let i = 0; i < 12; i++) {
          const rawKey = `${iteratorDate.getFullYear()}-${String(iteratorDate.getMonth() + 1).padStart(2, '0')}`;
          const formatter = new Intl.DateTimeFormat('es-PE', { month: 'short' });
          let labelX = formatter.format(iteratorDate).replace('.', '');
          groupedChart[rawKey] = { rawDate: rawKey, date: labelX.charAt(0).toUpperCase() + labelX.slice(1), ventas: 0, ordenes: 0 };
          iteratorDate.setMonth(iteratorDate.getMonth() + 1);
        }
      } else {
        while (iteratorDate <= skeletonEndDate) {
          const rawKey = getLocalDateStr(iteratorDate);
          let labelX = '';
          if (timeFilter === 'semana') {
            const formatter = new Intl.DateTimeFormat('es-PE', { weekday: 'short' });
            labelX = formatter.format(iteratorDate).replace('.', '');
            labelX = labelX.charAt(0).toUpperCase() + labelX.slice(1);
          } else if (timeFilter === 'mes') {
            labelX = `${String(iteratorDate.getDate()).padStart(2, '0')}/${String(iteratorDate.getMonth() + 1).padStart(2, '0')}`;
          } else if (timeFilter === 'hoy') {
            labelX = 'Hoy';
          }
          groupedChart[rawKey] = { rawDate: rawKey, date: labelX, ventas: 0, ordenes: 0 };
          iteratorDate.setDate(iteratorDate.getDate() + 1);
        }
      }

      let t = 0, c = 0, y = 0, orders = 0;
      const productCount = {};

      posDocsArray.forEach(dayStat => {
        if (!dayStat.date) return;

        t += Number(dayStat.totalRevenue) || 0;
        orders += Number(dayStat.totalOrders) || 0;
        c += Number(dayStat.paymentMethods?.efectivo || dayStat['paymentMethods.efectivo']) || 0;
        y += Number(dayStat.paymentMethods?.yape || dayStat['paymentMethods.yape']) || 0;

        const processProdObj = (prod) => {
          if (prod?.name && prod?.qty) productCount[prod.name] = (productCount[prod.name] || 0) + Number(prod.qty);
        };

        if (dayStat.productSales && typeof dayStat.productSales === 'object') {
          Object.values(dayStat.productSales).forEach(processProdObj);
        }

        const tempProducts = {};
        Object.keys(dayStat).forEach(key => {
          if (key.startsWith('productSales.')) {
            const parts = key.split('.');
            if (parts.length === 3) {
              if (!tempProducts[parts[1]]) tempProducts[parts[1]] = {};
              tempProducts[parts[1]][parts[2]] = dayStat[key];
            }
          }
        });
        Object.values(tempProducts).forEach(processProdObj);

        const bucketKey = timeFilter === 'todo' ? dayStat.date.substring(0, 7) : dayStat.date;
        if (groupedChart[bucketKey]) {
          groupedChart[bucketKey].ventas += Number(dayStat.totalRevenue) || 0;
          groupedChart[bucketKey].ordenes += Number(dayStat.totalOrders) || 0;
        }
      });

      try {
        const contractDocuments = await getContractsForReport(user.businessId, activeBranchId);
        const startMs = new Date(startDateStr + "T00:00:00").getTime();
        const endMs = new Date(endDateStr + "T23:59:59").getTime();

        contractDocuments.forEach(contract => {
          if (!contract.payments) return;

          contract.payments.forEach(pay => {
            const payMs = toMillisSafe(pay.date);

            if (payMs >= startMs && payMs <= endMs) {
              // 'adelanto' -> Ocurrió en la Sede de creación (branchId)
              // 'abono' o 'reembolso' -> Ocurrió en la Sede de entrega (deliveryType)
              const sedeDelPagoFisico = pay.type === 'adelanto' ? contract.branchId : contract.deliveryType;

              // Si NO estamos en "Global" y este pago NO le pertenece a la Sede actual, LO IGNORAMOS
              if (activeBranchId !== 'global' && sedeDelPagoFisico !== activeBranchId) {
                return;
              }

              const amount = Number(pay.amount);
              t += amount;

              if (pay.method === 'efectivo' || pay.method === 'efectivo_taller') c += amount;
              else if (pay.method === 'yape' || pay.method === 'plin' || pay.method === 'yape_taller') y += amount;

              const payDateObj = new Date(payMs);
              const dayKey = getLocalDateStr(payDateObj);
              const bucketKey = timeFilter === 'todo' ? dayKey.substring(0, 7) : dayKey;

              if (groupedChart[bucketKey]) {
                groupedChart[bucketKey].ventas += amount;
              }
            }
          });
        });
      } catch (err) {
        console.error("Error fusionando contratos al reporte:", err);
      }

      const resultSummary = { total: t, cash: c, yape: y, totalSales: orders };

      const resultChart = Object.values(groupedChart)
        .map(item => ({ ...item, ventas: Math.max(0, item.ventas), ordenes: Math.max(0, item.ordenes) }))
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

      const resultTop = Object.entries(productCount)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      if (!scope.isCurrent(revision)) return;
      setSummary(resultSummary);
      setChartData(resultChart);
      setTopProducts(resultTop);
      setIsLoading(false);

      reportsCache[cacheKey] = { summary: resultSummary, chartData: resultChart, topProducts: resultTop };
    };

    let unsubscribe = () => {};

    if (timeFilter === 'hoy') {
      unsubscribe = subscribeDailyStats(user.businessId, activeBranchId, startDateStr, endDateStr,
        scope.guard(processData), scope.guard(err => { console.error('Error hoy:', err); setIsLoading(false); }));
    } else {
      getDailyStats(user.businessId, activeBranchId, startDateStr, endDateStr)
        .then(scope.guard(processData))
        .catch(scope.guard(err => { console.error('Error histórico:', err); setIsLoading(false); }));
    }

    return () => { scope.close(); unsubscribe(); };
  }, [user?.businessId, identityKey, timeFilter, activeBranchId]);

  const maxProductQty = useMemo(() => topProducts.length > 0 ? topProducts[0].qty : 1, [topProducts]);

  return { summary, topProducts, chartData, isLoading, timeFilter, setTimeFilter: handleTimeFilterChange, maxProductQty };
};
