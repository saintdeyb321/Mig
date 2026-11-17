import assert from 'node:assert/strict';

export const reportHeader = (XLSX, sheet) => XLSX.utils.decode_range(sheet['!ref']).s.r;

export function assertWorkbookBorders(XLSX, workbook, bytes) {
  const archive = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const xml = path => Buffer.from(XLSX.CFB.find(archive, path).content).toString('utf8');
  const styles = xml('/xl/styles.xml');
  const borders = [...styles.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)[1].matchAll(/<border\b[^>]*>([\s\S]*?)<\/border>/g)].map(match => match[1]);
  const formats = [...styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*\bborderId="(\d+)"/g)]
    .map(([, id]) => borders[Number(id)]);
  const black = formats.map(border => ['top', 'bottom', 'left', 'right'].every(side =>
    new RegExp(`<${side} style="thin"><color rgb="(?:FF)?000000"\\s*\\/></${side}>`, 'i').test(border)));
  for (const [index, name] of workbook.SheetNames.entries()) {
    const sheetXml = xml(`/xl/worksheets/sheet${index + 1}.xml`);
    const cells = new Map([...sheetXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>/g)]
      .map(([tag, address]) => [address, Number(tag.match(/\bs="(\d+)"/)?.[1])]));
    const sheet = workbook.Sheets[name];
    const populated = Object.entries(sheet).filter(([address, cell]) => /^[A-Z]+\d+$/.test(address) && cell.v != null && cell.v !== '');
    assert.equal(cells.size, populated.length, `${name} has no materialized blank cells`);
    for (const [address, cell] of populated) {
      assert.ok(black[cells.get(address)], `${name}!${address} must have four thin black borders`);
      assert.doesNotMatch(String(cell.v), /^Generado:/);
    }
    assert.match(sheetXml, /<sheetView\b[^>]*showGridLines="1"/);
    if (name !== 'Resumen_Financiero') {
      assert.match(sheetXml, /<pane ySplit="1" topLeftCell="A2"[^>]*state="frozen"/);
      assert.doesNotMatch(sheetXml, /<mergeCells\b/);
      assert.equal(sheet['!rows'][0].hpt, 25);
      for (const row of sheet['!rows'].slice(1)) assert.ok([9, 13, 21, 22].includes(row?.hpt), `${name}: ${row?.hpt}pt`);
    }
  }
}

export function tableRows(XLSX, workbook, name) {
  const sheet = workbook.Sheets[name];
  const [head, ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', range: reportHeader(XLSX, sheet), blankrows: false });
  const size = sheet['!autofilter'] ? XLSX.utils.decode_range(sheet['!autofilter'].ref).e.r - reportHeader(XLSX, sheet) : undefined;
  const footerStart = rows.findIndex(row => row.includes('Detalle por canal') || row.includes('Resumen POS de la sede'));
  return rows.slice(0, size ?? (footerStart < 0 ? rows.length : footerStart))
    .filter(row => row.some(value => value !== ''))
    .map(row => Object.fromEntries(head.map((label, index) => [label, row[index]])));
}

export function readPosFooter(XLSX, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (rows.length === 1) return null;
  const index = rows.findIndex(row => row.includes('Resumen POS de la sede'));
  assert.ok(index > 0, 'Missing POS-only footer');
  const headings = rows[index], net = rows[index + 1];
  assert.equal(net[headings.indexOf('Resumen POS de la sede')], 'Neto POS');
  const amounts = ['Efectivo', 'Yape / Plin', 'Total POS'].map(label => net[headings.indexOf(label)]);
  assert.ok(amounts.every(Number.isFinite));
  assert.equal(rows.length, index + 2);
  return amounts;
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
    'Neto negativo': rows.find(row => /El neto de un canal puede ser negativo/.test(row[0]))?.[0],
    'Alcance de las compensaciones POS': rows.find(row => /son registros sin evidencia/.test(row[0]))?.[0],
  };
  const labels = ['Cobros registrados', 'Compensaciones POS', 'Reembolsos contables de pedidos', 'Neto contable'];
  for (const label of labels) for (const channel of ['Efectivo', 'Yape / Plin']) values[`${label} · ${channel}`] = 0;
  const add = (label, cash, digital) => {
    values[`${label} · Efectivo`] = money(values[`${label} · Efectivo`] + cash);
    values[`${label} · Yape / Plin`] = money(values[`${label} · Yape / Plin`] + digital);
  };
  const movements = (name, column, adjustment, label) => {
    const net = [0, 0];
    for (const row of tableRows(XLSX, workbook, name)) {
      const total = row[column];
      if (total === '' || total === 0) continue;
      assert.ok(Number.isFinite(total));
      const method = row['Medio de pago'];
      const split = method.match(/Efectivo (?:S\/ )?(-?[\d.]+) · Yape\/Plin (?:S\/ )?(-?[\d.]+)/);
      assert.ok(split || ['EFECTIVO', 'YAPE', 'PLIN'].includes(method), `Invalid exported payment: ${method}`);
      const [cash, digital] = split ? split.slice(1).map(Number) : method === 'EFECTIVO' ? [total, 0] : [0, total];
      assert.equal(money(cash + digital), total);
      net[0] = money(net[0] + cash);
      net[1] = money(net[1] + digital);
      add(row.Movimiento === adjustment ? label : labels[0], cash, digital);
    }
    add(labels[3], ...net);
    return [...net, money(net[0] + net[1])];
  };
  const summaries = workbook.SheetNames.filter(name => name.startsWith('Resum_'));
  for (const name of summaries) {
    const cells = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false });
    const header = cells.findIndex(row => row.includes('Detalle por canal'));
    if (cells.length === 1) continue; // Branch without movements: only the table header.
    if (header < 0) throw new Error('Falta el desglose por canal en ' + name);
    const [title, cashColumn, digitalColumn] = ['Detalle por canal', 'Efectivo', 'Yape / Plin'].map(name => cells[header].indexOf(name));
    for (const [index, label] of labels.entries()) {
      const row = cells[header + 1 + index];
      if (row[title] !== label || typeof row[cashColumn] !== 'number' || typeof row[digitalColumn] !== 'number') throw new Error('Desglose de auditoría incompleto');
      add(label, row[cashColumn], row[digitalColumn]);
    }
  }
  if (!summaries.length) {
    for (const name of workbook.SheetNames.filter(name => name.startsWith('Detalle_'))) {
      const net = movements(name, 'Importe neto movimiento (S/)', 'COMPENSACIÓN POS', labels[1]);
      const footer = readPosFooter(XLSX, workbook.Sheets[name]);
      assert.deepEqual(net, footer ?? [0, 0, 0]);
    }
    if (workbook.Sheets.Auditoría_Pedidos) movements('Auditoría_Pedidos', 'Neto Movimiento (S/)', 'REEMBOLSO CONTABLE PEDIDO', labels[2]);
  }
  values['Cobros registrados'] = money(values['Cobros registrados · Efectivo'] + values['Cobros registrados · Yape / Plin']);
  return values;
}
