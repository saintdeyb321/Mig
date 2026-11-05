import { ChevronDown, Download, FileSpreadsheet } from 'lucide-react';
import FirestoreQueryError from '../components/FirestoreQueryError';
import { Select, Button } from '../shared/ui';
import { useState, useId, memo } from 'react';
import { useExportSales } from '../features/reports/hooks/useExportSales';

function ExportSales({ user }) {
  const [timeFilter, setTimeFilter] = useState('hoy');
  const periodId = useId();
  const { isExporting, queryError, exportData } = useExportSales(user);
  const handleExport = async () => {
    if (isExporting) return;
    await exportData('all', timeFilter);
  };
  return <section aria-label="Exportación Excel" className="export-toolbar space-y-2 rounded-2xl border border-line bg-panel p-3">
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <p className="flex items-center gap-2 text-sm font-bold"><FileSpreadsheet aria-hidden="true" className="size-5 text-success" />Excel</p>
      <label className="sr-only" htmlFor={periodId}>Período de exportación</label>
      <Select id={periodId} value={timeFilter} onChange={event => setTimeFilter(event.target.value)} disabled={isExporting} className="min-w-0">
        <option value="hoy">Hoy · detalle de tickets</option>
        <option value="semana">Semana · detalle de tickets</option>
        <option value="mes">Mes · resumen diario</option>
        <option value="todo">Año · resumen diario</option>
      </Select>
      <Button onClick={handleExport} disabled={isExporting} className="col-span-2 sm:col-span-1" type="button" variant="success" loading={isExporting}>
        <Download aria-hidden="true" />{isExporting ? 'Generando Excel…' : 'Descargar Excel'}
      </Button>
    </div>
    <p className="text-xs text-muted">La descarga consulta los movimientos del período seleccionado.</p>
    <details className="group text-xs text-muted"><summary className="flex min-h-8 cursor-pointer items-center gap-2 font-semibold">Detalles de exportación<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" /></summary>
      <div className="space-y-2 border-t border-line pt-2">
        <p>Excel con resumen, ventas, productos y sucursales para revisión operativa. Incluye ventas, compensaciones POS y pagos del período. Una compensación contable no acredita entrega física de efectivo ni devolución digital.</p>
        <p>Hoy y semana detallan cada movimiento; mes y año resumen por día. Máximo 10 000 movimientos y 500 contratos históricos. Si falta información o se excede el límite, se solicita reducir el período y no se descarga un Excel parcial.</p>
      </div>
    </details>
    <FirestoreQueryError error={queryError} area="reports" user={user} commercial />
  </section>;
}
export default memo(ExportSales);
