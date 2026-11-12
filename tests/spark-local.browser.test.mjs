import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { it } from 'node:test';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('P18 bounds WebP and Base64, recovers partial photos and preserves the encrypted queue in Chromium', { timeout: 90000 }, async () => {
  const module = path => fileURLToPath(new URL('../frontend/src/' + path, import.meta.url)).replaceAll('\\', '/');
  const client = module('core/firebase/client.js');
  const result = await runBrowserFixture({ htmlFile: new URL('./spark-local.browser.html', import.meta.url), route: '/spark-local-test',
    moduleMocks: {
      [client]: 'export const auth = {currentUser: null}; export const db = {};',
      [module('features/contracts/infrastructure/contractMediaRepository.js')]: `
        export const imageHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
        export function createContractMediaRepository(_db,{currentUser}) {return {
          async upload(scope,job){
            const m=window.__p18;
            m.calls.push(job.mediaId);
            if(m.networkFailure===m.calls.length) throw Error('Conexión interrumpida');
            m.photos.set(job.mediaId,job.blob);
            if(!m.manifest.includes(job.mediaId)) m.manifest.push(job.mediaId);
            return {parent:{mediaIds:[...m.manifest],referenceImages:[],pendingMedia:null}};
          },
          async readPhoto(scope,id,{signal}){
            const m=window.__p18; m.reads++;
            m.active=(m.active??0)+1; m.peak=Math.max(m.peak??0,m.active);
            try {
              await new Promise(resolve=>setTimeout(resolve,20)); signal?.throwIfAborted();
              if(scope.uid!==currentUser()?.uid||scope.uid==='pickup-only'||!m.photos.has(id)) throw Error('No autorizado');
              return {blob:m.photos.get(id)};
            } finally { m.active--; }
          }
        };}`,
    },
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.checks.length, 24);
  assert.equal(result.metrics.photos.length, 4);
  console.log(JSON.stringify(result.metrics));
  const output = new URL('../.release/qa-p18/', import.meta.url);
  await mkdir(output,{recursive:true});
  await writeFile(new URL('foto-letras.webp',output),Buffer.from(result.photoSample.split(',')[1],'base64'));
  for (const [name, url] of [['qr-600',result.encodedQR],['qr-200',result.mobileQR]]) {
    await writeFile(new URL(name+'.png',output),Buffer.from(url.split(',')[1],'base64'));
  }
});
