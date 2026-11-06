import assert from 'node:assert/strict';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('opens and counts cash with exact cents, rejects invalid original text, and preserves the existing ceiling', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile: new URL('./cash-amount.browser.html', import.meta.url), route: '/cash-cent-precision',
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.checks.length, 48);
});
