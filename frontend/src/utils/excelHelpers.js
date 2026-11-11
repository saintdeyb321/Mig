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

const border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, { style: 'thin', color: { rgb: 'DBD9E4' } }]));
const tones = {
  info: { fill: { fgColor: { rgb: 'EDF2FF' } } },
  product: { fill: { fgColor: { rgb: 'FFF8E8' } } },
  cash: { fill: { fgColor: { rgb: 'E5F5ED' } } },
  digital: { fill: { fgColor: { rgb: 'F0EAFA' } } },
  mixed: { fill: { fgColor: { rgb: 'E5F0FC' } } },
  success: { fill: { fgColor: { rgb: 'E5F5ED' } }, font: { bold: true, color: { rgb: '166534' } } },
  warning: { fill: { fgColor: { rgb: 'FFF4D6' } }, font: { color: { rgb: '92400E' } } },
  danger: { fill: { fgColor: { rgb: 'FDE8E8' } }, font: { bold: true, color: { rgb: '991B1B' } } },
  muted: { fill: { fgColor: { rgb: 'F2F1F5' } }, font: { color: { rgb: '625C70' } } },
};
export const cashStateTone = state => ({
  'Pendiente de arqueo': 'warning', 'Conciliación pendiente': 'warning', 'Pendiente de revisión': 'warning',
  'Sobrante registrado': 'warning', 'Faltante registrado': 'danger', Coincide: 'success',
})[state];
export const paymentTone = value => String(value).startsWith('MIXTO') ? 'mixed'
  : String(value).startsWith('EFECTIVO') ? 'cash' : ['YAPE', 'PLIN'].includes(value) ? 'digital' : undefined;
const formats = { money: '"S/" #,##0.00;[Red]-"S/" #,##0.00', count: '0', date: 'dd/mm/yyyy', time: 'hh:mm', datetime: 'dd/mm/yyyy hh:mm' };
const excelValue = (value, format) => {
  if (typeof value !== 'string' || !value || !['date', 'time', 'datetime'].includes(format)) return value;
  const [date, time = '00:00'] = format === 'time' ? ['', value] : value.split(' ');
  const [day, month, year] = date.split('/');
  const [hour, minute] = time.split(':').map(Number);
  const serial = (format === 'time' ? 0 : excelDay(`${year}-${month}-${day}`)) + (hour * 60 + minute) / 1440;
  if (!Number.isFinite(serial)) throw new Error('Fecha u hora de exportación inválida.');
  return serial;
};
const headerStyle = { fill: { fgColor: { rgb: '3E2C63' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };

// Each schema entry owns its label, width, format and meaning. Sheet positions are derived.
export function createSheet(XLSX, rows, columns = {}, { title, note } = {}) {
  const safeRows = cleanExcelRows(rows);
  const schema = safeRows.length ? columns : { Mensaje: { width: 40 } };
  const entries = Object.entries(schema);
  const data = safeRows.length ? safeRows : [{ Mensaje: 'Sin datos en este período' }];
  const intro = [...(title ? [[title]] : []), ...(note ? [[note]] : [])];
  const header = intro.length;
  const sheet = XLSX.utils.aoa_to_sheet([...intro, entries.map(([name]) => name),
    ...data.map((row, index) => entries.map(([name, column]) => excelValue(row[name] ?? '',
      typeof column.format === 'function' ? column.format(rows[index]) : column.format)))]);
  sheet['!cols'] = entries.map(([, column]) => ({ wch: column.width ?? 24 }));
  sheet['!rows'] = intro.map((_, index) => ({ hpt: index === 0 && title ? 26 : 30 }));
  sheet['!rows'][header] = { hpt: 34 };
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: header, c: 0 }, e: { r: header + data.length, c: entries.length - 1 } }) };
  sheet['!freeze'] = { ySplit: header + 1, topLeftCell: XLSX.utils.encode_cell({ r: header + 1, c: 0 }) };
  sheet['!merges'] = intro.map((_, index) => ({ s: { r: index, c: 0 }, e: { r: index, c: entries.length - 1 } }));
  intro.forEach((_, index) => {
    sheet[XLSX.utils.encode_cell({ r: index, c: 0 })].s = index === 0 && title
      ? { ...headerStyle, alignment: { horizontal: 'left', vertical: 'center' } }
      : { ...tones.info, font: { sz: 10, color: { rgb: '46405A' } }, alignment: { wrapText: true, vertical: 'center' } };
  });
  entries.forEach(([, column], col) => {
    sheet[XLSX.utils.encode_cell({ r: header, c: col })].s = headerStyle;
    data.forEach((row, index) => {
      const address = XLSX.utils.encode_cell({ r: header + index + 1, c: col });
      const cell = sheet[address];
      const format = typeof column.format === 'function' ? column.format(rows[index]) : column.format;
      const tone = typeof column.tone === 'function' ? column.tone(cell.v, rows[index] ?? row) : column.tone;
      const negative = cell.t === 'n' && cell.v < 0 && ['money', 'count'].includes(format);
      cell.s = { border, ...tones[negative ? 'danger' : tone],
        alignment: { vertical: 'center', horizontal: cell.t === 'n' ? 'right' : 'left', wrapText: true } };
      if (cell.t === 'n' && formats[format]) cell.z = formats[format];
      if (cell.t === 's') {
        // User text stays literal even when it begins with =, +, - or @.
        delete cell.f;
        delete cell.l;
      }
      const lines = Math.min(6, Math.max(1, Math.ceil(String(cell.v).length / Math.max(8, (column.width ?? 24) - 2))));
      const height = Math.max(24, lines * 15, rows[index]?._noteHeight ?? 0);
      const rowIndex = header + index + 1;
      sheet['!rows'][rowIndex] = { hpt: Math.max(sheet['!rows'][rowIndex]?.hpt ?? 0, height) };
    });
  });
  return sheet;
}
