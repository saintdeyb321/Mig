import assert from 'node:assert/strict';
import { it } from 'node:test';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, sep, basename, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';

function findBrowser() {
  if (process.env.MIGAPOS_TEST_BROWSER) {
    assert.ok(existsSync(process.env.MIGAPOS_TEST_BROWSER), 'MIGAPOS_TEST_BROWSER does not point to an existing Chromium/Edge executable.');
    return process.env.MIGAPOS_TEST_BROWSER;
  }
  const names = process.platform === 'win32' ? ['msedge.exe', 'chrome.exe', 'chromium.exe'] : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge'];
  const candidates = [process.env.CHROME_BIN, process.env.CHROME_PATH,
    ...[process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean)
      .flatMap(directory => [join(directory, 'Microsoft/Edge/Application/msedge.exe'), join(directory, 'Google/Chrome/Application/chrome.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...(process.env.PATH ?? '').split(delimiter).flatMap(directory => names.map(name => join(directory, name)))];
  const browser = candidates.find(candidate => candidate && existsSync(candidate));
  assert.ok(browser, 'Chromium/Edge was not found. Install a browser or set MIGAPOS_TEST_BROWSER to its executable.');
  return browser;
}
async function connectCDP(url, onEvent) {
  const socket = new WebSocket(url), pending = new Map();
  let sequence = 0;
  socket.addEventListener('message', message => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const request = pending.get(data.id); pending.delete(data.id); clearTimeout(request?.timeout);
      if (data.error) request?.reject(Error(data.error.message)); else request?.resolve(data.result);
    } else onEvent(data);
  });
  socket.addEventListener('close', () => { for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(Error('Browser disconnected.')); } pending.clear(); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(Error('DevTools connection timed out.')); }, 3000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timeout); reject(error); }, { once: true });
  });
  return { close: () => socket.close(), send: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`DevTools ${method} timed out.`)); }, 3000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
  }) };
}

it('migrates and synchronizes real IndexedDB in an isolated Chromium profile', { timeout: 90000 }, async () => {
  const browser = findBrowser();
  const root = fileURLToPath(new URL('../frontend/', import.meta.url));
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const html = await readFile(new URL('./offline-db.browser.html', import.meta.url), 'utf8');
  const profile = await mkdtemp(resolve(tmpdir(), 'migapos-phase4-browser-'));
  let complete, finished = false, stderr = '', requests = 0;
  const report = new Promise(resolve => { complete = value => { if (!finished) { finished = true; resolve(value); } }; });
  const server = await createServer({ root, configFile: false, clearScreen: false, logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: ['dexie'] },
    // saleModel imports the shared Functions domain outside frontend/. Default Vite fs policy denies it.
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [workspace] } }, plugins: [{ name: 'isolated-indexeddb-test', configureServer(server) {
      server.middlewares.use((_request, _response, next) => { requests++; next(); });
      server.middlewares.use('/__phase4-report', (request, response) => {
        let body = ''; request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
          try { const result = JSON.parse(body); response.end('OK', () => complete(result)); }
          catch { response.statusCode = 400; response.end(); complete({ ok: false, error: 'Invalid browser result.' }); }
        });
      });
      server.middlewares.use('/phase4-offline-test', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml('/phase4-offline-test', html));
      });
    } }] });
  let child, childClosed, page, browserControl, browserPid;
  const timeout = setTimeout(() => complete({ ok: false, error: `IndexedDB timed out after 60s (${requests} HTTP requests). ${stderr.slice(-1200)}` }), 60000);
  try {
    await server.listen();
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
      ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    childClosed = new Promise(resolve => child.once('close', resolve));
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.on('error', error => complete({ ok: false, error: `Browser launch failed: ${error.message}` }));
    // Edge may exit its launcher successfully and hand the isolated profile to a new process.
    child.on('exit', code => { if (!finished && code !== 0) complete({ ok: false, error: `Browser exited before reporting (${code}). ${stderr.slice(-1200)}` }); });
    let debug;
    const startup = Date.now() + 10000;
    while (!finished && Date.now() < startup) {
      try { debug = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); break; } catch { await delay(100); }
    }
    if (!debug && !finished) complete({ ok: false, error: `Browser did not expose DevTools. ${stderr.slice(-1200)}` });
    if (debug) {
      browserControl = await connectCDP(`ws://127.0.0.1:${debug[0]}${debug[1]}`, () => {});
      const info = await browserControl.send('SystemInfo.getProcessInfo').catch(() => null);
      browserPid = info?.processInfo?.find(process => process.type === 'browser')?.id;
      const targets = await (await fetch(`http://127.0.0.1:${debug[0]}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      const target = targets.find(target => target.type === 'page');
      assert.ok(target, 'Browser did not create an isolated page.');
      page = await connectCDP(target.webSocketDebuggerUrl, event => {
        if (event.method === 'Runtime.exceptionThrown') complete({ ok: false, error: event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text });
      });
      await page.send('Runtime.enable');
      await page.send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/phase4-offline-test` });
    }
    const result = await report;
    assert.equal(result.ok, true, result.error);
    assert.equal(result.checks.length, 22);
    console.log(`IndexedDB: ${result.checks.length} checks passed; isolated fixture database was closed and deleted.`);
  } finally {
    clearTimeout(timeout); finished = true;
    page?.close();
    if (browserControl) { await browserControl.send('Browser.close').catch(() => {}); browserControl.close(); }
    if (childClosed) await Promise.race([childClosed, delay(3000, undefined, { ref: false })]);
    const isRunning = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const remainingPid = browserPid && browserPid !== process.pid && isRunning(browserPid) ? browserPid
      : child && child.exitCode === null && child.signalCode === null ? child.pid : null;
    if (remainingPid) {
      if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(remainingPid), '/T', '/F'], { windowsHide: true }, resolve));
      else process.kill(remainingPid, 'SIGKILL');
      await Promise.race([childClosed, delay(2000, undefined, { ref: false })]);
    }
    child?.stderr?.destroy();
    await server.close();
    const target = resolve(profile);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('migapos-phase4-browser-'));
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
