import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('prints safely and cleans resources under the Hosting CSP in real Chromium', { timeout: 90000 }, async () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  const headers = Object.fromEntries(config.hosting.headers[0].headers.map(({ key, value }) => [key, value]));
  const mockPng = readFileSync(new URL('../frontend/public/img/Logo_192.png', import.meta.url)).toString('base64');
  const result = await runBrowserFixture({ htmlFile: new URL('./ui-security.browser.html', import.meta.url), route: '/phase9-ui-test', headers, mockPng,
    // Fulfill ALL external requests locally, including Auth/Storage/Functions fixtures.
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.checks.length, 17);
  console.log(`UI security: ${result.checks.length} browser checks passed (mocked external services; no production connection).`);
});
