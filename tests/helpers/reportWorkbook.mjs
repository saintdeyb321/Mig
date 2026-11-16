export const reportHeader = (XLSX, sheet) => sheet['!autofilter'] ? XLSX.utils.decode_range(sheet['!autofilter'].ref).s.r : 3;

export function tableRows(XLSX, workbook, name) {
  const sheet = workbook.Sheets[name];
  const [head, ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', range: reportHeader(XLSX, sheet), blankrows: false });
  const size = sheet['!autofilter'] ? XLSX.utils.decode_range(sheet['!autofilter'].ref).e.r - reportHeader(XLSX, sheet) : undefined;
  const footerStart = rows.findIndex(row => row.includes('Detalle por canal'));
  return rows.slice(0, size ?? (footerStart < 0 ? rows.length : footerStart))
    .filter(row => row.some(value => value !== ''))
    .map(row => Object.fromEntries(head.map((label, index) => [label, row[index]])));
}

export function readOverview(XLSX, workbook) {
  const sheet = workbook.Sheets.Resumen_Financiero;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  const paired = label => rows.find(row => row[0] === label)?.[1];
  const money = value => Math.round(value * 100) / 100;
  const netChannel = label => money(rows.filter(row => row[0] === label).reduce((sum, row) => sum + row[1], 0));
  const values = {
    'Total neto registrado (S/)': paired('INGRESO NETO REGISTRADO'),
    'Neto de ventas en mostrador (S/)': paired('VENTAS DE MOSTRADOR'),
    'Neto de pagos de pedidos (S/)': paired('PAGOS DE PEDIDOS'),
    'Tickets de venta válidos': paired('TICKETS COMPLETADOS'),
    'Neto en efectivo (S/)': netChannel('Efectivo'),
    'Neto por Yape/Plin (S/)': netChannel('Yape / Plin'),
    'Ventas anuladas': paired('TICKETS ANULADOS'),
    'Conciliación histórica pendiente': rows.find(row => /provisional y requiere conciliación histórica/.test(row[0]))?.[0],
  };
  const labels = ['Cobros registrados', 'Compensaciones POS', 'Reembolsos contables de pedidos', 'Neto contable'];
  for (const label of labels) for (const channel of ['Efectivo', 'Yape / Plin']) values[`${label} · ${channel}`] = 0;
  for (const name of workbook.SheetNames.filter(name => /^(Detalle|Resum)_/.test(name))) {
    const cells = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false });
    const header = cells.findIndex(row => row.includes('Detalle por canal'));
    if (header < 0) throw new Error('Falta el desglose por canal en ' + name);
    const [title, cashColumn, digitalColumn] = ['Detalle por canal', 'Efectivo', 'Yape / Plin'].map(name => cells[header].indexOf(name));
    for (const [index, label] of labels.entries()) {
      const row = cells[header + 1 + index];
      if (row[title] !== label || typeof row[cashColumn] !== 'number' || typeof row[digitalColumn] !== 'number') throw new Error('Desglose de auditoría incompleto');
      values[`${label} · Efectivo`] = money(values[`${label} · Efectivo`] + row[cashColumn]);
      values[`${label} · Yape / Plin`] = money(values[`${label} · Yape / Plin`] + row[digitalColumn]);
    }
    values['Neto negativo'] = cells.flat().find(value => /El neto de un canal puede ser negativo/.test(value));
    values['Alcance de las compensaciones POS'] = cells.flat().find(value => /son registros sin evidencia/.test(value));
  }
  values['Cobros registrados'] = money(values['Cobros registrados · Efectivo'] + values['Cobros registrados · Yape / Plin']);
  return values;
}
