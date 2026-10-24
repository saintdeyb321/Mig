import { Select, Button, Card, Input, FormField } from "../shared/ui";
// src/modules/ExportSales.jsx
import React, { useState, memo } from "react";
import { useExportSales } from "../features/reports/hooks/useExportSales";
function ExportSales({
  user
}) {
  // 🚀 FIX: Ahora controlamos el RANGO DE TIEMPO, no el tipo de reporte.
  const [timeFilter, setTimeFilter] = useState("hoy");
  const [consent, setConsent] = useState(false);
  const {
    isExporting,
    exportData
  } = useExportSales(user);
  const handleExport = async () => {
    if (isExporting || !consent) return;
    // Pasamos un string genérico 'all' (ya que el hook hace todo) y el filtro de tiempo
    await exportData("all", timeFilter);
  };
  return <Card className="animate-enter motion-reduce:animate-none grid gap-4 border-l-4 border-l-success" tone="finance" as="div">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span>📊</span>
          Exportar Reportes Contables
        </h3>
        {/* 🚀 Ajuste de texto: Agregamos "Sucursales" para presumir la nueva función */}
        <p className="text-sm leading-relaxed text-muted">
          Descarga un Excel con resumen, ventas, productos y sucursales para tu revisión operativa.
        </p>
      </div>

      <p className="text-sm text-muted">Diario/semanal: detalle bajo demanda. Mes/año también consulta tickets individuales. Máximo 10000 movimientos y 500 contratos históricos; no se genera un informe parcial si se exceden.</p>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-finance-line bg-panel p-3 text-sm"><Input type="checkbox" checked={consent} disabled={isExporting} onChange={event => setConsent(event.target.checked)} /> Acepto el consumo de lecturas Spark de este período.</label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="Período de exportación" className="min-w-0 flex-1">
          {/* 🚀 Selector de Calendario Estricto */}
          <Select value={timeFilter} onChange={e => { setTimeFilter(e.target.value); setConsent(false); }} disabled={isExporting}>
            <option value="hoy">📅 Reporte Diario (Detallado por Ticket)</option>
            <option value="semana">📅 Reporte Semanal (Detallado por Ticket)</option>
            <option value="mes">📅 Reporte Mensual (Resumen por Día)</option>
            <option value="todo">📅 Reporte Anual (Resumen por Día)</option>
          </Select>
        </FormField>

        <div className="sm:shrink-0">
          <Button onClick={handleExport} disabled={isExporting || !consent} className="w-full" type="button" variant="success" loading={isExporting}>
            {isExporting ? "⏳ Generando Excel..." : "📥 Descargar Excel"}
          </Button>
        </div>
      </div>
    </Card>;
}
export default memo(ExportSales);
