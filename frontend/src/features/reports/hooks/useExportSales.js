import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getSessionsInPeriod } from '../../cash-register/infrastructure/cashRegisterRepository';
import { buildSalesWorkbook } from '../application/salesWorkbook.js';
import { reportPeriod } from '../domain/reportPeriod.js';
import { useTenantData } from '../../branches/context/TenantContext';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';

import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';

export const useExportSales = user => {
  const resources = useSessionResources();
  const { businessBranches, activeBranchId, identityKey } = useTenantData();
  const scope = useMemo(() => ({ active: true, identityKey, branchId: activeBranchId }), [identityKey, activeBranchId]);
  useEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  const [state, setState] = useState(null);
  const processing = useRef(false), lastExport = useRef(0);
  const exportData = useCallback(async (_type, timeFilter = 'hoy') => {
    if (!user?.businessId || !activeBranchId || processing.current || !scope.active) return;
    if (Date.now() - lastExport.current < 5000) { toast.error('Espera unos segundos antes de exportar.'); return; }
    lastExport.current = Date.now(); processing.current = true; setState(scope);
    const toastId = toast.loading('Generando Excel financiero...');
    try {
      const period = reportPeriod(timeFilter), detailed = ['hoy', 'semana'].includes(timeFilter);
      const reads = sessionReportReads(resources, user.businessId, activeBranchId, period);
      const branchesMap = Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name]));
      const [XLSX, pos, contractData, sessions] = await Promise.all([
        import('xlsx-js-style'),
        detailed ? reads.sales() : reads.stats(),
        reads.exportContracts(),
        detailed ? getSessionsInPeriod(user.businessId, period.startDate.toISOString(), period.endDate.toISOString(), activeBranchId) : [],
      ]);
      if (!scope.active) { toast.dismiss(toastId); return; }
      const { workbook } = buildSalesWorkbook(XLSX, { period, detailed, businessId: user.businessId, branchId: activeBranchId, branchesMap,
        ...(detailed ? { sales: pos } : { stats: pos }), payments: contractData.payments, contracts: contractData.contracts, sessions });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      try {
        const label = { hoy: 'Diario_Detallado', semana: 'Semanal_Detallado', mes: 'Mensual_Resumen', todo: 'Anual_Resumen' }[timeFilter];
        const link = document.createElement('a'); link.href = url; link.download = `Reporte_${label}_${period.start}.xlsx`;
        document.body.appendChild(link); link.click(); link.remove();
      } finally { URL.revokeObjectURL(url); }
      toast.success('Excel financiero descargado', { id: toastId });
    } catch (error) {
      reportDiagnostic('report', error);
      if (scope.active) toast.error(error.message || 'No se pudo generar el Excel.', { id: toastId }); else toast.dismiss(toastId);
    } finally { processing.current = false; setState(previous => previous === scope ? null : previous); }
  }, [user?.businessId, activeBranchId, scope, businessBranches, resources]);
  return { isExporting: state === scope, exportData };
};
