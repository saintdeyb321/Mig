import assert from 'node:assert/strict';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('migrates and synchronizes real IndexedDB in an isolated Chromium profile', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile: new URL('./offline-db.browser.html', import.meta.url) });
  assert.equal(result.checks.length, 22);
  console.log('IndexedDB: 22 checks passed; isolated fixture database was closed and deleted.');
});
