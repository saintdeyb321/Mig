import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createRequire } from 'node:module';
import { assertEmulatorEnvironment } from '../scripts/emulator-guard.mjs';
import { hostingHeaders, environmentFor } from '../frontend/src/config/environments.js';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

assertEmulatorEnvironment(process.env);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

it('runs an authenticated invitation/cash/sales/offline/contracts/closing/report flow in real Chromium + Emulator', { timeout: 90000 }, async () => {
  const app = initializeApp({ projectId: 'demo-migapos' }, 'browser-e2e');
  const db = getFirestore(app), auth = getAuth(app), suffix = crypto.randomUUID();
  const fixture = { password: 'emulator-fixture-only', businessId: 'tenant-e2e-a', branchId: 'e2e-a', otherBusiness: 'tenant-e2e-b', otherBranch: 'e2e-b' };
  const users = [];
  try {
    assert.equal((await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-migapos/databases/(default)/documents', { method: 'DELETE' })).ok, true);
    for (const name of ['owner', 'cashier', 'other']) {
      const user = await auth.createUser({ email: `${name}-${suffix}@emulator.invalid`, password: fixture.password, emailVerified: true });
      users.push(user); fixture[name] = { uid: user.uid, email: user.email };
      if (name !== 'cashier') await db.doc('users/' + user.uid).set({ email: user.email, businessId: name === 'other' ? fixture.otherBusiness : fixture.businessId,
        branchId: 'global', role: 'dueño', status: 'activo', firstName: 'Fixture', lastName: '', shiftStart: null, shiftEnd: null });
    }
    for (const [businessId, branchId] of [[fixture.businessId, fixture.branchId], [fixture.otherBusiness, fixture.otherBranch]]) {
      await db.doc('licenses/' + businessId).set({ businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) });
      await db.doc('branches/' + branchId).set({ businessId, status: 'activo', name: 'Fixture' });
    }
    const headers = Object.fromEntries(hostingHeaders(environmentFor('emulator')).map(({ key, value }) => [key, value]));
    const result = await runBrowserFixture({ htmlFile: new URL('./e2e.browser.html', import.meta.url), route: '/phase10-e2e', headers, fixture, firebaseSdk: true,
      setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
    });
    assert.equal(result.checks.length, 17);
    console.log(`Emulator E2E: ${result.checks.length} authenticated browser checks passed; real Firebase connections were prohibited.`);
  } finally { await Promise.all(users.map(user => auth.deleteUser(user.uid))); await deleteApp(app); }
});
