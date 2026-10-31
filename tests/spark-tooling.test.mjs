import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { releaseConfig } from '../scripts/release.mjs';
import { environmentFor, hostingHeaders } from '../frontend/src/config/environments.js';

const require = createRequire(import.meta.url);
it('keeps patched glob APIs compatible across all trees and the archive/filelist consumers', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const folder of ['../', '../frontend/', '../functions/']) {
    const consumer = createRequire(new URL(folder + 'package.json', import.meta.url));
    const glob = consumer('glob');
    const cwd = fileURLToPath(new URL(folder, import.meta.url));
    assert.deepEqual(glob.sync('package.json', { cwd, nodir: true }), ['package.json']);
    assert.deepEqual(await glob.glob('package.json', { cwd, nodir: true }), ['package.json']);
    await assert.rejects(glob.glob('*.jsx', { cwd: fileURLToPath(new URL('../frontend/src/modules/pos/', import.meta.url)),
      signal: AbortSignal.abort(new Error('expected cancellation')) }), /expected cancellation/);
  }
  const archive = require('archiver')('zip'), entries = [], chunks = [];
  const completed = new Promise((resolve, reject) => { archive.on('error', reject); archive.on('entry', entry => entries.push(entry.name)); archive.on('data', chunk => chunks.push(chunk)); archive.on('end', resolve); });
  archive.glob('package.json', { cwd: root }); await archive.finalize(); await completed;
  assert.deepEqual(entries, ['package.json']); assert.equal(Buffer.concat(chunks).subarray(0, 2).toString(), 'PK');
  const frontend = createRequire(new URL('../frontend/package.json', import.meta.url));
  const { FileList } = frontend('filelist');
  // A small directory and basename pattern avoid recursively scanning node_modules and
  // filelist's existing Windows path-normalization behavior (independent of this update).
  const previous = process.cwd();
  try {
    process.chdir(fileURLToPath(new URL('../frontend/src/modules/pos/', import.meta.url)));
    assert.ok(new FileList('*.jsx').toArray().includes('PaymentParts.jsx'));
  } finally { process.chdir(previous); }
});

it('retains callable minimatch consumers rather than forcing incompatible global exports', () => {
  const modern = createRequire(require.resolve('glob/package.json'))('minimatch');
  assert.equal(typeof modern.minimatch, 'function');
  assert.throws(() => modern('assets/main.js', '**/*.js'), TypeError);
  const { configMatcher } = require('superstatic/lib/utils/patterns.js');
  assert.equal(configMatcher('/assets/main.js', { source: '/assets/**' }), true);
  assert.equal(configMatcher('/private/data', { source: '/assets/**' }), false);
});

it('keeps patched RE2JS repeated lookbehind matching compatible with the Firestore SDK', async () => {
  const frontend = createRequire(new URL('../frontend/package.json', import.meta.url));
  for (const { RE2JS } of [require('re2js'), frontend('re2js'), await import('re2js')]) {
    const matcher = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS).matcher('ab'.repeat(256));
    let count = 0; while (matcher.find()) count++;
    assert.equal(count, 256);
  }
});
it('builds Spark release configuration with no Functions or Storage deployment resources', () => {
  const config = releaseConfig(JSON.parse(readFileSync('firebase.json', 'utf8')), environmentFor('production'));
  assert.equal(config.hosting.site, 'migapos-peru'); assert.equal(config.functions, undefined); assert.equal(config.storage, undefined);
  assert.equal(config.emulators, undefined);
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.doesNotMatch(JSON.stringify(hostingHeaders(environmentFor('production'))), /cloudfunctions.net|storage.googleapis.com/);
  assert.deepEqual(JSON.parse(readFileSync('scripts/security-exceptions.json', 'utf8')), []);
});

it('keeps patched PubSub and gaxios CommonJS APIs compatible with the Node 22 CLI without network calls', async () => {
  const { PubSub } = require('@google-cloud/pubsub');
  const pubsub = new PubSub({ projectId: 'demo-migapos', apiEndpoint: '127.0.0.1:8085' });
  assert.ok(pubsub.topic('local-api-check').name.endsWith('/topics/local-api-check'));
  await pubsub.close();
  const { Gaxios } = require('gaxios');
  const client = new Gaxios({ adapter: async config => ({ status: 200, statusText: 'OK', headers: {}, config, data: { local: true } }) });
  assert.equal((await client.request({ url: 'http://127.0.0.1/local-adapter-only' })).data.local, true);
});

it('keeps both body-parser major APIs compatible with compressed JSON and rejects ambiguous fast-uri inputs', async () => {
  const modern = createRequire(new URL('../node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url));
  for (const parser of [require('body-parser'), modern('body-parser')]) {
    const middleware = parser.json();
    const server = createServer((request, response) => middleware(request, response, error => {
      response.writeHead(error ? 400 : 200, {'Content-Type':'application/json'});
      response.end(JSON.stringify(error ? {error:true} : request.body));
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:gzipSync('{"fixture":true}')});
      assert.equal(response.status,200); assert.deepEqual(await response.json(),{fixture:true});
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
  const uri = require('fast-uri');
  assert.notEqual(uri.parse('%6Aavascript:alert(1)').scheme,'javascript');
  assert.ok(uri.parse('http://a@b@evil.example/').error);
});

it('refuses production targets and service accounts before starting any Spark test', () => {
  const base = { ...process.env, GCLOUD_PROJECT: 'demo-migapos', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GOOGLE_APPLICATION_CREDENTIALS: '' };
  const run = changes => spawnSync(process.execPath, ['scripts/spark-emulator-guard.mjs'], { env: { ...base, ...changes }, encoding: 'utf8', windowsHide: true }).status;
  assert.equal(run({}), 0);
  for (const env of [{ GCLOUD_PROJECT: 'migapos' }, { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com' }, { GOOGLE_APPLICATION_CREDENTIALS: 'never-read.json' }]) assert.notEqual(run(env), 0);
});
