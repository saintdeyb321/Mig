import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { sep, resolve } from 'node:path';
import { readBrowserBuildCss, runBrowserFixture } from './helpers/browserHarness.mjs';

const module = path => fileURLToPath(new URL('../frontend/src/' + path, import.meta.url)).split(sep).join('/');
it('P17-RC preserves pending receipts, materializes on reconnect and opens once with the ordinary 14-hour form', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile:new URL('./plan17-cash.browser.html',import.meta.url), route:'/p17-cash', fixture:{ css:await readBrowserBuildCss() },
    moduleMocks: {
      [module('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p17-cashier"}}; export const db={};',
      [module('features/cash-register/infrastructure/cashRegisterRepository.js')]: `
        export async function findOpenSession() { window.__p17.reads++; return window.__p17.turn; }
        export function watchCashAvailability(_business, _branch, _session, onChange){
          window.__p17.watch = onChange;
          return () => { window.__p17.watch = null; };
        }
        export async function finalizeExpiredCash({sessionId}) {
          if (!window.__p17.online || window.__p17.turn?.id !== sessionId) throw Error('Wrong scope');
          window.__p17.writes++; window.__p17.turn=null;
        }
        export async function createSession(command) {
          const model = window.__p17;
          if (!model.online || !model.turn || command.recoverSessionId || model.opens) throw Error('Unexpected opening');
          model.opens = 1; model.writes++;
          model.turn = { ...command, status:'open', durationHours:14, runtime:'spark', openedAt:new Date().toISOString(), serverConfirmed:true };
          model.watch?.();
          await new Promise(resolve => setTimeout(resolve, 100));
          return model.turn;
        }
        const unexpected=()=>{throw Error('Unexpected cash operation')};
        export const updateSession=unexpected, cacheSession=unexpected, reserveOfflineSession=unexpected, previewSessionClose=unexpected;`,
    },
    async inspectPage(page) {
      const dir = resolve(process.env.MIGAPOS_TEST_ARTIFACT_DIR || '.release', 'p17-rc-visual');
      await mkdir(dir, { recursive: true });
      for (const [width, height] of [[1280,560],[320,640]]) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:width<768 });
        await new Promise(resolve => setTimeout(resolve, 150));
        const { result: layout } = await page.send('Runtime.evaluate', { expression:`(() => {
          const dialog = document.querySelector('[role=dialog]');
          const fund = dialog.querySelector('input').getBoundingClientRect();
          const action = dialog.querySelector('button[type=submit]').getBoundingClientRect();
          return { fund: fund.top >= 0 && fund.bottom <= innerHeight,
            action: action.left >= 0 && action.right <= innerWidth && action.bottom <= innerHeight };
        })()`, returnByValue:true });
        assert.deepEqual(layout.value, { fund:true, action:true }, `Opening form at ${width}×${height}`);
        const shot = await page.send('Page.captureScreenshot', { format:'png' });
        await writeFile(resolve(dir, `apertura-${width}x${height}.png`), Buffer.from(shot.data,'base64'));
      }
      const submit = await page.send('Runtime.evaluate', { expression:'__p17Submit()', awaitPromise:true, returnByValue:true });
      assert.equal(submit.exceptionDetails, undefined, JSON.stringify(submit.exceptionDetails));
      await page.send('Runtime.evaluate', { expression:'__p17Dispose()' });
    },
    setupPage: page => page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
  });
  assert.equal(result.checks,6);
});
