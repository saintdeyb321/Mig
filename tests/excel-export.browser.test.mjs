import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runExcelFixture } from './helpers/excelExportHarness.mjs';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const artifacts = fileURLToPath(new URL('../.release/qa-excel-ux/', import.meta.url));
const card = '.export-toolbar';
const primary = card + ' button[type="submit"]';
const retry = primary;
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

async function workbook(downloads, previous, { net, cash, digital, label, artifact, detailed = true, empty = false, branches = ['Centro'] }) {
  const filename = await until(async () => (await downloadNames(downloads)).find(name => !previous.includes(name)), `Missing download ${label}`);
  assert.match(filename, new RegExp(`^Reporte_${label}_\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
  const bytes = await readFile(join(downloads, filename));
  assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  const book = XLSX.read(bytes, { type: 'buffer', cellNF: true, cellStyles: true });
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(book.Sheets.Resumen_Financiero).map(row => [row.Concepto, row.Valor]));
  assert.equal(summary['Total neto registrado (S/)'], net);
  assert.equal(summary['Neto en efectivo (S/)'], cash);
  assert.equal(summary['Neto por Yape/Plin (S/)'], digital);
  if (empty) assert.deepEqual(book.SheetNames, ['Resumen_Financiero']);
  else {
    for (const name of ['Productos_Global', 'Auditoría_Pedidos']) assert.ok(book.SheetNames.includes(name), name);
    for (const name of ['Comparativa_Sedes', 'Productos_Sedes']) assert.equal(book.SheetNames.includes(name), branches.length > 1, name);
    assert.equal(book.SheetNames.includes('Auditoría_Cajas'), detailed);
    const column = detailed ? 'Importe movimiento (S/)' : 'Total neto registrado (S/)';
    const movementSheets = branches.map(branch => book.Sheets[(detailed ? 'Detalle_' : 'Resum_') + branch]);
    assert.ok(movementSheets.every(Boolean));
    const headerOf = sheet => XLSX.utils.decode_range(sheet['!autofilter'].ref).s.r;
    const movements = sheet => XLSX.utils.sheet_to_json(sheet, { range: headerOf(sheet), defval: '' });
    const totalCents = rows => rows.reduce((sum, row) => sum + Math.round((row[column] || 0) * 100), 0);
    assert.equal(totalCents(movementSheets.flatMap(movements)), Math.round(net * 100));
    if (branches.length > 1) {
      const compared = XLSX.utils.sheet_to_json(book.Sheets.Comparativa_Sedes);
      for (const [index, branch] of branches.entries()) {
        assert.equal(totalCents(movements(movementSheets[index])), Math.round(compared.find(row => row.Sucursal === branch)['Total neto registrado (S/)'] * 100));
      }
    }
    if (detailed) for (const sheet of movementSheets) {
      assert.match(sheet.A1.v, /^Detalle · .+ · \d{2}\/\d{2}\/\d{4}(?: a \d{2}\/\d{2}\/\d{4})?$/);
      const header = headerOf(sheet), labels = XLSX.utils.sheet_to_json(sheet, { header: 1, range: header })[0];
      const cell = name => sheet[XLSX.utils.encode_cell({ r: header + 1, c: labels.indexOf(name) })];
      assert.ok(!labels.includes('Sucursal'));
      assert.equal(cell('Fecha').t, 'n');
      assert.equal(cell('Fecha').w, sheet.A1.v.match(/\d{2}\/\d{2}\/\d{4}/)[0]);
      assert.equal(cell(column).t, 'n');
      assert.match(cell(column).z, /S\//);
      for (const row of movements(sheet).filter(row => /PEDIDO$/.test(row.Movimiento))) {
        assert.deepEqual([row.Cantidad, row['Precio unitario'], row['Subtotal producto']], ['', '', '']);
      }
      const number = book.SheetNames.findIndex(name => book.Sheets[name] === sheet) + 1;
      const file = XLSX.CFB.find(XLSX.CFB.read(bytes, { type: 'buffer' }), `/xl/worksheets/sheet${number}.xml`);
      const xml = Buffer.from(file.content).toString('utf8');
      assert.match(xml, new RegExp(`<pane ySplit="${header + 1}" topLeftCell="A${header + 2}"[^>]+state="frozen"`));
      assert.ok(xml.includes(`<autoFilter ref="${sheet['!autofilter'].ref}"`));
      assert.equal(XLSX.utils.decode_range(sheet['!autofilter'].ref).e.c, labels.length - 1);
    }
    const cells = Object.values(book.Sheets.Productos_Global);
    assert.ok(cells.some(cell => cell.t === 's' && cell.v.includes('=1+1')));
    assert.ok(Object.values(book.Sheets).flatMap(sheet => Object.values(sheet)).every(cell => cell?.f == null && cell?.l == null));
    assert.ok(Object.values(book.Sheets).flatMap(sheet => Object.values(sheet)).every(cell =>
      typeof cell?.v !== 'string' || !/RMux1Jm3vl7pofbT54G6YXkT2lP7|RLui5Jm3wl7pofbT54G6YXkT2lP7|QvY2SOyq7BnP9aU7cmeGPxaH2uP3|fe5ef63c-b034-4bdf-9e16-1492bb6c5258|ID Movimiento|Documento Pedido|UID:/i.test(cell.v)));
    const order = XLSX.utils.sheet_to_json(book.Sheets.Auditoría_Pedidos)[0];
    assert.equal(order['N.º de pedido'], 'PED-2026-0034');
    if (detailed) assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Auditoría_Cajas).find(row => row.Turno === 'CIERRE MANUAL')['Registrado por'], 'Empleado no identificado');
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
  assert.ok(ax.nodes.some(node => node.role?.value === 'button' && node.name?.value === 'Preparar informe PDF'));
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
    await until(() => ev(() => document.activeElement.textContent === 'Descargar detalle Excel'), 'Primary retry receives focus');
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
      ['integrity','Los movimientos no concilian'], ['limit','El período supera el límite']]) {
      await ev(fault => { window.__excelFixture.resetReads(); window.__excelFixture.fault = fault; }, fault);
      await press(primary);
      await error(message);
      assert.deepEqual(await downloadNames(downloads), names);
    }
    await select(ev)('mes');
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
    await ev(() => {
      const fixture = window.__excelFixture;
      fixture.resetReads();
      fixture.fault = 'hold';
      fixture.pending = [];
      fixture.setTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, ms, ...args) => fixture.setTimeout(callback, ms === 30000 ? 250 : ms, ...args);
    });
    await press(primary);
    await error('El informe tardó demasiado');
    await ev(() => {
      const fixture = window.__excelFixture;
      window.setTimeout = fixture.setTimeout;
      fixture.pending.forEach(resolve => resolve());
    });
    assert.deepEqual(await downloadNames(downloads), names);
    for (const update of [{ branchId: 'taller' }, { identityKey: 'other' }, { businessId: 'another-tenant' }, { mounted: false }]) {
      await ev(() => { window.__excelFixture.resetReads(); window.__excelFixture.fault = 'hold'; window.__excelFixture.pending = []; });
      await press(primary);
      await until(() => ev(() => window.__excelFixture.pending?.length === 1), 'Report reached the held sales read');
      await press(primary);
      assert.equal(await ev(() => window.__excelFixture.pending.length), 1, 'A second click during the read cannot start another export');
      await ev(update => window.__excelFixture.setScope(update), update);
      await until(() => ev(() => !document.querySelector('.export-toolbar button[type="submit"]')?.disabled), 'Scope changed before resolving reads');
      await ev(() => window.__excelFixture.pending.forEach(resolve => resolve()));
      await delay(150);
      assert.equal(await ev(() => window.__excelFixture.pending.length), 1, 'An abandoned scope cannot start supplemental reads');
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
    await until(() => ev(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), 'Generated PWA registration activates');
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
    await select(ev)('mes');
    await press(primary);
    let names = await workbook(downloads, [], { net: 55, cash: 28, digital: 27, label: 'Mensual_Resumen', artifact: 'preview', detailed: false });
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
    await select(ev)('todo');
    await press(primary);
    await error('No se pudieron consultar los movimientos');
    assert.deepEqual(await downloadNames(downloads), names);
    assert.equal(responses.length, requestCount, 'Cached Excel must not hit preview while offline');
    assert.ok(network.slice(networkCount).some(row => row.status === 200 && row.fromServiceWorker), 'Offline Excel comes from the active Workbox service worker');
    await offline(page, false);
    await press(retry);
    names = await workbook(downloads, names, { net: 0, cash: 0, digital: 0, label: 'Anual_Resumen', artifact: 'preview', detailed: false, empty: true });
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
  const out = resolve(artifacts, '../qa-plan14-ux');
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
        assert.match(preview.html, /Turno vencido sin arqueo/);
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
          branches: multi ? ['Centro', 'Taller'] : ['Centro'], artifact: scenario });
        const additional = await ev(reads => window.__excelFixture.calls.slice(reads).map(call => call.kind), reads);
        assert.deepEqual(additional, ['audit'], 'Only Excel needs the historical order reference');
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

it('P14-RC prints A4 with 0, 1, 6 and 8 cash incidents and keeps the complete Excel audit', { timeout: 180000 }, async () => {
  const output = resolve(artifacts, '../qa-p14-rc');
  await mkdir(output, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads }) {
    const ev = evaluate(page), press = click(page);
    const printA4 = async () => Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: false }, 15000)).data, 'base64');
    const pageCount = pdf => [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    for (const count of [0, 1, 6, 8]) {
      if (count) await reload(page, ev, { ignoreCache: true });
      await ev(count => { window.__excelFixture.reviewCount = count; }, count);
      assert.equal(await ev(() => window.__excelFixture.reads), 0);
      await press(primary);
      const preview = await previewReady(ev);
      assert.equal([...preview.html.matchAll(/<article class="review-row /g)].length, Math.min(count, 6));
      assert.equal(preview.html.includes('Cajas que requieren revisión'), count > 0);
      assert.doesNotMatch(preview.html, /Alertas operativas|Notificaciones/);
      if (count === 8) assert.match(preview.html, /6 incidencias más recientes de 8/);
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
        const audit = XLSX.utils.sheet_to_json(book.Sheets.Auditoría_Cajas);
        assert.equal(audit.length, 16);
        assert.equal(audit.filter(row => row.Turno !== 'APERTURA').length, 8);
        assert.deepEqual(await ev(() => window.__excelFixture.calls.slice(4).map(call => call.kind)), ['audit']);
      }
      await ev(html => { document.open(); document.write('<!doctype html>' + html); document.close(); }, preview.html);
      const pdf = await printA4();
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      await writeFile(resolve(output, `informe-caja-${count}.pdf`), pdf);
      assert.equal(pageCount(pdf), 1, `PDF con ${count} incidencias`);
      if (count >= 6) {
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
