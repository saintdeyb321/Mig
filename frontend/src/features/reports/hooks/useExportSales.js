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
import { isSummaryPeriod, exportReportSourceForPeriod } from '../application/reportSources.js';
import { readVerifiedSummary } from '../infrastructure/summaryRepository.js';
import { buildSummaryView } from '../application/summaryView.js';
import { buildSummaryWorkbook, managementSummaryReportHtml } from '../application/summaryDocuments.js';
import { employeeReportName, profileReportName, reportLabel } from '../application/reportNames.js';
import { prepareReportPrint } from '../../../shared/printing/printDocument.js';

const labels = { hoy: 'Diario_Detallado', semana: 'Semanal_Detallado', mes: 'Mensual_Resumen', todo: 'Anual_Resumen' };
const activePhases = ['module-load', 'data-read', 'contract-audit', 'integrity', 'document', 'download'];
const REMOTE_TIMEOUT = 30000;
const DATA_READ_TIMEOUT = 90000;

function reportTiming(name, start) {
  if (import.meta.env.DEV) performance.measure(`migapos:report:${name}`, { start });
}

async function waitForRemote(load, signal, timeout, onTimeout) {
  signal.throwIfAborted();
  let timer, cancel;
  const guard = new Promise((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      onTimeout();
      reject(Object.assign(new Error('No se completó la operación remota.'), { code: 'report-timeout' }));
    }, timeout);
  });
  try { return await Promise.race([guard, Promise.resolve().then(() => { signal.throwIfAborted(); return load(); })]); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}

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
  const { businessBranches, identityKey, settings } = useTenantData();
  const branchId = 'global';
  const businessId = user?.businessId;
  const revisionCell = reportRevision(resources, businessId);
  const revision = useSyncExternalStore(revisionCell.subscribe, revisionCell.get);
  // Replace and erase prepared reports whenever the authenticated scope changes.
  const { cache } = useMemo(() => ({ resources, identityKey, businessId, revision, cache: createReportExportCache() }),
    [resources, identityKey, businessId, revision]);
  useLayoutEffect(() => () => cache.clear(), [cache]);
  const scope = useMemo(() => ({ active: false, cache, filter, format }), [cache, filter, format]);
  const processing = useRef(null);
  useLayoutEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
      if (processing.current?.scope === scope) processing.current.controller.abort();
    };
  }, [scope]);
  const [state, setState] = useState(null);
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

  const exportData = async ({ acceptHistorical = false } = {}) => {
    if (!user?.uid || !identityKey || !businessId || !scope.active || !Object.hasOwn(labels, filter) || processing.current?.scope === scope) return;
    const isAuthorized = () => resources.active && revisionCell.get() === revision;
    const validScope = () => scope.active && isAuthorized();
    if (!validScope()) return;
    const period = reportPeriod(filter);
    const historical = isSummaryPeriod(period) && acceptHistorical;
    if (historical && !window.confirm('La exportación histórica puede consultar hasta 10 000 movimientos, 500 referencias de pedidos y las cajas del período. Puede consumir miles de lecturas de Firestore. ¿Autorizar esta consulta?')) return;
    if (!validScope()) return;
    const source = exportReportSourceForPeriod(period, () => sessionReportReads(resources, businessId, branchId, period, { identityKey, revision }),
      { acceptHistorical: historical, readSummary: () => readVerifiedSummary({
        resources, uid: user.uid, identityKey, businessId, branchId, period, revision, includeProducts: true,
      }) });
    const reads = source.exportReads;
    const consolidated = isSummaryPeriod(period) && source.representation === 'snapshots';
    const key = JSON.stringify([period.key, consolidated ? 'snapshots' : historical ? 'history' : 'detail']);
    const controller = new AbortController(), run = { scope, controller };
    processing.current = run;
    let phase = 'data-read', timedOut = false;
    const isCurrent = () => validScope() && !timedOut && !controller.signal.aborted;
    const assertCurrent = () => { if (!isCurrent()) throw new DOMException('El alcance del informe cambió.', 'AbortError'); };
    const update = next => { phase = next; setState({ scope, phase, historical }); };
    let entry = cache.get(key);
    let cached = !!entry;
    const detailed = source.kind === 'detailed';
    const printable = format === 'pdf';
    const remote = async (name, load) => {
      update(name);
      const start = performance.now();
      try { return await waitForRemote(load, controller.signal, name === 'data-read' ? DATA_READ_TIMEOUT : REMOTE_TIMEOUT, () => { timedOut = true; }); }
      finally { reportTiming(name, start); }
    };
    const local = (name, work) => {
      const start = performance.now();
      try { return work(); }
      finally { reportTiming(name, start); }
    };
    const assertFresh = expiresAt => {
      if (expiresAt <= Date.now()) throw Object.assign(new Error('La lectura caducó. Vuelve a preparar el informe.'), { code: 'report-stale' });
    };
    try {
      let artifact = entry?.artifacts.get(format);
      if (!artifact) {
        const XLSX = printable ? null : await remote('module-load', loadExcelModule);
        assertCurrent();
        entry = cache.get(key);
        cached = !!entry;
        if (!entry) {
          const data = await remote('data-read', () => {
            if (!navigator.onLine) throw new Error('Conéctate para verificar el período.');
            // The timeout ends the wait; a retry may still reuse the original reads.
            return consolidated ? source.readSummary() : reads.exportSnapshot(() => validScope() && !controller.signal.aborted);
          });
          assertCurrent();
          update('integrity');
          const model = local('aggregate', () => consolidated ? buildSummaryView(data, period) : aggregateReport({ ...data, period, businessId, branchId }));
          if (detailed) local('pos-validation', () => { for (const { row } of model.pos.sales) assertPosReportDetail(row); });
          const expiresAt = consolidated ? data.expiresAt : data.loadedAt + reportTTL(period);
          assertFresh(expiresAt);
          entry = cache.put(key, { data, model }, expiresAt);
        }
        const { data, model } = entry.snapshot;
        const contracts = consolidated || printable ? data.contracts : (await remote('contract-audit', () => reads.withContractAudit(data, isCurrent))).contracts;
        assertCurrent();
        assertFresh(entry.expiresAt);
        update('document');
        const branchesMap = Object.fromEntries((businessBranches ?? []).map(branch => [branch.id, branch.name]));
        const people = reportPeople(resources, user);
        const business = reportLabel(settings?.companyData?.razonSocial || user?.businessName, 'Mi negocio', businessId);
        const input = { ...data, contracts, period, businessId, business, branchId, branchesMap, people, model };
        if (consolidated) {
          if (printable) artifact = local('pdf-html', () => prepareReportPrint(managementSummaryReportHtml(model, input), document));
          else {
            const workbook = local('xlsx-workbook', () => buildSummaryWorkbook(XLSX, model, input));
            const bytes = local('xlsx-serialize', () => writeSalesWorkbook(XLSX, workbook));
            artifact = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          }
        } else if (printable) {
          const view = local('view-model', () => reportViewModel(model, data.contracts, input, data.sessions, { branchesMap, people,
            branchIds: [...model.branches.keys()] }));
          const html = local('pdf-html', () => managementReportHtml(view, { period, operator: employeeReportName(people, user.uid),
            business,
            branch: 'Todas las sucursales',
            generatedAt: new Date(), fetchedAt: new Date(data.loadedAt) }));
          artifact = local('print-document', () => prepareReportPrint(html, document));
        } else {
          const { workbook } = local('xlsx-workbook', () => buildSalesWorkbook(XLSX, { ...input, detailed }));
          const bytes = local('xlsx-serialize', () => writeSalesWorkbook(XLSX, workbook));
          artifact = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }
        assertFresh(entry.expiresAt);
        entry.artifacts.set(format, artifact);
      }
      assertCurrent();
      const ready = { scope, historical, fetchedAt: entry.snapshot.data.loadedAt, expiresAt: entry.expiresAt, reused: cached,
        provisional: !consolidated && entry.snapshot.model.pos.sales.some(({ row }) => row.voided) };
      if (printable) setState({ ...ready, phase: 'preview', html: artifact });
      else {
        update('download');
        const label = historical ? `${filter === 'mes' ? 'Mensual' : 'Anual'}_Historico` : labels[filter];
        startDownload(artifact, `Reporte_${label}_${period.start}.xlsx`);
        setState({ ...ready, phase: 'started' });
      }
    } catch (error) {
      if (!validScope()) return;
      if ((phase === 'integrity' && !entry) || error.code === 'report-stale') {
        cache.drop(key);
        reads?.discardSnapshot();
      }
      reportDiagnostic('report', error);
      setState({ scope, historical, phase: 'error', failure: { kind: phase, error, offline: !navigator.onLine } });
    } finally {
      if (processing.current === run) processing.current = null;
    }
  };
  return { phase: current?.phase ?? 'idle', html: current?.html, expiresAt: current?.expiresAt, expired: current?.expired,
    failure: current?.failure, isExporting: activePhases.includes(current?.phase),
    fetchedAt: current?.fetchedAt, reused: current?.reused, provisional: current?.provisional,
    historical: current?.historical === true, summaryPeriod: ['mes', 'todo'].includes(filter),
    exportData, closePreview: () => setState(previous => previous?.scope === scope && previous.phase === 'preview'
      ? (previous.expired ? null : { ...previous, phase: 'ready', html: undefined }) : previous) };
}
