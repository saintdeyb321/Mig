// src/modules/ExportSales.jsx
import React, { useState, memo } from "react"
import { useExportSales } from "../features/reports/hooks/useExportSales"

function ExportSales({ user }) {
  // 🚀 FIX: Ahora controlamos el RANGO DE TIEMPO, no el tipo de reporte.
  const [timeFilter, setTimeFilter] = useState("hoy")
  const [consent, setConsent] = useState(false)
  const { isExporting, exportData } = useExportSales(user)

  const handleExport = async () => {
    if (isExporting || !consent) return
    // Pasamos un string genérico 'all' (ya que el hook hace todo) y el filtro de tiempo
    await exportData("all", timeFilter)
  }

  return (
    <div className="card fade-in export-card">
      <div className="export-header">
        <h3 className="export-title">
          <span>📊</span>
          Exportar Reportes Contables
        </h3>
        {/* 🚀 Ajuste de texto: Agregamos "Sucursales" para presumir la nueva función */}
        <p className="export-description">
          Descarga un Excel multi-hoja (Resumen, Ventas, Productos y Sucursales) listo para auditoría.
        </p>
      </div>

      <p>Diario/semanal: detalle bajo demanda. Mensual/anual también lee tickets individuales, aunque el archivo muestre resúmenes. Máximo 10000 movimientos y 500 contratos históricos; si se exceden no se genera un informe parcial. Las lecturas recientes se reutilizan durante su vigencia.</p>
      <label><input type="checkbox" checked={consent} disabled={isExporting} onChange={event => setConsent(event.target.checked)} /> Acepto el consumo de lecturas Spark de este período.</label>
      <div className="export-controls">
        <div className="export-select-wrapper">
          {/* 🚀 Selector de Calendario Estricto */}
          <select
            className="export-select"
            value={timeFilter}
            onChange={(e) => { setTimeFilter(e.target.value); setConsent(false) }}
            disabled={isExporting}
          >
            <option value="hoy">📅 Reporte Diario (Detallado por Ticket)</option>
            <option value="semana">📅 Reporte Semanal (Detallado por Ticket)</option>
            <option value="mes">📅 Reporte Mensual (Resumen por Día)</option>
            <option value="todo">📅 Reporte Anual (Resumen por Día)</option>
          </select>
        </div>

        <div className="export-button-wrapper">
          <button
            onClick={handleExport}
            disabled={isExporting || !consent}
            className={`export-button ${isExporting ? "disabled" : ""}`}
          >
            {isExporting ? "⏳ Generando Excel..." : "📥 Descargar Excel"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(ExportSales)
