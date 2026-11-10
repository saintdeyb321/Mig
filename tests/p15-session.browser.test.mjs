import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

const modulePath = path => fileURLToPath(new URL('../frontend/src/' + path, import.meta.url)).replaceAll('\\', '/');
const mocks = {
  'virtual:p15-auth': 'export const onAuthStateChanged = (_, callback) => window.__p15.observe(callback); export const signOut = async () => { window.__p15.logouts++; window.__p15.switchUser(null); };',
  [modulePath('hooks/useAuthManager.js')]: readFileSync(modulePath('hooks/useAuthManager.js'), 'utf8').replace("from 'firebase/auth'", "from 'virtual:p15-auth'"),
  [modulePath('core/firebase/client.js')]: 'export const auth = { get currentUser() { return window.__p15.user; } }; export const db = {};',
  [modulePath('features/users/infrastructure/userRepository.js')]: `
    export const subscribeProfile = (...args) => window.__p15.subscribe('profile', ...args);
    export const getProfileFromServer = id => window.__p15.read('profile', id);
    export const getInviteFromServer = async () => null;
    export const acceptInvitedProfile = () => { throw Error('P15 cannot provision users'); };`,
  [modulePath('features/licenses/infrastructure/licenseRepository.js')]: `
    export const subscribeLicense = (...args) => window.__p15.subscribe('license', ...args);
    export const subscribeTenant = (...args) => window.__p15.subscribe('tenant', ...args);
    export const getLicenseFromServer = id => window.__p15.read('license', id);
    export const getTenantFromServer = id => window.__p15.read('tenant', id);`,
};

it('P15 recovers a persisted identity after a stale access stream without removing drafts', { timeout: 90000 }, async () => {
  await runBrowserFixture({ htmlFile: new URL('./p15-session.browser.html', import.meta.url), route: '/p15-session', moduleMocks: mocks,
    async inspectPage(page) {
      const evaluate = async (fn, ...args) => {
        const result = await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`,
          awaitPromise: true, returnByValue: true }, 15000);
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const until = async (fn, message, ...args) => {
        for (let i = 0; i < 60; i++) {
          if (await evaluate(fn, ...args)) return;
          await delay(50);
        }
        assert.fail(`${message}: ${JSON.stringify(await evaluate(() => ({ text: document.body.innerText, watches: window.__p15.watches.map(watch => watch.kind), reads: window.__p15.reads.map(row => row.kind) })))}`);
      };
      const ready = (business = 'tenant-a') => until(business => document.querySelector('#business-ready')?.textContent === business
        && window.__p15.canWrite(), 'The verified owner can operate', business);
      const restricted = text => until(text => document.querySelector('h1')?.textContent.includes(text), text, text);
      const retry = () => evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Volver a comprobar acceso').click());
      await ready();
      assert.deepEqual(await evaluate(() => window.__p15.reads), []);
      await evaluate(() => window.__p15.publish('stale'));
      await restricted('Configuración no encontrada');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      await retry();
      await ready();
      assert.deepEqual(await evaluate(() => window.__p15.reads.map(row => row.kind)), ['profile', 'license', 'tenant']);
      assert.equal(await evaluate(() => window.__p15.token), 1);
      const draft = () => evaluate(async () => (await window.__p15.draft()).data);
      assert.equal(await draft(), 'synthetic-encrypted-sentinel');

      // Reload the page with a persisted synthetic Auth identity and the same browser storage.
      const previousBoot = await evaluate(() => {
        sessionStorage.setItem('p15:boot', 'stale');
        return window.__p15.bootId;
      });
      await page.send('Page.reload');
      await until(previous => window.__p15?.bootId !== previous && !!window.__p15?.bootId, 'F5 booted a new document', previousBoot);
      await restricted('Configuración no encontrada');
      await retry();
      await ready();
      assert.equal(await draft(), 'synthetic-encrypted-sentinel');
      assert.equal(await evaluate(() => window.__p15.watches.filter(watch => watch.kind === 'profile').length), 1);

      const readsBefore = await evaluate(() => {
        const fixture = window.__p15;
        fixture.elapsed = 4 * 3600000;
        fixture.visible = false;
        document.dispatchEvent(new Event('visibilitychange'));
        return fixture.reads.length;
      });
      await evaluate(() => {
        const fixture = window.__p15;
        fixture.hold = true;
        fixture.visible = true;
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('focus'));
      });
      await until(() => window.__p15.pending?.length === 2, 'Resume starts one paired read');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      assert.equal((await evaluate(() => window.__p15.reads.length)) - readsBefore, 3);
      await evaluate(() => { window.__p15.hold = false; window.__p15.pending.splice(0).forEach(resolve => resolve()); });
      await ready();
      assert.equal(await evaluate(() => window.__p15.token), 1, 'Resume does not force a token refresh');
      assert.equal(await evaluate(() => window.__p15.logouts), 0, 'The owner stays signed in');

      const beforeOffline = await evaluate(() => {
        window.__p15.online = false;
        window.dispatchEvent(new Event('offline'));
        return window.__p15.reads.length;
      });
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      await evaluate(() => {
        window.__p15.elapsed += 60000;
        window.__p15.online = true;
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new Event('focus'));
      });
      await ready();
      assert.equal((await evaluate(() => window.__p15.reads.length)) - beforeOffline, 3, 'Only the business guard retries the package on reconnect');
      assert.equal(await evaluate(() => window.__p15.token), 1);

      const beforeInterruption = await evaluate(() => {
        const fixture = window.__p15;
        fixture.elapsed += 31000;
        fixture.hold = true;
        fixture.publish('network');
        window.dispatchEvent(new Event('focus'));
        return fixture.reads.length;
      });
      await until(() => window.__p15.pending?.length === 2, 'The initial configuration pair is in flight');
      await evaluate(() => {
        const fixture = window.__p15;
        fixture.online = false;
        window.dispatchEvent(new Event('offline'));
        fixture.online = true;
        fixture.elapsed += 29750;
        window.dispatchEvent(new Event('online'));
        // Deliver replies from the interrupted request while keeping the new pair on hold.
        fixture.pending.splice(0).forEach(resolve => resolve());
      });
      await until(() => window.__p15.pending?.length === 2, 'Reconnect retries once after the cooldown');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false, 'The interrupted request cannot grant access');
      assert.equal((await evaluate(() => window.__p15.reads.length)) - beforeInterruption, 6);
      await evaluate(() => { window.__p15.hold = false; window.__p15.pending.splice(0).forEach(resolve => resolve()); });
      await ready();

      for (const [mode, title] of [
        ['absent', 'Configuración no encontrada'], ['license-missing', 'Licencia no encontrada'],
        ['permission', 'Lectura no autorizada'], ['expired', 'Suscripción vencida'], ['suspended', 'Acceso suspendido'],
        ['network', 'Conexión pendiente'], ['cache', 'Acceso sin verificar'], ['pending', 'Acceso sin verificar'],
      ]) {
        const before = await evaluate(mode => {
          window.__p15.publish('stale');
          window.__p15.readMode = mode;
          return window.__p15.reads.length;
        }, mode);
        await restricted('Configuración no encontrada');
        await retry();
        await until(before => window.__p15.reads.length === before + 3, 'One bounded retry package', before);
        await restricted(title);
        assert.equal(await evaluate(() => window.__p15.canWrite()), false, mode);
        await evaluate(() => { window.__p15.readMode = 'healthy'; });
        await retry();
        await ready();
      }

      const beforeTokenFailure = await evaluate(() => {
        window.__p15.publish('stale');
        window.__p15.tokenError = 'auth/user-token-expired';
        return window.__p15.reads.length;
      });
      await restricted('Configuración no encontrada');
      await retry();
      await restricted('Credenciales sin confirmar');
      assert.equal(await evaluate(() => window.__p15.reads.length), beforeTokenFailure);
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      await evaluate(() => { window.__p15.tokenError = null; window.__p15.watchMode = 'healthy'; });
      await retry();
      await ready();

      // Same Auth UID, different assigned branch and then a different tenant/UID.
      await evaluate(() => { window.__p15.publish('stale'); window.__p15.hold = true; });
      await restricted('Configuración no encontrada');
      await retry();
      await until(() => window.__p15.pending?.length === 2, 'Old document pair is in flight');
      await evaluate(() => {
        const fixture = window.__p15;
        fixture.watchMode = 'permission';
        fixture.changeProfile({ ...fixture.profile, branchId: 'sede-b' });
      });
      await restricted('Lectura no autorizada');
      await evaluate(() => {
        const fixture = window.__p15;
        fixture.hold = false;
        fixture.pending.splice(0).forEach(resolve => resolve());
        // Call a disposed listener deliberately to cover stale callbacks after cleanup.
        for (const old of fixture.watches.filter(watch => !watch.active && watch.kind === 'license')) {
          old.next({ businessId: old.id, status: 'activa', expiry: '2099-01-01' }, { fromCache: false, hasPendingWrites: false });
        }
      });
      await restricted('Lectura no autorizada');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      await evaluate(() => window.__p15.switchUser('owner-b', { ...window.__p15.profile, businessId: 'tenant-b' }));
      await ready('tenant-b');
      const activeWatches = await evaluate(() => window.__p15.watches.filter(watch => watch.active).map(watch => [watch.kind, watch.id]));
      assert.deepEqual(activeWatches, [['profile', 'owner-b'], ['license', 'tenant-b'], ['tenant', 'tenant-b']]);
      assert.equal(await draft(), 'synthetic-encrypted-sentinel');
      await evaluate(() => window.__p15.switchUser(null));
      await restricted('Sin sesión');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false);
      assert.equal(await draft(), 'synthetic-encrypted-sentinel');
      await evaluate(() => {
        sessionStorage.setItem('p15:boot', 'healthy');
        window.__p15.other = window.open(location.pathname, 'p15-isolated-tab');
      });
      await until(() => window.__p15.other?.__p15?.canWrite(), 'A second isolated tab independently verifies its access');
      assert.equal(await evaluate(() => window.__p15.canWrite()), false, 'A different tab cannot grant this tab access');
      assert.equal(await evaluate(async () => (await window.__p15.other.__p15.draft()).data), 'synthetic-encrypted-sentinel');
      await evaluate(() => window.__p15.other.close());
    },
  });
});
