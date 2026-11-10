import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { getIdentityKey } from '../../../core/session/identity.js';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';
import { buildSalesWorkbook, writeSalesWorkbook } from '../application/salesWorkbook.js';
import { loadExcelModule } from '../application/excelModule.js';
import { reportPeriod } from '../domain/reportPeriod.js';
import { sessionReportReads } from '../infrastructure/sessionReportReads.js';
import { managementReportHtml } from '../application/managementReportHtml.js';
import { reportViewModel } from '../application/reportViewModel.js';
import { aggregateReport, assertPosReportDetail } from '../domain/reportTotals.js';
import { reportRevision, reportTTL } from '../application/reportResource.js';
import { createReportExportCache } from '../application/reportExportCache.js';
import { branchReportName, employeeReportName, profileReportName, reportLabel } from '../application/reportNames.js';
import { prepareReportPrint } from '../../../shared/printing/printDocument.js';

const labels = { hoy: 'Diario_Detallado', semana: 'Semanal_Detallado', mes: 'Mensual_Resumen', todo: 'Anual_Resumen' };
const activePhases = ['module-load', 'data-read', 'integrity', 'download'];
const waitForPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const REQUEST_TIMEOUT = 30000;

function startDownload(file, filename) {
  if (!file.size) throw new Error('El archivo generado está vacío.');
  const link = document.createElement('a');
  if (!('download' in link)) throw new Error('El navegador no admite descargas Blob.');
  const url = URL.createObjectURL(file);
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function reportPeople(resources, user) {
  const snapshot = resources.peekWatch(`personnel:users:${getIdentityKey(user)}`);
  const members = !snapshot?.isStale && !snapshot?.error && snapshot?.updatedAt != null ? snapshot.data : [];
  return new Map([...members.filter(person => person.businessId === user.businessId && person.role !== 'superadmin')
    .map(person => [person.id, profileReportName(person)]), [user.uid, profileReportName(user)]]);
}

export function useExportSales(user, filter, format) {
  const resources = useSessionResources();
  const { businessBranches, activeBranchId: branchId, identityKey, settings } = useTenantData();
  const businessId = user?.businessId;
  const revisionCell = reportRevision(resources, businessId);
  const revision = useSyncExternalStore(revisionCell.subscribe, revisionCell.get);
  // Replace and erase prepared reports whenever the authenticated scope changes.
  const { cache } = useMemo(() => ({ resources, identityKey, businessId, branchId, revision, cache: createReportExportCache() }),
    [resources, identityKey, businessId, branchId, revision]);
  useLayoutEffect(() => () => cache.clear(), [cache]);
  const scope = useMemo(() => ({ active: false, cache, filter, format }), [cache, filter, format]);
  useLayoutEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  const [state, setState] = useState(null);
  const processing = useRef(null);
  if (state && state.scope !== scope) setState(null);
  const current = state?.scope === scope ? state : null;
  useEffect(() => {
    if (!current?.expiresAt || current.expired) return;
    const timer = setTimeout(() => setState(previous => {
      if (previous !== current) return previous;
      // Keep an already-open native print job's document alive until the preview closes.
      return current.phase === 'preview' ? { ...current, expired: true } : null;
    }),
      Math.max(0, current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [current]);

  const exportData = async () => {
    if (!user?.uid || !identityKey || !businessId || !branchId || !scope.active || !Object.hasOwn(labels, filter) || processing.current === scope) return;
    const validScope = () => scope.active && resources.active && revisionCell.get() === revision;
    if (!validScope()) return;
    const period = reportPeriod(filter), key = period.key;
    const reads = sessionReportReads(resources, businessId, branchId, period);
    processing.current = scope;
    let phase = 'data-read', timedOut = false, timer;
    const isCurrent = () => validScope() && !timedOut;
    const assertCurrent = () => { if (!isCurrent()) throw new DOMException('El alcance del informe cambió.', 'AbortError'); };
    const update = next => { phase = next; setState({ scope, phase }); };
    let entry = cache.get(key);
    const cached = !!entry;
    const detailed = ['hoy', 'semana'].includes(filter);
    const printable = format === 'pdf';
    const prepare = async () => {
      let artifact = entry?.artifacts.get(format);
      if (!artifact) {
        const XLSX = printable ? null : await loadExcelModule();
        assertCurrent();
        if (!entry) {
          update('data-read');
          if (!navigator.onLine) throw new Error('Conéctate para verificar el período.');
          const data = await reads.exportSnapshot(isCurrent);
          assertCurrent();
          update('integrity');
          const model = aggregateReport({ ...data, period, businessId, branchId });
          if (detailed) for (const { row } of model.pos.sales) assertPosReportDetail(row);
          const expiresAt = data.loadedAt + reportTTL(period);
          if (expiresAt <= Date.now()) throw Object.assign(new Error('La lectura caducó. Vuelve a preparar el informe.'), { code: 'report-stale' });
          const snapshot = { data, model };
          entry = model.pos.sales.some(({ row }) => row.voided) ? { snapshot, expiresAt, artifacts: new Map() }
            : cache.put(key, snapshot, expiresAt);
        }
        const { data, model } = entry.snapshot;
        let contracts = data.contracts;
        if (!printable) {
          update('data-read');
          ({ contracts } = await reads.withContractAudit(data, isCurrent));
        }
        assertCurrent();
        update('integrity');
        await waitForPaint();
        assertCurrent();
        const branchesMap = Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name]));
        const people = reportPeople(resources, user);
        const input = { ...data, contracts, period, businessId, branchId, branchesMap, people, model };
        if (printable) {
          const view = reportViewModel(model, data.contracts, input, data.sessions, { branchesMap, people,
            branchIds: branchId === 'global' ? Object.keys(branchesMap) : [branchId] });
          artifact = prepareReportPrint(managementReportHtml(view, { period, operator: employeeReportName(people, user.uid),
            business: reportLabel(settings?.companyData?.razonSocial || user?.businessName, 'Mi negocio', businessId),
            branch: branchId === 'global' ? 'Todas las sucursales' : branchReportName(branchesMap, branchId),
            generatedAt: new Date(), fetchedAt: new Date(data.loadedAt) }), document);
        } else {
          const { workbook } = buildSalesWorkbook(XLSX, { ...input, detailed });
          const bytes = writeSalesWorkbook(XLSX, workbook);
          artifact = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }
        if (entry.expiresAt <= Date.now()) throw Object.assign(new Error('La lectura caducó. Vuelve a preparar el informe.'), { code: 'report-stale' });
        entry.artifacts.set(format, artifact);
      }
      return artifact;
    };
    update(printable || entry?.artifacts.has(format) ? 'integrity' : 'module-load');
    try {
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
        timedOut = true;
        reject(Object.assign(new Error('El informe tardó demasiado en responder.'), { code: 'report-timeout' }));
      }, REQUEST_TIMEOUT); });
      const artifact = await Promise.race([deadline, prepare()]);
      assertCurrent();
      const ready = { scope, fetchedAt: entry.snapshot.data.loadedAt, expiresAt: entry.expiresAt, reused: cached,
        provisional: entry.snapshot.model.pos.sales.some(({ row }) => row.voided) };
      if (printable) setState({ ...ready, phase: 'preview', html: artifact });
      else {
        update('download');
        startDownload(artifact, `Reporte_${labels[filter]}_${period.start}.xlsx`);
        setState({ ...ready, phase: 'started' });
      }
    } catch (error) {
      if (!validScope()) return;
      if (timedOut || phase === 'integrity' && !entry || error.code === 'report-stale') {
        cache.drop(key);
        reads.discardSnapshot();
      }
      reportDiagnostic('report', error);
      setState({ scope, phase: 'error', failure: { kind: phase, error, offline: !navigator.onLine } });
    } finally {
      clearTimeout(timer);
      if (processing.current === scope) processing.current = null;
    }
  };
  return { phase: current?.phase ?? 'idle', html: current?.html, expiresAt: current?.expiresAt, expired: current?.expired,
    failure: current?.failure, isExporting: activePhases.includes(current?.phase),
    fetchedAt: current?.fetchedAt, reused: current?.reused, provisional: current?.provisional, branchName: branchId === 'global' ? 'Todas las sucursales'
      : branchReportName(Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name])), branchId),
    exportData, closePreview: () => setState(previous => previous?.scope === scope && previous.phase === 'preview'
      ? (previous.expired ? null : { ...previous, phase: 'ready', html: undefined }) : previous) };
}
