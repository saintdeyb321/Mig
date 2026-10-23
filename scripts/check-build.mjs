import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.short_name, 'MigaPOS');
for (const match of index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) { assert.ok(/\bsrc=/.test(match[1])); assert.equal(match[2].trim(), '', 'CSP requires external scripts.'); }
const sw = await readFile(resolve(root, 'sw.js'), 'utf8');
const precache = sw.match(/precacheAndRoute\((\[[\s\S]*?\]),/);
assert.ok(precache, 'Generated service worker precache was not found.');
assert.ok(!precache[1].includes('xlsx'), 'Excel must load on demand, not during initial PWA install.');
assert.ok(sw.includes('migapos-excel-v1') && sw.includes('CacheFirst'), 'Lazy Excel still needs offline cache after first use.');
let bytes = 0, count = 0;
// Workbox deduplicates icon URLs contributed by both glob patterns and manifest entries.
for (const url of new Set([...precache[1].matchAll(/url:"([^"]+)"/g)].map(match => match[1]))) {
  const file = resolve(root, url); assert.ok(file.startsWith(resolve(root) + sep), 'Precache path outside build.');
  bytes += (await stat(file)).size; count++;
}
assert.ok(count > 0); assert.ok(bytes < 3 * 1024 * 1024, `Initial PWA precache exceeds 3 MiB (${bytes}).`);
console.log(`Build/PWA: ${count} local precache files, ${(bytes / 1024 / 1024).toFixed(2)} MiB; lazy Excel cache and external scripts verified.`);
