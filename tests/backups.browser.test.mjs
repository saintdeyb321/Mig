import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';
import { verifyBackupFile } from '../frontend/src/features/backups/domain/backupFile.js';
const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');

it('downloads a real encrypted backup in isolated Chromium and preserves IndexedDB with zero restoration writes', {timeout:90000}, async () => {
  const module = path => fileURLToPath(new URL(`../frontend/src/${path}`,import.meta.url)).replaceAll('\\','/');
  const result = await runBrowserFixture({htmlFile:new URL('./backups.browser.html',import.meta.url),route:'/backups-test',excel:true,
    moduleMocks:{[module('core/firebase/client.js')]:'export const auth={currentUser:null}; export const db={};',
      [module('features/backups/infrastructure/remoteBackup.js')]:`export async function readRemoteBackup(options){globalThis.__remoteReads++;if(!globalThis.__pendingRemote)throw Error('Remote reads must be explicit');return new Promise(resolve=>globalThis.__pendingRemote.push({resolve,options}));}`},
    setupPage:page=>page.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]}),
    verifyDownload:async (directory,report) => {
      let text;
      for(let attempt=0;attempt<30;attempt++) {try{text=await readFile(join(directory,report.filename),'utf8');break;}catch{await delay(100);}}
      assert.ok(text,'The browser must write the actual JSON download to its isolated profile');
      assert.equal(JSON.parse(text).format,'migapos-encrypted-backup');
      const verified = await verifyBackupFile(text,'fixture-password-123','backup-tenant');
      assert.equal(verified.writes,0); assert.equal(verified.records,3);
      const workbook = XLSX.read(await readFile(join(directory,report.excelName)), { type: 'buffer', cellNF: true });
      assert.deepEqual(workbook.SheetNames, ['Alcance', 'Productos', 'Invitaciones']);
      const entries = Object.values(workbook.Sheets.Productos);
      const textCell = entries.find(cell => cell?.v === '=1+1');
      assert.equal(textCell.t, 's'); assert.equal(textCell.f, undefined);
      assert.ok(entries.some(cell => cell?.v === 10.05 && cell.t === 'n' && /S\//.test(cell.z)));
      assert.ok(Object.values(workbook.Sheets.Alcance).some(cell => cell?.v === 'EXPORTACIÓN PARCIAL'));
      assert.ok(entries.every(cell => cell?.v !== 'technical-product'));
    }});
  assert.equal(result.checks.length,13);
});
