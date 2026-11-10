import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewFrames, video} from '../src/timeline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const output = join(root, 'out', 'review');
const cache = join(root, '.cache');
const candidates = [
  process.env.MIGAPOS_VIDEO_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const browser = candidates.find(candidate => candidate && existsSync(candidate));
if (!browser) throw Error('Indica un navegador Chromium instalado en MIGAPOS_VIDEO_CHROME.');

function run(args) {
  const {status, error} = spawnSync(process.execPath, [cli, ...args], {cwd: root, stdio: 'inherit'});
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

mkdirSync(output, {recursive: true});
mkdirSync(cache, {recursive: true});
const bundle = join(mkdtempSync(join(cache, 'review-')), 'bundle');
run(['bundle', 'src/index.jsx', `--out-dir=${bundle}`, '--disable-git-source']);
for (const frame of reviewFrames) {
  const filename = `frame-${String(frame).padStart(3, '0')}.png`;
  run(['still', bundle, video.id, join(output, filename), `--frame=${frame}`, '--image-format=png', '--overwrite',
    `--browser-executable=${browser}`, '--chrome-mode=chrome-for-testing', '--gl=angle']);
}
