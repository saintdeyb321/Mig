import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readBrowserBuildCss, runBrowserFixture} from '../../../tests/helpers/browserHarness.mjs';
import {clips, fps, viewport} from './timeline.mjs';

const file = relative => fileURLToPath(new URL(relative, import.meta.url));
const src = name => file(`../../../frontend/src/${name}`).replaceAll('\\', '/');
const hooks = [
  ['catalog/hooks/useCategories', 'useCategories', 'categories'],
  ['catalog/hooks/useProducts', 'useProducts', 'products'],
  ['cash-register/hooks/useCashRegister', 'useCashRegister', 'cash'],
  ['contracts/hooks/useContracts', 'useContracts', 'contracts'],
  ['customers/hooks/useAgenda', 'useAgenda', 'agenda'],
  ['branches/hooks/useBranches', 'useBranches', 'branches'],
  ['backups/hooks/useLocalBackup', 'useLocalBackup', 'backup'],
  ['reports/hooks/useReports', 'useReports', 'reports'],
  ['sales/hooks/useSalesHistory', 'useSalesHistory', 'history'],
  ['settings/hooks/useSettings', 'useSettings', 'settings'],
  ['users/hooks/useUserManagement', 'useUserManagement', 'users'],
];
const moduleMocks = Object.fromEntries(hooks.map(([path, hook, key]) => [
  src(`features/${path}.js`),
  `import {useSyncExternalStore} from 'react';
  export function ${hook}() {
    const fixture = window.__p09;
    useSyncExternalStore(next => fixture.watch('${key}', next), () => fixture.revisions['${key}'] ?? 0);
    return fixture.${key};
  }`,
]));
Object.assign(moduleMocks, {
  [src('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p09-user"}};export const db={};',
  [src('hooks/useSuperAdmin.js')]: 'export function useSuperAdmin(){return window.__p09.admin;}',
  [src('features/notifications/hooks/useAlerts.js')]: 'export function useAlerts(){return {alerts:[],canViewNotifications:true};}',
  [src('features/reports/hooks/useExportSales.js')]: 'export function useExportSales(){return {isExporting:false,exportData:()=>window.__p09.forbidden()};}',
  [src('features/contracts/hooks/useContractImageUrls.js')]: 'export function useContractImageUrls(){return {urls:[],isLoading:false,error:null};}',
  [src('features/payments/infrastructure/paymentRepository.js')]: 'export const getPaymentsByContract=async()=>window.__p09.ledger;',
  [src('features/licenses/infrastructure/platformBusinessRepository.js')]: 'export const readPlatformBusiness=async()=>window.__p09.platformDetail;',
  [src('features/sales/hooks/useRecentSales.js')]: 'export function useRecentSales(){return {sales:[],rejected:[],isLoading:false};}',
  [src('features/sales/infrastructure/saleTransactions.js')]: `
    const forbidden = () => window.__p09.forbidden();
    export const saveSaleTransaction=forbidden, saveSaleDraftTransaction=forbidden,
      verifyPendingSaleTransaction=forbidden, reviewDraftSaleTransaction=forbidden,
      confirmDraftSaleTransaction=forbidden, subscribeSaleAcknowledgement=()=>()=>{},
      subscribeVoidAttempts=()=>()=>{}, recoverFinancialReceipts=forbidden;
  `,
});

const recordings = new Map();
const gestures = {};
let connection;
let active;
const external = [];

await runBrowserFixture({
  htmlFile: new URL('../../../tests/plan09.browser.html', import.meta.url),
  route: '/plan09-ux',
  fixture: {css: await readBrowserBuildCss()},
  moduleMocks,
  firebaseSdk: false,
  headers: {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'",
  },
  setupPage: async page => {
    await page.send('Emulation.setDeviceMetricsOverride', viewport);
    await page.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
    await page.send('Network.enable');
  },
  onPageEvent: ({method, params}) => {
    if (method === 'Network.requestWillBeSent' && /^https?:/.test(params.request.url)) {
      const url = new URL(params.request.url);
      if (url.hostname !== '127.0.0.1') external.push(url.origin);
    }
    if (method === 'Page.screencastFrame' && connection) {
      void connection.send('Page.screencastFrameAck', {sessionId: params.sessionId}).catch(() => {});
      if (active) active.frames.push({at: performance.now() - active.start, bytes: Buffer.from(params.data, 'base64')});
    }
  },
  inspectPage: async page => {
    connection = page;
    const evaluate = async (fn, ...args) => {
      const response = await page.send('Runtime.evaluate', {
        expression: `(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`,
        awaitPromise: true, returnByValue: true,
      });
      assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
      return response.result.value;
    };
    const show = async view => {
      const error = await evaluate(async name => {
        await window.__p09.show(name, 'dueño');
        window.scrollTo(0, 0);
        await window.__p09.frames();
        return window.__p09.renderError;
      }, view);
      assert.ok(!error, error);
    };
    const tap = async (at, selector) => {
      await delay(Math.max(0, at - (performance.now() - active.start)));
      const point = await evaluate(query => {
        const control = document.querySelector(query);
        if (!control || control.disabled) {
          const visible = [...document.querySelectorAll('.pos-catalog button[title]')].slice(0, 4).map(el => [el.title, el.disabled]);
          throw Error(`Control no disponible: ${query} ${JSON.stringify(visible)}`);
        }
        const rect = control.getBoundingClientRect();
        const x = Math.round(rect.x + rect.width / 2);
        const y = Math.round(rect.y + rect.height / 2);
        if (!control.contains(document.elementFromPoint(x, y))) throw Error(`Control fuera de alcance: ${query} (${x},${y})`);
        return {x, y};
      }, selector);
      active.taps.push({...point, frame: Math.round((performance.now() - active.start) / 1000 * fps)});
      await page.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
      await delay(48);
      await page.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await delay(170);
    };
    const film = async (name, action) => {
      const {data} = await page.send('Page.captureScreenshot', {format: 'jpeg', quality: 91});
      active = {start: performance.now(), frames: [{at: 0, bytes: Buffer.from(data, 'base64')}], taps: [], swipes: []};
      await page.send('Page.startScreencast', {format: 'jpeg', quality: 91, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1});
      try {
        await action();
        await delay(Math.max(0, clips[name] / fps * 1000 - (performance.now() - active.start)));
      } finally {
        await page.send('Page.stopScreencast');
      }
      assert.ok(active.frames.length >= 8, `Insuficientes cuadros reales para ${name}: ${active.frames.length}`);
      recordings.set(name, active.frames);
      gestures[name] = {taps: active.taps, swipes: active.swipes, capturedFrames: active.frames.length};
      console.log(`${name} · ${active.frames.length} cuadros del navegador`);
      active = null;
    };
    const filmScroll = async (name, firstFrame, distance, movingFrames) => {
      await evaluate(() => {
        const scrollable = [];
        for (let node = document.querySelector('.workspace-page'); node; node = node.parentElement) {
          if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) scrollable.push(node);
        }
        window.__bragScrollers = [...new Set([...scrollable, document.scrollingElement])];
        for (const node of window.__bragScrollers) node.scrollTop = 0;
      });
      const point = {x: 200, y: 615};
      await page.send('Input.synthesizeScrollGesture', {
        ...point, yDistance: -distance, speed: 1350, gestureSourceType: 'touch', preventFling: true,
      }, 4500);
      await delay(150);
      const motion = await evaluate(requested => {
        const nodes = window.__bragScrollers;
        const native = nodes.find(node => node.scrollTop > 80);
        window.__bragScroller = native || nodes.find(node => node.scrollHeight - node.clientHeight > 80);
        const node = window.__bragScroller;
        return {native: Boolean(native), end: node ? (native ? node.scrollTop : Math.min(requested, node.scrollHeight - node.clientHeight)) : 0};
      }, distance);
      const {end} = motion;
      assert.ok(end > 80, `El gesto no desplazó la vista ${name}.`);

      // Sample the same real scroll path at an exact 30 fps, independent of CDP's screencast rate.
      const frames = [];
      for (let index = 0; index <= movingFrames; index++) {
        const t = index / movingFrames;
        await evaluate(async y => {
          window.__bragScroller.scrollTop = y;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, end * t * t * (3 - 2 * t));
        const {data} = await page.send('Page.captureScreenshot', {format: 'jpeg', quality: 91});
        frames.push({at: (index === 0 ? 0 : firstFrame + index) * 1000 / fps, bytes: Buffer.from(data, 'base64')});
      }
      recordings.set(name, frames);
      gestures[name] = {taps: [], swipes: [{...point, frame: firstFrame}], capturedFrames: frames.length, native: motion.native};
      console.log(`${name} · ${frames.length} cuadros del navegador · scroll ${end}px`);
    };

    await evaluate(() => {
      const demo = window.__p09;
      const names = ['Pan artesanal', 'Café molido', 'Galletas de avena', 'Granola tostada'];
      demo.products.filteredProducts.forEach((product, index) => { product.name = names[index]; });
      const extra = ['Pan integral', 'Pan de centeno', 'Biscotes', 'Tostadas', 'Bollos', 'Galletas de cacao'];
      extra.forEach((name, index) => demo.products.filteredProducts.push({
        ...demo.products.filteredProducts[0], id: `brag-demo-${index}`, name,
      }));
      demo.products.businessBranches[0].name = 'Sede demo';
      demo.reports.topProducts[0].name = names[0];
    });
    await show('products');
    await show('pos');
    const size = await evaluate(() => [innerWidth, innerHeight, devicePixelRatio, document.documentElement.scrollWidth]);
    assert.deepEqual(size, [390, 844, 2, 390]);
    await film('pos', async () => {
      await tap(1350, 'button[title="Pan artesanal"]');
      assert.match(await evaluate(() => document.querySelector('.pos-cart-launcher').innerText), /S\/ 5\.00/);
      await tap(2820, '.pos-cart-launcher');
      assert.equal(await evaluate(() => document.querySelector('[role="dialog"] .pos-ticket-total strong').textContent.trim()), 'S/ 5.00');
      await tap(4700, '[role="dialog"] button[aria-label="Aumentar Pan artesanal"]');
      assert.equal(await evaluate(() => document.querySelector('[role="dialog"] .pos-ticket-total strong').textContent.trim()), 'S/ 10.00');
    });
    await show('products');
    assert.match(await evaluate(() => document.querySelector('.workspace-page').innerText), /100 disp\./);
    await filmScroll('stock', 32, 360, 32);
    assert.ok(await evaluate(() => {
      return [...document.querySelectorAll('.workspace-page span')].some(el => {
        const rect = el.getBoundingClientRect();
        return el.textContent.includes('100 disp.') && rect.top >= 0 && rect.bottom < innerHeight - 60;
      });
    }), 'La disponibilidad no quedó visible después del desplazamiento.');
    await show('reports');
    assert.match(await evaluate(() => document.querySelector('.workspace-page').innerText), /Tickets POS/);
    const distance = await evaluate(() => {
      const chart = document.querySelector('[aria-label="Gráfico de ventas"]');
      const rect = chart.getBoundingClientRect();
      return Math.max(560, Math.ceil(rect.bottom - innerHeight + 115));
    });
    await filmScroll('reports', 39, distance, 48);
    assert.ok(await evaluate(() => {
      const rect = document.querySelector('[aria-label="Gráfico de ventas"]').getBoundingClientRect();
      return rect.top < innerHeight - 100 && rect.bottom > 80;
    }), 'La gráfica no quedó visible.');
    assert.deepEqual(external, [], 'Se intentó una conexión fuera del fixture aislado.');
  },
});

await mkdir(file('public/recordings/'), {recursive: true});
await mkdir(file('src/'), {recursive: true});
const ffmpeg = file('../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
for (const [name, frames] of recordings) {
  let current = 0;
  const timeline = Array.from({length: clips[name]}, (_, index) => {
    const at = index * 1000 / fps;
    while (current + 1 < frames.length && frames[current + 1].at <= at) current++;
    return frames[current].bytes;
  });
  const encode = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps),
    '-c:v', 'mjpeg', '-i', 'pipe:0', '-vf', 'scale=780:1688:in_range=jpeg:out_range=tv', '-c:v', 'libx264',
    '-crf', '15', '-pix_fmt', 'yuv420p', '-threads', '3', '-movflags', '+faststart', file(`public/recordings/${name}.mp4`)],
  {input: Buffer.concat(timeline), encoding: 'utf8'});
  if (encode.error) throw encode.error;
  assert.equal(encode.status, 0, encode.stderr);
}
await writeFile(file('src/gestures.generated.json'), JSON.stringify(gestures, null, 2) + '\n');
console.log('Tres tomas móviles codificadas a 30 fps. Firebase simulado y sin solicitudes externas.');
