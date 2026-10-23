import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const policy = JSON.parse(await readFile(new URL('./security-exceptions.json', import.meta.url), 'utf8'));
if (!process.env.npm_execpath) throw new Error('Ejecuta mediante npm run audit:security.');
await mkdir(resolve(root, '.release'), { recursive: true });
let failed = false;
for (const scope of ['root', 'frontend', 'functions']) {
  const args = [process.env.npm_execpath, 'audit', '--json', ...(scope === 'root' ? [] : ['--prefix', scope])];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  let audit;
  try { audit = JSON.parse(result.stdout); } catch { console.error(`Auditoría ${scope}: no se pudo obtener un resultado válido.`); failed = true; continue; }
  if (result.error || ![0, 1].includes(result.status) || audit.error || !audit.metadata) { console.error(`Auditoría ${scope}: servicio no disponible; no se declara aprobada.`); failed = true; continue; }
  await writeFile(resolve(root, `.release/audit-${scope}.json`), JSON.stringify(audit, null, 2));
  console.log(`npm audit ${scope}: ${JSON.stringify(audit.metadata.vulnerabilities)}`);
  const seen = new Set();
  for (const value of Object.values(audit.vulnerabilities || {})) for (const advisory of value.via.filter(item => typeof item === 'object')) {
    const id = advisory.url?.split('/').pop(); if (seen.has(id)) continue; seen.add(id);
    const exception = policy.find(item => item.id === id && item.scopes.includes(scope) && item.severity === advisory.severity && Date.parse(item.expires) > Date.now());
    if (exception) console.log(`EXCEPCIÓN VISIBLE ${scope} ${id} (${advisory.severity}), hasta ${exception.expires}: ${exception.reason}`);
    else if (['moderate', 'high', 'critical'].includes(advisory.severity)) { console.error(`BLOQUEA CI: ${scope} ${id} (${advisory.severity}).`); failed = true; }
    else console.log(`AVISO ${scope} ${id} (${advisory.severity}); requiere seguimiento de upstream.`);
  }
}
if (failed) process.exitCode = 1;
