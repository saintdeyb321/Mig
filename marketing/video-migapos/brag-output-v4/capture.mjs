import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readBrowserBuildCss, runBrowserFixture} from '../../../tests/helpers/browserHarness.mjs';
const viewport = {width: 390, height: 844, deviceScaleFactor: 2, mobile: true};

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const src = name => file(`../../../frontend/src/${name}`).replaceAll('\\', '/');
const hooks = [
  ['catalog/hooks/useCategories', 'useCategories', 'categories'],
  ['catalog/hooks/useProducts', 'useProducts', 'products'],
  ['cash-register/hooks/useCashRegister', 'useCashRegister', 'cash'],
  ['contracts/hooks/useContracts', 'useContracts', 'contracts'],
  ['customers/hooks/useAgenda', 'useAgenda', 'agenda'],
  ['branches/hooks/useBranches', 'useBranches', 'branches'],
  ['backups/hooks/useLocalBackup', 'useLocalBackup', 'backup'],
  ['reports/hooks/useReports', 'useReports', 'reports'],
  ['sales/hooks/useSalesHistory', 'useSalesHistory', 'history'],
  ['settings/hooks/useSettings', 'useSettings', 'settings'],
  ['users/hooks/useUserManagement', 'useUserManagement', 'users'],
];
const moduleMocks = Object.fromEntries(hooks.map(([path, hook, key]) => [
  src(`features/${path}.js`),
  `import {useSyncExternalStore} from 'react';
  export function ${hook}() {
    const fixture = window.__p09;
    useSyncExternalStore(next => fixture.watch('${key}', next), () => fixture.revisions['${key}'] ?? 0);
    return fixture.${key};
  }`,
]));
Object.assign(moduleMocks, {
  [src('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [src('hooks/useSuperAdmin.js')]: 'export function useSuperAdmin(){return window.__p09.admin;}',
  [src('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [src('features/reports/hooks/useExportSales.js')]: 'export function useExportSales(){return {isExporting:false,exportData:()=>window.__p09.forbidden()};}',
  [src('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [src('features/payments/infrastructure/paymentRepository.js')]: 'export const getPaymentsByContract=async()=>window.__p09.ledger;',
  [src('features/licenses/infrastructure/platformBusinessRepository.js')]: 'export const readPlatformBusiness=async()=>window.__p09.platformDetail;',
  [src('features/sales/hooks/useRecentSales.js')]: 'export function useRecentSales(){return {sales:[],rejected:[],isLoading:false};}',
  [src('features/sales/infrastructure/saleTransactions.js')]: `
    const forbidden = () => window.__p09.forbidden();
    export const saveSaleTransaction=forbidden, saveSaleDraftTransaction=forbidden,
      verifyPendingSaleTransaction=forbidden, reviewDraftSaleTransaction=forbidden,
      confirmDraftSaleTransaction=forbidden, subscribeSaleAcknowledgement=()=>()=>{},
      subscribeVoidAttempts=()=>()=>{}, recoverFinancialReceipts=forbidden;
  `,
});

const shots = {};
const evidence = {};
const clips = new Map();
const external = new Set();
let connection;
let active;
const requested = new Set(process.argv.slice(2));
const source = await readFile(file('../../../tests/plan09.fixture.jsx'), 'utf8');
const branchLine = /const branch = \{[^\n]+\};/;
assert.ok(branchLine.test(source) && source.includes('businessBranches: [branch]'));
const fixture = source.replace(branchLine, declaration => `${declaration}
const northBranch = {...branch, id:'p09-branch-norte', name:'Sede Norte demo'};`)
  .replaceAll('[branch]', '[branch, northBranch]')
  .replace('history: History,', 'history: ({user}) => <><ExportSales user={user}/><History user={user}/></>,');
await mkdir(file('.cache/'), {recursive: true});
await mkdir(file('public/shots/'), {recursive: true});
await mkdir(file('public/clips/'), {recursive: true});
await writeFile(file('.cache/fixture.jsx'), fixture);
await writeFile(file('.cache/fixture.html'), `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>
<script type="module" src="/@fs/__WORKSPACE__marketing/video-migapos/brag-output-v4/.cache/fixture.jsx"></script></html>`);

await runBrowserFixture({
  htmlFile: new URL('.cache/fixture.html', import.meta.url),
  route: '/plan09-v4',
  fixture: {css: await readBrowserBuildCss()},
  moduleMocks,
  firebaseSdk: false,
  headers: {'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'"},
  setupPage: async page => {
    await page.send('Emulation.setDeviceMetricsOverride', viewport);
    await page.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
    await page.send('Network.enable');
  },
  onPageEvent: ({method, params}) => {
    if (method === 'Page.screencastFrame' && connection) {
      void connection.send('Page.screencastFrameAck', {sessionId: params.sessionId}).catch(() => {});
      if (active) {
        const frame = Buffer.from(params.data, 'base64');
        if (!frame.equals(active.frames.at(-1).bytes)) active.frames.push({at: performance.now() - active.start, bytes: frame});
      }
    }
    if (method === 'Network.requestWillBeSent' && /^https?:/.test(params.request.url)) {
      const url = new URL(params.request.url);
      if (url.hostname !== '127.0.0.1') external.add(url.origin);
    }
  },
  inspectPage: async page => {
    connection = page;
    await page.send('Page.startScreencast', {format: 'png', maxWidth: 780, maxHeight: 1688, everyNthFrame: 1});
    const evaluate = async (fn, ...args) => {
      const response = await page.send('Runtime.evaluate', {
        expression: `(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`,
        awaitPromise: true, returnByValue: true,
      });
      assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
      return response.result.value;
    };
    const view = async name => {
      const result = await evaluate(async name => {
        await window.__p09.show(name, 'dueño');
        window.scrollTo(0, 0);
        document.querySelector('main')?.scrollTo(0, 0);
        await window.__p09.frames();
        return window.__p09.renderError;
      }, name);
      assert.ok(!result, `${name}: ${result}`);
    };
    const position = async (selector, text = '', center = false) => evaluate(async (query, pattern, center) => {
      const matches = [...document.querySelectorAll(query)].filter(element => element.getClientRects().length);
      const element = pattern ? matches.find(element => new RegExp(pattern, 'i').test(element.innerText || element.textContent)) : matches[0];
      if (!element) throw Error(`No se encontró ${query} ${pattern}`);
      const rect = element.getBoundingClientRect();
      if (center && rect.height < 710 && (rect.top < 85 || rect.bottom > innerHeight - 65)) {
        element.scrollIntoView({block: 'center', behavior: 'smooth'});
        await new Promise(resolve => setTimeout(resolve, 475));
        await window.__p09.frames();
      }
      const {x, y, width, height} = element.getBoundingClientRect();
      return {x, y, width, height, text: element.innerText?.trim().slice(0, 130)};
    }, selector, text, center);
    const grab = async (id, selector, pattern, focusSelector = selector, focusPattern = pattern) => {
      const focus = await position(focusSelector, focusPattern, true);
      const area = await position(selector, pattern);
      const {data} = await page.send('Page.captureScreenshot', {format: 'png'});
      const bytes = Buffer.from(data, 'base64');
      const elapsed = active ? performance.now() - active.start : 0;
      if (active?.id !== id && active?.frames.length > 1) {
        active.frames.push({at: elapsed, bytes});
        clips.set(id, {...active, elapsed});
      }
      await writeFile(file(`public/shots/${id}.png`), bytes);
      shots[id] = {
        area: [area.x, area.y, area.width, area.height].map(Math.round),
        focus: [focus.x, focus.y, focus.width, focus.height].map(Math.round),
      };
      assert.ok(focus.x >= -1 && focus.y >= -1 && focus.x + focus.width <= 391 && focus.y + focus.height <= 845,
        `Detalle fuera del viewport: ${id} · ${JSON.stringify(shots[id].focus)}`);
      active = {id, start: performance.now(), frames: [{at: 0, bytes}], taps: []};
    };
    const mark = point => { if (active) active.taps.push({...point, at: performance.now() - active.start}); };
    const click = async (query, pattern = '') => {
      const {x, y, width, height} = await position(query, pattern, true);
      const point = {x: Math.round(x + width / 2), y: Math.round(y + height / 2)};
      assert.ok(point.x >= 0 && point.x < 390 && point.y >= 0 && point.y < 844, `Control fuera del viewport: ${pattern || query}`);
      mark(point);
      await page.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
      await delay(50);
      await page.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await delay(230);
    };
    const search = async (query, value) => {
      const {x, y, width, height} = await position(query, '', true);
      mark({x: x + width / 2, y: y + height / 2});
      await evaluate(async (query, value) => {
        const input = document.querySelector(query);
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (let index = 1; index <= value.length; index++) {
          setter.call(input, value.slice(0, index));
          input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value[index - 1]}));
          await new Promise(resolve => setTimeout(resolve, 42));
        }
        await window.__p09.frames();
        input.blur();
      }, query, value);
      await delay(250);
      assert.equal(await evaluate(query => document.querySelector(query).value, query), value);
    };
    const choose = async (query, value) => {
      const {x, y, width, height} = await position(query, '', true);
      mark({x: x + width - 24, y: y + height / 2});
      await delay(170);
      await evaluate(async (query, value) => {
        const element = [...document.querySelectorAll(query)].find(element => element.getClientRects().length);
        if (!element || ![...element.options].some(option => option.value === value)) throw Error(`Opción no disponible: ${value}`);
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('change', {bubbles: true}));
        await window.__p09.frames();
      }, query, value);
      await delay(210);
    };
    const has = async (selector, pattern) => position(selector, pattern);
    const run = async (name, task) => {
      if (requested.size && !requested.has(name)) return;
      active = null;
      try {
        if (name !== 'pos') {
          await view('products');
          await view('pos');
        }
        evidence[name] = {ok: true, result: await task()};
        console.log(`PASS · ${name}`);
      } catch (error) {
        evidence[name] = {ok: false, error: error.message};
        console.error(`FAIL · ${name} · ${error.message.split('\n')[0]}`);
      } finally {
        active = null;
      }
    };

    await evaluate(() => {
      const data = window.__p09;
      const [base, north] = data.products.businessBranches;
      base.name = 'Sede Centro demo';
      const inventory = data.products.filteredProducts.slice();
      const names = ['Pan artesanal', 'Café molido', 'Galletas de avena', 'Granola tostada'];
      inventory.forEach((row, index) => {
        row.name = names[index];
        row.stock[base.id] = 100;
        row.stock[north.id] = 24 - index * 4;
      });
      data.categories.filteredCategories = ['Panes', 'Cafés', 'Galletas'].map((name, index) => ({
        id: `p09-category-${index}`, name, status: 'activo',
      }));
      data.products.setSearchTerm = term => {
        data.products.searchTerm = term;
        data.products.filteredProducts = inventory.filter(row => row.name.toLowerCase().includes(term.toLowerCase()));
        data.notify('products');
      };
      data.contracts.contracts[0].contractId = 'PEDIDO-DEMO-07';
      data.contracts.contracts[0].clientName = 'Cliente Almendra demo';
      data.contracts.contracts[0].clientPhone = '';
      data.contracts.contracts[0].details = 'Torta de chocolate de demostración';
      data.contracts.contracts.push({...data.contracts.contracts[0], id:'p09-closed', contractId:'PEDIDO-DEMO-05',
        clientName:'Cliente Naranja demo', status:'entregado', balance:0});
      data.history.sales.forEach(sale => sale.items.forEach(item => { item.name = names[0]; }));
      data.users.filteredUsers = [{id:'p09-staff-1', uid:'p09-staff-1', firstName:'Cajera',
        lastName:'Demo', email:'equipo@example.test', role:'cajero', status:'activo', branchId:north.id,
        shiftStart:'08:00', shiftEnd:'16:00'}];
      data.settings.companyData = {razonSocial:'Panadería Horizonte Demo', ruc:'', direccion:'', telefono:''};
      data.cash.calculateClose = async amount => ({openingAmount:11, posCash:106.3, contractCash:0,
        posCompensationCount:1, posCompensationCash:-106.3, posCompensationDigital:0, posCompensationTotal:-106.3,
        expectedAmount:11, declaredAmount:amount, difference:amount - 11, hasUnverifiedDisbursements:true});
      data.reports.setTimeFilter = period => {
        const numbers = {hoy: [3, 106.3], semana: [12, 430], mes: [37, 1340], todo: [104, 4270]};
        const [count, revenue] = numbers[period];
        const report = data.reports;
        report.timeFilter = period;
        report.summary = {...report.summary, posTicketCount: count, netRevenue: revenue,
          posRevenue: revenue, posAverageTicket: revenue / count};
        report.chartData = period === 'semana' ? [
          {ventas: 106.3, date: '04 nov'}, {ventas: 145.7, date: '05 nov'}, {ventas: 178, date: '06 nov'},
        ] : [{ventas: revenue, date: '04 nov'}];
        data.notify('reports');
      };
    });
    await view('products');
    await view('pos');
    assert.deepEqual(await evaluate(() => [innerWidth, innerHeight, devicePixelRatio, document.documentElement.scrollWidth]), [390, 844, 2, 390]);
    const mainNav = 'nav[aria-label="Navegación principal"]';
    const route = async name => {
      if (['Punto de venta', 'Contratos', 'Historial'].includes(name)) {
        await click(`${mainNav} button[title="${name}"]`);
      } else {
        await click(`${mainNav} button`, '^Más$');
        await click('[role="menuitem"]', `^${name}$`);
      }
      await evaluate(async () => {
        window.scrollTo(0, 0);
        document.querySelector('main')?.scrollTo(0, 0);
        await window.__p09.frames();
      });
    };
    const branch = 'select[aria-label="Seleccionar sucursal"]';
    const productSearch = 'input[placeholder="Buscar producto..."]';
    await run('pos', async () => {
      await grab('hook', '.pos-catalog', '', 'button[title="Pan artesanal"]');
      const query = await evaluate(() => [...document.querySelectorAll('.pos-catalog input')][0]?.getAttribute('placeholder'));
      assert.ok(query);
      await search(`.pos-catalog input[placeholder="${query}"]`, 'Pan artesanal');
      assert.deepEqual(await evaluate(() => [Boolean(document.querySelector('button[title="Pan artesanal"]')),
        Boolean(document.querySelector('button[title="Café molido"]'))]), [true, false]);
      await grab('pos-search', '.pos-catalog', '', 'button[title="Pan artesanal"]');
      await click('button[title="Pan artesanal"]');
      await has('.pos-cart-launcher', '5\\.00');
      await grab('pos-add', '.pos-cart-launcher');
      await click('.pos-cart-launcher');
      await has('[role="dialog"] .pos-ticket-total', '5\\.00');
      await grab('pos-ticket', '[role="dialog"] .pos-ticket-items li', 'Pan artesanal');
      await click('[role="dialog"] button[aria-label="Aumentar Pan artesanal"]');
      await has('[role="dialog"] .pos-ticket-total', '10\\.00');
      await grab('pos-quantity', '[role="dialog"] .pos-ticket-items li', 'Pan artesanal');
      await grab('pos-total', '[role="dialog"] .pos-ticket-total');
      return 'Búsqueda y tres toques; 5,00 → 10,00; no se cobra.';
    });
    await run('catalog', async () => {
      await route('Categorías');
      await grab('categories', '.workspace-page h3 + div', 'Panes');
      await route('Productos');
      await grab('products', '.workspace-page', 'Pan artesanal', productSearch, '');
      await search(productSearch, 'Pan artesanal');
      await has('.workspace-page', 'Inventario de la Sede');
      assert.ok(!(await evaluate(() => document.querySelector('.workspace-page').innerText)).includes('Café molido'));
      await grab('product-search', '.workspace-page div.border-l-4', 'Pan artesanal');
      return 'Categorías y búsqueda con resultado visible y 100 unidades en sede Centro.';
    });
    await run('branches', async () => {
      await route('Productos');
      await grab('branch-before', branch);
      await choose(branch, 'p09-branch-norte');
      await grab('branch-after', branch);
      await has('.workspace-page', '24 disp');
      await grab('branch-stock', '.workspace-page div.border-l-4', '24 disp');
      await choose(branch, 'p09-branch');
      return 'Selector Centro → Norte; el mismo producto pasa de 100 a 24 unidades sintéticas.';
    });
    await run('orders', async () => {
      await route('Contratos');
      const orders = '[aria-label="Estado de los pedidos"]';
      await grab('orders-active', orders);
      await click('button', 'Cuentas por Cobrar');
      await has('button[aria-pressed="true"]', 'Cuentas por Cobrar');
      await grab('orders-debt', orders);
      await click('button', 'Historial Cerrados');
      await has('button[aria-pressed="true"]', 'Historial Cerrados');
      await grab('orders-closed', orders);
      await click('button', 'Pedidos en Curso');
      const query = 'input[placeholder^="Buscar por cliente"]';
      await grab('orders-search', query);
      await search(query, 'Almendra');
      await has('main', 'Cliente Almendra demo');
      await grab('orders-result', 'article', 'Cliente Almendra demo');
      return 'Contratos en navegación principal; tres filtros, búsqueda y estado de un pedido ficticio.';
    });
    await run('history', async () => {
      await route('Historial');
      await grab('history', 'article', 'Venta registrada');
      await click('article button', '^Ver detalle$');
      await grab('history-items', '[role="dialog"]', 'Productos del ticket');
      return 'Fecha y estado de venta sintética, más diálogo real de productos.';
    });
    await run('reports', async () => {
      await route('Reportes');
      const periodGroup = '[aria-label="Período del reporte"]';
      await grab('report-today', periodGroup, '', `${periodGroup} button[aria-pressed="true"]`, '^Hoy$');
      for (const [id, label] of [['week', 'Esta semana'], ['month', 'Este mes'], ['year', 'Este año']]) {
        await click(`${periodGroup} button`, label);
        await grab(`report-${id}`, periodGroup, '', `${periodGroup} button[aria-pressed="true"]`, label);
      }
      await click(`${periodGroup} button`, 'Esta semana');
      await grab('report-metric', '.workspace-page div.border-t-4:has(h2)', 'Tickets POS');
      await grab('report-chart', '.workspace-page .overflow-hidden:has(> [aria-label="Gráfico de ventas"])', 'Evolución de ventas');
      return 'Hoy, semana, mes y año con selección real; tarjetas y gráfico sintéticos.';
    });
    await run('export', async () => {
      await route('Historial');
      await has('.export-toolbar button[type="submit"]', 'Preparar informe PDF');
      await grab('export-pdf', '.export-toolbar', '', '.export-toolbar button[type="submit"]');
      await choose('.export-toolbar select:has(option[value="excel"])', 'excel');
      await has('.export-toolbar button[type="submit"]', 'Descargar detalle Excel');
      await grab('export-excel', '.export-toolbar', '', '.export-toolbar button[type="submit"]');
      return 'Se comprobaron selector y etiquetas. No se imprimió ni se descargó.';
    });
    await run('cash', async () => {
      await route('Punto de venta');
      await grab('cash-entry', 'button', '^Cerrar caja$');
      await click('button', '^Cerrar caja$');
      await grab('cash-input', '[role="dialog"]', 'Cuánto efectivo contaste');
      await search('[role="dialog"] input[type="number"]', '11');
      await click('[role="dialog"] button', '^Siguiente$');
      await has('[role="dialog"]', 'Referencia calculada');
      await has('[role="dialog"]', 'Dinero contado');
      await grab('cash', '[role="dialog"] dl');
      await has('[role="dialog"]', 'Por revisar');
      await grab('cash-warning', '[role="dialog"] dl', '', '[role="dialog"] dd', '^Por revisar$');
      return 'POS → Cerrar caja → Siguiente. Referencia y conteo en mock de cálculo, con aviso provisional.';
    });
    await run('staff', async () => {
      await route('Personal');
      await grab('staff', 'article', 'Cajera Demo');
      await has('article', '08:00');
      await click('button', '^Editar$');
      await grab('staff-edit', '[role="dialog"] div[class*="sm:grid-cols-2"]:has(select)', 'Nivel de acceso');
      await grab('staff-shift', '[role="dialog"] div:has(> h3):has(input[type="time"])', 'Horario de turno');
      return 'Cajera demo, sede Norte, turno 08:00–16:00 y ficha abierta como dueño. No se guarda.';
    });
    await run('settings', async () => {
      await route('Ajustes');
      await grab('settings', 'dd', 'Panadería Horizonte Demo');
      await click('button', 'Mostrar Sucursales');
      await has('button[aria-expanded="true"]', 'Ocultar Sucursales');
      await grab('settings-branches', '#settings-branches article', 'Sede Centro demo');
      return 'Datos comerciales ficticios y panel de Sucursales abierto, sin cambios.';
    });
    await page.send('Page.stopScreencast');
    await page.send('Emulation.setDeviceMetricsOverride', {...viewport, width: 360, height: 800});
    const sizes = {};
    for (const tab of ['pos', 'products', 'categories', 'contracts', 'history', 'reports', 'users', 'settings']) {
      await view(tab);
      sizes[tab] = await evaluate(() => [innerWidth, innerHeight, document.documentElement.scrollWidth]);
      assert.deepEqual(sizes[tab], [360, 800, 360], tab);
    }
    evidence.responsive = {ok: true, result: sizes};
    assert.deepEqual([...external], [], 'Se intentó una conexión fuera del fixture aislado.');
  },
});

const oldShots = requested.size ? JSON.parse(await readFile(file('.cache/shots.json'), 'utf8').catch(() => '{}')) : {};
const oldEvidence = requested.size ? JSON.parse(await readFile(file('.cache/evidence.json'), 'utf8').catch(() => '{}')) : {};
const oldClips = requested.size ? JSON.parse(await readFile(file('.cache/clips.json'), 'utf8').catch(() => '{}')) : {};
const clipInfo = {...oldClips};
const ffmpeg = file('../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
for (const [id, clip] of clips) {
  const frameCount = Math.max(12, Math.ceil(clip.elapsed * 30 / 1000) + 4);
  let cursor = 0;
  const sequence = Array.from({length: frameCount}, (_, index) => {
    while (cursor + 1 < clip.frames.length && clip.frames[cursor + 1].at <= index * 1000 / 30) cursor++;
    return clip.frames[cursor].bytes;
  });
  const result = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30',
    '-c:v', 'png', '-i', 'pipe:0', '-vf', 'scale=780:1688', '-c:v', 'libx264', '-preset', 'fast', '-crf', '15',
    '-threads', '3', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file(`public/clips/${id}.mp4`)],
  {input: Buffer.concat(sequence), encoding: 'utf8'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  clipInfo[id] = {from: clip.id, frames: frameCount, distinct: clip.frames.length,
    taps: clip.taps.map(({x, y, at}) => ({x, y, frame: Math.round(at * 30 / 1000)}))};
}
await writeFile(file('.cache/shots.json'), JSON.stringify({...oldShots, ...shots}, null, 2));
await writeFile(file('.cache/evidence.json'), JSON.stringify({...oldEvidence, ...evidence}, null, 2));
await writeFile(file('.cache/clips.json'), JSON.stringify(clipInfo, null, 2));
assert.ok(Object.values(evidence).every(({ok}) => ok), 'Hay capítulos pendientes. Consulte .cache/evidence.json.');
console.log(`${Object.keys(shots).length} tomas y ${clips.size} grabaciones aisladas · 0 solicitudes externas`);


