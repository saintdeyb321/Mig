import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync} from 'node:fs';
import {writeFile, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = join(root, '..', 'node_modules', '@remotion');
const cli = join(packageRoot, 'cli', 'remotion-cli.js');
const requireCli = createRequire(join(packageRoot, 'cli', 'package.json'));
const ffmpeg = join(packageRoot, 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const ffprobe = join(packageRoot, 'compositor-win32-x64-msvc', 'ffprobe.exe');
const cache = join(root, '.cache');
const timeline = JSON.parse(readFileSync(join(root, 'timeline.json'), 'utf8'));
const mode = process.argv[2];
assert.ok(['preview', 'final'].includes(mode), 'Indica preview o final.');
const final = mode === 'final';
const scale = final ? 1 : 0.25;
const started = Date.now();

function run(command, args, encoding = 'utf8', inherit = false) {
  const result = spawnSync(command, args, {cwd: root, encoding, stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 16 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} terminó con código ${result.status}\n${result.stderr ?? ''}`);
  return result;
}
const probe = path => JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout);
const media = (...args) => run(ffmpeg, args);
const shotNames = new Set(timeline.boards.map(board => board[2]));
shotNames.delete('cta');
for (const shot of shotNames) {
  const path = join(root, 'public', 'shots', `${shot}.jpg`);
  assert.ok(statSync(path, {throwIfNoEntry: false})?.size, `Falta toma real: ${shot}`);
  const [image] = probe(path).streams;
  assert.deepEqual([image.codec_name, image.width, image.height], ['mjpeg', 780, 1688]);
}
assert.equal(timeline.chapters.length, 12);
assert.equal(timeline.runs.reduce((total, length) => total + length, 0), timeline.duration);
assert.equal(Number(probe(join(root, 'narration.wav')).format.duration), timeline.duration / timeline.fps);
copyFileSync(join(root, '..', '..', '..', 'frontend', 'public', 'img', 'Logo_MP.png'), join(root, 'public', 'logo.png'));
copyFileSync(join(root, 'narration.wav'), join(root, 'public', 'narration.wav'));

const directory = mkdtempSync(join(cache, `${mode}-`));
const bundle = join(directory, 'bundle');
const boards = join(directory, 'frames');
mkdirSync(boards);
const chrome = [process.env.MIGAPOS_VIDEO_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert.ok(chrome, 'Chrome/Edge local no encontrado.');
run(process.execPath, [cli, 'bundle', 'src/index.jsx', `--public-dir=${join(root, 'public')}`,
  `--out-dir=${bundle}`, '--disable-git-source', '--log=warn'], 'utf8', true);

const {openBrowser, renderFrames, selectComposition} = requireCli('@remotion/renderer');
const chromiumOptions = {gl: 'angle'};
const browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions, chromeMode: 'chrome-for-testing', logLevel: 'warn'});
try {
  const composition = await selectComposition({serveUrl: bundle, id: 'MigaPOSV3Boards', puppeteerInstance: browser, logLevel: 'warn'});
  assert.equal(composition.durationInFrames, timeline.runs.length);
  await renderFrames({
    serveUrl: bundle, composition, puppeteerInstance: browser, inputProps: {}, outputDir: null,
    scale, concurrency: 4, imageFormat: 'jpeg', jpegQuality: 95, muted: true, logLevel: 'warn',
    onStart: () => console.log(`Remotion · ${composition.durationInFrames} cuadros distintos · escala ${scale}`),
    onFrameUpdate: done => { if (done % 50 === 0) console.log(`Cuadros Remotion · ${done}/${composition.durationInFrames}`); },
    onFrameBuffer: (buffer, frame) => writeFile(join(boards, `${frame}.jpg`), buffer),
  });
} finally {
  await browser.close({silent: true});
}

async function* visualTrack() {
  for (let index = 0; index < timeline.runs.length; index++) {
    const bytes = await readFile(join(boards, `${index}.jpg`));
    for (let count = 0; count < timeline.runs[index]; count++) yield bytes;
  }
}

const output = join(root, final ? 'master-voice.mp4' : 'preview.mp4');
const encoder = spawn(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg',
  '-i', 'pipe:0', '-i', join(root, 'narration.wav'), '-map', '0:v:0', '-map', '1:a:0', '-vf',
  'scale=in_range=pc:out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'fast',
  '-crf', final ? '18' : '22', '-threads', '4', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', output], {stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true});
let failure = '';
encoder.stderr.setEncoding('utf8').on('data', chunk => {failure += chunk;});
const completed = new Promise((resolve, reject) => {
  encoder.on('error', reject);
  encoder.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg ${code}\n${failure}`)));
});
await Promise.all([pipeline(Readable.from(visualTrack()), encoder.stdin), completed]);

const {streams, format} = probe(output);
const video = streams.find(stream => stream.codec_type === 'video');
const voice = streams.find(stream => stream.codec_type === 'audio');
assert.deepEqual([video.codec_name, video.width, video.height, video.avg_frame_rate, video.pix_fmt, Number(video.nb_frames)],
  ['h264', timeline.width * scale, timeline.height * scale, '30/1', 'yuv420p', timeline.duration]);
assert.equal(Number(video.duration), timeline.duration / 30);
assert.equal(voice.codec_name, 'aac');
assert.equal(voice.channels, 1);

const frames = run(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-an', '-vf', 'scale=1:1',
  '-pix_fmt', 'gray', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], 'buffer').stdout;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let offset = 0;
let decoded = 0;
let minLuma = 255;
while (offset < frames.length) {
  assert.ok(frames.subarray(offset, offset + 8).equals(signature));
  offset += 8;
  const image = [];
  for (;;) {
    const size = frames.readUInt32BE(offset);
    const type = frames.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') image.push(frames.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
    if (type === 'IEND') break;
  }
  minLuma = Math.min(minLuma, inflateSync(Buffer.concat(image))[1]);
  decoded++;
}
assert.equal(decoded, timeline.duration);
assert.ok(minLuma > 16);
const levels = media('-hide_banner', '-i', output, '-vn', '-af', 'loudnorm=print_format=json', '-c:a', 'pcm_s16le', '-f', 'null', '-').stderr;
const {input_i: lufs, input_tp: peak} = JSON.parse(levels.match(/\{\s*"input_i"[\s\S]+?\}/)[0]);
assert.ok(Number(peak) < -1, 'Pico real demasiado alto.');

const review = final ? join(root, 'review') : join(cache, 'preview-review');
mkdirSync(review, {recursive: true});
function still(frame, path, codec = 'png') {
  media('-v', 'error', '-xerror', '-ss', String(Math.max(0, frame / 30 - 0.001)), '-i', output, '-frames:v', '1',
    '-c:v', codec, '-update', '1', '-y', path);
}
for (const [index, chapter] of timeline.chapters.entries()) {
  still(chapter.review, join(review, `${String(index + 1).padStart(2, '0')}-${chapter.id}.png`));
}
if (final) {
  const clean = join(root, 'master-clean.mp4');
  media('-v', 'error', '-y', '-i', output, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', clean);
  const {streams: cleanStreams} = probe(clean);
  assert.equal(cleanStreams.length, 1);
  assert.equal(Number(cleanStreams[0].nb_frames), timeline.duration);
  still(0, join(root, 'cover.jpg'), 'mjpeg');
}
const result = {mode, bytes: statSync(output).size, seconds: Number(video.duration),
  containerSeconds: Number(format.duration), width: video.width, height: video.height, fps: video.avg_frame_rate,
  decoded, minLuma, lufs: Number(lufs), peakDbtp: Number(peak), audioHz: Number(voice.sample_rate),
  elapsedSeconds: (Date.now() - started) / 1000};
await writeFile(join(cache, `${mode}-result.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
