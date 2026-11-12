import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, sep, basename, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

export async function readBrowserBuildCss() {
  const directory = resolve(workspace, process.env.MIGAPOS_TEST_BUILD_DIR || 'frontend/dist');
  const index = await readFile(resolve(directory, 'index.html'), 'utf8');
  const asset = index.match(/href="(\/assets\/[^"/]+\.css)"/)?.[1];
  assert.ok(asset, 'The browser fixture requires a built CSS asset.');
  return readFile(resolve(directory, '.' + asset), 'utf8');
}

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
function connectCDP(child, onPageEvent) {
  // Chromium speaks null-delimited JSON over inherited descriptors 3 and 4.
  // No discovery file, TCP port or separate target WebSocket is needed.
  const [, , , input, output] = child.stdio;
  const pending = new Map();
  let sequence = 0, buffer = '', failure;
  const disconnect = error => {
    failure ??= error;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(failure);
    }
    pending.clear();
  };
  input.on('error', disconnect);
  output.on('error', disconnect);
  output.once('close', () => disconnect(Error('DevTools pipe closed.')));
  output.setEncoding('utf8');
  output.on('data', chunk => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf('\0')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      if (!frame) continue;
      const data = JSON.parse(frame);
      if (data.id) {
        const request = pending.get(data.id);
        if (!request) continue;
        pending.delete(data.id);
        clearTimeout(request.timeout);
        if (data.error) request.reject(Error(data.error.message));
        else request.resolve(data.result);
      } else onPageEvent(data);
    }
  });
  const channel = sessionId => ({ send: (method, params = {}, timeoutMs = 3000) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`DevTools ${method} timed out.`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    input.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
  }) });
  return { browser: channel(), page: channel };
}

export async function runBrowserFixture({ htmlFile, route = '/phase4-offline-test', headers = {}, setupPage, inspectPage, onPageEvent, createFixtureServer, mockPng, verifyDownload, firebaseSdk = false, excel = false, fixture, moduleMocks = {} } = {}) {
  const browser = findBrowser();
  const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
  const html = htmlFile && (await readFile(htmlFile, 'utf8')).replaceAll('__WORKSPACE__', workspace.replaceAll('\\', '/'));
  const profile = await mkdtemp(resolve(tmpdir(), 'migapos-isolated-browser-'));
  let complete, finished = false, stderr = '', requests = 0;
  const report = new Promise(resolve => { complete = value => { if (!finished) { finished = true; resolve(value); } }; });
  const fixtureMiddleware = server => {
    server.middlewares.use((request, response, next) => {
      // This server is also Chromium's deny-only proxy.
      if (!request.url?.startsWith('/')) { response.writeHead(403).end(); return; }
      requests++;
      for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
      next();
    });
    server.middlewares.use('/__phase4-report', (request, response) => {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        try { const result = JSON.parse(body); response.end('OK', () => complete(result)); }
        catch { response.statusCode = 400; response.end(); complete({ ok: false, error: 'Invalid browser result.' }); }
      });
    });
  };
  let server;
  let child, childClosed, page, browserControl, browserPid;
  const timeout = setTimeout(() => complete({ ok: false, error: `Browser fixture timed out after 60s (${requests} HTTP requests). ${stderr.slice(-1200)}` }), 60000);
  try {
    server = createFixtureServer ? await createFixtureServer(fixtureMiddleware) : await createServer({ root, cacheDir: join(profile, 'vite-cache'), configFile: false, envFile: false, clearScreen: false, logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    resolve: { alias: { react: resolve(root, 'node_modules/react'), 'react-dom': resolve(root, 'node_modules/react-dom'), 'xlsx-js-style': resolve(root, 'node_modules/xlsx-js-style'), firebase: resolve(root, 'node_modules/firebase') } },
    // Discovery is disabled for isolated/mocked fixtures. Radix also imports the CJS
    // react-dom root (portals/flushSync), so prebundle it alongside react-dom/client.
    optimizeDeps: { noDiscovery: true, include: ['dexie', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-dom', 'react-dom/client', ...(mockPng || firebaseSdk || excel ? ['xlsx-js-style'] : []), ...(firebaseSdk ? ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'] : [])] },
    // saleModel imports the shared Functions domain outside frontend/. Default Vite fs policy denies it.
    server: { host: '127.0.0.1', port: 0, hmr: false, headers, fs: { allow: [workspace, profile] } }, plugins: [{ name: 'isolated-indexeddb-test',
      resolveId: id => id === 'virtual:browser-fixture' ? '\0browser-fixture' : Object.hasOwn(moduleMocks, id) ? id : undefined,
      load: id => id === '\0browser-fixture' ? 'export default ' + JSON.stringify(fixture || {}) + ';' : moduleMocks[id],
      configureServer(server) {
      fixtureMiddleware(server);
      server.middlewares.use('/__ui-sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.end('self.addEventListener("install", () => self.skipWaiting());');
      });
      server.middlewares.use(route, async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml(route, html));
      });
    } }] });
    if (!server.httpServer.listening) await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const localHosts = [new URL(origin).host, ...(firebaseSdk ? [8080, 9099, 5001].map(port => `127.0.0.1:${port}`) : [])];
    server.httpServer.on('connect', (_request, socket) => socket.destroy());
    child = spawn(browser, ['--headless=new', '--disable-dev-shm-usage', '--disable-extensions', '--disable-gpu', '--disable-background-networking', '--disable-popup-blocking', '--no-first-run', '--no-default-browser-check',
      // Prevent outbound connections even from workers outside the page's DevTools interception.
      `--proxy-server=${origin}`, `--proxy-bypass-list=<-loopback>;${localHosts.join(';')}`, '--disable-quic',
      ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    childClosed = new Promise(resolve => child.once('close', resolve));
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.on('error', error => complete({ ok: false, error: `Browser launch failed: ${error.message}` }));
    // Edge may exit its launcher successfully and hand the isolated profile to a new process.
    child.on('exit', code => { if (!finished && code !== 0) complete({ ok: false, error: `Browser exited before reporting (${code}). ${stderr.slice(-1200)}` }); });
    let sessionId;
    const cdp = connectCDP(child, event => {
      if (!sessionId || event.sessionId !== sessionId) return;
      onPageEvent?.(event);
      if (event.method === 'Fetch.requestPaused') {
        const {requestId, request} = event.params;
        const url = new URL(request.url);
        if (!mockPng) {
          void page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
          complete({ ok: false, error: `Unexpected request to ${url.origin} blocked by the browser fixture.` }); return;
        }
        const image = url.hostname === 'firebasestorage.googleapis.com' || url.hostname === 'storage.googleapis.com' || url.hostname === 'www.gstatic.com';
        const script = url.hostname === 'apis.google.com';
        const frame = url.pathname === '/__/auth/iframe';
        const text = image ? mockPng : script ? 'window.__authScriptLoaded = true;' : frame ? '<!doctype html><title>Local auth helper fixture</title>' : JSON.stringify({fixture: true});
        const responseHeaders = [{name:'Content-Type',value:image ? 'image/png' : script ? 'text/javascript' : frame ? 'text/html' : 'application/json'}, {name:'Access-Control-Allow-Origin',value:'*'}];
        void page.send('Fetch.fulfillRequest', {requestId, responseCode:200, responseHeaders, body:image ? text : Buffer.from(text).toString('base64')}).catch(error => complete({ok:false,error:error.message}));
      }
      if (event.method === 'Runtime.exceptionThrown') complete({ ok: false, error: event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text });
    });
    browserControl = cdp.browser;
    try {
      // Apply the existing 20-second startup budget to a real CDP exchange.
      await browserControl.send('Browser.getVersion', {}, 20000);
      const info = await browserControl.send('SystemInfo.getProcessInfo').catch(() => null);
      browserPid = info?.processInfo?.find(process => process.type === 'browser')?.id;
      await browserControl.send('Browser.setDownloadBehavior', mockPng || verifyDownload
        ? { behavior: 'allow', downloadPath: join(profile, 'downloads') } : { behavior: 'deny' });
      const { targetId } = await browserControl.send('Target.createTarget', { url: 'about:blank' });
      ({ sessionId } = await browserControl.send('Target.attachToTarget', { targetId, flatten: true }));
      page = cdp.page(sessionId);
    } catch (error) {
      throw new Error(`Chromium CDP startup failed: ${error.message}. ${stderr.slice(-1200)}`, { cause: error });
    }
    await page.send('Runtime.enable');
    if (setupPage) await setupPage(page);
    await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
    await page.send('Page.navigate', { url: `${origin}${route}` }, 15000);
    const result = await report;
    assert.equal(result.ok, true, result.error);
    if (inspectPage) await inspectPage(page, result, join(profile, 'downloads'));
    if (mockPng) {
      let workbook;
      for (let attempt = 0; attempt < 20; attempt++) {
        try { workbook = await readFile(join(profile, 'downloads', 'fixture.xlsx')); break; } catch { await delay(100); }
      }
      assert.ok(workbook?.[0] === 0x50 && workbook?.[1] === 0x4b, 'Spreadsheet download was not written to the isolated profile.');
    }
    if (verifyDownload) await verifyDownload(join(profile, 'downloads'), result);
    return result;
  } finally {
    clearTimeout(timeout); finished = true;
    await browserControl?.send('Browser.close').catch(() => {});
    if (childClosed) await Promise.race([childClosed, delay(3000, undefined, { ref: false })]);
    const isRunning = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const remainingPid = browserPid && browserPid !== process.pid && isRunning(browserPid) ? browserPid
      : child && child.exitCode === null && child.signalCode === null ? child.pid : null;
    if (remainingPid) {
      if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(remainingPid), '/T', '/F'], { windowsHide: true }, resolve));
      else {
        try { process.kill(remainingPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      await Promise.race([childClosed, delay(2000, undefined, { ref: false })]);
    }
    child?.stderr?.destroy();
    await server?.close();
    const target = resolve(profile);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('migapos-isolated-browser-'));
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
}
