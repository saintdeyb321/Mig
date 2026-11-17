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

const edge = { style: 'thin', color: { rgb: '000000' } };
const grid = { top: edge, bottom: edge, left: edge, right: edge };
const ink = '30243F';
const tones = {
  header: { fill: { fgColor: { rgb: 'FCE4D6' } }, font: { bold: true } },
  info: { fill: { fgColor: { rgb: '9DE0F6' } } },
  value: { fill: { fgColor: { rgb: 'B4C6E7' } } },
  cash: { fill: { fgColor: { rgb: 'C7F2D6' } } },
  success: { fill: { fgColor: { rgb: 'A9F08A' } }, font: { bold: true, color: { rgb: '166534' } } },
  digital: { fill: { fgColor: { rgb: 'E9DEF8' } } },
  mixed: { fill: { fgColor: { rgb: 'CDEBFA' } } },
  product: { fill: { fgColor: { rgb: 'FFFFA6' } } },
  warning: { fill: { fgColor: { rgb: 'FFF0BF' } }, font: { color: { rgb: '704408' } } },
  danger: { fill: { fgColor: { rgb: 'FBDADA' } }, font: { bold: true, color: { rgb: '991B1B' } } },
  muted: { fill: { fgColor: { rgb: 'F2F1F5' } }, font: { color: { rgb: '625C70' } } },
};
export const cashStateTone = state => ({
  'Pendiente de arqueo': 'warning', 'Conciliación pendiente': 'warning', 'Pendiente de revisión': 'warning',
  Sobrante: 'warning', Faltante: 'danger', Cuadrado: 'success',
  'Vencido sin arqueo': 'warning', 'Fondo registrado': 'info', 'En curso': 'info',
  'Vencido sin conteo': 'warning', 'Faltan datos para revisar el cierre': 'warning',
  'Sin diferencia registrada · por verificar': 'warning', 'Faltante por revisar': 'danger', 'Sobrante por revisar': 'warning',
})[state];
export const paymentTone = value => String(value).startsWith('MIXTO') ? 'mixed'
  : String(value).startsWith('EFECTIVO') ? 'cash' : ['YAPE', 'PLIN'].includes(value) ? 'digital' : undefined;
const formats = { money: '"S/" #,##0.00;[Red]-"S/" #,##0.00', provisionalMoney: '"S/" #,##0.00;-"S/" #,##0.00',
  count: '0', date: 'dd/mm/yyyy', time: 'hh:mm', timeSeconds: 'hh:mm:ss', datetime: 'dd/mm/yyyy hh:mm' };
const excelValue = (value, format) => {
  if (typeof value !== 'string' || !value || !['date', 'time', 'timeSeconds', 'datetime'].includes(format)) return value;
  const timeOnly = format === 'time' || format === 'timeSeconds';
  const [date, time = '00:00'] = timeOnly ? ['', value] : value.split(' ');
  const [day, month, year] = date.split('/');
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const serial = (timeOnly ? 0 : excelDay(`${year}-${month}-${day}`)) + (hour * 3600 + minute * 60 + second) / 86400;
  if (!Number.isFinite(serial)) throw new Error('Fecha u hora de exportación inválida.');
  return serial;
};
const style = (tone, { bold, size = 10 } = {}) => {
  const surface = tones[tone];
  return { ...(surface?.fill && { fill: surface.fill }), border: grid,
    font: { name: 'Calibri', sz: size, color: { rgb: ink }, ...surface?.font,
    ...(bold ? { bold: true } : {}) } };
};
const headerStyle = { ...style('header'),
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
const rowTones = { 'ticket-total': 'success', 'void-total': 'muted', 'adjustment-total': 'danger',
  'business-total': 'success', 'channel-heading': 'info' };

export function createOverviewSheet(XLSX, layout) {
  const sheet = XLSX.utils.aoa_to_sheet(layout.map(({ label, value, format }) => [label, excelValue(value, format)]));
  sheet['!cols'] = [{ wch: 40 }, { wch: 29 }];
  sheet['!rows'] = layout.map(({ height = 20 }) => ({ hpt: height }));
  sheet['!merges'] = [];
  layout.forEach(({ tone, bold, size, format, note, softNegative }, row) => {
    for (let col = 0; col < 2; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      if (cell.t === 'n' && !Number.isFinite(cell.v)) throw new Error('Valor no finito en el resumen.');
      if (cell.t === 'n' && formats[format]) cell.z = formats[format];
      cell.s = { ...style(cell.t === 'n' && cell.v < 0 && !softNegative ? 'danger' : tone, { bold, size }),
        alignment: { vertical: 'center', horizontal: cell.t === 'n' ? 'right' : 'left', wrapText: true, indent: 1 } };
    }
    if (note) sheet['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 1 } });
  });
  return sheet;
}

// Each schema entry owns its label, width, format and meaning. Sheet positions are derived.
export function createSheet(XLSX, rows, columns = {}, { filter = true, footer = [] } = {}) {
  const entries = Object.entries(columns);
  const sourceRows = [...rows, ...footer];
  const data = cleanExcelRows(sourceRows);
  const sheet = XLSX.utils.aoa_to_sheet([entries.map(([name]) => name),
    ...data.map((row, index) => entries.map(([name, column]) => {
      const value = row[name] ?? '';
      if (value === '') return undefined;
      return excelValue(value, typeof column.format === 'function' ? column.format(sourceRows[index]) : column.format);
    }))]);
  sheet['!cols'] = entries.map(([, column]) => ({ wch: column.width ?? 24 }));
  const range = r => XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: entries.length - 1 } });
  sheet['!ref'] = range(data.length);
  sheet['!rows'] = [{ hpt: 25 }, ...sourceRows.map(({ _kind }) => ({ hpt: _kind === 'group-spacer' ? 13 : _kind === 'spacer' ? 9 : _kind?.endsWith('-total') ? 22 : 21 }))];
  if (filter && rows.length) sheet['!autofilter'] = { ref: range(rows.length) };
  sheet['!freeze'] = { ySplit: 1, topLeftCell: 'A2' };
  entries.forEach(([name, column], col) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c: col })].s = headerStyle;
    sourceRows.forEach((source, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })];
      if (!cell) return;
      const format = typeof column.format === 'function' ? column.format(source) : column.format;
      const tone = typeof column.tone === 'function' ? column.tone(cell.v, source) : column.tone;
      const negative = cell.t === 'n' && cell.v < 0 && ['money', 'count'].includes(format) && column.colorNegative !== false;
      cell.s = { ...style(negative ? 'danger' : rowTones[source._kind] ?? tone, { bold: source._groupStart && name === 'Sucursal' }),
        alignment: { vertical: 'center', horizontal: cell.t === 'n' && ['money', 'provisionalMoney', 'count'].includes(format) ? 'right'
          : ['date', 'time', 'timeSeconds', 'datetime'].includes(format) ? 'center' : 'left', wrapText: true } };
      if (cell.t === 'n' && formats[format]) cell.z = formats[format];
      if (cell.t === 's') {
        // User text stays literal even when it begins with =, +, - or @.
        delete cell.f;
        delete cell.l;
      }
    });
  });
  return sheet;
}
