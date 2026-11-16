export const sanitizeSheetName = name => name.replace(/[\][*?:/\\]/g, '').trim().substring(0, 31) || 'Sede_Desconocida';
export const uniqueSheetName = (name, used = []) => {
  const base = sanitizeSheetName(name);
  let candidate = base, counter = 1;
  while (used.some(item => item.toLowerCase() === candidate.toLowerCase())) {
    const suffix = `_${counter++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  return candidate;
};

// Calendar values are already attributed to America/Lima by the report domain.
// Excel serials must not pass through the device's local timezone.
export const excelDay = day => (Date.parse(`${day}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
export const cleanExcelRows = rows => rows.map(row => Object.fromEntries(Object.entries(row)
  .filter(([key]) => !key.startsWith('_')).map(([key, value]) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Importe no finito en columna ${key}.`);
    return [key, value ?? ''];
  })));

const borders = rgb => {
  const edge = { style: 'thin', color: { rgb } };
  return { top: edge, bottom: edge, left: edge, right: edge };
};
const ink = '30243F';
const grid = borders('D4D0DD');
const headerGrid = borders('87779E');
const spacerGrid = borders('E8E5ED');
const tones = {
  header: { fill: { fgColor: { rgb: '3E2C63' } }, font: { bold: true, color: { rgb: 'FFFFFF' } } },
  info: { fill: { fgColor: { rgb: 'BDE7F5' } } },
  cash: { fill: { fgColor: { rgb: 'C7F2D6' } } },
  success: { fill: { fgColor: { rgb: 'C7F2D6' } }, font: { bold: true, color: { rgb: '166534' } } },
  digital: { fill: { fgColor: { rgb: 'E9DEF8' } } },
  mixed: { fill: { fgColor: { rgb: 'CDEBFA' } } },
  product: { fill: { fgColor: { rgb: 'FFF5C2' } } },
  warning: { fill: { fgColor: { rgb: 'FFF0BF' } }, font: { color: { rgb: '704408' } } },
  danger: { fill: { fgColor: { rgb: 'FBDADA' } }, font: { bold: true, color: { rgb: '991B1B' } } },
  muted: { fill: { fgColor: { rgb: 'F2F1F5' } }, font: { color: { rgb: '625C70' } } },
  ivory: { fill: { fgColor: { rgb: 'FCFAF6' } } },
  white: { fill: { fgColor: { rgb: 'FFFFFF' } } },
};
export const cashStateTone = state => ({
  'Pendiente de arqueo': 'warning', 'Conciliación pendiente': 'warning', 'Pendiente de revisión': 'warning',
  Sobrante: 'warning', Faltante: 'danger', Cuadrado: 'success',
  'Vencido sin arqueo': 'warning', 'Fondo registrado': 'info', 'En curso': 'info',
})[state];
export const paymentTone = value => String(value).startsWith('MIXTO') ? 'mixed'
  : String(value).startsWith('EFECTIVO') ? 'cash' : ['YAPE', 'PLIN'].includes(value) ? 'digital' : undefined;
const formats = { money: '"S/" #,##0.00;[Red]-"S/" #,##0.00', provisionalMoney: '"S/" #,##0.00;-"S/" #,##0.00',
  count: '0', date: 'dd/mm/yyyy', time: 'hh:mm', datetime: 'dd/mm/yyyy hh:mm', generated: 'dd/mm/yyyy "·" hh:mm' };
const excelValue = (value, format) => {
  if (typeof value !== 'string' || !value || !['date', 'time', 'datetime', 'generated'].includes(format)) return value;
  const [date, time = '00:00'] = format === 'time' ? ['', value] : value.split(' ');
  const [day, month, year] = date.split('/');
  const [hour, minute] = time.split(':').map(Number);
  const serial = (format === 'time' ? 0 : excelDay(`${year}-${month}-${day}`)) + (hour * 60 + minute) / 1440;
  if (!Number.isFinite(serial)) throw new Error('Fecha u hora de exportación inválida.');
  return serial;
};
const style = (tone, { bold, size = 11 } = {}) => {
  const surface = tones[tone] ?? tones.white;
  return { fill: surface.fill, border: tone === 'header' ? headerGrid : grid,
    font: { name: 'Calibri', sz: size, color: { rgb: ink }, ...surface.font,
    ...(bold ? { bold: true } : {}) } };
};
const blankStyles = Object.fromEntries(Object.keys(tones).map(tone => [tone, style(tone)]));
const spacerStyle = { ...blankStyles.white, border: spacerGrid };
const headerStyle = { ...style('header'),
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
const rowTones = { 'ticket-total': 'success', 'void-total': 'muted', 'adjustment-total': 'danger',
  'business-total': 'success', 'channel-heading': 'info', 'channel-note': 'warning' };

const sheetCell = (XLSX, sheet, r, c) => sheet[XLSX.utils.encode_cell({ r, c })] ??= { t: 's', v: '' };

function styleMergeMembers(XLSX, sheet) {
  for (const { s, e } of sheet['!merges']) {
    const { s: appearance } = sheetCell(XLSX, sheet, s.r, s.c);
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        // Excel draws the perimeter of a merged range from its member cells.
        sheetCell(XLSX, sheet, r, c).s = appearance;
      }
    }
  }
}

export function createOverviewSheet(XLSX, layout) {
  const sheet = XLSX.utils.aoa_to_sheet(layout.map(({ label = '', value = '', format }) => [label, excelValue(value, format)]));
  sheet['!cols'] = [{ wch: 46 }, { wch: 25 }];
  sheet['!rows'] = layout.map(({ height = 24 }) => ({ hpt: height }));
  sheet['!merges'] = [];
  layout.forEach(({ tone, bold, size, format, note, softNegative, height }, row) => {
    for (let col = 0; col < 2; col++) {
      const cell = sheetCell(XLSX, sheet, row, col);
      if (cell.t === 'n' && !Number.isFinite(cell.v)) throw new Error('Valor no finito en el resumen.');
      if (cell.t === 'n' && formats[format]) cell.z = formats[format];
      cell.s = height === 9 ? spacerStyle : { ...style(cell.t === 'n' && cell.v < 0 && !softNegative ? 'danger' : tone, { bold, size }),
        alignment: { vertical: 'center', horizontal: cell.t === 'n' ? 'right' : 'left', wrapText: true, indent: 1 } };
    }
    if (note) sheet['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 1 } });
  });
  styleMergeMembers(XLSX, sheet);
  return sheet;
}

// Each schema entry owns its label, width, format and meaning. Sheet positions are derived.
export function createSheet(XLSX, rows, columns = {}, { title, context, generated, note, filter = true, footer = [] } = {}) {
  const safeRows = cleanExcelRows(rows);
  const schema = safeRows.length ? columns : { Mensaje: { width: 40 } };
  const entries = Object.entries(schema);
  const main = safeRows.length ? safeRows : [{ Mensaje: 'Sin datos en este período' }];
  const data = [...main, ...cleanExcelRows(footer)], sourceRows = [...rows, ...footer];
  const intro = [title, context, generated, note].filter(Boolean).map(text => [text]);
  const header = intro.length;
  const sheet = XLSX.utils.aoa_to_sheet([...intro, entries.map(([name]) => name),
    ...data.map((row, index) => entries.map(([name, column]) => {
      const value = row[name] ?? '';
      if (value === '') return undefined;
      return excelValue(value, typeof column.format === 'function' ? column.format(sourceRows[index]) : column.format);
    }))]);
  sheet['!cols'] = entries.map(([, column]) => ({ wch: column.width ?? 24 }));
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: header + data.length, c: entries.length - 1 } });
  sheet['!rows'] = [...intro.map((_, index) => ({ hpt: index === 0 && title ? 32 : 24 })), { hpt: 32 },
    ...data.map((_, index) => ({ hpt: sourceRows[index]?._kind === 'spacer' ? 9 : sourceRows[index]?._kind === 'channel-note' ? 32 : 22 }))];
  if (filter) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: header, c: 0 }, e: { r: header + main.length, c: entries.length - 1 } }) };
  sheet['!freeze'] = { ySplit: header + 1, topLeftCell: XLSX.utils.encode_cell({ r: header + 1, c: 0 }) };
  sheet['!merges'] = intro.map((_, index) => ({ s: { r: index, c: 0 }, e: { r: index, c: entries.length - 1 } }));
  intro.forEach((_, index) => {
    sheet[XLSX.utils.encode_cell({ r: index, c: 0 })].s = index === 0 && title
      ? { ...style('header', { size: 13 }), alignment: { horizontal: 'left', vertical: 'center', indent: 1, wrapText: true } }
      : { ...style('info', { size: 10 }), alignment: { wrapText: true, vertical: 'center', indent: 1 } };
  });
  entries.forEach(([, column], col) => {
    sheet[XLSX.utils.encode_cell({ r: header, c: col })].s = headerStyle;
    data.forEach((row, index) => {
      const rowIndex = header + index + 1;
      const cell = sheetCell(XLSX, sheet, rowIndex, col);
      const source = sourceRows[index] ?? row;
      const special = rowTones[source._kind];
      const band = (source._band ?? index % 2) ? 'ivory' : 'white';
      const empty = cell.t === 's' && cell.v === '';
      if (empty) {
        cell.s = source._kind === 'spacer' ? spacerStyle : blankStyles[source._kind === 'business-total' ? special : special || !filter ? 'white' : band];
        return;
      }
      const format = typeof column.format === 'function' ? column.format(source) : column.format;
      const tone = typeof column.tone === 'function' ? column.tone(cell.v, source) : column.tone;
      const negative = cell.t === 'n' && cell.v < 0 && ['money', 'count'].includes(format) && column.colorNegative !== false;
      cell.s = { ...style(negative ? 'danger' : special ?? tone ?? band),
        alignment: { vertical: 'center', horizontal: cell.t === 'n' && ['money', 'provisionalMoney', 'count'].includes(format) ? 'right'
          : ['date', 'time', 'datetime'].includes(format) ? 'center' : 'left', wrapText: true } };
      if (cell.t === 'n' && formats[format]) cell.z = formats[format];
      if (cell.t === 's') {
        // User text stays literal even when it begins with =, +, - or @.
        delete cell.f;
        delete cell.l;
      }
      const lines = Math.min(26, String(typeof cell.v === 'string' ? cell.v : '').split('\n')
        .reduce((total, part) => total + Math.max(1, Math.ceil(part.length / Math.max(8, (column.width ?? 24) * .87))), 0));
      const height = source._kind === 'channel-note' ? 32 : Math.max(22, lines * 15 + 5);
      if (source._kind === 'channel-note') {
        sheet['!merges'].push({ s: { r: rowIndex, c: col }, e: { r: rowIndex, c: entries.length - 1 } });
      }
      sheet['!rows'][rowIndex] = { hpt: Math.max(sheet['!rows'][rowIndex]?.hpt ?? 0, height) };
    });
  });
  styleMergeMembers(XLSX, sheet);
  return sheet;
}
