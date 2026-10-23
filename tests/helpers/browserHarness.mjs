import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, sep, basename, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

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

export async function runBrowserFixture({ htmlFile, route = '/phase4-offline-test', headers = {}, setupPage, mockPng } = {}) {
  const browser = findBrowser();
  const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
  const workspace = fileURLToPath(new URL('../../', import.meta.url));
  const html = (await readFile(htmlFile, 'utf8')).replaceAll('__WORKSPACE__', workspace.replaceAll('\\', '/'));
  const profile = await mkdtemp(resolve(tmpdir(), 'migapos-isolated-browser-'));
  let complete, finished = false, stderr = '', requests = 0;
  const report = new Promise(resolve => { complete = value => { if (!finished) { finished = true; resolve(value); } }; });
  const server = await createServer({ root, configFile: false, clearScreen: false, logLevel: 'error',
    resolve: { alias: { react: resolve(root, 'node_modules/react'), 'react-dom': resolve(root, 'node_modules/react-dom'), 'xlsx-js-style': resolve(root, 'node_modules/xlsx-js-style') } },
    optimizeDeps: { noDiscovery: true, include: ['dexie', 'react', 'react-dom/client', ...(mockPng ? ['xlsx-js-style'] : [])] },
    // saleModel imports the shared Functions domain outside frontend/. Default Vite fs policy denies it.
    server: { host: '127.0.0.1', port: 0, hmr: false, headers, fs: { allow: [workspace] } }, plugins: [{ name: 'isolated-indexeddb-test', configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        requests++;
        for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
        next();
      });
      server.middlewares.use('/__ui-sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.end('self.addEventListener("install", () => self.skipWaiting());');
      });
      server.middlewares.use('/__phase4-report', (request, response) => {
        let body = ''; request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
          try { const result = JSON.parse(body); response.end('OK', () => complete(result)); }
          catch { response.statusCode = 400; response.end(); complete({ ok: false, error: 'Invalid browser result.' }); }
        });
      });
      server.middlewares.use(route, async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml(route, html));
      });
    } }] });
  let child, childClosed, page, browserControl, browserPid;
  const timeout = setTimeout(() => complete({ ok: false, error: `Browser fixture timed out after 60s (${requests} HTTP requests). ${stderr.slice(-1200)}` }), 60000);
  try {
    await server.listen();
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-popup-blocking', '--no-first-run', '--no-default-browser-check',
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
      await browserControl.send('Browser.setDownloadBehavior', mockPng
        ? { behavior: 'allow', downloadPath: join(profile, 'downloads') } : { behavior: 'deny' });
      const info = await browserControl.send('SystemInfo.getProcessInfo').catch(() => null);
      browserPid = info?.processInfo?.find(process => process.type === 'browser')?.id;
      const targets = await (await fetch(`http://127.0.0.1:${debug[0]}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      const target = targets.find(target => target.type === 'page');
      assert.ok(target, 'Browser did not create an isolated page.');
      page = await connectCDP(target.webSocketDebuggerUrl, event => {
        if (event.method === 'Fetch.requestPaused') {
          const {requestId, request} = event.params;
          if (request.url.endsWith('/slow.png')) return; // Local timeout fixture; never contacts Storage.
          const url = new URL(request.url);
          const image = url.hostname === 'firebasestorage.googleapis.com' || url.hostname === 'storage.googleapis.com' || url.hostname === 'www.gstatic.com';
          const script = url.hostname === 'apis.google.com';
          const frame = url.pathname === '/__/auth/iframe';
          const text = image ? mockPng : script ? 'window.__authScriptLoaded = true;' : frame ? '<!doctype html><title>Local auth helper fixture</title>' : JSON.stringify({fixture: true});
          const responseHeaders = [{name:'Content-Type',value:image ? 'image/png' : script ? 'text/javascript' : frame ? 'text/html' : 'application/json'}, {name:'Access-Control-Allow-Origin',value:'*'}];
          void page.send('Fetch.fulfillRequest', {requestId, responseCode:200, responseHeaders, body:image ? text : Buffer.from(text).toString('base64')}).catch(error => complete({ok:false,error:error.message}));
        }
        if (event.method === 'Runtime.exceptionThrown') complete({ ok: false, error: event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text });
      });
      await page.send('Runtime.enable');
      if (setupPage) await setupPage(page);
      await page.send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}${route}` });
    }
    const result = await report;
    assert.equal(result.ok, true, result.error);
    if (mockPng) {
      let workbook;
      for (let attempt = 0; attempt < 20; attempt++) {
        try { workbook = await readFile(join(profile, 'downloads', 'fixture.xlsx')); break; } catch { await delay(100); }
      }
      assert.ok(workbook?.[0] === 0x50 && workbook?.[1] === 0x4b, 'Spreadsheet download was not written to the isolated profile.');
    }
    return result;
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
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('migapos-isolated-browser-'));
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
}
