import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('preserves the encrypted queue and bounds device-only images in isolated Chromium', { timeout: 90000 }, async () => {
  const client = fileURLToPath(new URL('../frontend/src/core/firebase/client.js', import.meta.url)).replaceAll('\\', '/');
  const result = await runBrowserFixture({ htmlFile: new URL('./spark-local.browser.html', import.meta.url), route: '/spark-local-test',
    moduleMocks: { [client]: 'export const auth = {currentUser: null}; export const db = {};' },
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.checks.length, 9);
});
