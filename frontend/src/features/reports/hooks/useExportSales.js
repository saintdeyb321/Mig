import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';
import { buildSalesWorkbook } from '../application/salesWorkbook.js';
import { loadExcelModule } from '../application/excelModule.js';
import { reportPeriod } from '../domain/reportPeriod.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';
import { managementReportHtml } from '../application/managementReportHtml.js';
import { reportViewModel } from '../application/reportViewModel.js';
import { aggregateReport, assertPosReportDetail } from '../domain/reportTotals.js';

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
  const { businessBranches, activeBranchId, identityKey, settings } = useTenantData();
  const businessId = user?.businessId;
  const businessName = settings?.companyData?.razonSocial || user?.businessName || businessId;
  const operator = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Cuenta autorizada';
  const scope = useMemo(() => ({ active: false, identityKey, businessId, branchId: activeBranchId, filter, resources }),
    [identityKey, businessId, activeBranchId, filter, resources]);
  useLayoutEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  const [state, setState] = useState(null);
  const processing = useRef(null), lastDownload = useRef(null);
  const exportData = useCallback(async (format, timeFilter = scope.filter) => {
    const { businessId, branchId: activeBranchId, identityKey, filter, resources } = scope;
    if (!businessId || !activeBranchId || timeFilter !== filter || !Object.hasOwn(labels, filter) || processing.current === scope || !scope.active) return;
    const printable = format === 'pdf';
    if (!printable && lastDownload.current?.identityKey === identityKey && Date.now() - lastDownload.current.at < 5000) {
      setState({ scope, phase: 'cooldown' });
      return;
    }
    processing.current = scope;
    let phase = printable ? 'data-read' : 'module-load';
    setState({ scope, phase });
    try {
      const XLSX = printable ? null : await loadExcelModule();
      if (!scope.active) return;
      phase = 'data-read';
      setState({ scope, phase });
      if (!navigator.onLine) throw new Error('Conéctate para verificar el período.');
      const period = reportPeriod(filter), detailed = ['hoy', 'semana'].includes(filter);
      const reads = sessionReportReads(resources, businessId, activeBranchId, period);
      const data = await reads.exportSnapshot(() => scope.active);
      if (!scope.active) return;
      phase = 'integrity';
      setState({ scope, phase });
      await waitForPaint();
      if (!scope.active) return;
      const branchesMap = Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name]));
      const input = { ...data, period, businessId, branchId: activeBranchId };
      if (printable) {
        const model = aggregateReport(input);
        if (detailed) for (const { row } of model.pos.sales) assertPosReportDetail(row);
        const view = reportViewModel(model, data.contracts, input, data.sessions);
        const html = managementReportHtml(view, { period, business: businessName, branchesMap, operator,
          branch: activeBranchId === 'global' ? 'Todas las sucursales' : branchesMap[activeBranchId] ?? activeBranchId, generatedAt: new Date() });
        setState({ scope, phase: 'preview', html });
        return;
      }
      const { workbook } = buildSalesWorkbook(XLSX, { ...input, detailed, branchesMap });
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
      setState({ scope, phase: 'error', failure: { kind: phase, error, format, offline: !navigator.onLine } });
    } finally {
      if (processing.current === scope) processing.current = null;
    }
  }, [scope, businessBranches, businessName, operator]);
  const current = state?.scope === scope ? state : null;
  return { phase: current?.phase ?? 'idle', html: current?.html, failure: current?.failure, isExporting: activePhases.includes(current?.phase),
    exportData, closePreview: () => setState(previous => previous?.scope === scope && previous.phase === 'preview' ? null : previous) };
};
