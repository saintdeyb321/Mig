import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('Plan07 verifies cart transitions, pending receipt UI and transient cached notifications in isolated Chromium', { timeout: 90000 }, async () => {
  const client = fileURLToPath(new URL('../frontend/src/core/firebase/client.js', import.meta.url)).replaceAll('\\', '/');
  const transactions = fileURLToPath(new URL('../frontend/src/features/sales/infrastructure/saleTransactions.js', import.meta.url)).replaceAll('\\', '/');
  const result = await runBrowserFixture({ htmlFile: new URL('./plan07.browser.html', import.meta.url), route: '/plan07',
    moduleMocks: {
      [client]: 'export const auth = { currentUser: { uid: "cashier" } }; export const db = {};',
      [transactions]: `export async function saveSaleTransaction(sale, items) { return { success: false, isOffline: true, sale: { ...sale, saleId: sale.localId, items } }; }
        export const saveSaleDraftTransaction = async () => { throw Error('No draft save expected in the Plan07 online scenario'); };
        export const verifyPendingSaleTransaction = async () => {};
        export const subscribeSaleAcknowledgement = (_id, callback) => { window.__saleAck = callback; return () => { delete window.__saleAck; }; };`,
    },
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.checks.length, 11);
});
