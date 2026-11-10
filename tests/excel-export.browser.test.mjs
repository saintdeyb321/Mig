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
const select = ev => value => ev(value => {
  const control = document.querySelector('.export-toolbar select');
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
const alert = ev => title => until(() => ev(title => document.querySelector('.export-toolbar [role="alert"]')?.textContent.includes(title), title), title);
const ready = ev => until(() => ev(() => Boolean(window.__excelFixture && document.querySelector('.export-toolbar'))), 'Fixture ready after reload');
const offline = (page, offline) => page.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

async function workbook(downloads, previous, { net, cash, digital, label, artifact, detailed = true, empty = false }) {
  const filename = await until(async () => (await downloadNames(downloads)).find(name => !previous.includes(name)), `Missing download ${label}`);
  assert.match(filename, new RegExp(`^Reporte_${label}_\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
  const bytes = await readFile(join(downloads, filename));
  assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  const book = XLSX.read(bytes, { type: 'buffer' });
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(book.Sheets.Resumen_Financiero).map(row => [row.Concepto, row.Valor]));
  assert.equal(summary['💰 GRAN TOTAL INGRESOS NETOS'], net);
  assert.equal(summary['Neto contable · Efectivo'], cash);
  assert.equal(summary['Neto contable · Yape / Plin'], digital);
  if (empty) assert.deepEqual(book.SheetNames, ['Resumen_Financiero']);
  else {
    for (const name of ['Comparativa_Sedes', 'Productos_Global', 'Productos_Sedes', 'Auditoría_Pedidos']) assert.ok(book.SheetNames.includes(name), name);
    assert.equal(book.SheetNames.includes('Auditoría_Cajas'), detailed);
    const sheet = book.Sheets[detailed ? 'Detalle_Centro' : 'Resum_Centro'];
    assert.ok(sheet);
    const column = detailed ? 'Total movimiento (S/)' : 'Ingreso';
    assert.equal(XLSX.utils.sheet_to_json(sheet).reduce((sum, row) => sum + (row[column] || 0), 0), net);
    const cells = Object.values(book.Sheets.Productos_Sedes);
    assert.ok(cells.some(cell => cell.t === 's' && cell.v.includes('=1+1')));
    assert.ok(Object.values(book.Sheets).flatMap(sheet => Object.values(sheet)).every(cell => cell?.f == null && cell?.l == null));
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
      const section = document.querySelector('.export-toolbar'), control = section.querySelector('select'), button = section.querySelector('button');
      const b = element => element.getBoundingClientRect().toJSON();
      return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, section: b(section), select: b(control), button: b(button),
        description: b(section.querySelector('header p')).height, border: getComputedStyle(section).borderLeftWidth,
        title: document.getElementById(section.getAttribute('aria-labelledby')).textContent };
    });
    assert.equal(metrics.viewport, width);
    assert.ok(metrics.scroll <= width + 1, JSON.stringify(metrics));
    assert.equal(metrics.title, 'Exportar reportes contables');
    assert.equal(metrics.border, '4px');
    assert.ok(metrics.description > 0 && metrics.select.height >= 44 && metrics.button.height >= 44);
    if (width >= 768) assert.ok(Math.abs(metrics.select.bottom - metrics.button.bottom) <= 1 && metrics.button.left >= metrics.select.right);
    else assert.ok(metrics.button.top >= metrics.select.bottom && Math.abs(metrics.select.width - metrics.button.width) <= 1);
    measurements.push(metrics);
    if ([1440,320].includes(width)) {
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' }, 15000);
      await writeFile(join(artifacts, `tarjeta-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await ev(() => document.querySelector('.export-toolbar select').focus());
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await ev(() => document.activeElement.matches('.export-toolbar button[type="submit"]')));
  const ax = await page.send('Accessibility.getFullAXTree', {}, 15000);
  assert.ok(ax.nodes.some(node => node.role?.value === 'combobox' && node.name?.value === 'Período de exportación'));
  assert.ok(ax.nodes.some(node => node.role?.value === 'button' && node.name?.value === 'Descargar Excel'));
  await writeFile(resolve(artifacts, 'tarjeta-metricas.json'), JSON.stringify(measurements, null, 2));
}

it('downloads actual XLSX from Vite dev, recovers an obsolete optimizer URL and blocks incomplete or stale exports', { timeout: 180000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await runExcelFixture({ fault: 'stale', force: true, async inspectPage(page, { responses, network, downloads }) {
    const ev = evaluate(page), press = click(page), error = alert(ev);
    await ux(page);
    assert.deepEqual(responses, []);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    await ev(() => {
      const revoke = URL.revokeObjectURL;
      window.__excelFixture.revoked = 0;
      URL.revokeObjectURL = url => { window.__excelFixture.revoked++; revoke(url); };
    });
    await press(primary);
    await error('No se pudo preparar Excel');
    assert.equal(responses[0].status, 504);
    assert.match(responses[0].served, /v=00000000/);
    assert.equal(await ev(() => window.__excelFixture.reads), 0);
    await until(() => ev(() => document.activeElement.textContent === 'Reintentar exportación'), 'Retry receives focus');
    assert.deepEqual(await downloadNames(downloads), []);
    await press(retry);
    let names = await workbook(downloads, [], { net: 85, cash: 28, digital: 57, label: 'Diario_Detallado', artifact: 'dev' });
    assert.equal(responses[1].status, 200);
    assert.match(responses[1].mime, /javascript/);
    assert.ok(await ev(() => document.querySelector('.export-toolbar [role="status"]').textContent.includes('Se solicitó la descarga')));
    await until(() => ev(() => window.__excelFixture.revoked === 1 && !document.querySelector('a[download]')), 'Blob URL and temporary link are cleaned up');
    await press(primary);
    await until(() => ev(() => document.querySelector('.export-toolbar [role="status"]').textContent.includes('Espera unos segundos')), 'Cooldown after a real download');
    assert.deepEqual(await downloadNames(downloads), names);
    await page.send('Page.reload', { ignoreCache: true });
    await ready(ev);
    await ev(() => { window.__excelFixture.compensated = true; });
    await select(ev)('semana');
    await press(primary);
    names = await workbook(downloads, names, { net: 55, cash: 28, digital: 27, label: 'Semanal_Detallado', artifact: 'dev' });
    await page.send('Page.reload', { ignoreCache: true });
    await ready(ev);
    for (const [fault, message] of [['permission','Lectura de movimientos denegada'], ['integrity','Los movimientos no concilian'], ['limit','El período supera el límite']]) {
      await ev(fault => { window.__excelFixture.fault = fault; }, fault);
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
    for (const update of [{ branchId: 'taller' }, { identityKey: 'other' }, { mounted: false }]) {
      await ev(() => { window.__excelFixture.fault = 'hold'; window.__excelFixture.pending = []; });
      await press(primary);
      await until(() => ev(() => window.__excelFixture.pending?.length === 3), 'Report reached the held reads');
      await press(primary);
      assert.equal(await ev(() => window.__excelFixture.pending.length), 3, 'A second click during the read cannot start another export');
      await ev(update => window.__excelFixture.setScope(update), update);
      await until(() => ev(() => !document.querySelector('.export-toolbar button[type="submit"]')?.disabled), 'Scope changed before resolving reads');
      await ev(() => window.__excelFixture.pending.forEach(resolve => resolve()));
      await delay(150);
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
      await page.send('Page.reload');
      await ready(ev);
    }
    await until(() => ev(() => Boolean(navigator.serviceWorker.controller)), 'Preview is controlled by the generated PWA');
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
    await offline(page, true);
    await page.send('Page.reload');
    await ready(ev);
    const requestCount = responses.length;
    const networkCount = network.length;
    await ev(() => { window.__excelFixture.empty = true; });
    await select(ev)('todo');
    await press(primary);
    names = await workbook(downloads, names, { net: 0, cash: 0, digital: 0, label: 'Anual_Resumen', artifact: 'preview', detailed: false, empty: true });
    assert.equal(responses.length, requestCount, 'Cached Excel must not hit preview while offline');
    assert.ok(network.slice(networkCount).some(row => row.status === 200 && row.fromServiceWorker), 'Offline Excel comes from the active Workbox service worker');
    console.log(JSON.stringify({ previewRequests: responses, network, files: names.length }));
  } });
});
