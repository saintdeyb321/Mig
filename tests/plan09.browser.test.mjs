import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readBrowserBuildCss, runBrowserFixture } from './helpers/browserHarness.mjs';

const path = name => fileURLToPath(new URL('../frontend/src/' + name, import.meta.url)).replaceAll('\\', '/');
const mockHooks = Object.fromEntries([
  ['features/catalog/hooks/useCategories.js', 'useCategories', 'categories'], ['features/catalog/hooks/useProducts.js', 'useProducts', 'products'],
  ['features/customers/hooks/useAgenda.js', 'useAgenda', 'agenda'], ['features/settings/hooks/useSettings.js', 'useSettings', 'settings'],
  ['features/branches/hooks/useBranches.js', 'useBranches', 'branches'], ['features/users/hooks/useUserManagement.js', 'useUserManagement', 'users'],
  ['features/reports/hooks/useReports.js', 'useReports', 'reports'], ['features/contracts/hooks/useContracts.js', 'useContracts', 'contracts'],
  ['features/sales/hooks/useSalesHistory.js', 'useSalesHistory', 'history'], ['hooks/useSuperAdmin.js', 'useSuperAdmin', 'admin'],
  ['features/cash-register/hooks/useCashRegister.js', 'useCashRegister', 'cash'], ['features/backups/hooks/useLocalBackup.js', 'useLocalBackup', 'backup'],
].map(([file, name, key]) => [path(file), `import {useSyncExternalStore} from 'react';
  export function ${name}(){useSyncExternalStore(next=>window.__p09.watch('${key}',next),()=>window.__p09.revisions['${key}']??0);return window.__p09.${key};}`]));
const moduleMocks = { ...mockHooks,
  [path('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [path('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [path('features/reports/hooks/useExportSales.js')]: 'export function useExportSales(){return {isExporting:false,exportData:()=>window.__p09.forbidden()};}',
  [path('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [path('features/payments/infrastructure/paymentRepository.js')]: 'export const getPaymentsByContract=async()=>window.__p09.ledger;',
  [path('features/licenses/infrastructure/platformBusinessRepository.js')]: 'export const readPlatformBusiness=async()=>window.__p09.platformDetail;',
  [path('features/sales/infrastructure/saleTransactions.js')]: `export const saveSaleTransaction=()=>window.__p09.forbidden();
    export const saveSaleDraftTransaction=()=>window.__p09.forbidden();export const verifyPendingSaleTransaction=async()=>{};
    export const subscribeSaleAcknowledgement=()=>()=>{};export const reviewDraftSaleTransaction=()=>window.__p09.forbidden();export const confirmDraftSaleTransaction=()=>window.__p09.forbidden();`,
};

it('P14-RC compares the shared palette in actual modules and keeps checkout and keyboard focus visible', { timeout: 180000 }, async () => {
  const css = await readBrowserBuildCss();
  const phase = process.env.MIGAPOS_TEST_CREAM_PHASE === 'before' ? 'before' : 'after';
  const output = `.release/qa-p14-rc/${phase}`;
  await mkdir(output, { recursive: true });
  const measurements = [];
  await runBrowserFixture({ htmlFile: new URL('./plan09.browser.html', import.meta.url), route: '/p14-cream', fixture: { css }, moduleMocks,
    async inspectPage(page) {
      const evaluate = async (fn, ...args) => {
        const result = await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const viewport = (width, height) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      const show = (name) => evaluate(async name => { await window.__p09.show(name); scrollTo(0, 0); await window.__p09.frames(); }, name);
      const capture = async name => {
        await evaluate(async () => {
          await Promise.allSettled(document.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished));
        });
        const shot = await page.send('Page.captureScreenshot', { format: 'png' }, 15000);
        await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'));
      };
      const views = ['reports', 'pos', 'history', 'contracts', 'cash-close', 'users', 'settings', 'export', 'products', 'categories'];
      for (const [width, height] of [[375, 667], [768, 1024], [1280, 560], [1440, 900]]) {
        await viewport(width, height);
        for (const view of views) {
          await show(view);
          const actual = await evaluate(() => {
            const main = document.querySelector('#main-content');
            const sidebar = document.querySelector('.nebula-brand');
            const active = sidebar.querySelector('[aria-current="page"]');
            return { error: window.__p09.renderError, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              canvas: getComputedStyle(main.closest('.bg-canvas')).backgroundColor,
              panel: getComputedStyle(document.documentElement).getPropertyValue('--color-panel').trim(),
              sidebar: getComputedStyle(sidebar).backgroundImage, active: active && getComputedStyle(active).backgroundColor };
          });
          assert.ok(!actual.error && actual.width === width && actual.scrollWidth <= width + 1, JSON.stringify({ view, width, actual }));
          if (phase === 'after') {
            assert.equal(actual.canvas, 'rgb(255, 254, 250)');
            assert.equal(actual.panel, '#fffefc');
            assert.match(actual.sidebar, /linear-gradient/);
          }
          measurements.push({ view, width, height, ...actual });
          if (width === 1440 || width === 375) await capture(`${view}-${width}`);
          if (view === 'cash-close') await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        }
      }
      await viewport(1280, 560);
      await show('pos');
      await evaluate(async () => {
        const products = [...document.querySelectorAll('[aria-label="Catálogo de productos"] button')].filter(el => el.title.startsWith('Producto'));
        for (const button of products.slice(0, 8)) { button.click(); await window.__p09.frames(); }
      });
      const checkout = await evaluate(async () => {
        const ticket = document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
        const input = ticket.querySelector('input[inputmode="decimal"]');
        input.focus();
        await window.__p09.frames();
        const field = input.getBoundingClientRect(), payment = ticket.querySelector('.pos-ticket-payment').getBoundingClientRect();
        return { total: ticket.querySelector('.pos-ticket-total').getBoundingClientRect().bottom, charge: ticket.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom,
          field: [field.top, field.bottom], payment: [payment.top, payment.bottom], items: ticket.querySelectorAll('button[aria-label^="Quitar"]').length, scroll: scrollY };
      });
      assert.ok(checkout.total <= 560 && checkout.charge <= 560 && checkout.items === 8 && checkout.scroll === 0
        && checkout.field[0] >= checkout.payment[0] - 1 && checkout.field[1] <= checkout.payment[1] + 1, JSON.stringify(checkout));
      assert.ok(await evaluate(async () => {
        const ticket = document.querySelector('aside[aria-label="Ticket"] .pos-ticket');
        const button = ticket.querySelector('.pos-ticket-actions button');
        const wasDisabled = button.disabled;
        const input = ticket.querySelector('input[inputmode="decimal"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '40.00');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await window.__p09.frames();
        return wasDisabled && !button.disabled;
      }), 'Checkout becomes available after the exact amount is entered');
      await capture('pos-1280x560');
      await viewport(375, 667);
      const drawer = await evaluate(async () => {
        const trigger = document.querySelector('.pos-cart-launcher');
        trigger.focus();
        trigger.click();
        await window.__p09.frames();
        const panel = document.querySelector('[role="dialog"]');
        return { total: panel.querySelector('.pos-ticket-total').getBoundingClientRect().bottom,
          charge: panel.querySelector('.pos-ticket-actions').getBoundingClientRect().bottom, focus: panel.contains(document.activeElement) };
      });
      assert.ok(drawer.total <= 667 && drawer.charge <= 667 && drawer.focus, JSON.stringify(drawer));
      await capture('pos-drawer-375');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      const returnedFocus = await evaluate(async () => {
        for (let frame = 0; frame < 30; frame++) {
          if (!document.querySelector('[role="dialog"]') && document.activeElement.matches('.pos-cart-launcher')) return { restored: true };
          await window.__p09.frames();
        }
        return { restored: false, dialog: Boolean(document.querySelector('[role="dialog"]')), active: document.activeElement.outerHTML };
      });
      assert.ok(returnedFocus.restored, 'Escape closes the drawer and restores focus to the focused launch button ' + JSON.stringify(returnedFocus));
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await show('reports');
      assert.ok(await evaluate(() => getComputedStyle(document.querySelector('.workspace-page')).animationName === 'none'));
      await viewport(1440, 900);
      const accessibility = await evaluate(() => {
        const tokens = getComputedStyle(document.documentElement);
        const rgb = name => tokens.getPropertyValue(`--color-${name}`).trim().match(/\w\w/g).map(hex => parseInt(hex, 16));
        const mix = (base, overlay, weight) => base.map((value, index) => value * (1 - weight) + overlay[index] * weight);
        const luminance = color => color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const ratio = (a, b) => { const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (high + 0.05) / (low + 0.05); };
        const hasSelectionColor = Boolean(tokens.getPropertyValue('--color-sidebar-active').trim());
        const lightSidebar = mix(mix(rgb('sidebar-end'), rgb('stellar'), hasSelectionColor ? 0.13 : 0.22), rgb('nebula'), hasSelectionColor ? 0.17 : 0.22);
        const active = document.querySelector('.nebula-brand [aria-current="page"]');
        active.focus();
        const pairs = [['ink', 'canvas', 4.5], ['muted', 'subtle', 4.5], ['muted', 'panel', 4.5], ['control', 'panel', 3],
          ['focus', 'panel', 3], ['success', 'success-soft', 4.5], ['warning', 'warning-soft', 4.5], ['danger', 'danger-soft', 4.5]];
        const measured = pairs.map(([a, b, minimum]) => ({ name: `${a}/${b}`, ratio: ratio(rgb(a), rgb(b)), minimum }));
        measured.push({ name: 'sidebar text/gradient bound', ratio: ratio(rgb('sidebar-muted'), lightSidebar), minimum: 4.5 },
          { name: 'white/primary', ratio: ratio([255, 255, 255], rgb('primary')), minimum: 4.5 },
          { name: 'sidebar focus/gradient bound', ratio: ratio(rgb('sidebar-glow'), lightSidebar), minimum: 3 });
        if (hasSelectionColor) measured.push(
          { name: 'white/selected sidebar', ratio: ratio([255, 255, 255], rgb('sidebar-active')), minimum: 4.5 },
          { name: 'selection border/gradient bound', ratio: ratio(rgb('sidebar-active-line'), lightSidebar), minimum: 3 });
        return { measured, focus: getComputedStyle(active).outlineWidth, selected: active.getAttribute('aria-current') };
      });
      assert.ok(accessibility.selected === 'page' && parseFloat(accessibility.focus) >= 2, JSON.stringify(accessibility));
      for (const pair of accessibility.measured) assert.ok(pair.ratio >= pair.minimum, JSON.stringify(pair));
      await writeFile(`${output}/measurements.json`, JSON.stringify({ measurements, checkout, drawer, accessibility }, null, 2));
      await evaluate(() => window.__p09.stop());
    } });
});

it('P09 verifies actual views, viewport-bound checkout, dialog focus/busy, role navigation and contrast in isolated Chromium', { timeout: 180000 }, async () => {
  const css = await readBrowserBuildCss();
  const artifacts = process.env.MIGAPOS_TEST_ARTIFACT_DIR || '.release';
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
      const capture = async name => { await new Promise(resolve => setTimeout(resolve, 220)); const result = await page.send('Page.captureScreenshot', { format: 'png' }); const directory = artifacts + (name.startsWith('p0907-') ? '/p0907-visual' : '/plan09-visual'); await mkdir(directory, { recursive: true }); await writeFile(directory + '/' + name + '.png', Buffer.from(result.data, 'base64')); screenshots.push(name); };
      const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };

      await viewport(390,740); await show('users');
      await evaluate(async () => { [...document.querySelectorAll('header button')].find(el=>el.textContent.trim()==='Nuevo empleado').click(); await window.__p09.frames(); });
      const personnel = await evaluate(() => { const d=document.querySelector('[role="dialog"]'); return {footer:d.querySelector('button[type="submit"]').parentElement.getBoundingClientRect().bottom,panel:d.getBoundingClientRect().bottom,viewport:innerHeight}; });
      await capture('p0907-form-users-mobile');
      check(personnel.footer <= personnel.panel + 1 && personnel.panel <= personnel.viewport + 1, 'personnel form actions fit in mobile: '+JSON.stringify(personnel));
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'}); await frames();
      await viewport(1280,800); await show('pos');

      for (const [view, label, title, editingKey, editTitle] of [
        ['agenda', 'Nuevo contacto', 'Nuevo contacto', 'editing', 'Editar contacto'],
        ['branches', 'Nueva sede', 'Nueva sede', 'editingBranch', 'Editar sede'],
      ]) {
        await show(view);
        await evaluate(async label => { const button = [...document.querySelectorAll('#main-content button')].find(el => el.textContent.trim() === label); button.focus(); button.click(); await window.__p09.frames(); }, label);
        check(await evaluate(title => { const d = document.querySelector('[role="dialog"]'); return d.querySelector('h2').textContent.trim() === title && !d.innerText.includes('<Plus') && d.contains(document.activeElement) && !d.querySelector('input').matches(':disabled'); }, title), `${view} opens a readable title, enabled form and initial focus`);
        await evaluate(async () => { document.querySelector('[role="dialog"] button[aria-label="Cerrar diálogo"]').click(); await window.__p09.frames(); });
        check(await evaluate(label => document.activeElement.textContent.trim() === label && !document.querySelector('[role="dialog"]'), label), `${view} returns focus to its unchanged create button`);
        await evaluate(async (view, key) => { window.__p09[view][key] = key === 'editing' ? 'existing' : {id:'existing'}; window.__p09[view].setShowFormModal(true); await window.__p09.frames(); }, view, editingKey);
        check(await evaluate(title => document.querySelector('[role="dialog"] h2').textContent.trim() === title, editTitle), `${view} editing title is also plain readable text`);
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      }
      await show('superadmin', 'superadmin');
      await viewport(1280,560); await capture('p16-negocios-1280x560');
      await viewport(390,844); await capture('p16-negocios-390x844');
      await viewport(1280,800);
      check(await evaluate(() => [...document.querySelectorAll('header button')].some(el => el.textContent.trim() === 'Agregar negocio' && !el.disabled)), 'SuperAdmin exposes the Spark create action');
      await evaluate(async () => { [...document.querySelectorAll('header button')].find(el => el.textContent.trim() === 'Agregar negocio').click(); await window.__p09.frames(); });
      check(await evaluate(() => document.querySelector('[role="dialog"] h2').textContent === 'Agregar negocio' && Boolean(document.querySelector('[role="dialog"] form'))), 'the SuperAdmin action opens its labeled create form');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await frames();
      await show('pos');

      await evaluate(async () => { const buttons = [...document.querySelectorAll('[aria-label="Catálogo de productos"] button')].filter(el => el.title.startsWith('Producto')); for (const button of buttons.slice(0, 8)) { button.click(); await window.__p09.frames(); } });
      const ticketBounds = () => evaluate(() => {
        const root = document.querySelector('aside[aria-label="Ticket"]'), card = root.querySelector('.pos-ticket'), action = card.querySelector('.pos-ticket-actions'), total = card.querySelector('.pos-ticket-total'), list = card.querySelector('.pos-ticket-items');
        return { height: card.getBoundingClientRect().height, bottom: card.getBoundingClientRect().bottom, actionBottom: action.getBoundingClientRect().bottom, totalBottom: total.getBoundingClientRect().bottom, scroll: list.scrollHeight > list.clientHeight, count: list.querySelectorAll('button[aria-label^="Quitar"]').length };
      });
      let bounds = await ticketBounds(); check(bounds.actionBottom <= 800, 'checkout is visible immediately below the POS header before any page scroll'); check(bounds.count === 8 && bounds.scroll && bounds.height <= 752, 'eight actual cart lines scroll inside a fixed-height ticket');
      console.log(JSON.stringify({ checkout1280x800: bounds }));
      await evaluate(async () => { window.scrollTo(0, 650); document.querySelector('[aria-label="Catálogo de productos"]').scrollTop = 650; await window.__p09.frames(); });
      check(await evaluate(() => document.querySelector('[aria-label="Catálogo de productos"]').scrollTop > 0), 'the catalogue has its own scroll without moving checkout');
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
      await show('history');
      const history = await evaluate(() => {
        const list = document.querySelector('.sales-history');
        const labels = [...list.querySelectorAll('.history-grid article')].filter(card => !card.closest('details')).map(card => card.getAttribute('aria-label'));
        const review = list.querySelector('details');
        return { labels, secondary: !review.open && review.querySelector('summary').textContent.includes('Revisión local')
          && Boolean(review.querySelector('article[aria-label^="Venta no realizada"]')) };
      });
      check(['Venta registrada', 'Sin cobrar', 'Por comprobar', 'Venta anulada'].every(state => history.labels.some(label => label.startsWith(state)))
        && history.secondary, 'financial statuses remain distinct and rejections stay in the collapsed review');
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
      check(await evaluate(() => document.querySelector('aside[aria-label="Ticket"] .pos-ticket-actions').getBoundingClientRect().bottom <= innerHeight), 'offline shell notices do not push the ticket action below the viewport');
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

      const modalFailures = [];
      for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
        await viewport(width, width < 768 ? 740 : 900);
        for (const name of ['details', 'cancel', 'photo', 'quota', 'business', 'cash-open', 'cash-close', 'cash-summary']) {
          await show(name, ['quota', 'business'].includes(name) ? 'superadmin' : 'dueño');
          const metrics = await evaluate(() => { const d = document.querySelector('[role="dialog"], [role="alertdialog"]'), body = d.lastElementChild, rect = d.getBoundingClientRect(); return {top:rect.top,bottom:rect.bottom,viewport:innerHeight,scroll:body.scrollWidth,width:body.clientWidth,overflow:[...body.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1&&getComputedStyle(el).overflowX==='visible').slice(0,5).map(el=>[el.tagName,el.className,el.scrollWidth,el.clientWidth])}; });
          const fits = metrics.top >= -1 && metrics.bottom <= metrics.viewport + 1 && metrics.scroll <= metrics.width + 1;
          if (!fits) modalFailures.push({name,width,...metrics});
          else check(true, `${name} specialized modal fits without clipped horizontal content at ${width}px`);
          await capture(`p0907-${name}-${width}`);
        }
      }
      check(modalFailures.length === 0, 'specialized modal layout: '+JSON.stringify(modalFailures));
      for (const [kind, width, height] of [['desktop',1440,900],['mobile',390,740]]) {
        await viewport(width,height);
        for (const [view, role] of [['pos','dueño'],['contracts','dueño'],['superadmin','superadmin'],['contractform','dueño'],['details','dueño'],['cancel','dueño'],['photo','dueño'],['quota','superadmin'],['business','superadmin'],['cash-open','dueño'],['cash-close','dueño'],['cash-summary','dueño']]) {
          await show(view,role);
          if (view === 'pos') {
            await evaluate(async () => { document.querySelector('[aria-label="Catálogo de productos"] button[title="Producto de prueba 0"]').click(); await window.__p09.frames(); if(innerWidth < 1024){document.querySelector('.pos-cart-launcher').click();await window.__p09.frames();} });
          }
          await capture(`p0907-${view}-${kind}`);
        }
        for (const [view,label] of [['agenda','Nuevo contacto'],['branches','Nueva sede'],['products','Nuevo producto'],['users','Nuevo empleado']]) {
          await show(view); await evaluate(async label => { [...document.querySelectorAll('header button')].find(el => el.textContent.trim() === label).click(); await window.__p09.frames(); },label);
          const formMetrics = await evaluate(() => {const d=document.querySelector('[role="dialog"]');return {exists:Boolean(d),error:window.__p09.renderError,scroll:d?.lastElementChild.scrollWidth,width:d?.lastElementChild.clientWidth,literal:d?.innerText.includes('<Plus'),footer:d?.querySelector('button[type="submit"]')?.getBoundingClientRect().bottom,panel:d?.getBoundingClientRect().bottom,viewport:innerHeight};});
          check(formMetrics.exists && !formMetrics.literal && formMetrics.scroll <= formMetrics.width + 1, `${view} form stays readable in ${kind}: `+JSON.stringify(formMetrics));
          await capture(`p0907-form-${view}-${kind}`);
          await page.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape'}); await frames();
        }
      }
      await evaluate(() => window.__p09.stop());
    },
  });
  console.log(JSON.stringify({ checks: checks.length, screenshots }));
});
 
it('P19 measures the mobile shell and operational modules', { timeout: 180000 }, async () => {
  const css = await readBrowserBuildCss();
  const baseline = process.env.MIGAPOS_P19_PHASE === 'before';
  const output = '.release/qa-p19/' + (baseline ? 'before' : 'after');
  await mkdir(output, { recursive: true });
  const measurements = [];
  const printMock = `export const usePrintJobs = () => async (prepare, options) => prepare({
    signal: new AbortController().signal,
    print: async html => { (window.__p09.prints ??= []).push({ title: new DOMParser().parseFromString(html, 'text/html').title, compact: options.compact }); }
  });`;
  await runBrowserFixture({ htmlFile: new URL('./plan09.browser.html', import.meta.url), route: '/p19-mobile', fixture: { css, p19: true },
    moduleMocks: { ...moduleMocks, [path('shared/printing/usePrintJobs.js')]: printMock },
    async inspectPage(page) {
      const evaluate = async (fn, ...args) => {
        const result = await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const viewport = (width, height) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1024 });
      const show = (view) => evaluate(async view => { await window.__p09.show(view); scrollTo(0, 0); await window.__p09.frames(); }, view);
      const press = async (key, code = key) => {
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
        await evaluate(() => window.__p09.frames());
      };
      const capture = async name => {
        await evaluate(async () => {
          await Promise.allSettled(document.getAnimations().filter(animation =>
            Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished));
        });
        const shot = await page.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true }, 15000);
        await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'));
      };
      const sample = [[320, 568], [360, 740], [390, 844], [430, 932], [1280, 560]];
      const dimensions = baseline ? sample : [...sample, [320, 640], [375, 667], [412, 915], [667, 375], [844, 390], [768, 1024], [820, 1180], [1024, 768], [1440, 900]];
      for (const [width, height] of dimensions) {
        await viewport(width, height);
        for (const view of ['pos', 'contracts', 'categories']) {
          await show(view);
          const actual = await evaluate(() => {
            const bounds = el => {
              if (!el) return null;
              const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
              return { left, right, top, bottom, width, height };
            };
            const nav = document.querySelector('[aria-label="Navegación principal"]');
            const launcher = document.querySelector('.pos-cart-launcher');
            const header = document.querySelector('header');
            const catalog = document.querySelector('[aria-label="Catálogo de productos"]');
            return { error: window.__p09.renderError, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              nav: bounds(nav), launcher: bounds(launcher), header: bounds(header),
              headerGradient: getComputedStyle(header).backgroundImage,
              navGradient: getComputedStyle(nav.parentElement).backgroundImage,
              navButtons: [...nav.querySelectorAll('button')].map(bounds),
              headerButtons: [...header.querySelectorAll('button,select')].map(bounds),
              columns: catalog && getComputedStyle(catalog.querySelector('button[title^="Producto"]')?.parentElement ?? catalog).gridTemplateColumns };
          });
          measurements.push({ view, width, height, ...actual });
          if (!baseline) {
            const details = JSON.stringify({ view, width, height, actual });
            assert.ok(!actual.error && actual.width === width && actual.scrollWidth <= width + 1, details);
            if (width < 1024) {
              assert.match(actual.headerGradient, /gradient/, details);
              assert.match(actual.navGradient, /gradient/, details);
              assert.ok(actual.nav.left >= 0 && actual.nav.right <= width + 1 && actual.nav.bottom <= height + 1, details);
              assert.ok(actual.navButtons.every(b => b.height >= 44 && b.width >= 44), details);
              assert.ok(actual.navButtons.every((b, i, buttons) => i === 0 || b.left >= buttons[i - 1].right), details);
              assert.ok(actual.headerButtons.every(b => b.height >= 44 && b.width >= 44 && b.left >= 0 && b.right <= width + 1), details);
              assert.ok(actual.headerButtons.every((a, i, buttons) => buttons.slice(i + 1).every(b =>
                a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)), details);
              if (view === 'pos') assert.ok(actual.launcher.height >= 44 && actual.launcher.bottom < actual.nav.top && actual.launcher.top > actual.header.bottom, details);
            }
          }
          if (sample.some(([w, h]) => w === width && h === height)) await capture(`${view}-${width}x${height}`);
        }
      }
      if (!baseline) {
        await viewport(320, 568);
        await evaluate(() => window.__p09.loadMobileStressData());
        await show('pos');
        const catalog = await evaluate(async () => {
          const area = document.querySelector('[aria-label="Catálogo de productos"]');
          const rail = area.querySelector('[aria-label="Filtrar por categoría"]');
          const lastChip = rail.lastElementChild;
          lastChip.focus({ preventScroll: true });
          rail.scrollLeft = rail.scrollWidth;
          await window.__p09.frames();
          const chip = lastChip.getBoundingClientRect(), railBounds = rail.getBoundingClientRect();
          const chipVisible = chip.left >= railBounds.left - 1 && chip.right <= railBounds.right + 1;
          const products = area.querySelectorAll('.pos-product-card');
          const last = products[products.length - 1];
          last.scrollIntoView({ block: 'end' });
          await window.__p09.frames();
          const rect = last.getBoundingClientRect();
          const price = last.querySelector('strong');
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 5);
          return { chipCount: rail.childElementCount, chipVisible, price: price.textContent, priceFits: price.scrollWidth <= price.clientWidth + 1,
            stock: last.textContent.includes('100 disponibles'), lastReachable: last.contains(hit),
            globalWidth: document.documentElement.scrollWidth, touches: rect.height >= 44 && rect.width >= 44 };
        });
        assert.deepEqual(catalog, { chipCount: 17, chipVisible: true, price: 'S/ 49995.00', priceFits: true,
          stock: true, lastReachable: true, globalWidth: 320, touches: true });
        await evaluate(async () => {
          document.querySelector('.pos-cart-launcher').focus();
          document.querySelector('.pos-cart-launcher').click();
          await window.__p09.frames();
        });
        assert.ok(await evaluate(() => document.querySelector('[role="dialog"]').textContent.includes('El ticket está vacío') ||
          document.querySelector('[role="dialog"] .pos-ticket-items').querySelectorAll('li').length === 0));
        await press('Escape');
        assert.equal(await evaluate(() => document.activeElement.matches('.pos-cart-launcher')), true);
        await evaluate(async () => {
          for (const product of [...document.querySelectorAll('.pos-product-card')].slice(0, 3)) {
            product.click(); await window.__p09.frames();
          }
          document.querySelector('.pos-cart-launcher').click();
          await window.__p09.frames();
          const dialog = document.querySelector('[role="dialog"]');
          dialog.querySelector('button[aria-label^="Aumentar"]').click();
          dialog.querySelector('[data-ticket-payment="mixto"]').click();
          await window.__p09.frames();
        });
        const keyboard = await evaluate(async () => {
          const root = document.documentElement;
          // Simulate the measurements delivered by visualViewport when the keyboard covers 318px.
          root.style.setProperty('--ui-viewport-height', '250px');
          root.style.setProperty('--ui-keyboard-inset', '318px');
          const dialog = document.querySelector('[role="dialog"]');
          const field = dialog.querySelector('input[inputmode="decimal"]');
          field.focus();
          field.scrollIntoView({ block: 'nearest' });
          await window.__p09.frames();
          const fieldRect = field.getBoundingClientRect();
          const action = dialog.querySelector('[data-pos-charge]');
          action.scrollIntoView({ block: 'end' });
          await window.__p09.frames();
          const chargeRect = action.getBoundingClientRect();
          const bounds = dialog.getBoundingClientRect();
          return { panel: bounds.bottom, input: [fieldRect.top, fieldRect.bottom], button: [chargeRect.top, chargeRect.bottom],
            quantity: dialog.querySelectorAll('button[aria-label^="Quitar"]').length,
            total: dialog.querySelector('.pos-ticket-total strong').textContent };
        });
        assert.equal(keyboard.total, 'S/ 20.00');
        assert.equal(keyboard.quantity, 3);
        assert.ok(keyboard.input[0] >= 0 && keyboard.input[1] <= keyboard.panel + 1 && keyboard.button[0] >= 0 && keyboard.button[1] <= keyboard.panel + 1, JSON.stringify(keyboard));
        await capture('pos-teclado-simulado-320');
        await press('Escape');
        await viewport(320, 640);
        await show('contracts');
        const contracts = await evaluate(async () => {
          const root = document.querySelector('main');
          const filters = root.querySelector('[aria-label="Estado de los pedidos"]');
          const last = filters.lastElementChild;
          const cards = [...root.querySelectorAll('article')];
          const first = cards[0], print = [...first.querySelectorAll('[aria-label="Imprimir pedido"] button')];
          const printBounds = print.map(button => button.getBoundingClientRect());
          last.focus();
          last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          await window.__p09.frames();
          const rail = filters.getBoundingClientRect(), item = last.getBoundingClientRect();
          last.click();
          await window.__p09.frames();
          const closed = root.querySelectorAll('article').length;
          filters.firstElementChild.click();
          await window.__p09.frames();
          return { active: cards.length, closed, print: print.map(button => button.getAttribute('aria-label')),
            printTouches: printBounds.every(b => b.width >= 44 && b.height >= 44),
            printSeparated: printBounds.every((a, i) => printBounds.slice(i + 1).every(b =>
              a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)),
            filterReachable: item.left >= rail.left - 1 && item.right <= rail.right + 1,
            finance: first.textContent.includes('123456.78') && first.textContent.includes('123436.78'),
            width: document.documentElement.scrollWidth };
        });
        assert.deepEqual(contracts, { active: 22, closed: 1, print: ['Imprimir Ticket', 'Imprimir Orden de Taller', 'Imprimir Texto Solo'],
          printTouches: true, printSeparated: true, filterReachable: true, finance: true, width: 320 });
        const printing = await evaluate(async () => {
          for (const button of document.querySelector('main article [aria-label="Imprimir pedido"]').querySelectorAll('button')) {
            button.click();
            await window.__p09.frames();
          }
          return window.__p09.prints;
        });
        assert.deepEqual(printing?.map(({ title }) => title.split(' - ')[0]), ['Ticket de Pedido', 'Orden de Producción', 'Orden de Horneado']);
        assert.deepEqual(printing.map(({ compact }) => compact), [true, false, false]);
        await evaluate(async () => {
          const manage = [...document.querySelectorAll('main article button')].find(button => button.textContent.trim() === 'Gestionar');
          manage.click();
          await window.__p09.frames();
        });
        assert.ok(await evaluate(() => {
          const details = document.querySelector('[role="dialog"]');
          const payment = [...details.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confirmar Abono');
          return payment?.disabled && details.scrollWidth <= details.clientWidth + 1;
        }));
        await evaluate(async () => {
          document.querySelector('[role="dialog"] button[title="Editar datos permitidos"]').click();
          await window.__p09.frames();
        });
        assert.match(await evaluate(() => document.querySelector('[role="dialog"] h2').textContent), /Editar Pedido/);
        await press('Escape');
        await evaluate(async () => {
          window.__p09.savedCash = window.__p09.cash.currentSession;
          window.__p09.cash.currentSession = null;
          window.__p09.notify('cash');
          await window.__p09.frames();
        });
        assert.ok(await evaluate(() => [...document.querySelectorAll('main header button')].some(button => button.textContent.trim() === 'Abrir caja')));
        await evaluate(async () => {
          const trigger = [...document.querySelectorAll('main header button')].find(button => button.textContent.trim() === 'Nuevo Pedido');
          trigger.focus(); trigger.click(); await window.__p09.frames();
          const textarea = document.querySelector('[role="dialog"] textarea');
          textarea.focus(); textarea.scrollIntoView({ block: 'nearest' });
          await window.__p09.frames();
        });
        const form = await evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const bounds = dialog.getBoundingClientRect();
          const footer = dialog.querySelector('button[type="submit"]').getBoundingClientRect();
          const field = document.activeElement.getBoundingClientRect();
          return { visible: field.top >= bounds.top && field.bottom <= footer.top + 1 && footer.bottom <= bounds.bottom + 1,
            photo: !!dialog.querySelector('input[type="file"]'), width: dialog.scrollWidth, panel: dialog.clientWidth };
        });
        assert.ok(form.visible && form.photo && form.width <= form.panel + 1, JSON.stringify(form));
        await capture('contratos-formulario-320');
        await press('Escape');
        await evaluate(() => document.querySelector('[aria-label="Navegación principal"] button:last-child').focus());
        await press('Enter');
        assert.ok(await evaluate(() => document.querySelector('[role="menu"]')?.textContent.includes('Categorías')));
        await press('Escape');
        assert.ok(await evaluate(() => document.activeElement.textContent === 'Más'));
        await show('categories');
        const zoom = await evaluate(async () => {
          document.documentElement.style.fontSize = '200%';
          await window.__p09.frames();
          const edits = [...document.querySelectorAll('main button[aria-label="Editar"]')];
          const last = edits.at(-1);
          last.focus({ preventScroll: true });
          const nav = document.querySelector('.app-mobile-dock');
          const header = document.querySelector('.app-mobile-header');
          const visibleCenter = nav.getBoundingClientRect().top / 2;
          scrollTo(0, scrollY + last.getBoundingClientRect().top - visibleCenter + last.offsetHeight / 2);
          for (let attempt = 0; attempt < 3; attempt++) await window.__p09.frames();
          const bounds = last.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          return { width: document.documentElement.scrollWidth, lastAccessible: last.contains(hit), rows: edits.length,
            archived: document.querySelector('main').textContent.includes('Inactiva'),
            headerBottom: header.getBoundingClientRect().bottom, position: [bounds.top, bounds.bottom], dockTop: nav.getBoundingClientRect().top };
        });
        assert.ok(zoom.width === 320 && zoom.lastAccessible && zoom.rows === 16 && zoom.archived &&
          zoom.position[0] >= Math.max(0, zoom.headerBottom) && zoom.position[1] <= zoom.dockTop, JSON.stringify(zoom));
        await capture('categorias-texto-200-320');
        measurements.push({ catalog, keyboard, contracts, printing, form, zoom });
      }
      await evaluate(() => window.__p09.stop());
    },
  });
  await writeFile(`${output}/geometry.json`, JSON.stringify(measurements, null, 2));
});
