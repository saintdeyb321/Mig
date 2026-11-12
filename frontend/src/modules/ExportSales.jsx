import { CheckCircle2, ChevronDown, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogFooter, Select } from '../shared/ui';
import { queryErrorDiagnostic } from '../core/firebase/queryErrors.js';
import { useExportSales } from '../features/reports/hooks/useExportSales';

const statusMessages = {
  'module-load': 'Cargando módulo Excel…',
  'data-read': 'Consultando movimientos…',
  integrity: 'Verificando el informe…',
  download: 'Iniciando la descarga…',
  started: 'Se solicitó la descarga al navegador.',
};

function errorCopy({ kind, error, offline }, diagnostic) {
  if (error.code === 'report-timeout') return ['El informe tardó demasiado', 'Vuelve a intentar con el mismo período o selecciona un rango menor.'];
  if (error.code === 'report-stale') return ['Los datos del informe caducaron', 'Vuelve a preparar el informe para verificar los movimientos.'];
  if (kind === 'module-load') return ['No se pudo preparar Excel', offline
    ? 'Sin conexión. Conéctate para cargar el generador de archivos e intenta nuevamente.'
    : 'Hubo un problema al cargar el generador de archivos. Intenta nuevamente; si continúa, recarga la página.'];
  if (['permission-denied', 'unauthenticated'].includes(diagnostic?.code)) return ['Lectura de movimientos denegada', 'Tu cuenta no pudo acceder a estos movimientos. Solicita revisión al dueño.'];
  if (diagnostic?.missingIndex) return ['La consulta requiere preparación', 'Solicita al administrador que revise el índice indicado.'];
  if (/selecciona un período menor|reduce el período|supera 500 contratos/i.test(error?.message)) return ['El período supera el límite de exportación', 'Selecciona un período menor y vuelve a intentar.'];
  if (kind === 'integrity') return ['Los movimientos no concilian', 'Revisa los datos del período antes de intentar otra exportación.'];
  if (kind === 'download') return ['No se pudo iniciar la descarga', 'Comprueba que el navegador permita descargas y vuelve a intentar.'];
  return ['No se pudieron consultar los movimientos', offline || ['unavailable', 'deadline-exceeded'].includes(diagnostic?.code)
    ? 'Comprueba la conexión y vuelve a intentar.'
    : 'Intenta nuevamente o solicita revisión al administrador.'];
}

function ReportPreview({ html, expiresAt, expired, onClose }) {
  const frame = useRef(null);
  const inFlight = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(() => setStatus('frame-error'), 10000);
    return () => clearTimeout(timeout);
  }, [ready]);
  const print = () => {
    if (inFlight.current || !ready || Date.now() >= expiresAt) return;
    inFlight.current = true;
    try {
      const target = frame.current?.contentWindow;
      if (!target) throw new Error('La vista previa no está lista.');
      target.focus();
      // Keep the loaded document alive for nonblocking dialogs. afterprint is optional.
      target.print();
      setStatus('requested');
    } catch { setStatus('print-error'); }
    finally { requestAnimationFrame(() => { inFlight.current = false; }); }
  };
  return <Dialog title="Informe gerencial" description="Elige Guardar como PDF en el diálogo del navegador. Si aparece la URL o la fecha automática, desactiva Encabezados y pies de página."
    icon={Printer} className="max-w-5xl" onClose={onClose}>
    <iframe ref={frame} title="Vista previa del informe gerencial" sandbox="allow-same-origin allow-modals" srcDoc={html}
      onLoad={() => {
        if (!frame.current?.contentDocument?.querySelector('main')) return;
        setReady(true);
        setStatus('ready');
      }} className="h-[52vh] min-h-48 w-full rounded-lg border border-line bg-panel" />
    {status === 'frame-error' && <Alert variant="danger">La vista previa no pudo cargarse. Ciérrala y vuelve a preparar el informe.</Alert>}
    {status === 'print-error' && <Alert variant="danger">No se pudo abrir la impresión. Vuelve a intentar desde esta vista previa.</Alert>}
    {expired && <Alert variant="warning">Los datos caducaron. Cierra esta vista y vuelve a preparar el informe.</Alert>}
    <p role="status" aria-live="polite" className="text-sm text-muted">
      {status === 'loading' ? 'Cargando vista previa…' : status === 'requested' ? 'Se solicitó la impresión al navegador.' : ''}
    </p>
    <DialogFooter className="items-stretch sm:items-center sm:justify-center">
      <Button variant="secondary" onClick={onClose}>Cerrar vista previa</Button>
      <Button disabled={!ready || expired} onClick={print}>Imprimir / Guardar como PDF</Button>
    </DialogFooter>
  </Dialog>;
}

function ExportSales({ user }) {
  const [timeFilter, setTimeFilter] = useState('hoy');
  const [format, setFormat] = useState('pdf');
  const headingId = useId(), periodId = useId(), formatId = useId(), noticeId = useId();
  const actionRef = useRef(null);
  const { isExporting, failure, phase, html, expiresAt, expired, exportData, closePreview, fetchedAt, reused, provisional, branchName } = useExportSales(user, timeFilter, format);
  const diagnostic = failure?.kind === 'data-read' ? queryErrorDiagnostic(failure.error, 'reports') : null;
  const error = failure && errorCopy(failure, diagnostic);
  const admin = ['dueño', 'superadmin'].includes(user?.role) || import.meta.env.DEV;
  useEffect(() => {
    if (failure || phase === 'started') actionRef.current?.focus();
  }, [failure, phase]);

  const request = event => {
    event.preventDefault();
    if (!isExporting) void exportData();
  };

  return <section aria-labelledby={headingId} className="export-toolbar min-w-0 rounded-card border border-line border-l-4 border-l-success bg-linear-to-br from-panel via-panel to-success-soft/55 p-3 shadow-card sm:px-6">
    <header className="flex min-w-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-finance-line bg-success-soft text-success shadow-xs sm:size-11">
        <FileSpreadsheet aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 id={headingId} className="text-xl font-extrabold leading-snug tracking-tight text-ink sm:text-2xl">Informes del negocio</h2>
        <p className="mt-0.5 text-sm leading-snug text-muted">Revisa los resultados del período o descarga el detalle de los movimientos.</p>
      </div>
    </header>
    <form onSubmit={request} className="mt-4 grid min-w-0 gap-3">
      <div className="export-controls grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-ink" htmlFor={periodId}>Período</label>
          <Select id={periodId} value={timeFilter} onChange={event => setTimeFilter(event.target.value)} className="min-h-12 border-line bg-stellar-soft/35">
            <option value="hoy">Hoy</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="todo">Año</option>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-ink" htmlFor={formatId}>Formato</label>
          <Select id={formatId} value={format} onChange={event => setFormat(event.target.value)} className="min-h-12 border-line bg-stellar-soft/35">
            <option value="pdf">Informe visual (PDF)</option><option value="excel">Detalle Excel</option>
          </Select>
        </div>
      </div>
      <p id={noticeId} className="text-center text-xs text-muted">{branchName} · {format === 'pdf'
        ? 'Resumen para imprimir o guardar como PDF.' : 'Detalle y hojas de auditoría por período.'}</p>
      <Button ref={actionRef} aria-describedby={noticeId} type="submit" variant="success" size="lg" loading={isExporting}
        className="w-full sm:w-auto sm:min-w-56 sm:justify-self-center">
        {format === 'pdf' ? <><Printer aria-hidden="true" />Preparar informe PDF</> : <><Download aria-hidden="true" />Descargar detalle Excel</>}
      </Button>
    </form>
    <p role="status" aria-atomic="true" className={statusMessages[phase] || fetchedAt ? 'mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted' : 'sr-only'}>
      {phase === 'started' && <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />}{statusMessages[phase]}
      {fetchedAt && <span>{provisional ? 'Conciliación histórica pendiente' : reused ? 'Datos reutilizados' : 'Datos consultados'}
        {' · '}{new Date(fetchedAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })} (Lima)</span>}
    </p>
    {error && <Alert variant="danger" title={error[0]} className="mt-2">
      <p>{error[1]}</p>
      <details className="mt-1 text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Detalles técnicos</summary>
        <p>Etapa {failure.kind}{failure.kind === 'module-load' ? ' · xlsx-js-style' : ''}{diagnostic?.code && /^[a-z-]{1,48}$/.test(diagnostic.code) ? ' · ' + diagnostic.code : ''}.</p>
        {admin && diagnostic?.url && <a href={diagnostic.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold underline">Revisar índice en Firebase Console</a>}
      </details>
    </Alert>}
    <details className="group mt-1 text-xs text-muted">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold">Detalles de exportación<ChevronDown aria-hidden="true" className="size-3.5 shrink-0 group-open:rotate-180" /></summary>
      <div className="space-y-2 border-t border-line py-2">
        <p>La descarga consulta los movimientos del período seleccionado.</p>
        <p>Incluye ventas, compensaciones POS y pagos del período. Una compensación contable no acredita entrega física de efectivo ni devolución digital.</p>
        <p>Hoy y semana detallan cada movimiento. Mes y año resumen por día. Máximo 10 000 movimientos y 500 contratos históricos. Si falta información o se excede el límite, reduce el período antes de reintentar.</p>
      </div>
    </details>
    {html && <ReportPreview html={html} expiresAt={expiresAt} expired={expired} onClose={closePreview} />}
  </section>;
}
export default memo(ExportSales);
