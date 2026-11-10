import {copyFileSync, existsSync, mkdirSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {soundtrack} from '../src/media.mjs';
import {reviewFrames, scenes, video} from '../src/timeline.mjs';
import {checkAssets, command, root} from './media-tools.mjs';
import {writeScore} from './score.mjs';

const cliDir = join(root, 'node_modules', '@remotion', 'cli');
const cli = join(cliDir, 'remotion-cli.js');
const requireCli = createRequire(join(cliDir, 'package.json'));
const output = join(root, 'out');
const cache = join(root, '.cache');
const mode = process.argv[2] ?? 'review';
if (!['check', 'review', 'final'].includes(mode)) throw Error(`Modo de render desconocido: ${mode}`);
checkAssets();
if (mode === 'check') process.exit(0);

const browser = [
  process.env.MIGAPOS_VIDEO_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && existsSync(candidate));
if (!browser) throw Error('Indica un navegador Chromium instalado en MIGAPOS_VIDEO_CHROME.');

writeScore(join(root, 'public', soundtrack));
mkdirSync(output, {recursive: true});
mkdirSync(cache, {recursive: true});
const bundle = join(mkdtempSync(join(cache, `${mode}-`)), 'bundle');
const run = args => command(process.execPath, [cli, ...args], {inherit: true});
run(['bundle', 'src/index.jsx', `--out-dir=${bundle}`, '--disable-git-source', '--log=warn']);

const render = (filename, flags) => {
  console.log(`Render Remotion · ${filename}`);
  const start = Date.now();
  run(['render', bundle, video.id, join(output, filename), '--codec=h264', '--pixel-format=yuv420p',
    '--color-space=bt709', '--image-format=png',
    '--crf=19', '--audio-codec=aac', '--audio-bitrate=160k', '--concurrency=3', '--overwrite',
    `--browser-executable=${browser}`, '--chrome-mode=chrome-for-testing', '--gl=angle', '--log=warn', ...flags]);
  console.log(`Tiempo de render · ${((Date.now() - start) / 1000).toFixed(1)} s`);
};

if (mode === 'final') {
  render('migapos-promo-30s.mp4', []);
} else {
  const {openBrowser, renderStill, selectComposition} = requireCli('@remotion/renderer');
  const puppeteerInstance = await openBrowser('chrome', {
    browserExecutable: browser, chromeMode: 'chrome-for-testing', chromiumOptions: {gl: 'angle'}, logLevel: 'warn',
  });
  const reviewDir = join(output, 'review');
  const cutsDir = join(reviewDir, 'cuts');
  mkdirSync(cutsDir, {recursive: true});
  try {
    const composition = await selectComposition({serveUrl: bundle, id: video.id, puppeteerInstance, logLevel: 'warn'});
    const still = (frame, directory, scale) => renderStill({
      serveUrl: bundle, composition, puppeteerInstance, frame, scale, imageFormat: 'png',
      output: join(directory, `frame-${String(frame).padStart(3, '0')}.png`), overwrite: true, logLevel: 'warn',
    });
    for (const frame of reviewFrames) await still(frame, reviewDir, 1);
    for (const {from} of scenes.slice(1)) {
      await still(from - 1, cutsDir, 0.25);
      await still(from, cutsDir, 0.25);
    }
  } finally {
    await puppeteerInstance.close({silent: true});
  }
  copyFileSync(join(reviewDir, 'frame-036.png'), join(output, 'thumbnail.png'));
  console.log('5 PNG de revisión, 12 muestras de corte y miniatura.');
  render('preview-5s.mp4', ['--frames=0-149', '--scale=0.5']);
}
