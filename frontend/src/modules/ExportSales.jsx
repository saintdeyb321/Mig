import { Select, Button, Card, cn } from "../shared/ui";
// src/modules/ExportSales.jsx
import React, { useState, memo } from "react";
import { useExportSales } from "../features/reports/hooks/useExportSales";
function ExportSales({
  user
}) {
  // 🚀 FIX: Ahora controlamos el RANGO DE TIEMPO, no el tipo de reporte.
  const [timeFilter, setTimeFilter] = useState("mes");
  const {
    isExporting,
    exportData
  } = useExportSales(user);
  const handleExport = async () => {
    if (isExporting) return;
    // Pasamos un string genérico 'all' (ya que el hook hace todo) y el filtro de tiempo
    await exportData("all", timeFilter);
  };
  return <Card className="animate-enter motion-reduce:animate-none grid gap-4 border-l-4 border-l-success" as="div">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span>📊</span>
          Exportar Reportes Contables
        </h3>
        {/* 🚀 Ajuste de texto: Agregamos "Sucursales" para presumir la nueva función */}
        <p className="text-sm leading-relaxed text-muted">
          Descarga un Excel multi-hoja (Resumen, Ventas, Productos y Sucursales) listo para auditoría.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          {/* 🚀 Selector de Calendario Estricto */}
          <Select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} disabled={isExporting}>
            <option value="hoy">📅 Reporte Diario (Detallado por Ticket)</option>
            <option value="semana">📅 Reporte Semanal (Detallado por Ticket)</option>
            <option value="mes">📅 Reporte Mensual (Resumen por Día)</option>
            <option value="todo">📅 Reporte Anual (Resumen por Día)</option>
          </Select>
        </div>

        <div className="sm:shrink-0">
          <Button onClick={handleExport} disabled={isExporting} className={cn(`w-full ${isExporting ? "" : ""} `)} type="button" variant="secondary">
            {isExporting ? "⏳ Generando Excel..." : "📥 Descargar Excel"}
          </Button>
        </div>
      </div>
    </Card>;
}
export default memo(ExportSales);
