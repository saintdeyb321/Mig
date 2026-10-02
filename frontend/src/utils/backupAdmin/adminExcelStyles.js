// src/utils/adminExcelStyles.js

const BORDER = {
  top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } }
};

const HEADER_STYLE = { fill: { fgColor: { rgb: "FCE4D6" } }, font: { bold: true }, alignment: { horizontal: "center" }, border: BORDER }; 
const VALUE_STYLE = { border: BORDER }; 
const INFO_STYLE = { fill: { fgColor: { rgb: "9DE0F6" } }, border: BORDER }; 
const DANGER_STYLE = { fill: { fgColor: { rgb: "FECACA" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 
const WARNING_STYLE = { fill: { fgColor: { rgb: "FEF08A" } }, font: { bold: true, color: { rgb: "92400E" } }, border: BORDER }; 
const SUCCESS_STYLE = { fill: { fgColor: { rgb: "BBF7D0" } }, font: { bold: true, color: { rgb: "166534" } }, border: BORDER };

const COMPLETED_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, border: BORDER }; 
const DETAILS_STYLE = { fill: { fgColor: { rgb: "B4C6E7" } }, border: BORDER }; 
const PRODUCT_STYLE = { fill: { fgColor: { rgb: "FFFFA6" } }, border: BORDER }; 
const EFECTIVO_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, border: BORDER }; 
const YAPE_STYLE = { fill: { fgColor: { rgb: "D9D2E9" } }, border: BORDER }; 
const VOIDED_STYLE = { fill: { fgColor: { rgb: "F6C0C0" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: BORDER }; 
const TOTAL_LABEL_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, font: { bold: true }, alignment: { horizontal: "right" }, border: BORDER }; 
const TOTAL_VALUE_STYLE = { fill: { fgColor: { rgb: "A9F08A" } }, font: { bold: true }, border: BORDER }; 
const ANULADO_LABEL_STYLE = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true, color: { rgb: "6B7280" } }, alignment: { horizontal: "right" }, border: BORDER };
const ANULADO_VALUE_STYLE = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true, color: { rgb: "6B7280" } }, border: BORDER };

export const applyAdminPremiumStyle = (ws) => {
  if (!ws) return; 

  Object.keys(ws).forEach(cell => {
    if (cell.startsWith('!')) return;
    const cellObj = ws[cell];
    if (!cellObj) return; 

    const rowNum = cell.replace(/[A-Z]/g, '');
    const col = cell.replace(/[0-9]/g, '');

    if (rowNum === '1') {
      cellObj.s = { ...HEADER_STYLE };
      return;
    }

    let cellStyle = { ...VALUE_STYLE };
    const val = cellObj.v ? String(cellObj.v).toUpperCase() : '';

    if (val.includes('ANULADA') || val.includes('FALTANTE') || val.includes('ERROR') || val.includes('ELIMINADO')) {
      cellStyle = DANGER_STYLE;
    } else if (val.includes('SOBRANTE') || val.includes('ADVERTENCIA') || val.includes('PENDIENTE')) {
      cellStyle = WARNING_STYLE;
    } else if (val.includes('COMPLETADA') || val.includes('CUADRADO') || val.includes('ACTIVO') || val.includes('EXITOSA')) {
      cellStyle = SUCCESS_STYLE;
    }

    if (col === 'A' || col === 'B') {
      if (JSON.stringify(cellStyle) === JSON.stringify(VALUE_STYLE)) {
        cellStyle = INFO_STYLE;
      }
    }

    cellObj.s = { ...(cellObj.s || {}), ...cellStyle };
  });
};

export const styleAdminDetailedTickets = (ws) => {
  if (!ws) return;

  const totalRows = new Set();
  const anuladoRows = new Set();

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    if (ws[cell].v === 'TOTAL TICKET ➔') totalRows.add(cell.replace(/[A-Z]/g, ''));
    if (ws[cell].v === 'TICKET ANULADO ➔') anuladoRows.add(cell.replace(/[A-Z]/g, ''));
  });

  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    const cellObj = ws[cell];
    if (!cellObj) return;

    const col = cell.replace(/[0-9]/g, '');
    const rowNum = cell.replace(/[A-Z]/g, '');

    if (rowNum === '1') return; // Headers already styled
    if (cellObj.v === undefined || cellObj.v === null || cellObj.v === '') return;

    // Info General (Celeste)
    if (['A', 'B', 'C', 'D', 'E'].includes(col)) ws[cell].s = { ...(ws[cell].s || {}), ...INFO_STYLE };
    
    // Estado
    else if (col === 'F') {
      if (cellObj.v === 'COMPLETADA') ws[cell].s = { ...(ws[cell].s || {}), ...COMPLETED_STYLE };
      else if (cellObj.v === 'ANULADA ❌') ws[cell].s = { ...(ws[cell].s || {}), ...VOIDED_STYLE };
    }
    
    // Pago
    else if (col === 'G') {
      if (cellObj.v === 'YAPE' || cellObj.v === 'PLIN') ws[cell].s = { ...(ws[cell].s || {}), ...YAPE_STYLE };
      else if (cellObj.v === 'EFECTIVO') ws[cell].s = { ...(ws[cell].s || {}), ...EFECTIVO_STYLE };
      else ws[cell].s = { ...(ws[cell].s || {}), ...VALUE_STYLE };
    }
    
    // Producto (Amarillo claro)
    else if (col === 'H') ws[cell].s = { ...(ws[cell].s || {}), ...PRODUCT_STYLE };
    
    // Detalles, Totales y Anulados (I, J, K)
    else if (['I', 'J', 'K'].includes(col)) {
      if (totalRows.has(rowNum)) {
        if (col === 'J') ws[cell].s = { ...(ws[cell].s || {}), ...TOTAL_LABEL_STYLE };
        if (col === 'K') ws[cell].s = { ...(ws[cell].s || {}), ...TOTAL_VALUE_STYLE };
      } else if (anuladoRows.has(rowNum)) {
        if (col === 'J') ws[cell].s = { ...(ws[cell].s || {}), ...ANULADO_LABEL_STYLE }; 
        if (col === 'K') ws[cell].s = { ...(ws[cell].s || {}), ...ANULADO_VALUE_STYLE }; 
      } else {
        ws[cell].s = { ...(ws[cell].s || {}), ...DETAILS_STYLE };
      }
    }
  });
};