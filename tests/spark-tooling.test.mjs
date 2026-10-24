import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { releaseConfig } from '../scripts/release.mjs';
import { environmentFor, hostingHeaders } from '../frontend/src/config/environments.js';

const require = createRequire(import.meta.url);
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
