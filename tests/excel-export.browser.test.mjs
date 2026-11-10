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
const pdfAction = card + ' button[type="button"]';
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

async function workbook(downloads, previous, { net, cash, digital, label, artifact, detailed = true, empty = false, branches = ['Centro'] }) {
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
    const column = detailed ? 'Total movimiento (S/)' : 'Ingreso';
    const movementSheets = branches.map(branch => book.Sheets[(detailed ? 'Detalle_' : 'Resum_') + branch]);
    assert.ok(movementSheets.every(Boolean));
    assert.equal(movementSheets.flatMap(sheet => XLSX.utils.sheet_to_json(sheet)).reduce((sum, row) => sum + (row[column] || 0), 0), net);
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
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await ev(() => document.activeElement.textContent.includes('Informe PDF')));
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
    for (const update of [{ branchId: 'taller' }, { identityKey: 'other' }, { mounted: false }]) {
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

it('Plan14 previews the authorized scope, prints sanitized A4 and reuses its snapshot for XLSX', { timeout: 180000 }, async () => {
  const out = resolve(artifacts, '../qa-plan14');
  await mkdir(out, { recursive: true });
  await runExcelFixture({ async inspectPage(page, { downloads, responses }) {
    const ev = evaluate(page), press = click(page);
    let filenames = [];
    for (const [multi, net, cash, digital] of [[false, 85, 28, 57], [true, 67, 40, 27]]) {
      if (multi) {
        await page.send('Page.reload', { ignoreCache: true });
        await ready(ev);
        await ev(() => {
          Object.assign(window.__excelFixture, { multi: true, compensated: true });
          window.__excelFixture.setScope({ branchId: 'global' });
        });
        await select(ev)('semana');
      }
      await ev(() => {
        const fixture = window.__excelFixture;
        fixture.failPrint = true;
        new MutationObserver(records => {
          for (const frame of records.flatMap(record => [...record.addedNodes])) {
            if (frame.title !== 'Informe gerencial para impresión') continue;
            frame.addEventListener('load', () => {
              frame.contentWindow.print = () => {
                if (fixture.failPrint) throw Error('Impresión de ensayo rechazada');
                const document = frame.contentDocument;
                fixture.printed = { html: document.documentElement.outerHTML, width: frame.getBoundingClientRect().width,
                  script: !!document.querySelector('script, img, object, svg'), sandbox: frame.getAttribute('sandbox'),
                  csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content };
                frame.contentWindow.dispatchEvent(new Event('afterprint'));
              };
            }, { capture: true, once: true });
          }
        }).observe(document.body, { childList: true });
      });
      await press(pdfAction);
      const preview = await until(() => ev(() => {
        const frame = document.querySelector('iframe[title="Vista previa del informe gerencial"]');
        return frame && { sandbox: frame.getAttribute('sandbox'), html: frame.srcdoc };
      }), 'PDF preview is shown');
      assert.equal(preview.sandbox, '');
      assert.ok(preview.html.includes(`S/ ${net.toFixed(2)}`));
      assert.ok(preview.html.includes('Pan de ensayo &lt;img'));
      assert.equal(preview.html.includes('<td class="bounded">Taller</td>'), multi);
      if (multi) {
        assert.match(preview.html, /No declarado/);
        assert.match(preview.html, /Pendiente de arqueo/);
      }
      if (!multi) assert.deepEqual(responses, [], 'PDF does not load the Excel library');
      const print = () => ev(() => [...document.querySelectorAll('[role="dialog"] button')]
        .find(button => button.textContent.trim() === 'Imprimir / Guardar como PDF').click());
      await print();
      await until(() => ev(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('No se pudo abrir la impresión')),
        'Print failure stays in preview and offers retry');
      await ev(() => { window.__excelFixture.failPrint = false; });
      await print();
      const printed = await until(() => ev(() => window.__excelFixture.printed), 'Native print uses sanitized HTML');
      assert.equal(printed.sandbox, 'allow-same-origin allow-modals');
      assert.match(printed.csp, /script-src 'none'/);
      assert.equal(printed.script, false);
      assert.ok(printed.width > 790 && printed.width < 795, String(printed.width));
      await until(() => ev(() => !document.querySelector('iframe[title="Informe gerencial para impresión"]')), 'Print frame is removed');
      const reads = await ev(() => window.__excelFixture.reads);
      await ev(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Cerrar vista previa').click());
      await press(primary);
      filenames = await workbook(downloads, filenames, { net, cash, digital, label: multi ? 'Semanal_Detallado' : 'Diario_Detallado',
        branches: multi ? ['Centro', 'Taller'] : ['Centro'] });
      assert.equal(await ev(() => window.__excelFixture.reads), reads, 'Consecutive PDF and Excel reuse all authorized reads');
      // Chromium renders the actual sanitized print document to a PDF in the isolated browser.
      await ev(html => { document.open(); document.write('<!doctype html>' + html); document.close(); }, printed.html);
      const pdf = Buffer.from((await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: false }, 15000)).data, 'base64');
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
      assert.equal(pageCount, 2);
      await writeFile(resolve(out, `informe-${multi ? 'dos-sedes' : 'una-sede'}.pdf`), pdf);
      console.log(JSON.stringify({ scopes: multi ? 2 : 1, net, cash, digital, pageCount, coldReads: reads, warmExtraReads: 0 }));
    }
  } });
});
