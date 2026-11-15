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

it('P21 checks both documents in invitation and existing-account flows before handing off to the server', { timeout: 90000 }, async () => {
  await runBrowserFixture({
    htmlFile: new URL('./p20-legal.browser.html', import.meta.url), route: '/p20-local',
    fixture: { css: await readBrowserBuildCss() },
    moduleMocks: {
      [path('core/firebase/client.js')]: 'export const auth = {}; export const db = {};',
      [path('hooks/useAuthManager.js')]: `import {useState} from 'react';
      export function useAuthManager() {
        const [user, setUser] = useState(null), [invitation, setInvitation] = useState(null);
        window.__p20Profile = profile => { setUser(profile); setInvitation(null); };
        window.__p21Invite = invite => { setUser(null); setInvitation(invite); };
        return {user, invitation, authIssue: invitation ? 'needs-invite' : null,
          acceptProfileInvitation: confirmation => window.__p21Record(
            { ...invitation, uid: 'invited-owner', accessVerified: true }, confirmation),
          handleLogout: () => window.__p20Profile(null)};
      }`,
      [path('hooks/useMaintenance.js')]: 'export const useMaintenance = () => ({});',
      [path('components/ReloadPrompt.jsx')]: 'export default function ReloadPrompt() {return null;}',
      [path('components/LicenseGuard.jsx')]: 'export default function LicenseGuard({children}) {return children;}',
      [path('components/BranchGuard.jsx')]: 'export default function BranchGuard({children}) {return children;}',
      [path('app/providers/SessionProviders.jsx')]: 'export function SessionProviders({children}) {return children;}',
      [path('layouts/AppLayout.jsx')]: 'export default function AppLayout() {return "Espacio operativo de prueba";}',
      [path('features/users/infrastructure/userRepository.js')]: `
        import {legalAcceptanceEvidence, legalAcceptanceMarker, legalPublication} from '/src/features/legal/publication.js';
        export async function acceptTerms(user, confirmation) {
          window.__p20Writes++;
          window.__p21Payload = confirmation;
          if (window.__p20Writes === 1) throw Object.assign(new Error('Offline fixture'), {code:'unavailable'});
          await new Promise(resolve => {window.__p20Ack = () => {
            const evidence = legalAcceptanceEvidence({...user, id: 'A'.repeat(20)}, legalPublication);
            window.__p20Profile({...user, legalAcceptance: legalAcceptanceMarker(evidence)});
            resolve();
          };});
        }
        window.__p21Record = acceptTerms;`,
    },
    async inspectPage(page) {
      const evaluate = async (fn, ...args) => {
        const result = await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const click = (label) => evaluate(label => {
        const control = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
        if (!control || control.disabled) return false;
        control.click();
        return true;
      }, label);
      const boxes = () => evaluate(() => [...document.querySelectorAll('fieldset input[type="checkbox"]')].map(el => ({ checked: el.checked, disabled: el.disabled })));
      const unlockedBoxes = async () => (await boxes()).filter(box => !box.disabled).length === 2;
      await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      const loginLinks = await until(() => evaluate(() => [...document.querySelectorAll('footer nav a')].map(anchor => anchor.getAttribute('href')).filter(Boolean).length === 4
        && [...document.querySelectorAll('footer nav a')].map(anchor => anchor.getAttribute('href'))), 'Legal, complaints and support links are missing on login');
      assert.deepEqual(loginLinks.slice(0, 2), ['/legal/terminos', '/legal/privacidad']);
      assert.match(loginLinks[2], /^https:\/\/docs\.google\.com\/forms\//);
      assert.equal(loginLinks[3], 'mailto:deyvidparionaramos@gmail.com');
      await evaluate(() => {
        window.__p20ValidDocument(false);
        window.__p21Invite({ businessId: 'p21-demo', role: 'dueño', email: 'owner@example.test' });
      });
      await until(() => evaluate(() => document.querySelector('[role="alert"]')?.textContent.includes('verificar los documentos')), 'The tampered privacy text should fail integrity verification');
      assert.equal(await click('Activar mi cuenta'), false);
      assert.equal(await evaluate(() => window.__p20Writes), 0);
      assert.ok(await evaluate(() => !document.body.textContent.includes('[PENDIENTE]') && !window.__legalExecuted));
      await evaluate(() => window.__p20ValidDocument(true));
      assert.equal(await click('Volver a verificar documentos'), true);
      await until(unlockedBoxes, 'Both authentic documents must be verified before checking');
      assert.deepEqual(await boxes(), [{ checked: false, disabled: false }, { checked: false, disabled: false }]);
      assert.ok(await evaluate(() => {
        const group = document.querySelector('fieldset');
        const links = [...group.querySelectorAll('a')];
        return !document.querySelector('[role="dialog"], [download]') && links[0].pathname === '/legal/terminos'
          && links[1].pathname === '/legal/privacidad'
          && links.every(link => link.target === '_blank' && link.relList.contains('noopener'))
          && group.getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
      }));
      assert.equal(await click('Activar mi cuenta'), false);
      await evaluate(() => document.querySelector('fieldset input').focus());
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await until(async () => (await boxes())[0].checked, 'Keyboard did not toggle terms checkbox');
      assert.equal((await boxes())[1].checked, false);
      assert.equal(await click('Activar mi cuenta'), false);
      const setOffline = offline => page.send('Network.emulateNetworkConditions', {
        offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      });
      await setOffline(true);
      await until(() => evaluate(() => !navigator.onLine), 'Chromium did not go offline');
      await evaluate(() => document.querySelectorAll('fieldset input')[1].click());
      assert.equal(await click('Activar mi cuenta'), false);
      assert.equal(await evaluate(() => window.__p20Writes), 0);
      await setOffline(false);
      await until(() => evaluate(() => navigator.onLine), 'Chromium did not reconnect');
      assert.equal(await click('Activar mi cuenta'), true);
      await until(() => evaluate(() => document.querySelector('[role="alert"]')?.textContent.includes('confirmar la activación')), 'The error must remain visible to retry');
      await evaluate(() => {
        const submit = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Activar mi cuenta');
        submit.click(); submit.click();
      });
      await until(() => evaluate(() => typeof window.__p20Ack === 'function'), 'An activation write did not start');
      assert.equal(await evaluate(() => window.__p20Writes), 2);
      assert.deepEqual(await evaluate(() => window.__p21Payload), { acceptedTerms: true, acknowledgedPrivacy: true });
      assert.ok(await evaluate(() => !document.body.textContent.includes('Espacio operativo') && document.querySelector('fieldset').disabled));
      await evaluate(() => window.__p20Ack());
      await until(() => evaluate(() => document.body.textContent.includes('Espacio operativo')), 'Verified activation did not unlock the workspace');

      await evaluate(() => {
        document.documentElement.style.fontSize = '200%';
        window.__p20Ack = null;
        window.__p20Profile({ uid: 'p21-cashier', businessId: 'p21-demo', branchId: 'p21-local', role: 'cajero', accessVerified: true, hasAcceptedTerms: true });
      });
      await until(unlockedBoxes, 'Existing cashier with legacy acceptance must see both unchecked controls');
      assert.deepEqual(await boxes(), [{ checked: false, disabled: false }, { checked: false, disabled: false }]);
      assert.ok(await evaluate(() => document.body.textContent.includes('Antes de continuar')
        && !document.querySelector('[role="dialog"]') && !document.body.textContent.includes('Espacio operativo')
        && document.documentElement.scrollWidth <= innerWidth));
      await evaluate(() => document.querySelectorAll('fieldset input').forEach(input => input.click()));
      assert.equal(await click('Aceptar y continuar'), true);
      await until(() => evaluate(() => typeof window.__p20Ack === 'function'), 'Cashier acceptance did not start');
      await evaluate(() => window.__p20Ack());
      await until(() => evaluate(() => document.body.textContent.includes('Espacio operativo')), 'Verified cashier acceptance did not unlock the workspace');
    },
  });
});

it('P21 serves both full official documents from Hosting build without requiring sign-in', { timeout: 90000 }, async () => {
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
      const official = async (kind, headingCount) => {
        const file = kind === 'terminos' ? 'terminos-1.1.txt' : 'privacidad-1.0.txt';
        const bytes = readFileSync(new URL('../frontend/public/legal/' + file, import.meta.url));
        await until(() => evaluate(`document.querySelectorAll('[role="dialog"] article h3').length === ${headingCount}`), `Public ${kind} could not be opened`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="dialog"] article > *')].map(block => block.textContent)`),
          bytes.toString('utf8').trim().split(/\r?\n\s*\r?\n/).map(block => block.replace(/^## /, '')));
        assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] input, [download]').length`), 0);
        assert.equal(await evaluate(`fetch('/legal/${file}').then(async res => {
          if (!res.ok || !res.headers.get('Content-Type').startsWith('text/plain')) return null;
          const hash = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
          return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
        })`), createHash('sha256').update(bytes).digest('hex'));
      };
      await official('terminos', 9);
      const origin = await evaluate('location.origin');
      await page.send('Page.navigate', { url: origin + '/legal/privacidad' });
      await official('privacidad', 12);
      assert.equal(await evaluate(`document.querySelector('[role="region"] a[href="mailto:deyvidparionaramos@gmail.com"]').textContent.trim()`),
        'Contactar para ejercer derechos ARCO');
      assert.equal(await evaluate(`fetch('/legal/terminos-2.0.txt').then(res => !res.headers.get('Content-Type')?.startsWith('text/plain'))`), true);
    },
  });
});
