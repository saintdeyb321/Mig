import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

const path = name => fileURLToPath(new URL('../frontend/src/' + name, import.meta.url)).replaceAll('\\', '/');
const mockHooks = Object.fromEntries([
  ['features/catalog/hooks/useCategories.js', 'useCategories', 'categories'], ['features/catalog/hooks/useProducts.js', 'useProducts', 'products'],
  ['features/customers/hooks/useAgenda.js', 'useAgenda', 'agenda'], ['features/settings/hooks/useSettings.js', 'useSettings', 'settings'],
  ['features/branches/hooks/useBranches.js', 'useBranches', 'branches'], ['features/users/hooks/useUserManagement.js', 'useUserManagement', 'users'],
  ['features/reports/hooks/useReports.js', 'useReports', 'reports'], ['features/contracts/hooks/useContracts.js', 'useContracts', 'contracts'],
  ['features/sales/hooks/useSalesHistory.js', 'useSalesHistory', 'history'], ['hooks/useSuperAdmin.js', 'useSuperAdmin', 'admin'],
  ['features/cash-register/hooks/useCashRegister.js', 'useCashRegister', 'cash'], ['features/backups/hooks/useLocalBackup.js', 'useLocalBackup', 'backup'],
].map(([file, name, key]) => [path(file), `export function ${name}(){return window.__p09.${key};}`]));
const moduleMocks = { ...mockHooks,
  [path('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [path('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [path('features/reports/hooks/useExportSales.js')]: 'export function useExportSales(){return {isExporting:false,exportData:()=>window.__p09.forbidden()};}',
  [path('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [path('features/sales/infrastructure/saleTransactions.js')]: `export const saveSaleTransaction=()=>window.__p09.forbidden();
    export const saveSaleDraftTransaction=()=>window.__p09.forbidden();export const verifyPendingSaleTransaction=async()=>{};
    export const subscribeSaleAcknowledgement=()=>()=>{};export const reviewDraftSaleTransaction=()=>window.__p09.forbidden();export const confirmDraftSaleTransaction=()=>window.__p09.forbidden();`,
};

it('P09 verifies actual views, viewport-bound checkout, dialog focus/busy, role navigation and contrast in isolated Chromium', { timeout: 180000 }, async () => {
  const index = await readFile(new URL('../frontend/dist/index.html', import.meta.url), 'utf8');
  const cssPath = index.match(/href="([^\"]+\.css)"/)[1];
  const css = await readFile(new URL('../frontend/dist' + cssPath, import.meta.url), 'utf8');
  const checks = [], screenshots = [];
  await runBrowserFixture({ htmlFile: new URL('./plan09.browser.html', import.meta.url), route: '/plan09-ux', fixture: { css }, moduleMocks,
    setupPage: async page => {
      await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    },
    inspectPage: async page => {
      const evaluate = async (fn, ...args) => {
        const response = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
        assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
        return response.result.value;
      };
      const frames = () => evaluate(async () => { await window.__p09.frames(); });
      const viewport = async (width, height) => { await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); await frames(); };
      const show = async (name, role = 'dueño') => {
        const failure = await evaluate(async (name, role) => { await window.__p09.show(name, role); window.scrollTo(0, 0); await window.__p09.frames(); return window.__p09.renderError; }, name, role);
        assert.ok(!failure, `Render ${name}: ${failure}`);
      };
      const capture = async name => { await new Promise(resolve => setTimeout(resolve, 220)); const result = await page.send('Page.captureScreenshot', { format: 'png' }); await mkdir('.release/plan09-visual', { recursive: true }); await writeFile('.release/plan09-visual/' + name + '.png', Buffer.from(result.data, 'base64')); screenshots.push(name); };
      const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };

      await evaluate(async () => { const buttons = [...document.querySelectorAll('[aria-label="Catálogo de productos"] button')].filter(el => el.title.startsWith('Producto')); for (const button of buttons.slice(0, 8)) { button.click(); await window.__p09.frames(); } });
      const ticketBounds = () => evaluate(() => {
        const root = document.querySelector('aside[aria-label="Ticket"]'), card = root.querySelector('.pos-ticket'), action = card.querySelector('.pos-ticket-actions'), total = card.querySelector('.pos-ticket-total'), list = card.querySelector('.pos-ticket-items');
        return { height: card.getBoundingClientRect().height, bottom: card.getBoundingClientRect().bottom, actionBottom: action.getBoundingClientRect().bottom, totalBottom: total.getBoundingClientRect().bottom, scroll: list.scrollHeight > list.clientHeight, count: list.querySelectorAll('button[aria-label^="Quitar"]').length };
      });
      let bounds = await ticketBounds(); check(bounds.count === 8 && bounds.scroll && bounds.height <= 752, 'eight actual cart lines scroll inside a fixed-height ticket');
      await evaluate(async () => { window.scrollTo(0, 650); await window.__p09.frames(); });
      bounds = await ticketBounds(); check(bounds.actionBottom <= 800 && bounds.totalBottom <= 800, 'catalogue scroll keeps total and checkout action inside the viewport');
      await capture('pos-desktop');
      await viewport(1280, 480); bounds = await ticketBounds(); check(bounds.bottom <= 480 && bounds.actionBottom <= 480, 'low-height desktop preserves checkout action');
      await viewport(390, 700);
      check(await evaluate(() => document.querySelector('.pos-cart-launcher').getBoundingClientRect().bottom < document.querySelector('.app-bottom-nav').getBoundingClientRect().top), 'mobile cart access does not overlap bottom navigation');
      await evaluate(async () => { window.scrollTo(0, 0); document.querySelector('.pos-cart-launcher').click(); await window.__p09.frames(); });
      let drawer = await evaluate(() => { const d = document.querySelector('[role="dialog"]'); return { bottom: d.getBoundingClientRect().bottom, actionBottom: d.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom, count: d.querySelectorAll('button[aria-label^="Quitar"]').length }; });
      check(drawer.count === 8 && drawer.actionBottom <= 700, 'mobile drawer preserves all lines with its checkout action visible');
      await evaluate(async () => { const input = document.querySelector('[role="dialog"] input[inputmode="decimal"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '40.00'); input.dispatchEvent(new Event('input', { bubbles: true })); await window.__p09.frames(); });
      await capture('pos-mobile');
      await viewport(390, 390); drawer = await evaluate(() => { const d = document.querySelector('[role="dialog"]'); return { bottom: d.getBoundingClientRect().bottom, actionBottom: d.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom, height: d.getBoundingClientRect().height, viewport: visualViewport.height, inner: innerHeight, css: getComputedStyle(document.documentElement).getPropertyValue('--ui-viewport-height') }; });
      await capture('pos-keyboard');
      check(drawer.bottom <= 391 && drawer.actionBottom <= 391, 'keyboard-sized visible viewport contains the drawer and final action: ' + JSON.stringify(drawer));
      await evaluate(async () => { document.querySelector('[role="dialog"] input[inputmode="decimal"]').focus(); await window.__p09.frames(); });
      const focusBounds = await evaluate(() => { const d = document.querySelector('[role="dialog"]'), input = d.querySelector('input[inputmode="decimal"]'), field = input.getBoundingClientRect(), container = d.querySelector('.pos-ticket-payment'), payment = container.getBoundingClientRect(); return {field: [field.top,field.bottom], payment: [payment.top,payment.bottom], active: document.activeElement === input, scroll:container.scrollTop, height:container.clientHeight}; });
      await capture('pos-keyboard-focus');
      check(focusBounds.field[0] >= focusBounds.payment[0] - 1 && focusBounds.field[1] <= focusBounds.payment[1] + 1, 'payment focus scrolls into the visible payment region above the checkout action: '+JSON.stringify(focusBounds));
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      await viewport(390, 700); await evaluate(async () => { document.querySelector('.pos-cart-launcher').click(); await window.__p09.frames(); });
      check(await evaluate(() => document.querySelector('[role="dialog"] input[inputmode="decimal"]').value === '40.00'), 'closing and reopening the drawer preserves payment text');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      await viewport(768, 360); await evaluate(async () => { document.querySelector('.pos-cart-launcher').click(); await window.__p09.frames(); });
      check(await evaluate(() => document.querySelector('[role="dialog"] .pos-ticket-actions').getBoundingClientRect().bottom <= innerHeight), 'landscape tablet drawer retains its checkout action');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();

      const views = ['products', 'categories', 'agenda', 'reports', 'export', 'settings', 'users', 'branches', 'contracts', 'history', 'superadmin', 'backup', 'auth'];
      for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
        await viewport(width, 800);
        for (const name of views) { await show(name, ['superadmin', 'backup'].includes(name) ? 'superadmin' : 'dueño');
          check(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no global horizontal overflow: ${name} at ${width}px`); }
      }
      await viewport(640, 400); await show('contracts');
      check(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'equivalent 200-percent desktop reflow fits a 640px viewport');
      await viewport(1440, 900); await show('contracts'); await capture('contracts-desktop');
      await viewport(360, 640); await show('contractform');
      await capture('contract-form-mobile');
      const contractBounds = await evaluate(() => { const d = document.querySelector('[role="dialog"]'); return {button: d.querySelector('button[type="submit"]').getBoundingClientRect().bottom, panel: d.getBoundingClientRect().bottom, width: document.documentElement.scrollWidth, viewport: innerHeight, children: [...d.querySelectorAll('fieldset, form')].map(el => ({tag: el.tagName, height: el.getBoundingClientRect().height, flex: getComputedStyle(el).flex, minHeight:getComputedStyle(el).minHeight}))}; });
      check(contractBounds.button <= 640 && contractBounds.width <= 361, 'actual long contract form keeps its save action visible on mobile: '+JSON.stringify(contractBounds));
      await viewport(1280, 480); await frames();
      check(await evaluate(() => document.querySelector('[role="dialog"] button[type="submit"]').getBoundingClientRect().bottom <= innerHeight), 'actual contract form keeps its save action visible at low desktop height');
      await viewport(1280, 800);
      await show('history'); const historyText = await evaluate(() => document.getElementById('main-content').innerText);
      check(['Venta registrada', 'Sin cobrar', 'Por comprobar', 'Venta anulada', 'Revisión local'].every(text => historyText.includes(text)), 'financial statuses remain visually distinct and rejections stay secondary');
      await show('pos', 'cajero');
      check(await evaluate(() => !document.querySelector('[aria-label="Módulos"] button[title="Personal"]')), 'cashier navigation does not expose owner modules');
      await show('superadmin', 'superadmin');
      check(await evaluate(() => !document.querySelector('[aria-label="Módulos"] button[title="Punto de venta"]')), 'platform navigation excludes operational modules');
      await capture('platform-desktop');

      await evaluate(() => { window.__p09.categories.isLoading = true; }); await show('categories');
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Organizando categorías')), 'loading state remains explicit');
      await evaluate(() => { window.__p09.categories.isLoading = false; window.__p09.categories.filteredCategories = []; }); await show('categories');
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Sin registros')), 'empty state remains actionable and legible');
      await evaluate(() => { window.__p09.reports.error = { code: 'unavailable', message: 'Conexión de prueba interrumpida' }; window.__p09.reports.hasData = false; }); await show('reports');
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Reintentar')), 'query failure retains a recovery action');
      await show('pos'); await evaluate(async () => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); await window.__p09.frames(); });
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Guardar sin cobrar') && !document.getElementById('main-content').innerText.includes('Venta registrada')), 'offline presentation does not turn an unsent ticket into revenue');
      await evaluate(async () => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); window.__p09.setBranch('global'); await window.__p09.frames(); });
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Modo lectura')), 'global branch preserves the read-only presentation');
      await evaluate(async () => { window.__p09.setBranch('p09-branch'); window.__p09.cash.isExpired = true; await window.__p09.frames(); }); await show('pos');
      check(await evaluate(() => document.getElementById('main-content').innerText.includes('Caja vencida')), 'expired cash remains visibly blocked');
      await evaluate(() => { window.__p09.cash.isExpired = false; });

      await viewport(360, 640); await show('dialogs');
      await evaluate(async () => { const t = document.getElementById('p09-trigger'); t.focus(); t.click(); await window.__p09.frames(); });
      check(await evaluate(() => document.activeElement.id === 'p09-value'), 'dialog focuses its useful first field');
      for (let i = 0; i < 17; i++) { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); }
      check(await evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), 'Tab remains inside the modal focus trap');
      await evaluate(async () => { const b = document.getElementById('p09-nested'); b.focus(); b.click(); await window.__p09.frames(); });
      check(await evaluate(() => Boolean(document.querySelector('[role="alertdialog"]'))), 'nested Radix confirmation remains operable');
      await evaluate(async () => { const b = [...document.querySelectorAll('[role="alertdialog"] button')].find(el => el.textContent === 'Confirmar'); b.click(); b.click(); await window.__p09.frames(); });
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      check(await evaluate(() => window.__p09.calls === 1 && Boolean(document.querySelector('[role="alertdialog"]'))), 'busy confirmation prevents Escape and duplicate confirmation');
      await evaluate(async () => { window.__p09.confirmReject(Error('Fallo de prueba: conserva el formulario')); await window.__p09.frames(); });
      check(await evaluate(() => document.querySelector('[role="alertdialog"]').innerText.includes('Fallo de prueba')), 'failed confirmation retains the dialog and explains the error');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      check(await evaluate(() => document.activeElement.id === 'p09-nested' && document.getElementById('p09-value').value === 'Valor conservado'), 'nested close restores focus and parent form values');
      await evaluate(async () => { window.__p09.dialog.setBusy(true); await window.__p09.frames(); });
      check(await evaluate(() => [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] button')].every(el => el.disabled || el.matches(':disabled'))), 'real fieldset disables controls only while busy');
      await evaluate(async () => { window.__p09.dialog.setBusy(false); await window.__p09.frames(); });
      check(await evaluate(() => !document.getElementById('p09-submit').matches(':disabled')), 'valid form action re-enables after busy');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      check(await evaluate(() => document.activeElement.id === 'p09-trigger'), 'closing the parent returns focus to its trigger');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      check(await evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced motion is available without changing semantic state');
      await evaluate(() => window.__p09.stop());
    },
  });
  console.log(JSON.stringify({ checks: checks.length, screenshots }));
});
