import { CheckCircle2, ChevronDown, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogFooter, Select } from '../shared/ui';
import { queryErrorDiagnostic } from '../core/firebase/queryErrors.js';
import { useExportSales } from '../features/reports/hooks/useExportSales';
import { usePrintJobs } from '../shared/printing/usePrintJobs.js';

const statusMessages = {
  'module-load': 'Cargando módulo Excel…',
  'data-read': 'Consultando movimientos…',
  integrity: 'Verificando el informe…',
  download: 'Iniciando la descarga…',
  started: 'Se solicitó la descarga al navegador.',
  cooldown: 'Espera unos segundos antes de volver a descargar.',
};

function errorCopy({ kind, error, offline }, diagnostic) {
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

function ReportPreview({ html, onClose }) {
  const runPrint = usePrintJobs();
  const inFlight = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(false);
  const print = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPrinting(true);
    setError(false);
    try { await runPrint(job => job.print(html), { page: 'a4' }); }
    catch (error) { if (error.name !== 'AbortError') setError(true); }
    finally { inFlight.current = false; setPrinting(false); }
  };
  return <Dialog title="Informe gerencial" description="Revisa la vista previa. En el diálogo de impresión puedes guardar una copia PDF."
    icon={Printer} className="max-w-5xl" busy={printing} onClose={onClose}>
    <iframe title="Vista previa del informe gerencial" sandbox="" srcDoc={html} className="h-[58vh] w-full rounded-lg border border-line bg-panel" />
    {error && <Alert variant="danger">No se pudo abrir la impresión. Vuelve a intentar desde esta vista previa.</Alert>}
    <DialogFooter>
      <Button variant="secondary" onClick={onClose}>Cerrar vista previa</Button>
      <Button loading={printing} onClick={print}>Imprimir / Guardar como PDF</Button>
    </DialogFooter>
  </Dialog>;
}

function ExportSales({ user }) {
  const [timeFilter, setTimeFilter] = useState('hoy');
  const headingId = useId(), periodId = useId(), noticeId = useId();
  const downloadRef = useRef(null), retryRef = useRef(null);
  const { isExporting, failure, phase, html, exportData, closePreview } = useExportSales(user, timeFilter);
  const diagnostic = failure?.kind === 'data-read' ? queryErrorDiagnostic(failure.error, 'reports') : null;
  const error = failure && errorCopy(failure, diagnostic);
  const admin = ['dueño', 'superadmin'].includes(user?.role) || import.meta.env.DEV;
  useEffect(() => {
    if (failure) retryRef.current?.focus();
    else if (phase === 'started' || phase === 'cooldown') downloadRef.current?.focus();
  }, [failure, phase]);

  const request = format => event => {
    event.preventDefault();
    if (!isExporting) void exportData(format, timeFilter);
  };

  return <section aria-labelledby={headingId} className="export-toolbar min-w-0 rounded-card border border-line border-l-4 border-l-success bg-linear-to-br from-panel via-panel to-success-soft/55 p-3 shadow-card sm:px-4">
    <header className="flex min-w-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-finance-line bg-success-soft text-success shadow-xs sm:size-11">
        <FileSpreadsheet aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 id={headingId} className="text-lg font-extrabold leading-snug tracking-tight text-ink sm:text-xl">Exportar reportes contables</h2>
        <p className="mt-0.5 text-sm leading-snug text-muted">Prepara un informe gerencial para imprimir o descarga el detalle Excel de movimientos, productos y sucursales.</p>
      </div>
    </header>
    <form onSubmit={request('excel')} className="export-controls mt-3 grid min-w-0 items-end gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:gap-3">
      <div className="min-w-0">
        <label className="mb-1 block text-xs font-semibold text-ink" htmlFor={periodId}>Período de exportación</label>
        <Select id={periodId} value={timeFilter} onChange={event => setTimeFilter(event.target.value)} disabled={isExporting} className="min-h-12 border-line bg-stellar-soft/35">
          <option value="hoy">Hoy · detalle de tickets</option>
          <option value="semana">Semana · detalle de tickets</option>
          <option value="mes">Mes · resumen diario</option>
          <option value="todo">Año · sujeto al límite de movimientos</option>
        </Select>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Button ref={downloadRef} aria-describedby={noticeId} type="submit" variant="success" size="lg" disabled={isExporting}>
          <Download aria-hidden="true" />Descargar Excel
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={isExporting} onClick={request('pdf')}><Printer aria-hidden="true" />Informe PDF</Button>
      </div>
    </form>
    <p id={noticeId} className="sr-only">La descarga consulta los movimientos del período seleccionado.</p>
    <p role="status" aria-atomic="true" className={statusMessages[phase] ? 'mt-2 flex items-center gap-2 text-sm text-muted' : 'sr-only'}>
      {phase === 'started' && <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />}{statusMessages[phase]}
    </p>
    {error && <Alert variant="danger" title={error[0]} className="mt-2">
      <p>{error[1]}</p>
      <Button ref={retryRef} onClick={request(failure.format)} variant="secondary" size="sm" className="mt-2 sm:min-h-11">Reintentar exportación</Button>
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
    {html && <ReportPreview html={html} onClose={closePreview} />}
  </section>;
}
export default memo(ExportSales);
