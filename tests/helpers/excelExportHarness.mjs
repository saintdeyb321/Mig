import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { build, createServer, preview, normalizePath } from '../../frontend/node_modules/vite/dist/node/index.js';
import { runBrowserFixture } from './browserHarness.mjs';
import { environmentFor, hostingHeaders } from '../../frontend/src/config/environments.js';

const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
const workspace = dirname(root);
const main = normalizePath(resolve(root, 'src/main.jsx'));
const entry = normalizePath(relative(dirname(main), fileURLToPath(new URL('../excel-export.fixture.jsx', import.meta.url))));
const matches = (name, path) => path === normalizePath(resolve(root, 'src/features', name));
const isExcel = pathname => /(?:\/deps\/xlsx-js-style|\/assets\/xlsx[^/]*)\.js$/.test(pathname);

export async function runExcelFixture({ mode = 'dev', inspectPage, fault = '', force = false }) {
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
  process.env.NODE_ENV = mode === 'preview' ? 'production' : 'development';
  Object.assign(process.env, { VITE_APP_ENV: 'emulator', VITE_USE_EMULATORS: 'true', VITE_APP_CHECK_MODE: 'off',
    VITE_FIREBASE_PROJECT_ID: 'demo-migapos', VITE_FIREBASE_AUTH_DOMAIN: 'demo-migapos.firebaseapp.com',
    VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789', VITE_FIREBASE_APP_ID: '1:123456789:web:emulator-only',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-migapos.appspot.com' });
  process.chdir(root);
  const artifacts = resolve(workspace, '.release/qa-excel-ux');
  const outDir = resolve(artifacts, 'preview');
  const responses = [], network = [];
  const excelRequests = new Map();
  const onPageEvent = ({ method, params }) => {
    if (method === 'Network.requestWillBeSent' && isExcel(new URL(params.request.url).pathname)) {
      excelRequests.set(params.requestId, params.request.url);
    }
    if (method === 'Network.responseReceived' && excelRequests.has(params.requestId)) {
      const { url, status, mimeType, fromServiceWorker, fromDiskCache } = params.response;
      network.push({ url, status, mimeType, fromServiceWorker, fromDiskCache });
      excelRequests.delete(params.requestId);
    }
    if (method === 'Network.loadingFailed' && excelRequests.has(params.requestId)) {
      network.push({ url: excelRequests.get(params.requestId), failure: params.errorText });
      excelRequests.delete(params.requestId);
    }
  };
  const plugin = {
    name: 'isolated-excel-interface', enforce: 'pre',
    load(id) {
      if (id === main) return `import ${JSON.stringify(entry)};`;
      if (matches('reports/infrastructure/sessionReportReads.js', id)) return `
        import { createSessionReportReads } from '../application/sessionReportReads.js';
        const day = date => new Date(+date - 18000000).toISOString().slice(0, 10);
        export const sessionReportReads = createSessionReportReads({
          getSalesInPeriod: (business, start, _end, { branchId }) => window.__excelFixture.read('sales', day(start), branchId, business),
          getPaymentsInPeriod: async (business, start, _end, branchId) => (await window.__excelFixture.read('contracts', day(start), branchId, business)).payments,
          getContractsInPeriod: async () => [],
          getContractAuditDocuments: business => window.__excelFixture.read('audit', '', 'global', business),
          readVoidsInPeriod: (business, start, _end, branchId) => window.__excelFixture.read('voids', day(start), branchId, business),
          getSessionsInPeriod: (business, start, _end, branchId) => window.__excelFixture.read('cash', day(start), branchId, business),
        });`;
    },
  };
  const config = { root, configFile: resolve(root, 'vite.config.js'), envFile: false, logLevel: 'error', plugins: [plugin],
    resolve: { dedupe: ['react', 'react-dom'] },
    cacheDir: resolve(root, 'node_modules/.vite-excel-qa'),
    optimizeDeps: { force },
    build: { outDir, emptyOutDir: true } };
  const start = async middleware => {
    const install = server => {
      middleware(server);
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (!isExcel(url.pathname)) { next(); return; }
        const original = url.pathname + url.search;
        const failure = fault; fault = '';
        response.on('finish', () => responses.push({ original, served: request.url, status: response.statusCode,
          mime: response.getHeader('content-type') ?? null, cache: response.getHeader('cache-control') ?? null }));
        if (failure === 'stale') { url.searchParams.set('v', '00000000'); request.url = url.pathname + url.search; }
        if (failure === 'unavailable') {
          response.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Fixture: asset temporarily unavailable'); return;
        }
        next();
      });
    };
    const wiring = { name: 'excel-local-browser-middleware', configureServer: install, configurePreviewServer: install };
    const network = { host: '127.0.0.1', port: 0 };
    if (mode === 'preview') {
      await build(config);
      const headers = Object.fromEntries(hostingHeaders(environmentFor('emulator')).map(({ key, value }) => [key, value]));
      return preview({ ...config, plugins: [wiring], preview: { ...network, headers } });
    }
    return createServer({ ...config, plugins: [plugin, wiring], server: { ...network, hmr: false, fs: { allow: [workspace] } } });
  };
  return runBrowserFixture({ route: '/', createFixtureServer: start, onPageEvent,
    setupPage: page => page.send('Network.enable'),
    inspectPage: (page, _ready, downloads) => inspectPage(page, { responses, network, downloads, failNext: type => { fault = type; } }),
    verifyDownload: () => {} });
}
