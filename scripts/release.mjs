import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from '../frontend/node_modules/vite/dist/node/index.js';
import { environments, validateWebEnvironment, hostingHeaders, environmentFor } from '../frontend/src/config/environments.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
export async function sourceFingerprint() {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
  const hashes = await Promise.all(files.map(async path => {
    try { return path + ':' + sha(await readFile(resolve(root, path))); } catch (error) { if (error.code === 'ENOENT') return path + ':deleted'; throw error; }
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
  const result = structuredClone(base);
  for (const resource of ['functions', 'firestore', 'storage', 'hosting']) result[resource].predeploy = [`node scripts/release.mjs guard --config firebase.${profile.name}.generated.json`];
  delete result.hosting.target;
  result.hosting.site = profile.emulator ? profile.projectId : profile.hostingSite;
  result.hosting.headers = [{ source: '**', headers: hostingHeaders(profile, { appCheck }) }];
  return result;
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
export function assertSmokeTarget(url, profile) {
  const target = new URL(url);
  if (profile.name !== 'staging' || !['https:'].includes(target.protocol) || target.hostname !== `${profile.hostingSite}.web.app` || target.port || target.username || target.password || target.pathname !== '/') throw new Error('Smoke remoto permitido únicamente en staging independiente.');
  return target;
}
export function releasePlan(profile, commit) {
  if (profile.emulator) throw new Error('Un proyecto demo no tiene plan de publicación.');
  const tag = commit.slice(0, 12), project = profile.projectId, site = profile.hostingSite, filename = `firebase.${profile.name}.generated.json`;
  return [
    `firebase hosting:channel:deploy qa-${tag} --project ${project} --config ${filename}`,
    `firebase hosting:clone ${site}:live ${site}:rollback-${tag} --project ${project}`,
    `firebase deploy --only hosting --project ${project} --config ${filename}`,
    `firebase hosting:clone ${site}:rollback-${tag} ${site}:live --project ${project}`,
  ];
}
async function run(args) {
  const [action, ...flags] = args;
  const option = name => { const index = flags.indexOf('--' + name); return index < 0 ? undefined : flags[index + 1]; };
  if (!['check', 'build', 'plan', 'guard', 'attest', 'smoke'].includes(action)) throw new Error('Acción de release no admitida. Este script no ejecuta deploy, rollback, migraciones ni purgas.');
  const name = option('env') || process.env.MIGAPOS_RELEASE_ENV;
  if (!['production', 'emulator', 'staging'].includes(name)) throw new Error('Selecciona explícitamente --env production|emulator|staging.');
  if (action === 'plan') {
    console.log('Solo comandos para revisión manual (sin ejecución):\n' + releasePlan(environmentFor(name), git(['rev-parse', 'HEAD'])).join('\n'));
    console.log('Hosting rollback no revierte Functions, Rules, índices ni datos. Backend: cambios compatibles/aditivos; conservar los fixes de autorización y preferir corrección hacia delante.'); return;
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
  if (action === 'guard') {
    if (option('config') !== filename) throw new Error('Usa la configuración generada de release; firebase.json base no permite deploy.');
    const receipt = await json(`.release/${name}.json`), ci = await json('.release/ci-verification.json');
    assertReleaseGuard({ profile, project: process.env.GCLOUD_PROJECT, acknowledgement: process.env.MIGAPOS_ALLOW_RELEASE,
      receipt, fingerprint, commit, configHash: sha(await readFile(resolve(root, filename))), publicEnvHash, artifactHash: await buildFingerprint(), ci });
    if (git(['status', '--porcelain']).length) throw new Error('Release requiere un checkout limpio del commit aprobado.');
    const index = await readFile(resolve(root, 'frontend/dist/index.html'));
    if (receipt.indexHash !== sha(index)) throw new Error('Build reemplazado después de validar release.');
    console.log('Guardas de proyecto, código, CI y build aprobadas.'); return;
  }
  if (action === 'build') {
    const config = releaseConfig(base, profile, env.VITE_APP_CHECK_MODE === 'monitor');
    // Emulator builds are local artifacts and cannot be published by the guard.
    const serialized = JSON.stringify(config, null, 2) + '\n';
    await writeFile(resolve(root, filename), serialized);
    const build = spawnSync(process.execPath, [resolve(root, 'frontend/node_modules/vite/bin/vite.js'), 'build', '--mode', name], {
      cwd: resolve(root, 'frontend'), env: { ...process.env, ...env, VITE_APP_ENV: name }, stdio: 'inherit', windowsHide: true,
    });
    if (build.status !== 0) throw new Error('Falló el build de release.');
    await writeFile(resolve(root, `.release/${name}.json`), JSON.stringify({ environment: name, projectId: profile.projectId, site: profile.hostingSite,
      fingerprint, commit, configHash: sha(serialized), publicEnvHash, artifactHash: await buildFingerprint(), indexHash: sha(await readFile(resolve(root, 'frontend/dist/index.html'))) }, null, 2));
    console.log(`Build ${name} preparado. No se ejecutó deploy.`); return;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
