import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runExcelFixture } from './helpers/excelExportHarness.mjs';
import { assertWorkbookBorders, readOverview, reportHeader, tableRows } from './helpers/reportWorkbook.mjs';
import { collections, keyOf, mergeProducts, rankProducts, total } from '../functions/src/reports/summaryModel.js';
import { hash, normalizeContribution } from '../functions/src/reports/contributions.js';
import { monthWindow, projectionFromRecords } from '../functions/src/reports/consolidation.js';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const artifacts = fileURLToPath(new URL('../.release/qa-p29/', import.meta.url));
const card = '.export-toolbar';
const primary = card + ' button[type="submit"]';
const retry = card + ' [role="alert"] button';
const downloadNames = async directory => (await readdir(directory).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
})).filter(file => file.endsWith('.xlsx')).sort();

async function until(check, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  assert.fail(label);
}
const evaluate = page => async (fn, ...args) => {
  const response = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true }, 15000);
  assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
  return response.result.value;
};
const click = page => async selector => {
  const ev = evaluate(page);
  const bounds = await ev(selector => {
    const element = document.querySelector(selector);
    element.scrollIntoView({ block: 'nearest' });
    const { left, top, width, height } = element.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
  }, selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, ...bounds, button: 'left', clickCount: 1 });
  }
};
const select = (ev, index = 0) => value => ev((value, index) => {
  const control = document.querySelectorAll('.export-toolbar select')[index];
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}, value, index);
const alert = ev => title => until(() => ev(title => document.querySelector('.export-toolbar [role="alert"]')?.textContent.includes(title), title), title);
async function reload(page, ev, options) {
  const previous = await ev(() => window.__excelFixture.bootId);
  await page.send('Page.reload', options);
  await until(() => ev(previous => window.__excelFixture?.bootId && window.__excelFixture.bootId !== previous
    && !!document.querySelector('.export-toolbar'), previous).catch(() => false), 'The new fixture is mounted after reload');
}
const offline = (page, offline) => page.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

async function workbook(downloads, previous, { net, cash, digital, label, artifact, detailed = true, empty = false, branches = ['Centro', 'Taller'], orders = true, cashAudit = true, cancelledOrders }) {
  const filename = await until(async () => (await downloadNames(downloads)).find(name => !previous.includes(name)), `Missing download ${label}`);
  assert.match(filename, new RegExp(`^Reporte_${label}_\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
  const bytes = await readFile(join(downloads, filename));
  assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  const book = XLSX.read(bytes, { type: 'buffer', cellNF: true, cellStyles: true });
  assertWorkbookBorders(XLSX, book, bytes);
  const summary = readOverview(XLSX, book);
  const cover = book.Sheets.Resumen_Financiero;
  assert.equal(cover.A1.v, 'RESUMEN DEL NEGOCIO');
  assert.equal(cover.A1.s.fgColor.rgb, 'FCE4D6');
  assert.ok(book.Props.CreatedDate instanceof Date);
  assert.match(book.Props.Subject, /\d{2}\/\d{2}\/\d{4}/);
  const netRow = Object.keys(cover).find(key => cover[key]?.v === 'INGRESO NETO REGISTRADO').slice(1);
  assert.equal(cover['B' + netRow].s.fgColor.rgb, net < 0 ? 'FBDADA' : 'A9F08A');
  if (cancelledOrders !== undefined) {
    const voidsRow = Number(Object.keys(cover).find(key => cover[key]?.v === 'TICKETS ANULADOS').slice(1));
    const ordersRow = voidsRow + 1;
    assert.equal(cover['A' + ordersRow].v, 'PEDIDOS ANULADOS');
    assert.equal(cover['B' + ordersRow].t, 'n');
    assert.equal(cover['B' + ordersRow].v, cancelledOrders);
    assert.equal(cover['B' + ordersRow].s.fgColor.rgb, 'FBDADA');
  }
  assert.match(cover['B' + netRow].z, /S\//);
  assert.equal(summary['Total neto registrado (S/)'], net);
  assert.equal(summary['Neto en efectivo (S/)'], cash);
  assert.equal(summary['Neto por Yape/Plin (S/)'], digital);
  if (empty) assert.deepEqual(book.SheetNames, ['Resumen_Financiero', 'Comparativa_Sedes',
    ...branches.map(branch => (detailed ? 'Detalle_' : 'Resum_') + branch)]);
  else {
    assert.ok(book.SheetNames.includes('Productos_Global'));
    assert.equal(book.SheetNames.includes('Auditoría_Pedidos'), orders);
    assert.equal(book.SheetNames.includes('Productos_por_Ticket'), false, 'The grouped details contain the complete item projection');
    assert.ok(book.SheetNames.includes('Comparativa_Sedes'));
    assert.equal(book.SheetNames.includes('Productos_Sedes'), branches.length > 1);
    assert.equal(book.SheetNames.includes('Auditoría_Cajas'), cashAudit);
    const column = detailed ? 'Importe neto movimiento (S/)' : 'Ingreso neto (S/)';
    const sheetNames = branches.map(branch => (detailed ? 'Detalle_' : 'Resum_') + branch);
    const movementSheets = sheetNames.map(name => book.Sheets[name]);
    assert.ok(movementSheets.every(Boolean));
    const headerOf = sheet => reportHeader(XLSX, sheet);
    const movements = name => tableRows(XLSX, book, name);
    const totalCents = rows => rows.reduce((sum, row) => sum + Math.round((row[column] || 0) * 100), 0);
    const orderRows = detailed && book.Sheets.Auditoría_Pedidos ? movements('Auditoría_Pedidos') : [];
    const orderCents = orderRows.reduce((sum, row) => sum + Math.round(row['Neto Movimiento (S/)'] * 100), 0);
    assert.equal(totalCents(sheetNames.flatMap(movements)) + orderCents, Math.round(net * 100));
    if (detailed) assert.ok(sheetNames.flatMap(movements).every(row => !row.Movimiento.includes('PEDIDO')));
    if (branches.length > 1) {
      const compared = tableRows(XLSX, book, 'Comparativa_Sedes');
      for (const [index, branch] of branches.entries()) {
        const row = compared.find(row => row.Sede === branch);
        assert.equal(totalCents(movements(sheetNames[index])), Math.round(row[detailed ? 'Ventas mostrador (S/)' : 'Ingreso neto (S/)'] * 100));
        if (detailed) assert.equal(orderRows.filter(entry => entry['Sede Movimiento'] === branch)
          .reduce((sum, entry) => sum + Math.round(entry['Neto Movimiento (S/)'] * 100), 0), Math.round(row['Pagos de pedidos (S/)'] * 100));
      }
    }
    if (detailed) for (const sheet of movementSheets) {
      assert.equal(sheet.A1.v, 'Fecha');
      const header = headerOf(sheet), labels = XLSX.utils.sheet_to_json(sheet, { header: 1, range: header })[0];
      const cell = name => sheet[XLSX.utils.encode_cell({ r: header + 1, c: labels.indexOf(name) })];
      assert.ok(!labels.includes('Sucursal'));
      assert.equal(labels.length, 13);
      if (cell('Fecha')) {
        assert.equal(cell('Fecha').t, 'n');
        const firstDay = book.Props.Subject.split(' · ').at(-1).split(' – ')[0];
        assert.equal(cell('Fecha').w, firstDay);
        assert.equal(cell(column).t, 'n');
        assert.match(cell(column).z, /S\//);
      }
      assert.ok(['Producto', 'Cantidad', 'Precio unitario', 'Subtotal (S/)'].every(name => labels.includes(name)));
      assert.ok(movements(book.SheetNames.find(name => book.Sheets[name] === sheet))
        .every(row => row.Fecha ? typeof row[column] === 'number' : row[column] === ''));
      const number = book.SheetNames.findIndex(name => book.Sheets[name] === sheet) + 1;
      const file = XLSX.CFB.find(XLSX.CFB.read(bytes, { type: 'buffer' }), `/xl/worksheets/sheet${number}.xml`);
      const xml = Buffer.from(file.content).toString('utf8');
      assert.match(xml, new RegExp(`<pane ySplit="${header + 1}" topLeftCell="A${header + 2}"[^>]+state="frozen"`));
      assert.doesNotMatch(xml, /<autoFilter\b/);
      assert.equal(sheet['!autofilter'], undefined);
    }
    const cells = Object.values(book.Sheets.Productos_Global);
    assert.ok(cells.some(cell => cell.t === 's' && cell.v.includes('=1+1')));
    assert.ok(Object.values(book.Sheets).flatMap(sheet => Object.values(sheet)).every(cell => cell?.f == null && cell?.l == null));
    assert.ok(Object.values(book.Sheets).flatMap(sheet => Object.values(sheet)).every(cell =>
      typeof cell?.v !== 'string' || !/RMux1Jm3vl7pofbT54G6YXkT2lP7|RLui5Jm3wl7pofbT54G6YXkT2lP7|QvY2SOyq7BnP9aU7cmeGPxaH2uP3|fe5ef63c-b034-4bdf-9e16-1492bb6c5258|ID Movimiento|Documento Pedido|UID:/i.test(cell.v)));
    if (orders) assert.equal(tableRows(XLSX, book, 'Auditoría_Pedidos')[0]['N.º de pedido'], 'PED-2026-0034');
    const manualClose = cashAudit && tableRows(XLSX, book, 'Auditoría_Cajas').find(row => row.Turno === 'CIERRE MANUAL');
    if (manualClose) assert.equal(manualClose['Registrado por'], 'Empleado no identificado');
  }
  assert.deepEqual(await downloadNames(downloads), [...previous, filename].sort());
  if (artifact) await copyFile(join(downloads, filename), join(artifacts, artifact + '-' + filename));
  console.log(JSON.stringify({ filename, sheets: book.SheetNames, net, cash, digital }));
  return [...previous, filename].sort();
}

async function ux(page) {
  const ev = evaluate(page);
  const measurements = [];
  for (const [width, height] of [[1440,900],[1024,768],[768,900],[640,700],[390,844],[320,560]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, 15000);
    const metrics = await ev(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const section = document.querySelector('.export-toolbar'), [control, format] = section.querySelectorAll('select'), button = section.querySelector('button');
      const b = element => element.getBoundingClientRect().toJSON();
      return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, section: b(section), select: b(control), format: b(format), button: b(button),
        actions: section.querySelectorAll('form button').length, form: b(section.querySelector('form')),
        description: b(section.querySelector('header p')).height, border: getComputedStyle(section).borderLeftWidth,
        title: document.getElementById(section.getAttribute('aria-labelledby')).textContent };
    });
    assert.equal(metrics.viewport, width);
    assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics));
    assert.equal(metrics.title, 'Informes del negocio');
    assert.equal(metrics.border, '4px');
    assert.equal(metrics.actions, 1);
    assert.ok(metrics.description > 0 && metrics.select.height >= 44 && metrics.format.height >= 44 && metrics.button.height >= 44);
    assert.ok(metrics.button.top >= metrics.format.bottom);
    assert.ok(Math.abs((metrics.button.left + metrics.button.right - metrics.form.left - metrics.form.right) / 2) <= 1);
    if (width < 640) assert.ok(Math.abs(metrics.form.width - metrics.button.width) <= 1);
    measurements.push(metrics);
    if ([1440,320].includes(width)) {
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' }, 15000);
      await writeFile(join(artifacts, `tarjeta-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await ev(() => document.querySelector('.export-toolbar select').focus());
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await ev(() => document.activeElement.matches('.export-toolbar select:nth-of-type(1)')
    && document.activeElement === document.querySelectorAll('.export-toolbar select')[1]));
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await ev(() => document.activeElement.matches('.export-toolbar button[type="submit"]')));
  const ax = await page.send('Accessibility.getFullAXTree', {}, 15000);
  assert.ok(ax.nodes.some(node => node.role?.value === 'combobox' && node.name?.value === 'Período'));
  assert.ok(ax.nodes.some(node => node.role?.value === 'combobox' && node.name?.value === 'Formato'));
  assert.ok(ax.nodes.some(node => node.role?.value === 'button' && node.name?.value === 'Ver resumen PDF'));
  await writeFile(resolve(artifacts, 'tarjeta-metricas.json'), JSON.stringify(measurements, null, 2));
}

it('downloads actual XLSX from Vite dev, recovers an obsolete optimizer URL and blocks incomplete or stale exports', { timeout: 180000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ fault: 'stale', force: true, async inspectPage(page, { responses, network, downloads }) {
    const ev = evaluate(page), press = click(page), error = alert(ev);
    await ux(page);
    for (const period of ['semana', 'mes', 'todo', 'hoy']) await select(ev)(period);
    await select(ev, 1)('excel');
    await select(ev, 1)('pdf');
    await ev(() => { const details = document.querySelector('.export-toolbar details'); details.open = true; details.open = false; });
    await select(ev, 1)('excel');
    assert.deepEqual(responses, []);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    await ev(() => {
      const revoke = URL.revokeObjectURL;
      const create = URL.createObjectURL;
      window.__excelFixture.revoked = 0;
      URL.revokeObjectURL = url => { window.__excelFixture.revoked++; revoke(url); };
      URL.createObjectURL = blob => { (window.__excelFixture.blobs ??= []).push(blob); return create(blob); };
    });
    await press(primary);
    await error('No se pudo preparar Excel');
    assert.equal(responses[0].status, 504);
    assert.match(responses[0].served, /v=00000000/);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    await until(() => ev(() => document.activeElement.textContent === 'Descargar Excel'), 'Primary retry receives focus');
    assert.deepEqual(await downloadNames(downloads), []);
    await press(retry);
    let names = await workbook(downloads, [], { net: 85, cash: 28, digital: 57, label: 'Diario_Detallado', artifact: 'dev' });
    assert.equal(responses[1].status, 200);
    assert.match(responses[1].mime, /javascript/);
    assert.ok(await ev(() => document.querySelector('.export-toolbar [role="status"]').textContent.includes('Se solicitó la descarga')));
    await until(() => ev(() => window.__excelFixture.revoked === 1 && !document.querySelector('a[download]')), 'Blob URL and temporary link are cleaned up');
    const reads = await ev(() => window.__excelFixture.reads);
    await ev(() => { HTMLAnchorElement.prototype.click = () => {}; });
    await press(primary);
    await until(() => ev(() => window.__excelFixture.blobs?.length === 2), 'A second click can request the same Excel immediately');
    assert.ok(await ev(() => window.__excelFixture.blobs[0] === window.__excelFixture.blobs[1]), 'The ready XLSX Blob is reused');
    assert.equal(await ev(() => window.__excelFixture.reads), reads);
    assert.deepEqual(await downloadNames(downloads), names);
    await reload(page, ev, { ignoreCache: true });
    await select(ev, 1)('excel');
    await ev(() => { window.__excelFixture.compensated = true; });
    await select(ev)('semana');
    await press(primary);
    names = await workbook(downloads, names, { net: 55, cash: 28, digital: 27, label: 'Semanal_Detallado', artifact: 'dev' });
    await reload(page, ev, { ignoreCache: true });
    await select(ev, 1)('excel');
    for (const [fault, message] of [['permission','Lectura de movimientos denegada'], ['index','La consulta requiere preparación'],
      ['integrity','Hay movimientos de este período que requieren revisión'], ['limit','El período supera el límite']]) {
      await ev(fault => { window.__excelFixture.resetReads(); window.__excelFixture.fault = fault; }, fault);
      await press(primary);
      await error(message);
      assert.deepEqual(await downloadNames(downloads), names);
    }
    await select(ev)('semana');
    await until(() => ev(() => !document.querySelector('.export-toolbar [role="alert"]')), 'Period change clears old errors');
    await ev(() => {
      window.__excelFixture.fault = '';
      window.__excelFixture.makeBlob = URL.createObjectURL;
      URL.createObjectURL = () => { throw Error('Descarga bloqueada en la fixture'); };
    });
    await press(primary);
    await error('No se pudo iniciar la descarga');
    assert.deepEqual(await downloadNames(downloads), names);
    await ev(() => { URL.createObjectURL = window.__excelFixture.makeBlob; });
    const previousWeekly = names.find(name => name.startsWith('Reporte_Semanal_'));
    await rename(join(downloads, previousWeekly), join(downloads, `anterior_${previousWeekly}`));
    names = await downloadNames(downloads);
    await select(ev)('semana');
    await ev(() => {
      const fixture = window.__excelFixture;
      fixture.resetReads();
      fixture.fault = 'hold';
      fixture.pending = [];
      fixture.setTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, ms, ...args) => fixture.setTimeout(callback, ms === 90000 ? 250 : ms, ...args);
    });
    await press(primary);
    await error('No se pudo completar la consulta');
    assert.match(await ev(() => document.querySelector('.export-toolbar [role="alert"]').textContent), /Etapa data-read · report-timeout/);
    assert.deepEqual(await downloadNames(downloads), names);
    await ev(() => {
      const fixture = window.__excelFixture;
      window.setTimeout = fixture.setTimeout;
      fixture.fault = '';
    });
    const held = await ev(() => window.__excelFixture.pending.length);
    assert.equal(held, 4);
    await press(retry);
    await until(() => ev(selector => document.querySelector(selector).disabled, primary), 'The retry is waiting on the data');
    assert.equal(await ev(() => window.__excelFixture.pending.length), held);
    await ev(() => {
      const fixture = window.__excelFixture;
      fixture.pending.forEach(resolve => resolve());
    });
    names = await workbook(downloads, names, { net: 85, cash: 28, digital: 57, label: 'Semanal_Detallado', artifact: 'reintento' });
    await select(ev)('hoy');
    for (const update of [{ identityKey: 'other' }, { businessId: 'another-tenant' }, { mounted: false }]) {
      await ev(() => { window.__excelFixture.resetReads(); window.__excelFixture.fault = 'hold'; window.__excelFixture.pending = []; });
      await press(primary);
      await until(() => ev(() => window.__excelFixture.pending?.length === 4), 'The daily report starts its four bounded parallel readers');
      await press(primary);
      assert.equal(await ev(() => window.__excelFixture.pending.length), 4, 'A second click during the read cannot start another export');
      await ev(update => window.__excelFixture.setScope(update), update);
      await until(() => ev(() => !document.querySelector('.export-toolbar button[type="submit"]')?.disabled), 'Scope changed before resolving reads');
      await ev(() => window.__excelFixture.pending.forEach(resolve => resolve()));
      await delay(150);
      assert.equal(await ev(() => window.__excelFixture.pending.length), 4, 'An abandoned scope cannot start more reads');
      assert.deepEqual(await downloadNames(downloads), names);
      assert.ok(await ev(() => !document.querySelector('.export-toolbar [role="status"]')?.textContent));
    }
    console.log(JSON.stringify({ devRequests: responses, network }));
  } });
});

it('downloads from Vite preview, keeps Excel out of precache and retries an unavailable production chunk', { timeout: 180000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ mode: 'preview', async inspectPage(page, { responses, network, downloads, failNext }) {
    const ev = evaluate(page), press = click(page), error = alert(ev);
    await until(() => ev(async () => {
      if (window.__excelFixture.pwaError) throw new Error(window.__excelFixture.pwaError);
      const worker = (await navigator.serviceWorker.getRegistration())?.active;
      return worker?.state === 'activated' && new URL(worker.scriptURL).pathname === '/sw.js';
    }), 'Generated PWA registration activates');
    if (!await ev(() => Boolean(navigator.serviceWorker.controller))) {
      await reload(page, ev);
    }
    await until(() => ev(() => Boolean(navigator.serviceWorker.controller)), 'Preview is controlled by the generated PWA');
    await select(ev, 1)('excel');
    assert.deepEqual(responses, []);
    assert.ok(await ev(async () => !(await caches.keys()).includes('migapos-excel-v1')));
    await offline(page, true);
    failNext('unavailable');
    await press(primary);
    await error('No se pudo preparar Excel');
    assert.ok(await ev(() => document.querySelector('.export-toolbar [role="alert"]').textContent.includes('Sin conexión')));
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    assert.deepEqual(await downloadNames(downloads), []);
    await offline(page, false);
    failNext('unavailable');
    await press(retry);
    await until(() => responses.some(row => row.status === 503), 'Preview retry reaches the server during a transient 503');
    await error('No se pudo preparar Excel');
    assert.deepEqual(await downloadNames(downloads), []);
    await ev(() => { window.__excelFixture.compensated = true; });
    await select(ev)('semana');
    await press(primary);
    let names = await workbook(downloads, [], { net: 55, cash: 28, digital: 27, label: 'Semanal_Detallado', artifact: 'preview' });
    assert.ok(responses.some(row => row.status === 200 && /javascript/.test(row.mime)));
    await until(() => ev(async () => (await caches.keys()).includes('migapos-excel-v1')),
      'Excel runtime cache is filled after the click: ' + JSON.stringify(network));
    const afterExcel = await ev(() => window.__excelFixture.reads);
    await select(ev, 1)('pdf');
    await press(primary);
    await previewReady(ev);
    await verifyPrintWithoutEvent(ev, false);
    await closePreview(ev);
    assert.equal(await ev(() => window.__excelFixture.reads), afterExcel, 'The PWA prints from the prepared snapshot');
    await offline(page, true);
    await reload(page, ev);
    await select(ev, 1)('excel');
    const requestCount = responses.length;
    const networkCount = network.length;
    await ev(() => { window.__excelFixture.empty = true; });
    await select(ev)('hoy');
    await press(primary);
    await error('No se pudieron consultar los movimientos');
    assert.deepEqual(await downloadNames(downloads), names);
    assert.equal(responses.length, requestCount, 'Cached Excel must not hit preview while offline');
    assert.ok(network.slice(networkCount).some(row => row.status === 200 && row.fromServiceWorker), 'Offline Excel comes from the active Workbox service worker');
    await offline(page, false);
    await press(retry);
    names = await workbook(downloads, names, { net: 0, cash: 0, digital: 0, label: 'Diario_Detallado', artifact: 'preview', empty: true });
    console.log(JSON.stringify({ previewRequests: responses, network, files: names.length }));
  } });
});

const frameSelector = 'iframe[title="Vista previa del informe gerencial"]';
const previewReady = ev => until(() => ev(frameSelector => {
  const frame = document.querySelector(frameSelector);
  const button = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.includes('Imprimir / Guardar como PDF'));
  return frame && button && !button.disabled && { sandbox: frame.getAttribute('sandbox'), html: frame.srcdoc };
}, frameSelector), 'PDF preview is shown and print is ready');
const closePreview = ev => ev(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Cerrar vista previa').click());

function summaryDocumentsFixture(now) {
  const businessId = 'qa-excel', branchId = 'centro', date = new Date(now - 1000);
  const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(date);
  const receipts = [['cash', 20, 'efectivo'], ['digital', 30, 'yape'], ['mixed', 20, 'mixto']].map(([id, amount, payment]) => ({
    id, businessId, branchId, createdAt: date, total: amount, payment,
    ...(payment === 'mixto' ? { splitPayments: { efectivo: 8, yape: 12 } } : {}),
    items: [{ id: 'product-' + id, name: '=1+1', qty: 1, price: amount }],
  }));
  receipts.push({ id: 'workshop', businessId, branchId: 'taller', createdAt: date, total: 11.05, payment: 'efectivo',
    items: [{ id: 'workshop-product', name: 'Pan de taller', qty: 1, price: 11.05 }] });
  const sources = [
    ...receipts.map(row => ['sales', row]),
    ['payments', { id: 'advance', businessId, branchId, sourceId: 'order', type: 'advance', amount: 15, method: 'yape', occurredAt: date }],
    ['pos_voids', { id: 'digital', saleId: 'digital', businessId, branchId, authority: 'pos-compensation', occurredAt: date,
      amount: -30, cashAmount: 0, digitalAmount: -30, items: receipts[1].items }],
    ['cash_sessions', { id: 'cash-session', businessId, branchId, openingAmount: 100, declaredAmount: 128,
      status: 'closed', reconciliationPending: true, openedAt: date, closedAt: date }],
  ];
  const entries = sources.map(([source, row]) => ({ atoms: normalizeContribution(source, row.id, row, now,
    { sale: receipts.find(sale => sale.id === row.saleId) }) }));
  const documents = {}, catalogs = [], revisions = [];
  for (let i = 1; i <= Number(currentMonth.slice(-2)); i++) {
    const month = currentMonth.slice(0, 5) + String(i).padStart(2, '0');
    const projection = projectionFromRecords(businessId, month, entries);
    const rows = projection.buckets.map(({ branchId, day, values }) => ({ branchId, day, values }));
    const revision = hash([month, rows]), periodEnd = +monthWindow(month).end;
    const products = projection.products, top = rankProducts(products);
    const base = { businessId, branchId: 'global', periodKey: month, schemaVersion: 2, revision };
    documents[collections.months + '/' + keyOf(businessId, 'global', month)] = { ...base,
      status: 'verified', calculatedThrough: Math.min(periodEnd, now), evidenceThrough: now, validUntil: now + 180000,
      closed: periodEnd < now, mode: 'manual', rows, values: total(rows), branchIds: ['centro', 'taller'], top,
      productPages: 1, productCount: products.length,
      coverage: { sales: true, legacy: true, ledger: true, voids: true, orders: true, cash: true, products: true },
      sourceProof: { epoch: 1, checkedDocuments: sources.length, checkedAt: now, contentHash: hash(sources) } };
    documents[collections.products + '/' + keyOf(businessId, 'global', month, 0)] = { ...base,
      page: 0, pageCount: 1, productCount: products.length, expiresAt: now + 180000, products, top };
    for (const branchId of ['centro', 'taller']) {
      const selected = products.filter(product => product.branchId === branchId), branchRows = rows.filter(row => row.branchId === branchId);
      documents[collections.months + '/' + keyOf(businessId, branchId, month)] = {
        ...documents[collections.months + '/' + keyOf(businessId, 'global', month)], branchId,
        rows: branchRows, values: total(branchRows), branchIds: [branchId], top: rankProducts(selected), productCount: selected.length,
      };
      documents[collections.products + '/' + keyOf(businessId, branchId, month, 0)] = {
        ...base, branchId, page: 0, pageCount: 1, productCount: selected.length, expiresAt: now + 180000, products: selected, top: rankProducts(selected),
      };
    }
    revisions.push(revision);
    catalogs.push(...products);
  }
  const products = mergeProducts(catalogs), year = 'year-' + currentMonth.slice(0, 4);
  documents[collections.products + '/' + keyOf(businessId, 'global', year, 0)] = {
    businessId, branchId: 'global', periodKey: year, schemaVersion: 2, page: 0, pageCount: 1,
    revision: hash(revisions), revisions, productCount: products.length, products, top: rankProducts(products), expiresAt: now + 180000,
  };
  for (const branchId of ['centro', 'taller']) {
    const selected = products.filter(product => product.branchId === branchId);
    documents[collections.products + '/' + keyOf(businessId, branchId, year, 0)] = {
      ...documents[collections.products + '/' + keyOf(businessId, 'global', year, 0)], branchId,
      productCount: selected.length, products: selected, top: rankProducts(selected),
    };
  }
  return documents;
}

it('P31 exports verified global monthly and annual PDF/XLSX without historical reads or dashboard additions', { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ summary: false, mode: 'preview', async inspectPage(page, { downloads }) {
    const ev = evaluate(page);
    await ev(documents => {
      const fixture = window.__excelFixture;
      fixture.summaryDocuments = documents;
      sessionStorage.setItem('migapos:report-filter:original:centro', 'mes');
      fixture.setScope({ dashboard: true });
    }, summaryDocumentsFixture(Date.now()));
    await until(() => ev(() => document.body.innerText.includes('Top 5 productos') && document.body.innerText.includes('S/ 55.00')), 'The monthly branch dashboard uses its verified snapshot');
    assert.equal(await ev(() => /Caja del período|Auditorías|Consulta histórica pendiente|Consultar documentos históricos|Exportar historial/.test(document.body.innerText)), false);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), 1);
    await select(ev)('mes');
    await click(page)(primary);
    const print = await previewReady(ev);
    assert.match(print.html, /Cajas — resumen/);
    assert.match(print.html, /Pedidos — resumen/);
    assert.match(print.html, /S\/ 66\.05/);
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), 3);
    for (const [width, height] of [[320, 650], [1280, 800]]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width === 320 });
      await until(() => ev(() => !document.querySelector('iframe') || document.documentElement.scrollWidth <= innerWidth + 1), 'Preview fits viewport');
    }
    await closePreview(ev);
    await select(ev, 1)('excel');
    await click(page)(primary);
    const monthly = await until(async () => (await downloadNames(downloads)).find(name => name.startsWith('Reporte_Mensual')), 'Summary workbook downloaded');
    const book = XLSX.read(await readFile(join(downloads, monthly)), { type: 'buffer', cellStyles: true });
    assert.deepEqual(book.SheetNames, ['Resumen_Financiero', 'Comparativa_Sedes', 'Evolucion_Diaria', 'Resumen_Cajas', 'Resumen_Pedidos', 'Productos_Global', 'Productos_Sedes']);
    assert.equal(readOverview(XLSX, book)['Total neto registrado (S/)'], 66.05);
    assertWorkbookBorders(XLSX, book, await readFile(join(downloads, monthly)));
    await copyFile(join(downloads, monthly), resolve(artifacts, 'p31-mensual-consolidado.xlsx'));
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), 3, 'PDF and XLSX reuse the same verified monthly data');
    await ev(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Este año').click());
    await until(() => ev(() => window.__excelFixture.summaries.some(call => call.branchId === 'centro' && call.filter === 'todo')
      && document.body.innerText.includes('S/ 55.00')), 'Annual branch dashboard uses its own month snapshots');
    await select(ev)('todo');
    await click(page)(primary);
    const annual = await until(async () => (await downloadNames(downloads)).find(name => name.startsWith('Reporte_Anual')), 'Annual workbook downloaded');
    const year = XLSX.read(await readFile(join(downloads, annual)), { type: 'buffer' });
    assert.ok(year.SheetNames.includes('Evolucion_Mensual'));
    assert.ok(year.SheetNames.includes('Resumen_Cajas'));
    assert.ok(year.SheetNames.includes('Resumen_Pedidos'));
    assert.ok(!year.SheetNames.some(name => /^(Auditoría|Detalle|Estado_Pedidos)/.test(name)));
    assert.equal(readOverview(XLSX, year)['Total neto registrado (S/)'], 66.05);
    await copyFile(join(downloads, annual), resolve(artifacts, 'p31-anual-consolidado.xlsx'));
    assert.deepEqual(await ev(() => window.__excelFixture.summaries.map(({ branchId, filter }) => [branchId, filter])),
      [['centro', 'mes'], ['global', 'mes'], ['centro', 'todo'], ['global', 'todo']]);
    const pointReads = await ev(() => window.__excelFixture.summaryPoints.length);
    const annualPoints = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', month: 'numeric' }).format(new Date())) + 1;
    assert.equal(pointReads, 3 + 2 * annualPoints);
    await select(ev, 1)('pdf');
    await click(page)(primary);
    const annualPrint = await previewReady(ev);
    assert.match(annualPrint.html, /Informe anual/);
    assert.match(annualPrint.html, /Cajas — resumen/);
    assert.match(annualPrint.html, /Pedidos — resumen/);
    assert.match(annualPrint.html, /S\/ 66\.05/);
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), pointReads);
    await closePreview(ev);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
    assert.equal(await ev(() => window.__excelFixture.documentSources ?? 0), 0);
    assert.deepEqual(await ev(() => window.__excelFixture.confirmations), []);
    await ev(() => {
      sessionStorage.setItem('migapos:report-filter:original:taller', 'todo');
      window.__excelFixture.setScope({ branchId: 'taller' });
    });
    await until(() => ev(() => window.__excelFixture.summaries.some(call => call.branchId === 'taller')
      && document.body.innerText.includes('S/ 11.05')), 'Changing active branch replaces dashboard values');
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), pointReads + annualPoints);
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
    for (const [name, html] of [['mensual', print.html], ['anual', annualPrint.html]]) {
      await ev(html => { document.open(); document.write(html); document.close(); }, html);
      const pdf = Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).data, 'base64');
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      await writeFile(resolve(artifacts, `p31-informe-${name}.pdf`), pdf);
    }
    console.log(JSON.stringify({ dashboardMonthlyPoints: 1, consolidatedMonthlyPoints: 2, dashboardAnnualPoints: annualPoints,
      consolidatedAnnualPoints: annualPoints, documentFactories: 0, historicalCalls: 0 }));
  } });
});

it('P31 missing snapshots block dashboard and exports without a gate or historical options', { timeout: 90000 }, async () => {
  await runExcelFixture({ oldSummary: true, async inspectPage(page, { downloads, responses }) {
    const ev = evaluate(page), press = click(page), error = alert(ev);
    await select(ev)('mes');
    await select(ev, 1)('excel');
    await press(primary);
    await error('Resumen no disponible');
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
    assert.equal(await ev(() => window.__excelFixture.summaryPoints?.length ?? 0), 1);
    assert.deepEqual(responses, [], 'A missing summary must not load the Excel generator');
    assert.deepEqual(await downloadNames(downloads), []);
    await ev(() => {
      sessionStorage.setItem('migapos:report-filter:original:centro', 'mes');
      window.__excelFixture.setScope({ dashboard: true });
    });
    await until(() => ev(() => document.querySelector('.workspace-page [role="status"]')?.textContent.includes('Resumen no disponible')), 'Dashboard also reports the unavailable summary');
    assert.equal(await ev(() => /Consulta histórica pendiente|Consultar documentos históricos|Exportar historial/.test(document.body.innerText)), false);
    assert.deepEqual(await ev(() => window.__excelFixture.confirmations), []);
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
    await select(ev)('todo');
    await press(primary);
    await error('Resumen no disponible');
    await ev(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Este año').click());
    assert.ok((await ev(() => window.__excelFixture.summaryPoints?.length ?? 0)) > 1);
  } });
  await runExcelFixture({ summary: true, async inspectPage(page, { downloads }) {
    const ev = evaluate(page), error = alert(ev);
    for (const fault of ['missing', 'expired', 'coverage', 'permission-denied', 'catalog']) {
      const documents = summaryDocumentsFixture(Date.now());
      if (fault === 'missing') for (const name of Object.keys(documents)) delete documents[name];
      if (fault === 'expired') for (const value of Object.values(documents)) value.validUntil = Date.now() - 1;
      if (fault === 'coverage') for (const value of Object.values(documents)) value.coverage = {};
      if (fault === 'catalog') for (const name of Object.keys(documents)) if (name.includes(':year-')) delete documents[name];
      const filter = fault === 'catalog' ? 'todo' : 'mes';
      await ev(({ documents, fault, filter }) => {
        const fixture = window.__excelFixture;
        fixture.summaryDocuments = documents;
        fixture.summaryFault = fault === 'permission-denied' ? fault : '';
        sessionStorage.setItem('migapos:report-filter:' + fault + ':centro', filter);
        fixture.setScope({ identityKey: fault, dashboard: true });
      }, { documents, fault, filter });
      await select(ev)(filter);
      await click(page)(primary);
      await error('Resumen no disponible');
      await until(() => ev(() => document.querySelector('.workspace-page [role="status"]')?.textContent.includes('Resumen no disponible')), 'Dashboard also blocks ' + fault);
      assert.equal(await ev(() => window.__excelFixture.reads), 0);
      assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
      assert.equal(await ev(() => document.body.innerText.includes('S/ 0.00')), false);
      assert.deepEqual(await downloadNames(downloads), []);
    }
    await ev(documents => {
      const fixture = window.__excelFixture;
      fixture.summaryDocuments = documents;
      fixture.summaryFault = '';
      fixture.summaryHold = true;
      fixture.pendingSummaries = [];
      sessionStorage.setItem('migapos:report-filter:waiting:centro', 'mes');
      fixture.setScope({ identityKey: 'waiting', dashboard: true });
    }, summaryDocumentsFixture(Date.now()));
    await until(() => ev(() => window.__excelFixture.pendingSummaries.length === 1), 'Dashboard snapshot read is held');
    await ev(() => { window.__excelFixture.setScope({ dashboard: false }); });
    await ev(() => { window.__excelFixture.summaryHold = false; window.__excelFixture.pendingSummaries.forEach(resolve => resolve()); });
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
    assert.equal(await ev(() => window.__excelFixture.documentSources ?? 0), 0);
    await select(ev)('mes');
    const before = await ev(() => window.__excelFixture.summaryPoints.length);
    await ev(() => { window.__excelFixture.summaryHold = true; window.__excelFixture.pendingSummaries = []; });
    await click(page)(primary);
    await until(() => ev(() => window.__excelFixture.pendingSummaries.length === 1), 'Export snapshot is held before product pages');
    await select(ev)('semana');
    await ev(() => { window.__excelFixture.summaryHold = false; window.__excelFixture.pendingSummaries.forEach(resolve => resolve()); });
    await delay(100);
    assert.equal(await ev(() => window.__excelFixture.summaryPoints.length), before + 1, 'A cancelled export cannot fetch further product pages');
    assert.deepEqual(await ev(() => window.__excelFixture.readerCalls ?? {}), {});
  } });
});

it('P27 prepares a global weekly PDF in a background tab and reuses it after changing operational branch', { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { responses, downloads }) {
    const ev = evaluate(page);
    await ev(() => {
      Object.assign(window.__excelFixture, { reference: 'secondary', readDelay: 40, cancelledContractCount: 2 });
      window.__excelFixture.loadPersonnel();
      window.__excelFixture.setScope({ branchId: 'taller' });
    });
    await select(ev)('semana');
    await until(() => ev(() => document.querySelector('.export-toolbar form').textContent.includes('Un archivo incluye todas las sedes')), 'Global scope displayed');
    await ev(() => {
      const fixture = window.__excelFixture;
      const frame = window.requestAnimationFrame.bind(window), timeout = window.setTimeout.bind(window);
      fixture.animationWaits = 0;
      fixture.clickAt = performance.now();
      fixture.restore = () => { delete document.visibilityState; window.requestAnimationFrame = frame; window.setTimeout = timeout; };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      window.requestAnimationFrame = callback => {
        if (document.visibilityState === 'hidden') {
          if (new Error().stack.includes('waitForPaint')) fixture.animationWaits++;
          return 0;
        }
        return frame(callback);
      };
      window.setTimeout = (callback, ms, ...args) => timeout(callback, ms === 90000 ? 400 : ms, ...args);
      document.querySelector('.export-toolbar form').requestSubmit();
    });
    const result = await until(() => ev(frameSelector => {
      const problem = document.querySelector('.export-toolbar [role="alert"]');
      const report = document.querySelector(frameSelector)?.contentDocument?.querySelector('main');
      return (problem || report) && { preview: !!report, alert: problem?.textContent ?? '',
        animationWaits: window.__excelFixture.animationWaits, reads: window.__excelFixture.reads };
    }, frameSelector), 'The weekly report produces a preview or a classified failure');
    assert.equal(result.preview, true, JSON.stringify(result));
    assert.equal(result.animationWaits, 0);
    assert.equal(result.reads, 5);
    assert.ok(await ev(() => window.__excelFixture.calls.every(call => call.branchId === 'global')));
    assert.deepEqual(responses, [], 'The PDF needs no Excel module');
    await ev(() => window.__excelFixture.restore());
    const preview = await previewReady(ev);
    const previewMs = () => ev(() => {
      const { startTime, duration } = performance.getEntriesByName('migapos:report:preview').at(-1);
      return startTime + duration - window.__excelFixture.clickAt;
    });
    const cold = await previewMs();
    for (const expected of ['S/ 28.00', 'S/ 17.00', 'S/ 11.00', 'S/ 9.00', 'S/ 19.00', 'Taller']) assert.ok(preview.html.includes(expected), expected);
    assert.match(preview.html, /<table>/);
    const capture = async filename => writeFile(resolve(artifacts, filename),
      Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await capture('pdf-semanal-vista-previa.png');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await until(() => ev(() => innerWidth === 390), 'The mobile viewport is active');
    assert.ok(await ev(frameSelector => {
      const { contentDocument: doc } = document.querySelector(frameSelector);
      return doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1;
    }, frameSelector), 'Mobile preview does not overflow its frame');
    await capture('pdf-semanal-movil.png');
    await page.send('Emulation.clearDeviceMetricsOverride');
    await ev(() => window.__excelFixture.setScope({ branchId: 'centro' }));
    assert.equal((await previewReady(ev)).html, preview.html, 'A branch change does not cancel the preview');
    await closePreview(ev);
    await ev(() => { window.__excelFixture.clickAt = performance.now(); document.querySelector('.export-toolbar form').requestSubmit(); });
    assert.equal((await previewReady(ev)).html, preview.html);
    const warm = await previewMs();
    await closePreview(ev);
    await select(ev, 1)('excel');
    await click(page)(primary);
    await workbook(downloads, [], { net: 28, cash: 9, digital: 19, label: 'Semanal_Detallado', artifact: 'global-semanal', cancelledOrders: 2 });
    const timing = await ev(() => ({ reads: window.__excelFixture.reads, sources: window.__excelFixture.timings,
      stages: performance.getEntriesByType('measure').filter(item => item.name.startsWith('migapos:report:'))
        .map(({ name, duration }) => ({ name, ms: duration })) }));
    assert.equal(timing.reads, 5, 'Warm PDF and Excel reuse five verified document sources');
    assert.equal(await ev(() => window.__excelFixture.countBusinesses.length), 1, 'Warm PDF and Excel also share one aggregate');
    await ev(() => window.__excelFixture.setScope({ businessId: 'other-p27-business' }));
    await select(ev, 1)('pdf');
    await click(page)(primary);
    await previewReady(ev);
    assert.deepEqual(await ev(() => window.__excelFixture.calls.slice(5).map(call => call.businessId)), Array(5).fill('other-p27-business'));
    assert.equal(await ev(() => window.__excelFixture.countBusinesses.at(-1)), 'other-p27-business');
    await closePreview(ev);
    await writeFile(resolve(artifacts, 'tiempos-semanal.json'), JSON.stringify({ coldMs: cold, warmMs: warm, ...timing }, null, 2));
    await ev(html => { document.open(); document.write(html); document.close(); }, preview.html);
    const pdf = Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).data, 'base64');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.equal([...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length, 1);
    await writeFile(resolve(artifacts, 'taller-semanal.pdf'), pdf);
  } });
});

async function verifyPrintWithoutEvent(ev, failFirst) {
  await ev((frameSelector, failFirst) => {
    const frame = document.querySelector(frameSelector), fixture = window.__excelFixture;
    fixture.failPrint = failFirst;
    fixture.printAttempts = 0;
    frame.contentWindow.print = () => {
      fixture.printAttempts++;
      if (fixture.failPrint) throw Error('Impresión de ensayo rechazada');
      const doc = frame.contentDocument;
      fixture.printed = { html: doc.documentElement.outerHTML, executable: !!doc.querySelector('script,img,object,svg'),
        sandbox: frame.getAttribute('sandbox'), csp: doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content };
      // Chromium may return from print() without delivering afterprint to this frame.
    };
  }, frameSelector, failFirst);
  const print = () => ev(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find(button => button.textContent.trim() === 'Imprimir / Guardar como PDF').click());
  await print();
  if (failFirst) {
    await until(() => ev(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('No se pudo abrir la impresión')),
      'Print failure stays in preview and offers retry');
    await ev(async () => { window.__excelFixture.failPrint = false; await new Promise(requestAnimationFrame); });
    await print();
  }
  const printed = await until(() => ev(() => window.__excelFixture.printed), 'Native print uses sanitized HTML');
  await previewReady(ev);
  assert.equal(printed.sandbox, 'allow-same-origin allow-modals');
  assert.match(printed.csp, /script-src 'none'/);
  assert.equal(printed.executable, false);
  await ev(() => new Promise(requestAnimationFrame));
  await print();
  assert.equal(await ev(() => window.__excelFixture.printAttempts), failFirst ? 3 : 2);
  assert.ok(await ev(() => document.querySelector('[role="dialog"] [role="status"]').textContent.includes('Se solicitó la impresión')));
  return printed;
}

it('Plan14 previews the authorized scope, prints sanitized A4 and reuses its snapshot for XLSX', { timeout: 180000 }, async () => {
  const out = resolve(artifacts, 'pdf-regresiones');
  await mkdir(out, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads, responses }) {
    const ev = evaluate(page), press = click(page);
    let filenames = [];
    for (const [scenario, net, cash, digital, expectedPages] of [
      ['una-sede', 85, 28, 57, 1], ['dos-sedes', 67, 40, 27, 1],
      ['vacio', 0, 0, 0, 1], ['negativo', -30, 0, -30, 1], ['denso', 1080, 1080, 0, 2],
    ]) {
      if (scenario !== 'una-sede') {
        await reload(page, ev, { ignoreCache: true });
        await ev(scenario => {
          const fixture = window.__excelFixture;
          Object.assign(fixture, { multi: scenario === 'dos-sedes', compensated: scenario === 'dos-sedes',
            empty: scenario === 'vacio', negative: scenario === 'negativo', dense: scenario === 'denso' });
          if (fixture.multi || fixture.dense) fixture.setScope({ branchId: 'global' });
          if (fixture.multi) fixture.loadPersonnel();
        }, scenario);
        if (scenario === 'dos-sedes') await select(ev)('semana');
      }
      assert.equal(await ev(() => window.__excelFixture.reads), 0);
      await ev(() => {
        const form = document.querySelector('.export-toolbar form');
        for (let i = 0; i < 3; i++) form.requestSubmit();
      });
      const preview = await previewReady(ev);
      assert.equal(preview.sandbox, 'allow-same-origin allow-modals');
      const formatted = net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      assert.ok(preview.html.includes(`S/ ${formatted}`));
      assert.ok(preview.html.includes('Pan de ensayo &lt;img'));
      assert.doesNotMatch(preview.html, /RMux1Jm3vl7pofbT54G6YXkT2lP7|RLui5Jm3wl7pofbT54G6YXkT2lP7|QvY2SOyq7BnP9aU7cmeGPxaH2uP3|fe5ef63c-b034-4bdf-9e16-1492bb6c5258|UID:/i);
      assert.match(preview.html, /Ana Quispe/);
      if (scenario === 'una-sede') assert.deepEqual(responses, [], 'PDF does not load the Excel library');
      if (scenario === 'vacio') assert.match(preview.html, /No se registraron movimientos confirmados/);
      if (scenario === 'negativo') assert.match(preview.html, /class="bar negative" style="left:0%;width:50%"/);
      if (scenario === 'dos-sedes') {
        assert.match(preview.html, /<td class="bounded">Taller<\/td>/);
        assert.match(preview.html, /Efectivo contado<\/dt> <dd>No declarado/);
        assert.match(preview.html, /Turno vencido sin conteo/);
        assert.match(preview.html, /Luis Quispe/);
      }
      const reads = await ev(() => window.__excelFixture.reads);
      assert.equal(reads, 4, 'Triple click launches one dataset pipeline');
      const printed = await verifyPrintWithoutEvent(ev, scenario === 'una-sede');
      await closePreview(ev);
      await until(() => ev(frameSelector => !document.querySelector(frameSelector), frameSelector), 'Closing preview removes the print frame');
      await press(primary);
      assert.equal((await previewReady(ev)).html, preview.html, 'Reopening uses the identical prepared HTML');
      await closePreview(ev);
      assert.equal(await ev(() => window.__excelFixture.reads), reads);
      let excelExtra = 0;
      if (['una-sede', 'dos-sedes'].includes(scenario)) {
        const multi = scenario === 'dos-sedes';
        await select(ev, 1)('excel');
        assert.equal(await ev(() => window.__excelFixture.reads), reads);
        await press(primary);
        filenames = await workbook(downloads, filenames, { net, cash, digital, label: multi ? 'Semanal_Detallado' : 'Diario_Detallado',
          artifact: scenario });
        const additional = await ev(reads => window.__excelFixture.calls.slice(reads).map(call => call.kind), reads);
        assert.deepEqual(additional, ['audit'], 'Only Excel needs a missing historical order reference');
        excelExtra = additional.length;
      }
      // Chromium renders the actual sanitized print document to a PDF in the isolated browser.
      await ev(html => { document.open(); document.write('<!doctype html>' + html); document.close(); }, printed.html);
      const pdf = Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: false }, 15000)).data, 'base64');
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
      assert.equal(pageCount, expectedPages, scenario);
      await writeFile(resolve(out, `informe-${scenario}.pdf`), pdf);
      console.log(JSON.stringify({ scenario, net, cash, digital, pageCount, coldReads: reads, warmExtraReads: 0, excelExtra }));
    }
  } });
});

it('P25 downloads the independent global sample with three tickets totaling S/68', { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads, responses }) {
    const ev = evaluate(page);
    await ev(() => { window.__excelFixture.reference = 'global'; window.__excelFixture.setScope({ branchId: 'global' }); });
    await until(() => ev(() => document.querySelector('.export-toolbar form').textContent.includes('Todas las sucursales')), 'Global scope selected');
    await click(page)(primary);
    const preview = await previewReady(ev);
    assert.match(preview.html, /S\/ 68\.00/);
    assert.deepEqual(responses, []);
    await closePreview(ev);
    await select(ev, 1)('excel');
    await click(page)(primary);
    const [name] = await workbook(downloads, [], { net: 68, cash: 39, digital: 29, label: 'Diario_Detallado',
      branches: ['Centro', 'Taller'], artifact: 'referencia-global', orders: false });
    const book = XLSX.read(await readFile(join(downloads, name)), { type: 'buffer' });
    assert.equal(readOverview(XLSX, book)['Tickets de venta válidos'], 3);
    assert.equal(['Detalle_Centro', 'Detalle_Taller'].flatMap(name => tableRows(XLSX, book, name)).filter(row => row.Producto).length, 4);
    assert.equal(await ev(() => window.__excelFixture.reads), 4);
    await ev(html => { document.open(); document.write(html); document.close(); }, preview.html);
    const pdf = Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).data, 'base64');
    assert.equal([...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length, 1);
    await writeFile(resolve(artifacts, 'referencia-global.pdf'), pdf);
  } });
});

it('P27 downloads a compact XLSX with borders only on data, nine tickets, two branches, cash and order evidence', { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads }) {
    const ev = evaluate(page);
    await ev(() => { window.__excelFixture.reference = 'v3'; window.__excelFixture.setScope({ branchId: 'global' }); });
    await until(() => ev(() => document.querySelector('.export-toolbar form').textContent.includes('Todas las sucursales')), 'Global scope selected');
    await select(ev)('semana');
    await select(ev, 1)('excel');
    await click(page)(primary);
    const [name] = await workbook(downloads, [], { net: 225, cash: 134, digital: 91, label: 'Semanal_Detallado',
      branches: ['Centro', 'Taller'], artifact: 'compacto' });
    const book = XLSX.read(await readFile(join(downloads, name)), { type: 'buffer', cellStyles: true, cellNF: true });
    assert.deepEqual(book.SheetNames, ['Resumen_Financiero', 'Auditoría_Cajas', 'Comparativa_Sedes',
      'Productos_Global', 'Productos_Sedes', 'Detalle_Centro', 'Detalle_Taller', 'Estado_Pedidos', 'Auditoría_Pedidos']);
    const overview = readOverview(XLSX, book);
    assert.deepEqual([overview['Neto de ventas en mostrador (S/)'], overview['Neto de pagos de pedidos (S/)'], overview['Tickets de venta válidos']], [225, 0, 9]);
    assert.deepEqual(XLSX.utils.decode_range(book.Sheets.Resumen_Financiero['!ref']).e.c, 1);
    const summary = Object.fromEntries(XLSX.utils.sheet_to_json(book.Sheets.Resumen_Financiero, { header: 1 }).filter(([key, value]) => key && value != null));
    assert.deepEqual([summary['Sobrante confirmado'], summary['Faltante confirmado'], summary['CAJAS QUE REQUIEREN REVISIÓN']], [7, -4, 4]);
    const cover = book.Sheets.Resumen_Financiero;
    assert.deepEqual([cover.A2.v, cover.A3.v, cover.A4.v, cover.A5], ['Negocio: Pastelería Nube de ensayo', 'Sedes:', 'Período:', undefined]);
    assert.equal(cover.B3.v, 'Todas las sedes');
    assert.match(cover.B4.v, /^Semana · \d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}$/);
    const product = book.Sheets.Productos_Global;
    assert.deepEqual([product.A1.v, product.B1.v, product.C1.v], ['Producto', 'Cantidad vendida', 'Ventas (S/)']);
    assert.equal(product.A1.s.fgColor.rgb, 'FCE4D6');
    assert.match(product['!autofilter'].ref, /^A1:C\d+$/);
    assert.deepEqual(['Productos_Sedes', 'Comparativa_Sedes', 'Auditoría_Cajas', 'Estado_Pedidos', 'Auditoría_Pedidos']
      .map(sheet => book.Sheets[sheet].A1.v), ['Sucursal', 'Sede', 'Fecha', 'Pedido', 'Fecha Pago']);
    assert.deepEqual(tableRows(XLSX, book, 'Auditoría_Pedidos').map(row => row['Neto Movimiento (S/)']), [11, -11]);
    const detail = book.Sheets.Detalle_Taller;
    assert.equal(detail.C2.v, 'T-2101');
    assert.equal(detail.D2.v, 'Completada');
    assert.match(detail.E2.v, /Efectivo S\/ 22.00 · Yape\/Plin S\/ 31.00/);
    assert.deepEqual(['C2', 'D2', 'E2', 'F2', 'I2'].map(cell => detail[cell].s.fgColor.rgb), ['9DE0F6', 'A9F08A', 'CDEBFA', 'FFFFA6', 'B4C6E7']);
    assert.ok(detail['!cols'].every((column, i) => column.wch <= [12, 10, 18, 14, 24, 35, 10, 14, 15, 19, 20, 21, 36][i] + 1));
    assert.deepEqual([detail.I2.v, detail.I3.v, detail.I4.v, detail.I5.v, detail.J2.v], [2, 46, 3, 2, 53]);
    assert.deepEqual([detail.H6.v, detail.I6.v, detail.I6.s.fgColor.rgb], ['TOTAL TICKET', 53, 'A9F08A']);
    assert.equal(detail.J6, undefined);
    for (const row of [3, 4, 5]) for (const col of ['A', 'B', 'C', 'D', 'E', 'J', 'K']) assert.equal(detail[col + row], undefined);
    for (const col of 'ABCDEFGHIJKLM') assert.equal(detail[col + '7'], undefined);
    assert.equal(detail['!rows'][6].hpt, 9);
    assert.equal(detail.C8.v, 'T-2102');
    assert.equal(detail.F4.v, '=1+1');
    assert.equal(detail.F4.t, 's');
    assert.equal(detail.F4.f, undefined);
    const compared = tableRows(XLSX, book, 'Comparativa_Sedes');
    assert.deepEqual(compared.map(row => [row.Sede, row.Tickets, row['Ingreso neto (S/)'], row['Diferencia de caja confirmada (S/)']]),
      [['Taller', 6, 157, 3], ['Centro', 3, 68, 'Sin arqueo']]);
    assert.equal(book.Sheets.Comparativa_Sedes['!autofilter'].ref, 'A1:F3');
    assert.equal(book.Sheets.Comparativa_Sedes.A5.v, 'TOTAL NEGOCIO');
    assert.equal(book.Sheets.Comparativa_Sedes.E5.v, 225);
    const bySite = book.Sheets.Productos_Sedes;
    assert.equal(bySite['!autofilter'], undefined);
    assert.equal(bySite.B1.v, 'Producto');
    assert.equal(bySite['!rows'][4].hpt, 13);
    assert.deepEqual(tableRows(XLSX, book, 'Productos_Sedes').map(row => row.Sucursal).filter(Boolean), ['Centro', 'Taller']);
    assert.deepEqual([bySite.A5, bySite.B5], [undefined, undefined], 'One blank separator between branch groups');
    const audit = tableRows(XLSX, book, 'Auditoría_Cajas');
    for (const [state, expected] of [['Cuadrado', 0], ['Sobrante', 7], ['Faltante', -4], ['Faltante por revisar', -2]]) {
      assert.equal(audit.find(row => row.Estado === state)['Diferencia (S/)'], expected);
    }
    for (const state of ['Vencido sin conteo', 'Fondo registrado']) {
      const row = audit.find(row => row.Estado === state);
      assert.deepEqual([row['Efectivo contado (S/)'], row['Diferencia (S/)']], ['No declarado', 'No calculable']);
    }
    assert.deepEqual(await ev(() => window.__excelFixture.calls.map(call => call.kind).sort()), ['cash', 'contracts', 'orders', 'sales', 'voids']);
  } });
});

it('P29 preserves mixed payment reversals and colors only the visible cancellation state in real XLSX', { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads }) {
    const ev = evaluate(page);
    await ev(() => { window.__excelFixture.mixedCompensation = true; });
    await select(ev, 1)('excel');
    await click(page)(primary);
    const [filename] = await workbook(downloads, [], { net: 65, cash: 20, digital: 45, label: 'Diario_Detallado', artifact: 'anulacion-mixta' });
    const bytes = await readFile(join(downloads, filename));
    const book = XLSX.read(bytes, { type: 'buffer', cellStyles: true, cellNF: true });
    const sheet = book.Sheets.Detalle_Centro, allRows = tableRows(XLSX, book, 'Detalle_Centro');
    const original = allRows.find(row => row.Movimiento === 'VENTA POS' && row['Medio de pago'].startsWith('MIXTO'));
    const adjustment = allRows.find(row => row.Movimiento === 'COMPENSACIÓN POS');
    const historical = allRows.find(row => row.Movimiento === 'VENTA POS ANULADA');
    assert.deepEqual([original.Estado, adjustment.Estado, historical.Estado], ['ANULADO', 'ANULADO', 'ANULADO · POR REVISAR']);
    assert.deepEqual([original['Importe neto movimiento (S/)'], adjustment['Importe neto movimiento (S/)'], historical['Importe neto movimiento (S/)']], [20, -20, 0]);
    assert.deepEqual([original.Cantidad, adjustment.Cantidad, historical.Cantidad], [1, -1, 0]);
    assert.match(adjustment['Medio de pago'], /Efectivo -8.00 · Yape\/Plin -12.00/);

    const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
    const xml = path => Buffer.from(XLSX.CFB.find(archive, path).content).toString('utf8');
    const styles = xml('/xl/styles.xml');
    const fonts = [...styles.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(match => match[1]);
    const fontIds = [...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*\bfontId="(\d+)"/g)].map(match => Number(match[1]));
    const cells = xml(`/xl/worksheets/sheet${book.SheetNames.indexOf('Detalle_Centro') + 1}.xml`);
    const canceled = Object.keys(sheet).filter(address => /^D\d+$/.test(address) && sheet[address].v.startsWith('ANULADO'));
    assert.equal(canceled.length, 3);
    for (const address of canceled) {
      assert.equal(sheet[address].s.fgColor.rgb, 'FBDADA');
      const style = Number(cells.match(new RegExp(`<c r="${address}"[^>]*\\bs="(\\d+)"`))[1]);
      assert.match(fonts[fontIds[style]], /rgb="(?:FF)?991B1B"/i);
      assert.match(fonts[fontIds[style]], /<b\b/);
      const row = Number(address.slice(1));
      const adjustmentRow = sheet[`L${row}`].v === 'COMPENSACIÓN POS';
      assert.deepEqual([sheet[`H${row + 1}`].v, sheet[`I${row + 1}`].v], adjustmentRow ? ['TOTAL AJUSTE', -20] : ['TOTAL TICKET', 0]);
    }
    assert.ok(Object.entries(sheet).some(([address, cell]) => /^D\d+$/.test(address) && cell.v === 'Completada' && cell.s.fgColor.rgb === 'A9F08A'));
    assert.deepEqual([readOverview(XLSX, book)['Compensaciones POS · Efectivo'], readOverview(XLSX, book)['Compensaciones POS · Yape / Plin']], [-8, -12]);
  } });
});

it('P28 prints classified cash incidents in A4 and keeps the complete Excel audit', { timeout: 180000 }, async () => {
  const output = resolve(artifacts, 'pdf-incidencias');
  await mkdir(output, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads }) {
    const ev = evaluate(page), press = click(page);
    const printA4 = async () => Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: false }, 15000)).data, 'base64');
    const pageCount = pdf => [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    for (const count of [0, 1, 6, 8, 'sample']) {
      if (count) await reload(page, ev, { ignoreCache: true });
      await ev(count => { Object.assign(window.__excelFixture, { reviewCount: count, reviewSample: count === 'sample' }); }, count);
      const incidents = count === 'sample' ? 5 : count;
      assert.equal(await ev(() => window.__excelFixture.reads), 0);
      await press(primary);
      const preview = await previewReady(ev);
      assert.equal([...preview.html.matchAll(/<article class="review-row /g)].length, Math.min(incidents, 6));
      assert.equal(preview.html.includes('Cajas que necesitan revisión'), incidents > 0);
      assert.doesNotMatch(preview.html, /Alertas operativas|Notificaciones/);
      if (count === 8) assert.match(preview.html, /6 incidencias más recientes de 8/);
      if (count === 'sample') {
        assert.match(preview.html, /Faltaron S\/ 43\.30/);
        assert.match(preview.html, /Sobraron S\/ 32\.00 · importe por verificar/);
        assert.match(preview.html, /Mensaje adjunto: Contar monedas/);
        assert.match(preview.html, /Confirmado \d{2}\/\d{2}\/\d{4} 19:00/);
      }
      assert.equal(await ev(() => window.__excelFixture.reads), 4);
      await closePreview(ev);
      await press(primary);
      assert.equal((await previewReady(ev)).html, preview.html);
      assert.equal(await ev(() => window.__excelFixture.reads), 4);
      if (count === 8) {
        await closePreview(ev);
        await select(ev, 1)('excel');
        await press(primary);
        const names = await workbook(downloads, [], { net: 85, cash: 28, digital: 57, label: 'Diario_Detallado' });
        const book = XLSX.read(await readFile(join(downloads, names[0])), { type: 'buffer' });
        const audit = tableRows(XLSX, book, 'Auditoría_Cajas');
        assert.equal(audit.length, 16);
        assert.equal(audit.filter(row => row.Turno !== 'APERTURA').length, 8);
        assert.deepEqual(await ev(() => window.__excelFixture.calls.slice(4).map(call => call.kind)), ['audit']);
      }
      await ev(html => { document.open(); document.write('<!doctype html>' + html); document.close(); }, preview.html);
      const pdf = await printA4();
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      await writeFile(resolve(output, `informe-caja-${count}.pdf`), pdf);
      assert.equal(pageCount(pdf), 1, `PDF con ${count} incidencias`);
      if (incidents >= 6) {
        // Reserve vertical space for wrapping differences across system fonts.
        await ev(() => {
          const margin = document.createElement('style');
          margin.textContent = '@page{margin-bottom:18mm}';
          document.head.append(margin);
        });
        assert.equal(pageCount(await printA4()), 1, `PDF con ${count} incidencias y 8 mm menos de altura disponible`);
      }
    }
  } });
});
