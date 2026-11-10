import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {capturePath, captures, logo} from '../src/media.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const bin = join(root, 'node_modules', '@remotion', 'compositor-win32-x64-msvc');

export function command(binary, args, {inherit = false, encoding = 'utf8'} = {}) {
  const result = spawnSync(binary, args, {
    cwd: root, encoding, maxBuffer: 16 * 1024 * 1024, stdio: inherit ? 'inherit' : 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${binary} terminó con código ${result.status}\n${result.stderr ?? ''}`);
  return result;
}

export function ffmpeg(args, options) {
  const binary = join(bin, 'ffmpeg.exe');
  return command(existsSync(binary) ? binary : 'ffmpeg', ['-hide_banner', ...args], options);
}

export function probe(path) {
  const binary = join(bin, 'ffprobe.exe');
  return JSON.parse(command(existsSync(binary) ? binary : 'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]).stdout);
}

export function checkAssets() {
  for (const asset of [...Object.keys(captures).map(capturePath), logo]) {
    const path = join(root, 'public', asset);
    const file = statSync(path, {throwIfNoEntry: false});
    assert.ok(file?.isFile() && file.size > 0, `Falta un PNG válido: ${asset}`);
    const [image] = probe(path).streams;
    assert.ok(image?.codec_name === 'png' && image.width >= 200 && image.height >= 80, `PNG inválido: ${asset}`);
    ffmpeg(['-v', 'error', '-xerror', '-i', path, '-c:v', 'rawvideo', '-f', 'null', '-']);
    console.log(`PNG OK · ${asset} · ${image.width}×${image.height}`);
  }
}
