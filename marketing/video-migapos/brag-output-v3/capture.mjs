import assert from 'node:assert/strict';

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
const external = new Set();
const requested = new Set(process.argv.slice(2));
const source = await readFile(file('../../../tests/plan09.fixture.jsx'), 'utf8');
const branchLine = /const branch = \{[^\n]+\};/;
assert.ok(branchLine.test(source) && source.includes('businessBranches: [branch]'));
const fixture = source.replace(branchLine, declaration => `${declaration}
const northBranch = {...branch, id:'p09-branch-norte', name:'Sede Norte demo'};`)
  .replaceAll('[branch]', '[branch, northBranch]');
await mkdir(file('.cache/'), {recursive: true});
await mkdir(file('public/shots/'), {recursive: true});
await writeFile(file('.cache/fixture.jsx'), fixture);
await writeFile(file('.cache/fixture.html'), `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>
<script type="module" src="/@fs/__WORKSPACE__marketing/video-migapos/brag-output-v3/.cache/fixture.jsx"></script></html>`);

await runBrowserFixture({
  htmlFile: new URL('.cache/fixture.html', import.meta.url),
  route: '/plan09-v3',
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
    if (method === 'Network.requestWillBeSent' && /^https?:/.test(params.request.url)) {
      const url = new URL(params.request.url);
      if (url.hostname !== '127.0.0.1') external.add(url.origin);
    }
  },
  inspectPage: async page => {
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
      if (center && rect.height < 630 && (rect.top < 85 || rect.bottom > innerHeight - 72)) {
        element.scrollIntoView({block: 'center', behavior: 'instant'});
        await window.__p09.frames();
      }
      const {x, y, width, height} = element.getBoundingClientRect();
      return {x, y, width, height, text: element.innerText?.trim().slice(0, 130)};
    }, selector, text, center);
    const grab = async (id, selector, pattern, focusSelector = selector, focusPattern = pattern) => {
      const focus = await position(focusSelector, focusPattern, true);
      const area = await position(selector, pattern);
      const {data} = await page.send('Page.captureScreenshot', {format: 'jpeg', quality: 94});
      await writeFile(file(`public/shots/${id}.jpg`), Buffer.from(data, 'base64'));
      shots[id] = {
        area: [area.x, area.y, area.width, area.height].map(Math.round),
        focus: [focus.x, focus.y, focus.width, focus.height].map(Math.round),
      };
    };
    const click = async (query, pattern = '') => {
      const {x, y, width, height} = await position(query, pattern, true);
      const point = {x: Math.round(x + width / 2), y: Math.round(y + height / 2)};
      assert.ok(point.x >= 0 && point.x < 390 && point.y >= 0 && point.y < 844, `Control fuera del viewport: ${pattern || query}`);
      await page.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
      await delay(50);
      await page.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await delay(230);
    };
    const search = async (query, value) => {
      await position(query, '', true);
      await evaluate(async (query, value) => {
        const input = document.querySelector(query);
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
        await window.__p09.frames();
        input.blur();
      }, query, value);
      await delay(250);
      assert.equal(await evaluate(query => document.querySelector(query).value, query), value);
    };
    const choose = async (query, value) => {
      await evaluate(async (query, value) => {
        const element = [...document.querySelectorAll(query)].find(element => element.getClientRects().length);
        if (!element || ![...element.options].some(option => option.value === value)) throw Error(`Opción no disponible: ${value}`);
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('change', {bubbles: true}));
        await window.__p09.frames();
      }, query, value);
    };
    const has = async (selector, pattern) => position(selector, pattern);
    const run = async (name, task) => {
      if (requested.size && !requested.has(name)) return;
      try {
        evidence[name] = {ok: true, result: await task()};
        console.log(`PASS · ${name}`);
      } catch (error) {
        evidence[name] = {ok: false, error: error.message};
        console.error(`FAIL · ${name} · ${error.message.split('\n')[0]}`);
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
      data.agenda.filteredContacts = [
        {id: 'p09-contact-1', name: 'Cliente Almendra demo', phone: ''},
        {id: 'p09-contact-2', name: 'Cliente Naranja demo', phone: ''},
      ];
      const contacts = data.agenda.filteredContacts.slice();
      data.agenda.setSearchTerm = term => {
        data.agenda.searchTerm = term;
        data.agenda.filteredContacts = contacts.filter(row => row.name.toLowerCase().includes(term.toLowerCase()));
        data.notify('agenda');
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
      await grab('pos-ticket', '[role="dialog"]', '', '[role="dialog"] button[aria-label="Aumentar Pan artesanal"]');
      await click('[role="dialog"] button[aria-label="Aumentar Pan artesanal"]');
      await has('[role="dialog"] .pos-ticket-total', '10\\.00');
      await grab('pos-total', '[role="dialog"] .pos-ticket-total');
      return 'Búsqueda y tres toques; 5,00 → 10,00; no se cobra.';
    });
    await run('catalog', async () => {
      await view('categories');
      await grab('categories', '.workspace-page', 'Panes', 'h1', 'Categorías');
      await view('products');
      await grab('products', '.workspace-page', 'Pan artesanal', productSearch, '');
      await search(productSearch, 'Pan artesanal');
      await has('.workspace-page', 'Inventario de la Sede');
      assert.ok(!(await evaluate(() => document.querySelector('.workspace-page').innerText)).includes('Café molido'));
      await grab('product-search', '.workspace-page', '', 'span', '100 disp');
      return 'Categorías y búsqueda con resultado visible y 100 unidades en sede Centro.';
    });
    await run('branches', async () => {
      await view('products');
      await grab('branch-before', branch);
      await choose(branch, 'p09-branch-norte');
      await grab('branch-after', branch);
      await has('.workspace-page', '24 disp');
      await grab('branch-stock', '.workspace-page', '', 'span', '24 disp');
      await choose(branch, 'p09-branch');
      return 'Selector Centro → Norte; el mismo producto pasa de 100 a 24 unidades sintéticas.';
    });
    await run('orders', async () => {
      await view('contracts');
      await grab('orders-active', 'button[aria-pressed="true"]', 'Pedidos en Curso');
      await click('button', 'Cuentas por Cobrar');
      await has('button[aria-pressed="true"]', 'Cuentas por Cobrar');
      await grab('orders-debt', 'button[aria-pressed="true"]', 'Cuentas por Cobrar');
      await click('button', 'Historial Cerrados');
      await has('button[aria-pressed="true"]', 'Historial Cerrados');
      await grab('orders-closed', 'button[aria-pressed="true"]', 'Historial Cerrados');
      await view('agenda');
      const query = 'input[placeholder^="Buscar contacto"]';
      await grab('agenda', query);
      await search(query, 'Almendra');
      await has('.workspace-page', 'Almendra');
      assert.ok(!(await evaluate(() => document.querySelector('.workspace-page').innerText)).includes('Naranja'));
      await grab('agenda-search', '.workspace-page', '', 'h3, strong, p', 'Cliente Almendra');
      return 'Pedidos en curso, cuentas por cobrar, historial cerrado y búsqueda de contacto demo.';
    });
    await run('history', async () => {
      await view('history');
      await grab('history', 'article', 'Venta registrada');
      await click('article button', '^Ver detalle$');
      await grab('history-items', '[role="dialog"]', 'Productos del ticket');
      return 'Fecha y estado de venta sintética, más diálogo real de productos.';
    });
    await run('reports', async () => {
      await view('reports');
      const periodGroup = '[aria-label="Período del reporte"]';
      await grab('report-today', periodGroup, '', `${periodGroup} button[aria-pressed="true"]`, '^Hoy$');
      for (const [id, label] of [['week', 'Esta semana'], ['month', 'Este mes'], ['year', 'Este año']]) {
        await click(`${periodGroup} button`, label);
        await grab(`report-${id}`, periodGroup, '', `${periodGroup} button[aria-pressed="true"]`, label);
      }
      await click(`${periodGroup} button`, 'Esta semana');
      await grab('report-metric', 'h2', 'Tickets POS');
      await grab('report-chart', '[aria-label="Gráfico de ventas"]');
      return 'Hoy, semana, mes y año con selección real; tarjetas y gráfico sintéticos.';
    });
    await run('export', async () => {
      await view('export');
      await has('.export-toolbar button[type="submit"]', 'Preparar informe PDF');
      await grab('export-pdf', '.export-toolbar', '', '.export-toolbar button[type="submit"]');
      await choose('.export-toolbar select:has(option[value="excel"])', 'excel');
      await has('.export-toolbar button[type="submit"]', 'Descargar detalle Excel');
      await grab('export-excel', '.export-toolbar', '', '.export-toolbar button[type="submit"]');
      return 'Se comprobaron selector y etiquetas. No se imprimió ni se descargó.';
    });
    await run('cash', async () => {
      await view('cash-summary');
      await has('[role="dialog"]', 'Referencia calculada');
      await has('[role="dialog"]', 'Dinero contado');
      await grab('cash', '[role="dialog"] dl');
      await has('[role="dialog"]', 'Por revisar');
      await grab('cash-warning', '[role="dialog"] dl', '', '[role="dialog"] dd', '^Por revisar$');
      return 'Referencia y conteo, con conciliación provisional visible.';
    });
    await run('staff', async () => {
      await view('users');
      await grab('staff', 'article', 'Cajera Demo');
      await has('article', '08:00');
      await click('button', '^Editar$');
      await grab('staff-edit', '[role="dialog"]', 'Editar Perfil', '[role="dialog"] select', '');
      return 'Cajera demo, sede Norte, turno 08:00–16:00 y ficha abierta como dueño. No se guarda.';
    });
    await run('settings', async () => {
      await view('settings');
      await grab('settings', 'dd', 'Panadería Horizonte Demo');
      await click('button', 'Mostrar Sucursales');
      await has('button[aria-expanded="true"]', 'Ocultar Sucursales');
      await grab('settings-branches', '#settings-branches', '', 'h4', '^Sede Centro demo$');
      return 'Datos comerciales ficticios y panel de Sucursales abierto, sin cambios.';
    });
    assert.deepEqual([...external], [], 'Se intentó una conexión fuera del fixture aislado.');
  },
});

const oldShots = requested.size ? JSON.parse(await readFile(file('.cache/shots.json'), 'utf8').catch(() => '{}')) : {};
const oldEvidence = requested.size ? JSON.parse(await readFile(file('.cache/evidence.json'), 'utf8').catch(() => '{}')) : {};
await writeFile(file('.cache/shots.json'), JSON.stringify({...oldShots, ...shots}, null, 2));
await writeFile(file('.cache/evidence.json'), JSON.stringify({...oldEvidence, ...evidence}, null, 2));
assert.ok(Object.values(evidence).every(({ok}) => ok), 'Hay capítulos pendientes. Consulte .cache/evidence.json.');
console.log(`${Object.keys(shots).length} tomas aisladas · 0 solicitudes externas`);


