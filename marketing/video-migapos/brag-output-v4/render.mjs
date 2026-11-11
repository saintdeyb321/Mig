import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {detailWindow, frameWindow, viewport} from './src/geometry.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const packages = join(root, '..', 'node_modules', '@remotion');
const cli = join(packages, 'cli', 'remotion-cli.js');
const media = join(packages, 'compositor-win32-x64-msvc');
const ffmpeg = join(media, 'ffmpeg.exe');
const ffprobe = join(media, 'ffprobe.exe');
const cache = join(root, '.cache');
const timeline = JSON.parse(readFileSync(join(root, 'timeline.json'), 'utf8'));
const mode = process.argv[2];
assert.ok(['preview', 'final'].includes(mode), 'Indica preview o final.');
const final = mode === 'final';
const scale = final ? 1 : 0.5;
const started = Date.now();

function run(command, args, encoding = 'utf8', inherit = false) {
  const result = spawnSync(command, args, {cwd: root, encoding, stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 24 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} terminó con código ${result.status}\n${result.stderr ?? ''}`);
  return result;
}
const probe = path => JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout);
const remotion = args => run(process.execPath, [cli, ...args], 'utf8', true);
const bounds = frameWindow(viewport, 0);
assert.equal(bounds.height, 844);
assert.equal(bounds.width, 390);
assert.ok(Math.abs(bounds.screen.width / bounds.screen.height - 390 / 844) < 0.000001);
const actions = [];
const assets = new Set();
for (const chapter of timeline.chapters) {
  for (const beat of chapter.beats) {
    const shot = beat.shot;
    if (!assets.has(shot)) {
      const [image] = probe(join(root, 'public', 'shots', `${shot}.png`)).streams;
      assert.deepEqual([image.codec_name, image.width, image.height], ['png', 780, 1688]);
      assets.add(shot);
    }
    if (beat.mode !== 'full') {
      const geometry = timeline.geometry[shot];
      const [x, y, w, h] = geometry.focus;
      const crop = detailWindow(geometry);
      assert.ok(crop.x <= x + 1 && crop.y <= y + 1 && crop.x + crop.width >= x + w - 1
        && crop.y + crop.height >= y + h - 1, `El detalle corta el objetivo: ${shot}`);
    }
    if (beat.clip) {
      const [clip] = probe(join(root, 'public', 'clips', `${shot}.mp4`)).streams;
      assert.deepEqual([clip.codec_name, clip.width, clip.height, Number(clip.nb_frames)], ['h264', 780, 1688, beat.clip.frames]);
      actions.push({shot, from: chapter.from + beat.from, to: chapter.from + beat.from + beat.play});
    }
  }
}
assert.equal(timeline.chapters.length, 12);
assert.ok(actions.length >= 15, 'Faltan grabaciones de las acciones.');
assert.ok(Math.abs(Number(probe(join(root, 'narration-v4.wav')).format.duration) - timeline.duration / 30) < 0.00001);
copyFileSync(join(root, '..', '..', '..', 'frontend', 'public', 'img', 'Logo_MP.png'), join(root, 'public', 'logo.png'));
copyFileSync(join(root, 'narration-v4.wav'), join(root, 'public', 'narration-v4.wav'));
const bundle = join(mkdtempSync(join(cache, `render-${mode}-`)), 'bundle');
const chrome = [process.env.MIGAPOS_VIDEO_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert.ok(chrome, 'Chrome/Edge local no encontrado.');
remotion(['bundle', 'src/index.jsx', `--public-dir=${join(root, 'public')}`, `--out-dir=${bundle}`,
  '--disable-git-source', '--log=warn']);
const output = join(root, final ? 'master-voice-v4.mp4' : 'preview-v4.mp4');
console.log(`Remotion continuo · ${timeline.duration} fotogramas · ${actions.length} acciones de navegador`);
remotion(['render', bundle, 'MigaPOSV4', output, '--codec=h264', '--pixel-format=yuv420p', '--color-space=bt709',
  '--audio-codec=aac', '--audio-bitrate=96k', '--concurrency=5', '--overwrite', '--gl=angle',
  `--crf=${final ? 18 : 22}`, `--scale=${scale}`, `--browser-executable=${chrome}`,
  '--chrome-mode=chrome-for-testing', '--log=warn']);

const {streams, format} = probe(output);
const video = streams.find(stream => stream.codec_type === 'video');
const audio = streams.find(stream => stream.codec_type === 'audio');
assert.deepEqual([video.codec_name, video.width, video.height, video.pix_fmt, video.avg_frame_rate, Number(video.nb_frames)],
  ['h264', 1080 * scale, 1920 * scale, 'yuv420p', '30/1', timeline.duration]);
assert.ok(Math.abs(Number(video.duration) - timeline.duration / 30) < 0.001);
assert.ok(audio.codec_name === 'aac' && audio.channels >= 1);

function paeth(left, up, diagonal) {
  const predicted = left + up - diagonal;
  const a = Math.abs(predicted - left), b = Math.abs(predicted - up), c = Math.abs(predicted - diagonal);
  if (a <= b && a <= c) return left;
  return b <= c ? up : diagonal;
}
const width = 16, height = 28;
const raw = run(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-an', '-vf', `scale=${width}:${height}`,
  '-pix_fmt', 'gray', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], 'buffer').stdout;
let offset = 0;
let frames = 0;
let previous = null;
let minimumLuma = 255;
const changed = [];
while (offset < raw.length) {
  offset += 8;
  const idat = [];
  for (;;) {
    const size = raw.readUInt32BE(offset);
    const type = raw.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(raw.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
    if (type === 'IEND') break;
  }
  const encoded = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height);
  let total = 0;
  let difference = 0;
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    const filter = encoded[row];
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const left = x ? pixels[index - 1] : 0;
      const up = y ? pixels[index - width] : 0;
      const diagonal = x && y ? pixels[index - width - 1] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up :
        filter === 3 ? ((left + up) >> 1) : paeth(left, up, diagonal);
      pixels[index] = encoded[row + 1 + x] + prediction;
      total += pixels[index];
      if (previous) difference += Math.abs(previous[index] - pixels[index]);
    }
  }
  minimumLuma = Math.min(minimumLuma, total / pixels.length);
  changed.push(difference / pixels.length);
  previous = pixels;
  frames++;
}
assert.equal(frames, timeline.duration);
assert.ok(minimumLuma > 16, 'Se detectó un fotograma negro.');
const motion = actions.map(({shot, from, to}) => ({
  shot, frames: to - from, movingFrames: changed.slice(from + 1, to).filter(delta => delta > 0.15).length,
}));

const levels = run(ffmpeg, ['-hide_banner', '-i', output, '-vn', '-af', 'loudnorm=print_format=json',
  '-c:a', 'pcm_s16le', '-f', 'null', '-']).stderr;
const {input_i: lufs, input_tp: peak} = JSON.parse(levels.match(/\{\s*"input_i"[\s\S]+?\}/)[0]);
assert.ok(Number(peak) < -1);
const review = final ? join(root, 'review') : join(cache, 'preview-review');
mkdirSync(review, {recursive: true});
function still(frame, path, codec = 'png') {
  run(ffmpeg, ['-v', 'error', '-xerror', '-ss', String(Math.max(0, frame / 30 - 0.001)), '-i', output,
    '-frames:v', '1', '-c:v', codec, '-update', '1', '-y', path]);
}
for (const [index, chapter] of timeline.chapters.entries()) {
  chapter.review.forEach((frame, stage) => still(frame, join(review, `${String(index + 1).padStart(2, '0')}-${chapter.id}-${stage + 1}.png`)));
}
if (final) {
  const clean = join(root, 'master-clean-v4.mp4');
  run(ffmpeg, ['-v', 'error', '-y', '-i', output, '-map', '0:v:0', '-an', '-c:v', 'copy', '-movflags', '+faststart', clean]);
  const {streams: cleanStreams} = probe(clean);
  assert.equal(cleanStreams.length, 1);
  assert.equal(Number(cleanStreams[0].nb_frames), timeline.duration);
  still(20, join(root, 'cover-v4.jpg'), 'mjpeg');
}
const result = {mode, bytes: statSync(output).size, seconds: Number(video.duration), containerSeconds: Number(format.duration),
  width: video.width, height: video.height, fps: video.avg_frame_rate, frames, minimumLuma: Number(minimumLuma.toFixed(2)),
  lufs: Number(lufs), peakDbtp: Number(peak), audioHz: Number(audio.sample_rate), actions: motion,
  elapsedSeconds: (Date.now() - started) / 1000};
writeFileSync(join(cache, `${mode}-result.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({...result, actions: motion.length, stationaryActions: motion.filter(item => item.movingFrames === 0)}, null, 2));
