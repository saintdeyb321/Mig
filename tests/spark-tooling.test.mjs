import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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

it('refuses production targets and service accounts before starting any Spark test', () => {
  const base = { ...process.env, GCLOUD_PROJECT: 'demo-migapos', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GOOGLE_APPLICATION_CREDENTIALS: '' };
  const run = changes => spawnSync(process.execPath, ['scripts/spark-emulator-guard.mjs'], { env: { ...base, ...changes }, encoding: 'utf8', windowsHide: true }).status;
  assert.equal(run({}), 0);
  for (const env of [{ GCLOUD_PROJECT: 'migapos' }, { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com' }, { GOOGLE_APPLICATION_CREDENTIALS: 'never-read.json' }]) assert.notEqual(run(env), 0);
});
