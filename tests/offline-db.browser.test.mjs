import assert from 'node:assert/strict';
import { it } from 'node:test';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';

it('Phase 4 migrates and synchronizes real IndexedDB in an isolated browser profile', { timeout: 90000 }, async () => {
  const browser = process.env.MIGAPOS_TEST_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.ok(existsSync(browser), 'Set MIGAPOS_TEST_BROWSER to a Chromium/Edge executable.');
  const root = fileURLToPath(new URL('../frontend/', import.meta.url));
  const html = await readFile(new URL('./offline-db.browser.html', import.meta.url), 'utf8');
  const profile = await mkdtemp(resolve(tmpdir(), 'migapos-phase4-browser-'));
  let complete;
  const report = new Promise(resolve => { complete = resolve; });
  const server = await createServer({ root, configFile: false, clearScreen: false, logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: ['dexie'] },
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'phase4-local-test', configureServer(server) {
      server.middlewares.use('/__phase4-report', (request, response) => {
        let body = ''; request.on('data', chunk => { body += chunk; });
        request.on('end', () => { complete(JSON.parse(body)); response.end('OK'); });
      });
      server.middlewares.use('/phase4-offline-test', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml('/phase4-offline-test', html));
      });
    } }] });
  let child;
  let timeout;
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    child = spawn(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/phase4-offline-test`], { windowsHide: true, stdio: 'ignore' });
    child.on('error', error => complete({ ok: false, error: error.message }));
    timeout = setTimeout(() => complete({ ok: false, error: 'Local IndexedDB browser test timed out.' }), 60000);
    const result = await report;
    assert.equal(result.ok, true, result.error);
    assert.equal(result.checks.length, 16);
    console.log(`IndexedDB: ${result.checks.length} checks passed; no application database was opened.`);
  } finally {
    clearTimeout(timeout); child?.kill(); await server.close();
    // Resolve and verify the isolated temp profile before recursively removing test artifacts.
    const target = resolve(profile);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('migapos-phase4-browser-'));
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
});
