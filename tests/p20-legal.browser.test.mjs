import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { it } from 'node:test';
import { readBrowserBuildCss, runBrowserFixture } from './helpers/browserHarness.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const path = file => fileURLToPath(new URL('../frontend/src/' + file, import.meta.url)).replaceAll('\\', '/');
async function until(work, message) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await work();
    if (result) return result;
    await delay(50);
  }
  assert.fail(message);
}

it('P20 keeps documents public, locks acceptance until verified, and retries without duplicate writes', { timeout: 90000 }, async () => {
  const draft = readFileSync(new URL('../docs/MIGAPOS-PRIVACIDAD-v1-BORRADOR.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const privacyText = draft.slice(draft.indexOf('## 1.')).split('\n---\n', 1)[0].trim();
  const privacy = { path: '/__p20-privacy-fixture', version: '1.0', dateLabel: 'Prueba aislada', sha256: createHash('sha256').update(privacyText).digest('hex') };
  await runBrowserFixture({
    htmlFile: new URL('./p20-legal.browser.html', import.meta.url), route: '/p20-local',
    fixture: { css: await readBrowserBuildCss(), privacy, privacyText },
    moduleMocks: {
      [path('core/firebase/client.js')]: 'export const auth = {}; export const db = {};',
      [path('hooks/useAuthManager.js')]: `import {useState} from 'react'; export function useAuthManager() {
        const [user, setUser] = useState(null); window.__p20Profile = setUser;
        return {user, handleLogout: () => setUser(null)};
      }`,
      [path('hooks/useMaintenance.js')]: 'export const useMaintenance = () => ({});',
      [path('components/ReloadPrompt.jsx')]: 'export default function ReloadPrompt() {return null;}',
      [path('components/LicenseGuard.jsx')]: 'export default function LicenseGuard({children}) {return children;}',
      [path('components/BranchGuard.jsx')]: 'export default function BranchGuard({children}) {return children;}',
      [path('app/providers/SessionProviders.jsx')]: 'export function SessionProviders({children}) {return children;}',
      [path('layouts/AppLayout.jsx')]: 'export default function AppLayout() {return "Espacio operativo de prueba";}',
      [path('features/users/infrastructure/userRepository.js')]: `export async function acceptTerms(user) {
        window.__p20Writes++;
        if (window.__p20Writes === 1) throw Object.assign(new Error('Offline fixture'), {code:'unavailable'});
        await new Promise(resolve => {window.__p20Ack = () => {
          window.__p20Profile({...user, hasAcceptedTerms: true, termsVersion: '1.1'});
          resolve();
        };});
      }`,
    },
    async inspectPage(page) {
      const evaluate = async (fn, ...args) => {
        const result = await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const button = (label) => evaluate(label => {
        const control = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
        if (!control) return false;
        control.click();
        return !control.disabled;
      }, label);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      const urls = await until(() => evaluate(() => {
        const links = [...document.querySelectorAll('footer nav a')].map(anchor => anchor.pathname);
        return links.length && links;
      }), 'Public legal links are missing on login');
      assert.deepEqual(urls, ['/legal/terminos', '/legal/privacidad']);
      await evaluate(() => {
        window.__p20ValidDocument(false);
        window.__p20Profile({ uid: 'p20-owner', businessId: 'p20-demo', role: 'dueño', accessVerified: true });
      });
      await until(() => evaluate(() => document.querySelector('[role="alert"]')?.textContent.includes('documento oficial')), 'The tampered text should fail the integrity check');
      assert.equal(await button('Aceptar y continuar'), false);
      assert.ok(await evaluate(() => !document.body.textContent.includes('[PENDIENTE]') && !window.__legalExecuted));
      await evaluate(() => window.__p20ValidDocument(true));
      await button('Volver a cargar');
      await until(() => evaluate(() => document.querySelectorAll('[role="dialog"] article h3').length === 9), 'Historical legal text did not load');
      assert.ok(await evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        return !checkbox.checked && !document.querySelector('[role="dialog"] [download]');
      }));
      assert.equal(await button('Aceptar y continuar'), false);
      await evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        dispatchEvent(new Event('offline'));
        document.querySelector('input[type="checkbox"]').click();
      });
      assert.equal(await button('Aceptar y continuar'), false);
      assert.equal(await evaluate(() => window.__p20Writes), 0);
      await evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        dispatchEvent(new Event('online'));
      });
      await button('Aceptar y continuar');
      await until(() => evaluate(() => document.querySelector('[role="alert"]')?.textContent.includes('confirmar la aceptación')), 'The error must remain visible to retry');
      await evaluate(() => {
        const submit = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Aceptar y continuar');
        submit.click();
        submit.click();
      });
      await until(() => evaluate(() => typeof window.__p20Ack === 'function'), 'An acceptance write did not start');
      assert.equal(await evaluate(() => window.__p20Writes), 2);
      assert.ok(await evaluate(() => !!document.querySelector('[role="dialog"]') && !document.body.textContent.includes('Espacio operativo')));
      await evaluate(() => window.__p20Ack());
      await until(() => evaluate(() => !document.querySelector('[role="dialog"]') && document.body.textContent.includes('Espacio operativo')), 'Verified acceptance did not unlock the workspace');

      await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 740, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => {
        document.documentElement.style.fontSize = '200%';
        window.__p20Profile({ uid: 'p20-cashier', businessId: 'p20-demo', branchId: 'p20-local', role: 'cajero', accessVerified: true });
      });
      await until(() => evaluate(() => !!document.querySelector('[role="dialog"] article')), 'The cashier Terms gate did not open');
      assert.ok(await evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const text = dialog.querySelector('[role="region"]');
        const actions = dialog.querySelector('.legal-actions');
        const bounds = dialog.getBoundingClientRect();
        text.focus();
        return document.activeElement === text && text.scrollHeight > text.clientHeight
          && dialog.textContent.includes('reglas de uso que corresponden a mi rol') && !dialog.querySelector('input').checked
          && dialog.scrollWidth <= dialog.clientWidth + 1 && bounds.left >= 0 && bounds.bottom <= innerHeight
          && actions.getBoundingClientRect().bottom <= bounds.bottom;
      }));
      await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => window.__p20PreviewPrivacy());
      await until(() => evaluate(() => document.querySelectorAll('[role="dialog"] article h3').length === 12), 'All 12 privacy sections must render in the isolated fixture');
      assert.deepEqual(await evaluate(() => [...document.querySelectorAll('[role="dialog"] article > *')].map(block => block.textContent)),
        privacyText.split(/\n\s*\n/).map(block => block.replace(/^## /, '')));
      assert.ok(await evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const region = dialog.querySelector('[role="region"]');
        region.focus();
        region.scrollTop = region.scrollHeight;
        return document.activeElement === region && region.scrollTop > 0 && dialog.scrollWidth <= dialog.clientWidth + 1
          && !dialog.querySelector('[download],input[type="checkbox"]');
      }));
    },
  });
});

it('P20 serves both legal routes from Hosting build without publishing drafts', { timeout: 90000 }, async () => {
  const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
  const output = resolve(process.env.MIGAPOS_TEST_BUILD_DIR || 'frontend/dist');
  const require = createRequire(new URL('../frontend/package.json', import.meta.url));
  const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
  const index = readFileSync(resolve(output, 'index.html'), 'utf8');
  await runBrowserFixture({
    route: '/legal/terminos',
    createFixtureServer: middleware => preview({
      configFile: false, root: frontend, build: { outDir: output }, preview: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'p20-hosting-probe',
        configurePreviewServer(server) {
          middleware(server);
          server.middlewares.use('/legal/terminos', (_request, response) => {
            response.setHeader('Content-Type', 'text/html');
            response.end(index.replace('</body>', '<script src="/__p20-ready.js"></script></body>'));
          });
          server.middlewares.use('/__p20-ready.js', (_request, response) => {
            response.setHeader('Content-Type', 'application/javascript');
            response.end(`fetch('/__phase4-report', {method:'POST', body:'{"ok":true}'})`);
          });
        },
      }],
    }),
    async inspectPage(page) {
      const evaluate = async expression => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
      await until(() => evaluate('document.querySelectorAll("[role=dialog] article h3").length === 9'), 'Public terms could not be opened');
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog] [download]").length'), 0);
      assert.equal(await evaluate('fetch("/legal/terminos-1.1.txt").then(res => res.ok && res.headers.get("Content-Type").startsWith("text/plain"))'), true);
      const origin = await evaluate('location.origin');
      await page.send('Page.navigate', { url: origin + '/legal/privacidad' });
      await until(() => evaluate('document.querySelector("[role=dialog]")?.textContent.includes("v1.0 se publicará")'), 'Privacy status should be public before sign-in');
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog] input, [download]").length'), 0);
      assert.equal(await evaluate(`Promise.all(['/legal/terminos-2.0.txt', '/legal/privacidad-1.0.txt'].map(async path => {
        const response = await fetch(path);
        return !response.headers.get('Content-Type')?.startsWith('text/plain') && !(await response.text()).includes('[PENDIENTE]');
      })).then(results => results.every(Boolean))`), true);
    },
  });
});
