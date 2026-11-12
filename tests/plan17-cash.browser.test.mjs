import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sep } from 'node:path';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

const module = path => fileURLToPath(new URL('../frontend/src/' + path, import.meta.url)).split(sep).join('/');
it('P17 preserves a pending receipt, then confirms expiry once on reconnect without exposing its technical ID', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile:new URL('./plan17-cash.browser.html',import.meta.url), route:'/p17-cash',
    moduleMocks: {
      [module('core/firebase/client.js')]: 'export const auth={currentUser:{uid:"p17-cashier"}}; export const db={};',
      [module('features/cash-register/infrastructure/cashRegisterRepository.js')]: `
        export async function findOpenSession() { window.__p17.reads++; return window.__p17.turn; }
        export function watchCashAvailability(){ return () => {}; }
        export async function finalizeExpiredCash({sessionId}) {
          if (!window.__p17.online || window.__p17.turn?.id !== sessionId) throw Error('Wrong scope');
          window.__p17.writes++; window.__p17.turn=null;
        }
        export const createSession=()=>{throw Error('Unexpected opening')};
        export const updateSession=createSession, cacheSession=createSession, reserveOfflineSession=createSession, previewSessionClose=createSession;`,
    },
    setupPage: page => page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
  });
  assert.equal(result.checks,4);
});
