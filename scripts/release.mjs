import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from '../frontend/node_modules/vite/dist/node/index.js';
import { validateWebEnvironment, hostingHeaders, environmentFor } from '../frontend/src/config/environments.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
export function sourceFileHash(bytes) {
  // CI uses LF on Linux; a clean Windows checkout commonly uses CRLF.
  const value = bytes.toString('utf8');
  return sha(!bytes.includes(0) && Buffer.from(value).equals(bytes) ? value.replaceAll('\r\n', '\n') : bytes);
}
export async function sourceFingerprint() {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
  const hashes = await Promise.all(files.map(async path => {
    try { return path + ':' + sourceFileHash(await readFile(resolve(root, path))); } catch (error) { if (error.code === 'ENOENT') return path + ':deleted'; throw error; }
  }));
  return sha(hashes.join('\n'));
}
async function buildFingerprint() {
  const walk = async path => (await Promise.all((await readdir(resolve(root, 'frontend/dist', path), { withFileTypes: true })).map(async entry => {
    const child = path ? path + '/' + entry.name : entry.name;
    if (entry.isDirectory()) return walk(child);
    if (!entry.isFile()) throw new Error('Build contiene un recurso que no es un archivo regular.');
    return child + ':' + sha(await readFile(resolve(root, 'frontend/dist', child)));
  }))).flat();
  return sha((await walk('')).sort().join('\n'));
}
export function releaseConfig(base, profile, appCheck = false) {
  const result = { firestore: { database: '(default)', rules: base.firestore.rules, indexes: base.firestore.indexes },
    hosting: { public: base.hosting.public, ignore: base.hosting.ignore, rewrites: [{ source: '**', destination: '/index.html' }] } };
  if (profile.emulator) result.emulators = { auth: { host: '127.0.0.1', port: 9099 }, firestore: { host: '127.0.0.1', port: 8080 }, ui: { enabled: false }, singleProjectMode: true };
  for (const resource of ['firestore', 'hosting']) result[resource].predeploy = [`node scripts/release.mjs guard --env ${profile.name} --config firebase.${profile.name}.generated.json`];
  result.hosting.site = profile.emulator ? profile.projectId : profile.hostingSite;
  result.hosting.headers = [{ source: '**', headers: hostingHeaders(profile, { appCheck }) }];
  return result;
}
export function assertSparkConfig(config, profile) {
  if (Object.keys(config).some(key => !['firestore', 'hosting', ...(profile.emulator ? ['emulators'] : [])].includes(key))) throw new Error('El release Spark solo admite Hosting y Firestore.');
  if (config.firestore.database !== '(default)' || config.firestore.rules !== 'firestore.rules' || config.firestore.indexes !== 'firestore.indexes.json'
    || config.hosting.site !== (profile.emulator ? 'demo-migapos' : 'migapos-peru') || profile.projectId !== (profile.emulator ? 'demo-migapos' : 'migapos')) throw new Error('Destino o archivos de publicación incorrectos.');
  if (config.hosting.public !== 'frontend/dist' || config.hosting.target || JSON.stringify(config.hosting.rewrites) !== JSON.stringify([{ source: '**', destination: '/index.html' }])
    || Object.keys(config.firestore).some(key => !['database', 'rules', 'indexes', 'predeploy'].includes(key))
    || Object.keys(config.hosting).some(key => !['public', 'ignore', 'rewrites', 'site', 'headers', 'predeploy'].includes(key))) throw new Error('Recursos o rutas fuera del release estático Spark.');
  if (!profile.emulator && /127\.0\.0\.1|localhost|cloudfunctions\.net|firebasestorage|storage\.googleapis/.test(JSON.stringify(config))) throw new Error('El release contiene endpoints ajenos a Spark producción.');
  for (const resource of ['firestore', 'hosting']) if (JSON.stringify(config[resource].predeploy) !== JSON.stringify([`node scripts/release.mjs guard --env ${profile.name} --config firebase.${profile.name}.generated.json`])) throw new Error('Falta la guarda de publicación Spark.');
  if (JSON.stringify(config.hosting.headers) !== JSON.stringify([{ source: '**', headers: hostingHeaders(profile, { appCheck: JSON.stringify(config.hosting.headers).includes('recaptcha') }) }])) throw new Error('CSP/headers de release inesperados.');
}
async function archivePolicy(profile, commit) {
  const rules = await readFile(resolve(root, 'firestore.rules')), indexes = await readFile(resolve(root, 'firestore.indexes.json'));
  const archive = `.release/policy/${profile.projectId}/${commit}`;
  await mkdir(resolve(root, archive), { recursive: true });
  const manifest = { commit, projectId: profile.projectId, database: '(default)', rulesHash: sha(rules), indexesHash: sha(indexes), policyHash: sha(Buffer.concat([rules, indexes])) };
  await writeFile(resolve(root, archive, 'firestore.rules'), rules);
  await writeFile(resolve(root, archive, 'firestore.indexes.json'), indexes);
  await writeFile(resolve(root, archive, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
async function readPolicy(commit, profile) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Selecciona el SHA completo de una política archivada, sin rutas externas.');
  const archive = `.release/policy/${profile.projectId}/${commit}`, manifest = await json(`${archive}/manifest.json`);
  const rules = await readFile(resolve(root, archive, 'firestore.rules')), indexes = await readFile(resolve(root, archive, 'firestore.indexes.json'));
  if (manifest.commit !== commit || manifest.projectId !== profile.projectId || manifest.database !== '(default)' || manifest.rulesHash !== sha(rules)
    || manifest.indexesHash !== sha(indexes) || manifest.policyHash !== sha(Buffer.concat([rules, indexes]))) throw new Error('Archivo de política alterado o de otro proyecto.');
  return { ...manifest, rules: `${archive}/firestore.rules` };
}
export function assertReleaseGuard({ profile, project, acknowledgement, receipt, fingerprint, commit, configHash, publicEnvHash, artifactHash, ci }) {
  if (profile.emulator || project !== profile.projectId) throw new Error('Proyecto de despliegue incorrecto o demo.');
  if (acknowledgement !== `${profile.projectId}/${profile.hostingSite}`) throw new Error('Falta confirmación explícita proyecto/site para release.');
  if (receipt.projectId !== project || receipt.site !== profile.hostingSite || receipt.environment !== profile.name
    || receipt.fingerprint !== fingerprint || receipt.commit !== commit || receipt.configHash !== configHash
    || receipt.publicEnvHash !== publicEnvHash || receipt.artifactHash !== artifactHash) throw new Error('Build/configuración de release desactualizados o de otro entorno.');
  if (ci?.commit !== commit || ci?.fingerprint !== fingerprint || ci?.result !== 'passed'
    || !/^https:\/\/github\.com\/saintdeyb321\/Mig\/actions\/runs\/\d+$/.test(ci?.run || '')) throw new Error('Falta artefacto CI aprobado del mismo código.');
}
export function assertPolicyRollback({ config, policy, receipt, acknowledgement, profile }) {
  const filename = `firebase.${profile.name}.rollback.generated.json`;
  if (acknowledgement !== `${profile.projectId}/(default)/${policy.policyHash}` || receipt.policyHash !== policy.policyHash
    || Object.keys(config).join() !== 'firestore' || config.firestore.database !== '(default)' || config.firestore.rules !== policy.rules
    || Object.keys(config.firestore).some(key => !['database', 'rules', 'predeploy'].includes(key))
    || JSON.stringify(config.firestore.predeploy) !== JSON.stringify([`node scripts/release.mjs guard-rollback --env ${profile.name} --config ${filename}`])) throw new Error('Rollback Rules requiere revisión y autorización exacta del hash; no incluye índices ni datos.');
}
export function assertSmokeTarget(url, profile) {
  const target = new URL(url);
  if (profile.name !== 'staging' || !['https:'].includes(target.protocol) || target.hostname !== `${profile.hostingSite}.web.app` || target.port || target.username || target.password || target.pathname !== '/') throw new Error('Smoke remoto permitido únicamente en staging independiente.');
  return target;
}
export function releasePlan(profile, commit) {
  if (profile.emulator) throw new Error('Un proyecto demo no tiene plan de publicación.');
  const tag = commit.slice(0, 12), project = profile.projectId, site = profile.hostingSite, filename = `firebase.${profile.name}.generated.json`;
  return [
    `npx --no-install firebase hosting:clone ${site}:live ${site}:rollback-${tag} --project ${project}`,
    `npx --no-install firebase deploy --only firestore:rules,firestore:indexes --project ${project} --config ${filename}`,
    `npx --no-install firebase deploy --only hosting --project ${project} --config ${filename}`,
    `npx --no-install firebase hosting:clone ${site}:rollback-${tag} ${site}:live --project ${project}`,
  ];
}
async function run(args) {
  const [action, ...flags] = args;
  const option = name => { const index = flags.indexOf('--' + name); return index < 0 ? undefined : flags[index + 1]; };
  if (!['check', 'build', 'prepare', 'plan', 'guard', 'attest', 'smoke', 'rollback-plan', 'guard-rollback'].includes(action)) throw new Error('Acción no admitida. Este script nunca ejecuta deploy, rollback, migraciones ni purgas.');
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Este procedimiento no admite cuentas de servicio.');
  const name = option('env') || process.env.MIGAPOS_RELEASE_ENV;
  if (!['production', 'emulator', 'staging'].includes(name)) throw new Error('Selecciona explícitamente --env production|emulator|staging.');
  if (action === 'plan') {
    console.log('Solo comandos para revisión manual (sin ejecución):\n' + releasePlan(environmentFor(name), git(['rev-parse', 'HEAD'])).join('\n'));
    console.log('Requiere build, CI del mismo commit y MIGAPOS_ALLOW_RELEASE=migapos/migapos-peru. Guarda el SHA/hash de política publicado. Hosting rollback no revierte Rules, índices ni documentos. Índices: conservar cambios aditivos; no se prepara borrado automático. Rules: rollback-plan --snapshot SHA_ARCHIVADO, revisión y autorización separadas.'); return;
  }
  const env = { ...loadEnv(name, resolve(root, 'frontend'), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))) };
  const profile = validateWebEnvironment(env, name);
  const publicEnvHash = sha(JSON.stringify(Object.fromEntries(Object.entries({ ...env, VITE_APP_ENV: name }).sort(([a], [b]) => a.localeCompare(b)))));
  const base = await json('firebase.json');
  if (action === 'check') { console.log(`Configuración ${name} válida: ${profile.projectId}; ${profile.hostingSite || 'emuladores locales'}.`); return; }
  if (action === 'smoke') {
    const url = assertSmokeTarget(option('url'), profile);
    for (const path of ['', 'manifest.webmanifest', 'sw.js']) {
      const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok || response.headers.get('x-content-type-options') !== 'nosniff') throw new Error(`Smoke falló: ${path || '/'}`);
      if (response.headers.get('content-security-policy') !== hostingHeaders(profile, { appCheck: env.VITE_APP_CHECK_MODE === 'monitor' })[0].value) throw new Error('CSP del entorno remoto no coincide.');
    }
    console.log('Smoke de Hosting/PWA aprobado; no sustituye QA autenticado de staging.'); return;
  }
  const fingerprint = await sourceFingerprint(), commit = git(['rev-parse', 'HEAD']);
  await mkdir(resolve(root, '.release'), { recursive: true });
  if (action === 'attest') {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'saintdeyb321/Mig' || process.env.GITHUB_SHA !== commit) throw new Error('La atestación solo se genera al final del job CI del mismo commit.');
    await writeFile(resolve(root, '.release/ci-verification.json'), JSON.stringify({ commit, fingerprint, result: 'passed', run: `https://github.com/saintdeyb321/Mig/actions/runs/${process.env.GITHUB_RUN_ID}` }, null, 2)); return;
  }
  const filename = `firebase.${name}.generated.json`;
  if (action === 'guard' || action === 'guard-rollback') {
    const rollback = action === 'guard-rollback', expected = rollback ? `firebase.${name}.rollback.generated.json` : filename;
    if (option('config') !== expected) throw new Error('Usa la configuración generada; firebase.json base no permite deploy.');
    const receipt = await json(`.release/${name}${rollback ? '-rollback' : ''}.json`), ci = await json('.release/ci-verification.json');
    assertReleaseGuard({ profile, project: process.env.GCLOUD_PROJECT, acknowledgement: process.env.MIGAPOS_ALLOW_RELEASE,
      receipt, fingerprint, commit, configHash: sha(await readFile(resolve(root, expected))), publicEnvHash, artifactHash: await buildFingerprint(), ci });
    if (rollback) {
      const policy = await readPolicy(receipt.snapshot, profile), config = await json(expected);
      assertPolicyRollback({ config, policy, receipt, acknowledgement: process.env.MIGAPOS_ALLOW_POLICY_ROLLBACK, profile });
    } else {
      assertSparkConfig(await json(expected), profile);
      const policy = await readPolicy(commit, profile);
      if (receipt.policyHash !== policy.policyHash || policy.rulesHash !== sha(await readFile(resolve(root, 'firestore.rules')))
        || policy.indexesHash !== sha(await readFile(resolve(root, 'firestore.indexes.json')))) throw new Error('Política archivada no coincide con el build/código aprobado.');
    }
    if (git(['status', '--porcelain']).length) throw new Error('Release requiere un checkout limpio del commit aprobado.');
    const index = await readFile(resolve(root, 'frontend/dist/index.html'));
    if (receipt.indexHash !== sha(index)) throw new Error('Build reemplazado después de validar release.');
    console.log('Guardas de proyecto, código, CI y build aprobadas.'); return;
  }
  if (action === 'rollback-plan') {
    if (profile.emulator || profile.projectId !== 'migapos') throw new Error('Rollback solo se prepara para migapos.');
    const policy = await readPolicy(option('snapshot'), profile), filename = `firebase.${name}.rollback.generated.json`;
    const config = { firestore: { database: '(default)', rules: policy.rules, predeploy: [`node scripts/release.mjs guard-rollback --env ${name} --config ${filename}`] } };
    const serialized = JSON.stringify(config, null, 2) + '\n';
    await writeFile(resolve(root, filename), serialized);
    await writeFile(resolve(root, `.release/${name}-rollback.json`), JSON.stringify({ environment: name, projectId: profile.projectId, site: profile.hostingSite,
      fingerprint, commit, configHash: sha(serialized), publicEnvHash, artifactHash: await buildFingerprint(), indexHash: sha(await readFile(resolve(root, 'frontend/dist/index.html'))), snapshot: policy.commit, policyHash: policy.policyHash }, null, 2));
    console.log(`Preparado, NO ejecutado. Revisar diff con ${policy.rules}. Requiere MIGAPOS_ALLOW_RELEASE=migapos/migapos-peru y MIGAPOS_ALLOW_POLICY_ROLLBACK=migapos/(default)/${policy.policyHash}`);
    console.log(`npx --no-install firebase deploy --only firestore:rules --project migapos --config ${filename}`); return;
  }
  if (action === 'build' || action === 'prepare') {
    if (action === 'prepare' && !profile.emulator) throw new Error('prepare solo admite artefactos locales demo. Producción exige release:build para vincular entorno y build.');
    const config = releaseConfig(base, profile, env.VITE_APP_CHECK_MODE === 'monitor');
    assertSparkConfig(config, profile);
    // Emulator builds are local artifacts and cannot be published by the guard.
    const serialized = JSON.stringify(config, null, 2) + '\n';
    await writeFile(resolve(root, filename), serialized);
    const build = action === 'prepare' ? { status: 0 } : spawnSync(process.execPath, [resolve(root, 'frontend/node_modules/vite/bin/vite.js'), 'build', '--mode', name], {
      cwd: resolve(root, 'frontend'), env: { ...process.env, ...env, VITE_APP_ENV: name }, stdio: 'inherit', windowsHide: true,
    });
    if (build.status !== 0) throw new Error('Falló el build de release.');
    const policy = await archivePolicy(profile, commit);
    await writeFile(resolve(root, `.release/${name}.json`), JSON.stringify({ environment: name, projectId: profile.projectId, site: profile.hostingSite,
      fingerprint, commit, configHash: sha(serialized), publicEnvHash, artifactHash: await buildFingerprint(), policyHash: policy.policyHash, indexHash: sha(await readFile(resolve(root, 'frontend/dist/index.html'))) }, null, 2));
    console.log(`Build ${name} preparado. No se ejecutó deploy.`); return;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
