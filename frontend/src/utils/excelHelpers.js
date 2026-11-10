// src/utils/excelHelpers.js

export const sanitizeSheetName = (name) => {
  return name.replace(/[\][*?:/\\]/g, '').trim().substring(0, 31) || 'Sede_Desconocida';
};
export const uniqueSheetName = (name, used = []) => {
  const base = sanitizeSheetName(name);
  let candidate = base, counter = 1;
  while (used.some(item => item.toLowerCase() === candidate.toLowerCase())) {
    const suffix = `_${counter++}`; candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  return candidate;
};
export const cleanExcelRows = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')).map(([key, value]) => {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Importe no finito en columna ${key}.`);
  return [key, value ?? ''];
})));

/* =========================================
    PALETA DE COLORES PREMIUM (Global)
========================================= */
const BORDER = {
  top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } }
};

const HEADER_STYLE = { fill: { fgColor: { rgb: "3E2C63" } }, font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true } };
const INFO_STYLE = { fill: { fgColor: { rgb: "9DE0F6" } }, border: BORDER }; 
const PRODUCT_STYLE = { fill: { fgColor: { rgb: "FFFFA6" } }, border: BORDER }; 
const VALUE_STYLE = { border: BORDER }; 

const EFECTIVO_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, border: BORDER }; 
const YAPE_STYLE = { fill: { fgColor: { rgb: "D9D2E9" } }, border: BORDER }; 

const VOIDED_STYLE = { fill: { fgColor: { rgb: "F6C0C0" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 

const DANGER_STYLE = { fill: { fgColor: { rgb: "FECACA" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 
const WARNING_STYLE = { fill: { fgColor: { rgb: "FEF08A" } }, font: { bold: true, color: { rgb: "92400E" } }, border: BORDER }; 
const SUCCESS_STYLE = { fill: { fgColor: { rgb: "BBF7D0" } }, font: { bold: true, color: { rgb: "166534" } }, border: BORDER }; 

const CASH_AUDIT_STYLE = {
  'Pendiente de arqueo': WARNING_STYLE,
  'Conciliación pendiente': WARNING_STYLE,
  'Pendiente de revisión': WARNING_STYLE,
  'Sobrante registrado': WARNING_STYLE,
  'Faltante registrado': DANGER_STYLE,
  Coincide: SUCCESS_STYLE,
};


/* =========================================
    CREACIÓN DE HOJAS Y MONEDAS
========================================= */
export const createSheet = (XLSX, rows, columns, title) => {
  const safeRows = rows.length > 0 ? cleanExcelRows(rows) : [{ "Mensaje": "Sin datos en este periodo" }];
  const headerRow = title ? 2 : 1;
  const ws = title ? XLSX.utils.sheet_add_json(XLSX.utils.aoa_to_sheet([[title]]), safeRows, { origin: 'A2' })
    : XLSX.utils.json_to_sheet(safeRows);
  ws["!cols"] = columns;
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    range.s.r = headerRow - 1;
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    if (title) ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } }];
  }
  ws['!rows'] = title ? [{ hpt: 26 }, { hpt: 30 }] : [{ hpt: 30 }];
  if (title) ws.A1.s = { ...HEADER_STYLE, alignment: { horizontal: 'left', vertical: 'center' }, font: { ...HEADER_STYLE.font, sz: 12 } };

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    if (Number(cell.replace(/[A-Z]/g, '')) === headerRow) {
      ws[cell].s = { ...ws[cell].s, ...HEADER_STYLE };
    } else if (title && /^A\d+$/.test(cell) && ws[cell].t === 'n') {
      ws[cell].z = 'dd/mm/yyyy';
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
    if (headers['A'] === 'N.º de pedido' && headers['D'] === 'Sede Origen') {
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
      } else if (col === 'K' && Number(cellObj.v) < 0) {
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
      const state = ws['J' + rowNum]?.v;
      const style = ['B', 'J'].includes(col) ? CASH_AUDIT_STYLE[state] ?? VALUE_STYLE : VALUE_STYLE;
      ws[cell].s = { ...ws[cell].s, ...style };
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
export const styleTotalRows = (ws, headerRow = 1) => {
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
    if (ws[cell].v === 'TOTAL COMPENSACIÓN ➔') totalRows.add(cell.replace(/[A-Z]/g, ''));
    if (ws[cell].v === 'TICKET ANULADO ➔') anuladoRows.add(cell.replace(/[A-Z]/g, ''));
    if (ws[cell].v === '▶ AJUSTE CAJA') ajusteRows.add(cell.replace(/[A-Z]/g, ''));
  });

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    const cellObj = ws[cell];
    const col = cell.replace(/[0-9]/g, '');
    const rowNum = cell.replace(/[A-Z]/g, '');

    if (Number(rowNum) <= headerRow) return;
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
      else if (['COMPENSACIÓN POS', 'REEMBOLSO CONTABLE'].includes(cellObj.v)) ws[cell].s = { ...(ws[cell].s || {}), ...DANGER_STYLE };
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
    else if (col === 'K') ws[cell].s = { ...(ws[cell].s || {}), ...(anuladoRows.has(rowNum) ? ANULADO_VALUE_STYLE : TOTAL_VALUE_STYLE) };
    if (typeof cellObj.v === 'number' && cellObj.v < 0) ws[cell].s = { ...(ws[cell].s || {}), ...DANGER_STYLE };
    if (['C', 'F', 'J', 'L', 'M'].includes(col) && typeof cellObj.v === 'string') {
      ws[cell].s = { ...ws[cell].s, alignment: { ...ws[cell].s?.alignment, wrapText: true, vertical: 'center' } };
      const lines = Math.min(4, Math.ceil(cellObj.v.length / (ws['!cols']?.[col.charCodeAt(0) - 65]?.wch ?? 25)));
      if (lines > 1) (ws['!rows'] ??= [])[Number(rowNum) - 1] = { hpt: Math.max(ws['!rows'][Number(rowNum) - 1]?.hpt ?? 0, lines * 15) };
    }
  });
};
