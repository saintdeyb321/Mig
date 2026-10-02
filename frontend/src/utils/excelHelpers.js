// src/utils/excelHelpers.js

export const sanitizeSheetName = (name) => {
  return name.replace(/[\][*?:/\\]/g, '').trim().substring(0, 31) || 'Sede_Desconocida';
};

/* =========================================
    PALETA DE COLORES PREMIUM (Global)
========================================= */
const BORDER = {
  top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } }
};

const HEADER_STYLE = { fill: { fgColor: { rgb: "FCE4D6" } }, font: { bold: true }, alignment: { horizontal: "center" }, border: BORDER }; 
const INFO_STYLE = { fill: { fgColor: { rgb: "9DE0F6" } }, border: BORDER }; 
const PRODUCT_STYLE = { fill: { fgColor: { rgb: "FFFFA6" } }, border: BORDER }; 
const VALUE_STYLE = { border: BORDER }; 

const EFECTIVO_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, border: BORDER }; 
const YAPE_STYLE = { fill: { fgColor: { rgb: "D9D2E9" } }, border: BORDER }; 

const VOIDED_STYLE = { fill: { fgColor: { rgb: "F6C0C0" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 

const DANGER_STYLE = { fill: { fgColor: { rgb: "FECACA" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 
const WARNING_STYLE = { fill: { fgColor: { rgb: "FEF08A" } }, font: { bold: true, color: { rgb: "92400E" } }, border: BORDER }; 
const SUCCESS_STYLE = { fill: { fgColor: { rgb: "BBF7D0" } }, font: { bold: true, color: { rgb: "166534" } }, border: BORDER }; 

// NUEVOS ESTILOS PARA SUB-FILAS (Desglose de Auditoría)
const SUBROW_LABEL_STYLE = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true }, border: BORDER, alignment: { horizontal: "right" } };
const SUBROW_VALUE_STYLE = { fill: { fgColor: { rgb: "E0F2FE" } }, font: { bold: true }, border: BORDER };


/* =========================================
    CREACIÓN DE HOJAS Y MONEDAS
========================================= */
export const createSheet = (XLSX, rows, columns) => {
  const safeRows = rows.length > 0 ? rows : [{ "Mensaje": "Sin datos en este periodo" }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  ws["!cols"] = columns;
  if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    if (cell.replace(/[A-Z]/g, '') === '1') {
      ws[cell].s = { ...ws[cell].s, ...HEADER_STYLE };
    }
  });

  return ws;
};

export const applyCurrencyToCols = (ws, colLetters) => {
  const currencyFormat = '"S/" #,##0.00';
  Object.keys(ws).forEach(key => {
    if (key.startsWith('!')) return;
    const col = key.replace(/[0-9]/g, '');
    const row = key.replace(/[A-Z]/g, '');
    
    const isHeader = row === '1'; 

    if (!isHeader && colLetters.includes(col) && typeof ws[key].v === 'number') {
      ws[key].s = ws[key].s || {}; 
      ws[key].z = currencyFormat;
    }
  });
};

/* =========================================
    ESTILOS INTELIGENTES PARA RESÚMENES
========================================= */
export const styleSummarySheet = (ws, type = 'default') => {
  const headers = {};
  
  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    if (cell.replace(/[A-Z]/g, '') === '1') {
      headers[cell.replace(/[0-9]/g, '')] = ws[cell].v;
    }
  });

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    const cellObj = ws[cell];
    const col = cell.replace(/[0-9]/g, '');
    const rowNum = cell.replace(/[A-Z]/g, '');

    if (rowNum === '1') return; 
    if (cellObj.v === undefined || cellObj.v === null || cellObj.v === '') return; 

    // --- 1. HOJA DE RESUMEN GLOBAL ---
    if (headers['A'] === 'Concepto' && headers['B'] === 'Valor') {
      const conceptoText = String(ws['A' + rowNum]?.v || '');
      let rowStyle = VALUE_STYLE; 

      if (conceptoText.includes('GRAN TOTAL')) {
        rowStyle = SUCCESS_STYLE; 
      }
      else if (conceptoText.includes('PEDIDOS ESPECIALES')) {
        rowStyle = PRODUCT_STYLE; 
      }
      else if (conceptoText.includes('Filtro') || conceptoText.includes('Rango') || conceptoText.includes('Generado') || conceptoText.includes('VENTAS MOSTRADOR') || conceptoText.includes('Completados')) {
        rowStyle = INFO_STYLE;
      } 
      else if (conceptoText.includes('Efectivo') || conceptoText.includes('Neto Real')) {
        rowStyle = EFECTIVO_STYLE;
      } 
      else if (conceptoText.includes('Yape')) {
        rowStyle = YAPE_STYLE;
      } 
      else if (conceptoText.includes('Sobrante')) {
        rowStyle = WARNING_STYLE;
      } 
      else if (conceptoText.includes('Faltante') || conceptoText.includes('Anulados')) {
        rowStyle = DANGER_STYLE;
      } 

      ws[cell].s = { ...(ws[cell].s || {}), ...rowStyle };
      return;
    }

    // --- 🚀 2. HOJA DE AUDITORÍA DE CONTRATOS (VISTA PANORÁMICA) ---
    if (headers['A'] === 'ID Pedido' && headers['D'] === 'Sede Origen') {
      let rowStyle = VALUE_STYLE;

      if (col === 'A' || col === 'B') {
        rowStyle = INFO_STYLE; // Columnas ID y Fecha en Azulito
      } else if (col === 'D' || col === 'E') {
        // Destacar si la Sede de Recojo o Origen es el Taller
        if (String(cellObj.v).toUpperCase().includes('TALLER')) rowStyle = WARNING_STYLE; 
      } else if (col === 'F') {
        rowStyle = PRODUCT_STYLE; // Total del contrato en Amarillo
      } else if (col === 'G' || col === 'I') {
        if (Number(cellObj.v) > 0) rowStyle = SUCCESS_STYLE; // Ingresos de Adelanto/Abono en Verde
      } else if (col === 'H' || col === 'J') {
         if (String(cellObj.v).includes('EFECTIVO')) rowStyle = EFECTIVO_STYLE;
         else if (String(cellObj.v).includes('YAPE') || String(cellObj.v).includes('PLIN')) rowStyle = YAPE_STYLE;
      } else if (col === 'K' && Number(cellObj.v) > 0) {
        rowStyle = DANGER_STYLE; // Reembolsos en Rojo
      } else if (col === 'L') {
        // Pintar la columna de Estado según su valor
        if (String(cellObj.v).includes('ENTREGADO')) rowStyle = SUCCESS_STYLE;
        else if (String(cellObj.v).includes('CANCELADO')) rowStyle = DANGER_STYLE;
        else rowStyle = WARNING_STYLE;
      }

      ws[cell].s = { ...(ws[cell].s || {}), ...rowStyle };
      return;
    }

    // --- 3. HOJA DE AUDITORÍA DE CAJAS ---
    if (type === 'auditoria') {
      const turnoCell = ws['B' + rowNum];
      const isSubRow = turnoCell && String(turnoCell.v).includes("↳ Fondo esperado");

      if (isSubRow) {
        if (col === 'B' || col === 'D') {
          ws[cell].s = { ...(ws[cell].s || {}), ...SUBROW_LABEL_STYLE };
        } else if (col === 'C' || col === 'E') {
          ws[cell].s = { ...(ws[cell].s || {}), ...SUBROW_VALUE_STYLE };
          if (typeof cellObj.v === 'number') ws[cell].z = '"S/" #,##0.00';
        } else if (col === 'F') {
          const isFaltante = String(cellObj.v).includes("FALTANTE") || String(cellObj.v).includes("ALERTA");
          ws[cell].s = { ...(ws[cell].s || {}), ...(isFaltante ? DANGER_STYLE : WARNING_STYLE), alignment: { horizontal: "center" } };
        } else if (col === 'G') {
          const isFaltante = Number(cellObj.v) < 0 || String(ws['F'+rowNum]?.v).includes("FALTANTE");
          ws[cell].s = { ...(ws[cell].s || {}), ...(isFaltante ? DANGER_STYLE : WARNING_STYLE) };
          if (typeof cellObj.v === 'number') ws[cell].z = '"S/" #,##0.00';
        } else {
          ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
        }
        return;
      }

      const estadoCell = ws['H' + rowNum]; 
      if (estadoCell && estadoCell.v) {
        let rowStyle = VALUE_STYLE;
        if (String(estadoCell.v).includes('Faltante')) rowStyle = DANGER_STYLE;
        else if (String(estadoCell.v).includes('Sobrante')) rowStyle = WARNING_STYLE;
        else if (String(estadoCell.v).includes('Cuadrado') && ['F', 'G', 'H'].includes(col)) rowStyle = SUCCESS_STYLE;

        ws[cell].s = { ...(ws[cell].s || {}), ...rowStyle };
        return;
      }
      ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
      return;
    }

    // --- 4. OTRAS HOJAS (Sucursales, Global, Detalle) ---
    if (headers['A'] === 'Sucursal' && headers['B'] === 'Tickets') {
      if (col === 'A') {
        ws[cell].s = { ...(ws[cell].s || {}), ...INFO_STYLE };
      } 
      else if (headers[col] === 'Faltante/Sobrante (S/)') {
        if (cellObj.v > 0) ws[cell].s = { ...(ws[cell].s || {}), ...WARNING_STYLE }; 
        else if (cellObj.v < 0) ws[cell].s = { ...(ws[cell].s || {}), ...DANGER_STYLE }; 
        else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE }; 
      }
      else if (headers[col] === 'Ingreso Real Sede (S/)') {
        ws[cell].s = { ...(ws[cell].s || {}), ...EFECTIVO_STYLE }; 
      }
      else {
        ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
      }
      return;
    }

    if (headers[col] === 'Anulados') {
      if (typeof cellObj.v === 'number' && cellObj.v > 0) ws[cell].s = { ...(ws[cell].s || {}), ...VOIDED_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE }; 
      return;
    }

    if (headers[col] === 'Efectivo') { ws[cell].s = { ...(ws[cell].s || {}), ...EFECTIVO_STYLE }; return; }
    if (headers[col] === 'Yape' || headers[col] === 'Yape/Plin') { ws[cell].s = { ...(ws[cell].s || {}), ...YAPE_STYLE }; return; }

    if (type === 'productos_global') {
      if (col === 'A') ws[cell].s = { ...(ws[cell].s || {}), ...PRODUCT_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
    } 
    else if (type === 'productos_detalle') {
      if (col === 'A') ws[cell].s = { ...(ws[cell].s || {}), ...PRODUCT_STYLE };
      else if (col === 'B') ws[cell].s = { ...(ws[cell].s || {}), ...INFO_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
    } 
    else {
      if (col === 'A') ws[cell].s = { ...(ws[cell].s || {}), ...INFO_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
    }
  });
};

/* =========================================
    ESTILOS PARA DETALLES DE TICKETS
========================================= */
export const styleTotalRows = (ws) => {
  const COMPLETED_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, border: BORDER }; 
  const DETAILS_STYLE = { fill: { fgColor: { rgb: "B4C6E7" } }, border: BORDER }; 
  const TOTAL_LABEL_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, font: { bold: true }, alignment: { horizontal: "right" }, border: BORDER }; 
  const TOTAL_VALUE_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, font: { bold: true }, border: BORDER }; 
  const ANULADO_LABEL_STYLE = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true, color: { rgb: "6B7280" } }, alignment: { horizontal: "right" }, border: BORDER };
  const ANULADO_VALUE_STYLE = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true, color: { rgb: "6B7280" } }, border: BORDER };

  const totalRows = new Set();
  const anuladoRows = new Set();
  const ajusteRows = new Set();

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    if (ws[cell].v === 'TOTAL TICKET ➔') totalRows.add(cell.replace(/[A-Z]/g, ''));
    if (ws[cell].v === 'TICKET ANULADO ➔') anuladoRows.add(cell.replace(/[A-Z]/g, ''));
    if (ws[cell].v === '▶ AJUSTE CAJA') ajusteRows.add(cell.replace(/[A-Z]/g, ''));
  });

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    const cellObj = ws[cell];
    const col = cell.replace(/[0-9]/g, '');
    const rowNum = cell.replace(/[A-Z]/g, '');

    if (rowNum === '1') return; 
    if (cellObj.v === undefined || cellObj.v === null || cellObj.v === '') return;

    if (ajusteRows.has(rowNum)) {
      const tipoAjuste = ws['D' + rowNum]?.v || ws['E' + rowNum]?.v || ''; 
      let ajusteStyle = VALUE_STYLE;

      if (String(tipoAjuste).includes('FALTANTE')) ajusteStyle = DANGER_STYLE;
      else if (String(tipoAjuste).includes('SOBRANTE')) ajusteStyle = WARNING_STYLE;
      else if (col === 'A' || col === 'B') ajusteStyle = INFO_STYLE; 

      ws[cell].s = { ...(ws[cell].s || {}), ...ajusteStyle };
      return; 
    }

    if (col === 'A' || col === 'B' || col === 'C') ws[cell].s = { ...(ws[cell].s || {}), ...INFO_STYLE };
    else if (col === 'D') {
      if (cellObj.v === 'COMPLETADA') ws[cell].s = { ...(ws[cell].s || {}), ...COMPLETED_STYLE };
      else if (cellObj.v === 'ANULADA ❌') ws[cell].s = { ...(ws[cell].s || {}), ...VOIDED_STYLE };
    }
    else if (col === 'E') {
      if (cellObj.v === 'YAPE' || cellObj.v === 'PLIN') ws[cell].s = { ...(ws[cell].s || {}), ...YAPE_STYLE };
      else if (cellObj.v === 'EFECTIVO') ws[cell].s = { ...(ws[cell].s || {}), ...EFECTIVO_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
    }
    else if (col === 'F') ws[cell].s = { ...(ws[cell].s || {}), ...PRODUCT_STYLE };
    else if (col === 'G' || col === 'H' || col === 'I') {
      if (totalRows.has(rowNum)) {
        if (col === 'H') ws[cell].s = { ...(ws[cell].s || {}), ...TOTAL_LABEL_STYLE };
        if (col === 'I') ws[cell].s = { ...(ws[cell].s || {}), ...TOTAL_VALUE_STYLE };
      } else if (anuladoRows.has(rowNum)) {
        if (col === 'H') ws[cell].s = { ...(ws[cell].s || {}), ...ANULADO_LABEL_STYLE }; 
        if (col === 'I') ws[cell].s = { ...(ws[cell].s || {}), ...ANULADO_VALUE_STYLE }; 
      } else {
        ws[cell].s = { ...(ws[cell].s || {}), ...DETAILS_STYLE };
      }
    }
  });
};