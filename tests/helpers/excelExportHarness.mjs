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

export async function runExcelFixture({ mode = 'dev', inspectPage, fault = '', force = false, summary = false, oldSummary = false }) {
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
  process.env.NODE_ENV = mode === 'preview' ? 'production' : 'development';
  Object.assign(process.env, { VITE_APP_ENV: 'emulator', VITE_USE_EMULATORS: 'true', VITE_APP_CHECK_MODE: 'off',
    VITE_FIREBASE_PROJECT_ID: 'demo-migapos', VITE_FIREBASE_AUTH_DOMAIN: 'demo-migapos.firebaseapp.com',
    VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789', VITE_FIREBASE_APP_ID: '1:123456789:web:emulator-only',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-migapos.appspot.com', VITE_REPORT_SUMMARIES_ENABLED: String(oldSummary),
    VITE_REPORT_EXPORT_SUMMARIES_ENABLED: String(summary) });
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
      if (matches('reports/infrastructure/summaryRepository.js', id)) return `
        import { createVerifiedSummaryReader } from './summaryReader.js';
        export async function readVerifiedSummary(args) {
          const { businessId, branchId, period } = args;
          const fixture = window.__excelFixture;
          (fixture.summaries ??= []).push({ businessId, branchId, filter: period.filter });
          const sdk = { doc: (_db, name, id) => name + '/' + id, getDocFromServer: async path => {
            (fixture.summaryPoints ??= []).push(path);
            if (fixture.summaryHold) await new Promise(resolve => { (fixture.pendingSummaries ??= []).push(resolve); });
            if (fixture.summaryFault) throw Object.assign(new Error('Snapshot unavailable'), { code: fixture.summaryFault });
            const data = fixture.summaryDocuments?.[path];
            return { metadata: { fromCache: false, hasPendingWrites: false }, exists: () => !!data, data: () => data };
          } };
          const read = createVerifiedSummaryReader({}, { sdk, currentUid: () => args.uid });
          return read(args);
        }`;
      if (matches('reports/infrastructure/sessionReportReads.js', id)) return `
        import { createSessionReportReads } from '../application/sessionReportReads.js';
        const day = date => new Date(+date - 18000000).toISOString().slice(0, 10);
        const record = (name, load) => (...args) => {
          const calls = window.__excelFixture.readerCalls ??= {};
          calls[name] = (calls[name] ?? 0) + 1;
          return load(...args);
        };
        const documentReaders = createSessionReportReads({
          getSalesInPeriod: record('getSalesInPeriod', (business, start, _end, { branchId }) => window.__excelFixture.read('sales', day(start), branchId, business)),
          getPaymentsInPeriod: record('getPaymentsInPeriod', async (business, start, _end, branchId) => (await window.__excelFixture.read('contracts', day(start), branchId, business)).payments),
          getContractsInPeriod: record('getContractsInPeriod', (business, start, _end, branchId) => ['secondary', 'v3'].includes(window.__excelFixture.reference)
            ? window.__excelFixture.read('orders', day(start), branchId, business) : []),
          getCancelledContractCount: record('getCancelledContractCount', async business => {
            const fixture = window.__excelFixture;
            (fixture.countBusinesses ??= []).push(business);
            return fixture.cancelledContractCount ?? 0;
          }),
          getContractAuditDocuments: record('getContractAuditDocuments', business => window.__excelFixture.read('audit', '', 'global', business)),
          readVoidsInPeriod: record('readVoidsInPeriod', (business, start, _end, branchId) => window.__excelFixture.read('voids', day(start), branchId, business)),
          getSessionsInPeriod: record('getSessionsInPeriod', (business, start, _end, branchId) => window.__excelFixture.read('cash', day(start), branchId, business)),
        });
        export function sessionReportReads(...args) {
          window.__excelFixture.documentSources = (window.__excelFixture.documentSources ?? 0) + 1;
          return documentReaders(...args);
        }`;
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
