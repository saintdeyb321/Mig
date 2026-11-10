import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSessionsInPeriod } from '../../cash-register/infrastructure/cashRegisterRepository';
import { useTenantData } from '../../branches/context/TenantContext';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';
import { buildSalesWorkbook } from '../application/salesWorkbook.js';
import { loadExcelModule } from '../application/excelModule.js';
import { reportPeriod } from '../domain/reportPeriod.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';

const labels = { hoy: 'Diario_Detallado', semana: 'Semanal_Detallado', mes: 'Mensual_Resumen', todo: 'Anual_Resumen' };
const activePhases = ['module-load', 'data-read', 'integrity', 'download'];
const waitForPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function startDownload(bytes, filename) {
  const file = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (file.size === 0) throw new Error('El archivo generado está vacío.');
  const link = document.createElement('a');
  if (!('download' in link)) throw new Error('El navegador no admite la descarga de archivos Blob.');
  const url = URL.createObjectURL(file);
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the Blob even after the component unmounts.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const useExportSales = (user, filter = 'hoy') => {
  const resources = useSessionResources();
  const { businessBranches, activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const scope = useMemo(() => ({ active: false, identityKey, businessId, branchId: activeBranchId, filter, resources }),
    [identityKey, businessId, activeBranchId, filter, resources]);
  useLayoutEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  const [state, setState] = useState(null);
  const processing = useRef(null), lastDownload = useRef(null);
  const exportData = useCallback(async (_type, timeFilter = scope.filter) => {
    const { businessId, branchId: activeBranchId, identityKey, filter, resources } = scope;
    if (!businessId || !activeBranchId || timeFilter !== filter || !Object.hasOwn(labels, filter) || processing.current === scope || !scope.active) return;
    if (lastDownload.current?.identityKey === identityKey && Date.now() - lastDownload.current.at < 5000) {
      setState({ scope, phase: 'cooldown' });
      return;
    }
    processing.current = scope;
    let phase = 'module-load';
    setState({ scope, phase });
    try {
      const XLSX = await loadExcelModule();
      if (!scope.active) return;
      phase = 'data-read';
      setState({ scope, phase });
      const period = reportPeriod(filter), detailed = ['hoy', 'semana'].includes(filter);
      const reads = sessionReportReads(resources, businessId, activeBranchId, period);
      const [sales, contractData, sessions, voids] = await Promise.all([
        reads.sales(), reads.exportContracts(),
        detailed ? getSessionsInPeriod(businessId, period.startDate.toISOString(), period.endDate.toISOString(), activeBranchId) : [],
        reads.voids(),
      ]);
      if (!scope.active) return;
      phase = 'integrity';
      setState({ scope, phase });
      await waitForPaint();
      if (!scope.active) return;
      const branchesMap = Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name]));
      const { workbook } = buildSalesWorkbook(XLSX, { period, detailed, businessId, branchId: activeBranchId, branchesMap,
        sales, payments: contractData.payments, voids, contracts: contractData.contracts, sessions });
      phase = 'download';
      setState({ scope, phase });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await waitForPaint();
      if (!scope.active) return;
      startDownload(buffer, `Reporte_${labels[filter]}_${period.start}.xlsx`);
      lastDownload.current = { identityKey, at: Date.now() };
      setState({ scope, phase: 'started' });
    } catch (error) {
      if (!scope.active) return;
      reportDiagnostic('report', error);
      setState({ scope, phase: 'error', failure: { kind: phase, error, offline: !navigator.onLine } });
    } finally {
      if (processing.current === scope) processing.current = null;
    }
  }, [scope, businessBranches]);
  const current = state?.scope === scope ? state : null;
  return { phase: current?.phase ?? 'idle', failure: current?.failure, isExporting: activePhases.includes(current?.phase), exportData };
};
