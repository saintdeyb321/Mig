// src/utils/adminExcelStyles.js

// 🚀 Renombrado a ADMIN_BORDER para evitar conflictos globales
const ADMIN_BORDER = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } }
};

const HEADER_STYLE = { fill: { fgColor: { rgb: "FCE4D6" } }, font: { bold: true }, alignment: { horizontal: "center" }, border: ADMIN_BORDER }; 
const VALUE_STYLE = { border: ADMIN_BORDER }; 
const INFO_STYLE = { fill: { fgColor: { rgb: "9DE0F6" } }, border: ADMIN_BORDER }; 
const DANGER_STYLE = { fill: { fgColor: { rgb: "FECACA" } }, font: { bold: true, color: { rgb: "991B1B" } }, border: ADMIN_BORDER }; 
const WARNING_STYLE = { fill: { fgColor: { rgb: "FEF08A" } }, font: { bold: true, color: { rgb: "92400E" } }, border: ADMIN_BORDER }; 
const SUCCESS_STYLE = { fill: { fgColor: { rgb: "BBF7D0" } }, font: { bold: true, color: { rgb: "166534" } }, border: ADMIN_BORDER };

export const applyAdminPremiumStyle = (ws) => {
  if (!ws) return; 

  Object.keys(ws).forEach(cell => {
    if (cell.startsWith('!')) return;

    const cellObj = ws[cell];
    if (!cellObj) return; 

    const rowNum = cell.replace(/[A-Z]/g, '');
    const col = cell.replace(/[0-9]/g, '');

    // 1. Estilo de Cabecera
    if (rowNum === '1') {
      cellObj.s = { ...HEADER_STYLE };
      return;
    }

    // 2. Estilos Lógicos
    let cellStyle = { ...VALUE_STYLE };
    const val = cellObj.v ? String(cellObj.v).toUpperCase() : '';

    if (val.includes('ANULADA') || val.includes('FALTANTE') || val.includes('ERROR') || val.includes('ELIMINADO')) {
      cellStyle = DANGER_STYLE;
    } else if (val.includes('SOBRANTE') || val.includes('ADVERTENCIA') || val.includes('PENDIENTE')) {
      cellStyle = WARNING_STYLE;
    } else if (val.includes('COMPLETADA') || val.includes('CUADRADO') || val.includes('ACTIVO') || val.includes('EXITOSA')) {
      cellStyle = SUCCESS_STYLE;
    }

    // Estilo para columnas de identificación (A y B)
    if (col === 'A' || col === 'B') {
      if (JSON.stringify(cellStyle) === JSON.stringify(VALUE_STYLE)) {
        cellStyle = INFO_STYLE;
      }
    }

    // 3. Aplicar estilo final respetando formatos previos (como moneda)
    cellObj.s = { ...(cellObj.s || {}), ...cellStyle };
  });
};