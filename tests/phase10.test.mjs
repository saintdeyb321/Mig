import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { printDate, paymentDate, printFinancials } from '../frontend/src/utils/printValues.js';
import { generateContractReceiptHTML } from '../frontend/src/utils/contractReceiptTemplate.js';
import { generateContractProductionHTML, generateContractTextOnlyHTML } from '../frontend/src/utils/contractProductionTemplate.js';
import { environments, environmentFor, validateWebEnvironment, hostingHeaders } from '../frontend/src/config/environments.js';
import { assertReleaseGuard, assertSmokeTarget, releaseConfig, releasePlan } from '../scripts/release.mjs';
import { observeOperation, logJobState } from '../functions/src/core/observability.js';
import { SaleError } from '../functions/src/sales/domain/saleModel.js';
import { requireShift } from '../functions/src/core/authorization.js';
import { isWithinShift, shiftEndMillis } from '../functions/src/core/shiftSchedule.js';
import { isWithinShift as clientShift } from '../frontend/src/core/auth/shiftAccess.js';
import { reportDiagnostic, diagnosticSnapshot } from '../frontend/src/core/errors/diagnostics.js';
import { isDeterministicSaleError } from '../frontend/src/features/sales/domain/queueState.js';
import { assertEmulatorEnvironment } from '../scripts/emulator-guard.mjs';

const publicEnv = (name = 'emulator', profiles = environments) => ({ VITE_APP_ENV: name, VITE_FIREBASE_PROJECT_ID: profiles[name].projectId,
  VITE_FIREBASE_AUTH_DOMAIN: profiles[name].authDomain, VITE_FIREBASE_STORAGE_BUCKET: profiles[name].projectId + '.appspot.com',
  VITE_FIREBASE_API_KEY: 'test-public-key', VITE_FIREBASE_APP_ID: '1:123:web:fixture', VITE_FIREBASE_MESSAGING_SENDER_ID: '123' });
const noon = '2026-10-23T17:00:00Z', midnight = '2026-10-24T05:00:00Z';

describe('Real ledger dates and cancelled contract printing', () => {
  it('prioritizes occurredAt Timestamp, supports Date/ISO and formats Lima independently of host time zone', () => {
    const stamp = { toDate: () => new Date(midnight) };
    assert.equal(paymentDate({ occurredAt: stamp, date: noon }, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), '00:00');
    assert.equal(paymentDate({ date: new Date(noon) }, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), '12:00');
    assert.equal(printDate('2026-10-24T02:30:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' }), '23/10/2026');
    assert.equal(printDate('2026-10-24T02:30Z', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), '21:30');
  });
  it('does not replace corrupt/missing dates with now or hide an invalid occurredAt', () => {
    for (const value of [null, undefined, '', 'bad', '2026-02-30T00:00:00Z', '10/23/2026', 0, new Date(NaN), { toDate: () => new Date(NaN) }]) assert.equal(printDate(value), 'Fecha no disponible');
    assert.equal(paymentDate({ occurredAt: 'bad', date: noon }), 'Fecha no disponible');
  });
  for (const template of [generateContractReceiptHTML, generateContractProductionHTML, generateContractTextOnlyHTML]) {
    it(`${template.name} prints historic installments, negative refunds and no fictitious cancelled debt/payment`, () => {
      const contract = { contractId: 'fixture', total: 100, balance: 0, status: 'cancelado', paymentsMigrated: true,
        payments: [{ amount: 20, type: 'advance', label: 'Primera', method: 'efectivo', occurredAt: '2025-01-12T18:00:00Z' },
          { amount: 30, type: 'payment', label: 'Segunda', method: 'yape', occurredAt: new Date('2025-02-14T18:00:00Z') },
          { amount: -50, type: 'refund', label: 'Devolución', method: 'efectivo', occurredAt: { toDate: () => new Date('2025-03-16T18:00:00Z') } }] };
      const html = template(contract, {});
      for (const value of ['12/01', '14/02', '16/03', 'Primera', 'Segunda', 'Devolución', '- S/ 50.00']) assert.ok(html.includes(value), value);
      assert.deepEqual(printFinancials(contract), { paidTotal: 0, balance: 0, settledLabel: 'CANCELADO · SIN DEUDA' });
      const partialLedger = { ...contract, status: 'entregado_con_deuda', paidTotal: 60, balance: 40, payments: [contract.payments[0]] };
      assert.equal(printFinancials(partialLedger).paidTotal, 60);
      assert.ok(template(partialLedger, {}).includes('60.00'), 'A branch-scoped ledger must not understate the server total.');
      assert.equal(printFinancials({ ...contract, paidTotal: 0, payments: [contract.payments[2]] }).paidTotal, 0);
    });
  }
});

describe('Environment/release guardrails', () => {
  const staging = { ...environments, staging: { projectId: 'fixture-staging', hostingSite: 'fixture-staging-site', authDomain: 'fixture-staging.firebaseapp.com', region: 'us-central1' } };
  it('keeps the existing real project/site; missing independent staging is explicitly blocked', () => {
    assert.equal(environmentFor('production').projectId, 'migapos'); assert.equal(environmentFor('production').hostingSite, 'migapos-peru');
    assert.throws(() => environmentFor('staging'), /pendiente/);
  });
  it('validates public config and refuses real projects in Emulator, cross-environment Auth/Storage and missing app configuration', () => {
    assert.equal(validateWebEnvironment(publicEnv()).emulator, true);
    for (const changes of [{ VITE_FIREBASE_PROJECT_ID: 'migapos' }, { VITE_FIREBASE_AUTH_DOMAIN: 'migapos.firebaseapp.com' }, { VITE_FIREBASE_STORAGE_BUCKET: 'migapos.appspot.com' }, { VITE_USE_EMULATORS: 'false' }, { VITE_FIREBASE_API_KEY: '' }, { VITE_PRIVATE_KEY: 'private' }]) assert.throws(() => validateWebEnvironment({ ...publicEnv(), ...changes }));
    assert.throws(() => validateWebEnvironment({ ...publicEnv('production'), VITE_USE_EMULATORS: 'true' }));
    assert.throws(() => environmentFor('staging', { ...staging, staging: environments.production }), /separado/);
    assert.throws(() => environmentFor('staging', { ...staging, staging: { ...staging.staging, authDomain: environments.production.authDomain } }), /no pertenece/);
    assert.throws(() => environmentFor('production', { ...environments, production: { ...environments.production, hostingSite: 'invalid/site' } }), /site inválido/);
    const mixedBucket = { ...staging, staging: { ...staging.staging, storageBucket: 'migapos.appspot.com' } };
    assert.throws(() => validateWebEnvironment({ ...publicEnv('staging', mixedBucket), VITE_FIREBASE_STORAGE_BUCKET: 'migapos.appspot.com' }, 'staging', mixedBucket), /Storage de producción/);
    assert.equal(validateWebEnvironment(publicEnv('staging', staging), 'staging', staging).projectId, 'fixture-staging');
  });
  it('builds exact CSP per environment and only adds Enterprise origins when explicitly enabled', () => {
    const policies = Object.fromEntries(['production', 'emulator', 'staging'].map(name => [name, hostingHeaders(environmentFor(name, staging))[0].value]));
    assert.ok(policies.production.includes('us-central1-migapos.cloudfunctions.net'));
    assert.ok(!policies.staging.includes('https://migapos.firebaseapp.com')); assert.ok(!policies.staging.includes('us-central1-migapos.cloudfunctions.net'));
    assert.ok(policies.emulator.includes('http://127.0.0.1:5001')); assert.ok(!policies.emulator.includes('cloudfunctions.net'));
    assert.ok(policies.emulator.includes("script-src 'self' https://apis.google.com"));
    for (const policy of Object.values(policies)) { assert.ok(!policy.includes('*')); assert.ok(!policy.includes('unsafe-eval')); assert.ok(!/script-src[^;]*unsafe-inline/.test(policy)); }
    const appCheck = hostingHeaders(environmentFor('production'), { appCheck: true })[0].value;
    assert.ok(appCheck.includes('https://www.google.com/recaptcha/')); assert.ok(!policies.production.includes('recaptcha'));
    assert.throws(() => validateWebEnvironment({ ...publicEnv(), VITE_APP_CHECK_MODE: 'monitor' }), /Emulator/);
    assert.throws(() => validateWebEnvironment({ ...publicEnv('production'), VITE_APP_CHECK_MODE: 'monitor' }), /clave pública/);
  });
  it('requires generated config, matching project/code/build/CI and an explicit release acknowledgement', () => {
    const profile = environmentFor('production');
    const fixture = { profile, project: 'migapos', acknowledgement: 'migapos/migapos-peru', fingerprint: 'source', commit: 'commit', configHash: 'config', publicEnvHash: 'public', artifactHash: 'assets',
      receipt: { environment: 'production', projectId: 'migapos', site: 'migapos-peru', fingerprint: 'source', commit: 'commit', configHash: 'config', publicEnvHash: 'public', artifactHash: 'assets' },
      ci: { result: 'passed', fingerprint: 'source', commit: 'commit', run: 'https://github.com/saintdeyb321/Mig/actions/runs/123' } };
    assert.doesNotThrow(() => assertReleaseGuard(fixture));
    for (const changes of [{ project: 'wrong-project' }, { acknowledgement: '' }, { commit: 'other' }, { fingerprint: 'changed' }, { configHash: 'wrong' }, { publicEnvHash: 'changed' }, { artifactHash: 'tampered' }, { ci: null }, { profile: environmentFor('emulator') }]) assert.throws(() => assertReleaseGuard({ ...fixture, ...changes }));
    const config = releaseConfig({ hosting: { target: 'app' }, functions: {}, firestore: {}, storage: {} }, profile);
    assert.equal(config.hosting.site, 'migapos-peru'); assert.equal(config.hosting.target, undefined);
    assert.equal(releaseConfig({ hosting: {}, functions: {}, firestore: {}, storage: {} }, environmentFor('emulator')).hosting.site, 'demo-migapos');
    for (const name of ['functions', 'firestore', 'storage', 'hosting']) assert.ok(config[name].predeploy[0].includes('--config firebase.production.generated.json'));
    const plan = releasePlan(profile, 'f3e558c123456789');
    assert.ok(plan.every(command => command.includes('--project migapos')));
    assert.ok(plan.some(command => command.includes('migapos-peru:rollback-f3e558c12345')));
    assert.throws(() => releasePlan(environmentFor('emulator'), 'fixture'));
  });
  it('never runs remote smoke against production, an arbitrary site or unsafe URL', () => {
    assert.throws(() => assertSmokeTarget('https://migapos-peru.web.app/', environmentFor('production')));
    assert.equal(assertSmokeTarget('https://fixture-staging-site.web.app/', environmentFor('staging', staging)).hostname, 'fixture-staging-site.web.app');
    for (const url of ['http://fixture-staging-site.web.app/', 'https://evil.test/', 'https://fixture-staging-site.web.app/path', 'https://u:p@fixture-staging-site.web.app/']) assert.throws(() => assertSmokeTarget(url, environmentFor('staging', staging)));
  });
  it('requires all local emulator hosts before any destructive test can start', () => {
    const env = { GCLOUD_PROJECT: 'demo-migapos', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' };
    assert.doesNotThrow(() => assertEmulatorEnvironment(env));
    for (const change of [{ GCLOUD_PROJECT: 'migapos' }, { FIRESTORE_EMULATOR_HOST: '' }, { FIREBASE_STORAGE_EMULATOR_HOST: 'storage.googleapis.com' }, { VITE_FIREBASE_PROJECT_ID: 'migapos' }]) assert.throws(() => assertEmulatorEnvironment({ ...env, ...change }));
  });
});

describe('Server shift policy shared with the UI', () => {
  it('uses the exact same pure function; server time rejects new online work, owner bypasses', () => {
    assert.equal(clientShift, isWithinShift);
    const cashier = { role: 'cajero', shiftStart: '08:00', shiftEnd: '17:00' };
    assert.doesNotThrow(() => requireShift(cashier, Date.parse(noon)));
    assert.throws(() => requireShift(cashier, Date.parse('2026-10-23T22:00:00Z')), { code: 'outside-shift' });
    assert.doesNotThrow(() => requireShift({ ...cashier, role: 'dueño' }, Date.parse(midnight)));
    assert.ok(isDeterministicSaleError({ code: 'outside-shift' }));
  });
  it('caps new offline grants at the server-calculated end of a day/night shift', () => {
    assert.equal(shiftEndMillis({ role: 'cajero', shiftStart: '08:00', shiftEnd: '17:00' }, Date.parse(noon)), Date.parse('2026-10-23T22:00:00Z'));
    const night = { role: 'cajero', shiftStart: '22:00', shiftEnd: '06:00' };
    for (const value of ['2026-10-24T03:00:00Z', midnight, '2026-10-24T10:59:59.999Z']) {
      assert.doesNotThrow(() => requireShift(night, Date.parse(value)));
      assert.equal(shiftEndMillis(night, Date.parse(value)), Date.parse('2026-10-24T11:00:00Z'));
    }
    assert.throws(() => requireShift(night, Date.parse('2026-10-24T11:00:00Z')), { code: 'outside-shift' });
    assert.equal(shiftEndMillis({ ...night, shiftStart: '00:00', shiftEnd: '00:00' }, Date.parse(noon)), Infinity);
  });
});

describe('Privacy-preserving structured diagnostics', () => {
  const harness = () => { const rows = []; return { rows, log: Object.fromEntries(['info', 'error'].map(level => [level, (name, entry) => rows.push({ level, name, ...entry })])) }; };
  it('reports expected rejects, retries, durations and correlation without logging payloads/PII', async () => {
    const { rows, log } = harness(); let time = 0;
    const request = { data: { operationId: 'person@example.test', password: 'secret', total: 999, token: 'private' }, rawRequest: { get: () => 'a'.repeat(32) + '/123;o=1' } };
    const handler = observeOperation('submitSale', async () => { time = 2500; throw new SaleError('outside-shift', 'person@example.test secret private'); }, { log, now: () => time });
    await assert.rejects(handler(request), { code: 'outside-shift' });
    assert.equal(rows[0].level, 'info'); assert.equal(rows[0].slow, true); assert.equal(rows[0].metrics.sales_rejected, 1);
    assert.equal(rows[0].requestId, 'a'.repeat(32)); assert.ok(!/example|secret|private|999/.test(JSON.stringify(rows)));
    await observeOperation('submitSale', async () => ({ status: 'ALREADY_APPLIED' }), { log })(request);
    assert.equal(rows[1].metrics.retries, 1);
  });
  it('records unexpected errors and failed backup/purge indicators, without serializing documents', async () => {
    const { rows, log } = harness();
    await assert.rejects(observeOperation('submitSale', async () => { throw new Error('sensitive'); }, { log })({}));
    for (const kind of ['backup', 'purge']) logJobState({ status: 'running' }, { id: 'id', kind, status: 'failed', lastError: 'job-unit-failed', document: { secret: true } }, log);
    assert.equal(rows[0].metrics.function_errors, 1); assert.equal(rows[1].metrics.backups_failed, 1); assert.equal(rows[2].metrics.purge_jobs_failed, 1);
    assert.ok(!JSON.stringify(rows).includes('sensitive')); assert.ok(!JSON.stringify(rows).includes('secret'));
  });
  it('bounds local UI diagnostics, deduplicates and strips financial/personal data; logging failure cannot alter results', async () => {
    const { log, rows } = harness();
    reportDiagnostic('sale', { code: 'unavailable', message: 'secret', payload: { total: 999 } }, 'pending', { log, now: 1 });
    reportDiagnostic('sale', { code: 'unavailable' }, 'pending', { log, now: 2 });
    assert.equal(rows.length, 1); assert.ok(!JSON.stringify(diagnosticSnapshot()).match(/secret|999|payload/));
    assert.equal(await observeOperation('submitSale', async () => 'confirmed', { log: { info: () => { throw new Error(); } } })({}), 'confirmed');
  });
});
