import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readBrowserBuildCss, runBrowserFixture} from '../../../tests/helpers/browserHarness.mjs';

const frontend = name => fileURLToPath(new URL(`../../../frontend/src/${name}`, import.meta.url)).replaceAll('\\', '/');
const hooks = [
  ['catalog/hooks/useCategories.js', 'useCategories', 'categories'],
  ['catalog/hooks/useProducts.js', 'useProducts', 'products'],
  ['cash-register/hooks/useCashRegister.js', 'useCashRegister', 'cash'],
  ['contracts/hooks/useContracts.js', 'useContracts', 'contracts'],
  ['customers/hooks/useAgenda.js', 'useAgenda', 'agenda'],
  ['branches/hooks/useBranches.js', 'useBranches', 'branches'],
  ['backups/hooks/useLocalBackup.js', 'useLocalBackup', 'backup'],
  ['reports/hooks/useReports.js', 'useReports', 'reports'],
  ['sales/hooks/useSalesHistory.js', 'useSalesHistory', 'history'],
  ['settings/hooks/useSettings.js', 'useSettings', 'settings'],
  ['users/hooks/useUserManagement.js', 'useUserManagement', 'users'],
];
const moduleMocks = Object.fromEntries(hooks.map(([file, hook, key]) => [
  frontend(`features/${file}`),
  `import {useSyncExternalStore} from 'react';
  export function ${hook}() {
    const fixture = window.__p09;
    useSyncExternalStore(next => fixture.watch('${key}', next), () => fixture.revisions['${key}'] ?? 0);
    return fixture.${key};
  }`,
]));

Object.assign(moduleMocks, {
  [frontend('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [frontend('hooks/useSuperAdmin.js')]: 'export function useSuperAdmin(){return window.__p09.admin;}',
  [frontend('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [frontend('features/reports/hooks/useExportSales.js')]: 'export function useExportSales(){return {isExporting:false,exportData:()=>window.__p09.forbidden()};}',
  [frontend('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [frontend('features/payments/infrastructure/paymentRepository.js')]: 'export const getPaymentsByContract=async()=>window.__p09.ledger;',
  [frontend('features/licenses/infrastructure/platformBusinessRepository.js')]: 'export const readPlatformBusiness=async()=>window.__p09.platformDetail;',
  [frontend('features/sales/hooks/useRecentSales.js')]: 'export function useRecentSales(){return {sales:[],rejected:[],isLoading:false};}',
  [frontend('features/sales/infrastructure/saleTransactions.js')]: `
    const forbidden = () => window.__p09.forbidden();
    export const saveSaleTransaction=forbidden, saveSaleDraftTransaction=forbidden,
      verifyPendingSaleTransaction=forbidden, reviewDraftSaleTransaction=forbidden,
      confirmDraftSaleTransaction=forbidden, subscribeSaleAcknowledgement=()=>()=>{},
      subscribeVoidAttempts=()=>()=>{}, recoverFinancialReceipts=forbidden;
  `,
});

const captures = new Map();
const css = await readBrowserBuildCss();

await runBrowserFixture({
  htmlFile: new URL('../../../tests/plan09.browser.html', import.meta.url),
  route: '/plan09-ux',
  fixture: {css},
  moduleMocks,
  firebaseSdk: false,
  headers: {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'",
  },
  setupPage: async page => {
    await page.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 1100, deviceScaleFactor: 2, mobile: false});
    await page.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  },
  inspectPage: async page => {
    const evaluate = async (fn, ...args) => {
      const response = await page.send('Runtime.evaluate', {
        expression: `(${fn.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')})`,
        awaitPromise: true,
        returnByValue: true,
      });
      assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
      return response.result.value;
    };

    const show = async view => {
      const failure = await evaluate(async name => {
        await window.__p09.show(name, 'dueño');
        return window.__p09.renderError;
      }, view);
      assert.ok(!failure, failure);
    };

    const capture = async (name, target, expected) => {
      const clip = await evaluate((select, text) => {
        const heading = [...document.querySelectorAll('h1, h2')].find(node => node.textContent === text);
        const first = select === 'ticket' ? document.querySelector('.pos-ticket-heading')
          : select === 'cash' ? document.querySelector('[role="dialog"]') : heading?.closest('header');
        const last = select === 'ticket' ? document.querySelector('.pos-ticket-total')
          : select === 'inventory' ? [...document.querySelectorAll('h3')].find(node => node.textContent.includes('Inventario'))?.nextElementSibling?.children[1]
          : select === 'reports' ? [...document.querySelectorAll('h2')].find(node => node.textContent === 'Evolución de ventas')?.parentElement?.parentElement
          : first;
        if (!first || !last) throw Error(`Recorte no localizado: ${select}`);
        const start = first.getBoundingClientRect();
        const end = last.getBoundingClientRect();
        const y = Math.floor(start.top + scrollY);
        return {x: Math.floor(start.left + scrollX), y, width: Math.floor(start.width), height: Math.ceil(end.bottom + scrollY - y), scale: 1};
      }, target, expected);
      assert.ok(clip.width > 200 && clip.height > 80 && clip.x >= 0 && clip.y >= 0, `Recorte inválido: ${name}`);
      const {data} = await page.send('Page.captureScreenshot', {
        format: 'png', clip, captureBeyondViewport: true, fromSurface: true,
      });
      captures.set(name, Buffer.from(data, 'base64'));
    };

    await show('pos');
    const before = await evaluate(async () => {
      document.querySelector('[aria-label="Catálogo de productos"] button[title="Producto de prueba 0"]').click();
      await window.__p09.frames();
      // Remove the empty scroll area from the shot, keeping the real row and total.
      const items = document.querySelector('.pos-ticket-items');
      items.style.setProperty('flex', '0 0 auto', 'important');
      items.style.setProperty('min-height', '0', 'important');
      return document.querySelector('.pos-ticket-total strong').textContent.trim();
    });
    assert.equal(before, 'S/ 5.00');
    await capture('ticket', 'ticket', 'Ticket de venta');
    const after = await evaluate(async () => {
      document.querySelector('button[aria-label="Aumentar Producto de prueba 0"]').click();
      await window.__p09.frames();
      return document.querySelector('.pos-ticket-total strong').textContent.trim();
    });
    assert.equal(after, 'S/ 10.00');
    await capture('ticket-updated', 'ticket', 'Ticket de venta');

    await page.send('Emulation.setDeviceMetricsOverride', {width: 760, height: 1250, deviceScaleFactor: 2, mobile: false});
    await show('products');
    assert.match(await evaluate(() => document.querySelector('.workspace-page').innerText), /100 disp\./);
    await capture('inventory', 'inventory', 'Productos');
    await show('reports');
    const report = await evaluate(() => document.querySelector('.workspace-page').innerText);
    assert.match(report, /Tickets POS/);
    assert.match(report, /Evolución de ventas/);
    await evaluate(() => {
      // Stage only the period, ticket metric and chart from the real report.
      const page = document.querySelector('.workspace-page');
      const metricLabel = [...page.querySelectorAll('h2')].find(node => node.textContent === 'Tickets POS');
      const metricGrid = [...page.children].find(child => child.contains(metricLabel));
      const metric = [...metricGrid.children].find(child => child.contains(metricLabel));
      const chart = page.querySelector('[aria-label="Gráfico de ventas"]').parentElement;
      for (const child of page.children) {
        if (child.tagName !== 'HEADER' && child !== metricGrid && child !== chart.parentElement) {
          child.style.display = 'none';
        }
      }
      for (const child of metricGrid.children) {
        if (child !== metric) child.style.display = 'none';
      }
      metricGrid.style.gridTemplateColumns = '1fr';
      for (const child of chart.parentElement.children) {
        if (child !== chart) child.style.display = 'none';
      }
    });
    await capture('reports', 'reports', 'Dashboard gerencial');
    await show('cash-summary');
    const cash = await evaluate(() => document.querySelector('[role="dialog"]').innerText);
    assert.match(cash, /Por revisar/);
    assert.match(cash, /Dinero contado/);
    await capture('cash', 'cash', 'Revisa el conteo');
  },
});

const out = new URL('../public/assets/demo/', import.meta.url);
await mkdir(out, {recursive: true});
for (const [name, bytes] of captures) await writeFile(new URL(`${name}.png`, out), bytes);
console.log(`Plan 09 aislado: ${captures.size} recortes con datos sintéticos.`);
