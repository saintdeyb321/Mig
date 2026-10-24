import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';
import { verifyBackupFile } from '../frontend/src/features/backups/domain/backupFile.js';

it('downloads a real encrypted backup in isolated Chromium and preserves IndexedDB with zero restoration writes', {timeout:90000}, async () => {
  const module = path => fileURLToPath(new URL(`../frontend/src/${path}`,import.meta.url)).replaceAll('\\','/');
  const result = await runBrowserFixture({htmlFile:new URL('./backups.browser.html',import.meta.url),route:'/backups-test',
    moduleMocks:{[module('core/firebase/client.js')]:'export const auth={currentUser:null}; export const db={};',
      [module('features/backups/infrastructure/backupRepository.js')]:`export function createBackupRepository(){return async options=>{globalThis.__remoteReads++;if(!globalThis.__pendingRemote)throw Error('Remote reads must be explicit');return new Promise(resolve=>globalThis.__pendingRemote.push({resolve,options}));};}`},
    setupPage:page=>page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
    verifyDownload:async (directory,report) => {
      let text;
      for(let attempt=0;attempt<30;attempt++) {try{text=await readFile(join(directory,report.filename),'utf8');break;}catch{await delay(100);}}
      assert.ok(text,'The browser must write the actual JSON download to its isolated profile');
      assert.equal(JSON.parse(text).format,'migapos-encrypted-backup');
      const verified = await verifyBackupFile(text,'fixture-password-123','backup-tenant');
      assert.equal(verified.writes,0); assert.equal(verified.records,3);
    }});
  assert.equal(result.checks.length,10);
});
