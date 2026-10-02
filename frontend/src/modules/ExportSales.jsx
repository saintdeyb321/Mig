// src/modules/ExportSales.jsx
import React, { useState, memo } from "react"
import { useExportSales } from "../hooks/useExportSales"

function ExportSales({ user }) {
  // 🚀 FIX: Ahora controlamos el RANGO DE TIEMPO, no el tipo de reporte.
  const [timeFilter, setTimeFilter] = useState("mes")
  const { isExporting, exportData } = useExportSales(user)

  const handleExport = async () => {
    if (isExporting) return
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

      <div className="export-controls">
        <div className="export-select-wrapper">
          {/* 🚀 Selector de Calendario Estricto */}
          <select
            className="export-select"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
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
            disabled={isExporting}
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