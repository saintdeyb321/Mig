import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {clips, duration, fps, height, width} from './timeline.mjs';
import {writeScore} from './score.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const bin = join(root, '..', 'node_modules', '@remotion');
const mediaBin = join(bin, 'compositor-win32-x64-msvc');
const ffmpeg = join(mediaBin, 'ffmpeg.exe');
const ffprobe = join(mediaBin, 'ffprobe.exe');
const cli = join(bin, 'cli', 'remotion-cli.js');
const mode = process.argv[2];
assert.ok(['preview', 'final'].includes(mode), 'Indica preview o final.');

function run(command, args, encoding = 'utf8', inherit = false) {
  const result = spawnSync(command, args, {cwd: root, encoding, stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 16 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} terminó con código ${result.status}\n${result.stderr ?? ''}`);
  return result;
}
const probe = path => JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout);
const remotion = args => run(process.execPath, [cli, ...args], 'utf8', true);
const gestures = JSON.parse(readFileSync(join(root, 'src', 'gestures.generated.json'), 'utf8'));
for (const [name, count] of Object.entries(clips)) {
  const {streams: [clip]} = probe(join(root, 'public', 'recordings', `${name}.mp4`));
  assert.deepEqual([clip.width, clip.height, clip.avg_frame_rate, Number(clip.nb_frames)], [780, 1688, '30/1', count]);
  assert.ok(gestures[name].capturedFrames >= 8);
}
assert.equal(gestures.pos.taps.length, 3);
assert.equal(gestures.stock.swipes.length + gestures.reports.swipes.length, 2);

copyFileSync(join(root, '..', '..', '..', 'frontend', 'public', 'img', 'Logo_MP.png'), join(root, 'public', 'logo.png'));
writeScore(join(root, 'public', 'score.wav'), gestures);
const cache = join(root, '.cache');
mkdirSync(cache, {recursive: true});
const bundle = join(mkdtempSync(join(cache, 'render-')), 'bundle');
const browser = [process.env.MIGAPOS_VIDEO_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert.ok(browser, 'Chrome/Edge local no encontrado.');
remotion(['bundle', 'src/index.jsx', `--public-dir=${join(root, 'public')}`, `--out-dir=${bundle}`, '--disable-git-source', '--log=warn']);

const final = mode === 'final';
const scale = final ? 1 : 0.25;
const output = join(root, final ? 'brag.mp4' : 'preview.mp4');
const start = performance.now();
console.log(`Remotion · ${mode} · ${duration} frames · escala ${scale}`);
remotion(['render', bundle, 'MigaPOSMobileV2', output, '--codec=h264', '--pixel-format=yuv420p',
  '--color-space=bt709', '--audio-codec=aac', '--audio-bitrate=160k', `--crf=${final ? 18 : 22}`,
  `--scale=${scale}`, '--concurrency=3', '--overwrite', '--chrome-mode=chrome-for-testing',
  `--browser-executable=${browser}`, '--gl=angle', '--log=warn']);

const {streams, format} = probe(output);
const video = streams.find(stream => stream.codec_type === 'video');
const audio = streams.find(stream => stream.codec_type === 'audio');
assert.deepEqual([video.codec_name, video.width, video.height, video.avg_frame_rate, Number(video.nb_frames)],
  ['h264', width * scale, height * scale, '30/1', duration]);
assert.equal(video.pix_fmt, 'yuv420p');
assert.equal(Number(video.duration), duration / fps);
assert.deepEqual([audio.codec_name, audio.channels, audio.sample_rate], ['aac', 2, '48000']);

const decoded = run(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-an', '-vf', 'scale=1:1',
  '-pix_fmt', 'gray', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], 'buffer').stdout;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let cursor = 0;
let frames = 0;
let minLuma = 255;
while (cursor < decoded.length) {
  assert.ok(decoded.subarray(cursor, cursor + 8).equals(signature));
  cursor += 8;
  const parts = [];
  for (;;) {
    const size = decoded.readUInt32BE(cursor);
    const kind = decoded.toString('ascii', cursor + 4, cursor + 8);
    if (kind === 'IDAT') parts.push(decoded.subarray(cursor + 8, cursor + 8 + size));
    cursor += 12 + size;
    if (kind === 'IEND') break;
  }
  minLuma = Math.min(minLuma, inflateSync(Buffer.concat(parts))[1]);
  frames++;
}
assert.equal(frames, duration);
assert.ok(minLuma > 16, `Hay un fotograma oscuro: ${minLuma}`);
const levels = run(ffmpeg, ['-hide_banner', '-i', output, '-vn', '-af', 'loudnorm=print_format=json',
  '-c:a', 'pcm_s16le', '-f', 'null', '-']).stderr;
const measured = JSON.parse(levels.match(/\{\s*"input_i"[\s\S]+?\}/)[0]);
assert.ok(Number(measured.input_i) > -32 && Number(measured.input_i) < -12);
assert.ok(Number(measured.input_tp) < -1);

const snapshots = join(root, final ? 'review' : '.cache', final ? '' : 'preview');
mkdirSync(snapshots, {recursive: true});
function still(frame, path, codec) {
  run(ffmpeg, ['-v', 'error', '-xerror', '-ss', String(Math.max(0, frame / fps - 0.001)), '-i', output,
    '-frames:v', '1', '-c:v', codec, '-update', '1', '-y', path]);
}
for (const frame of [0, 54, 157, 318, 454, 612]) {
  still(frame, join(snapshots, `frame-${String(frame).padStart(3, '0')}.png`), 'png');
}
if (final) still(0, join(root, 'brag.jpg'), 'mjpeg');
const result = {mode, bytes: statSync(output).size, seconds: Number(video.duration), containerSeconds: Number(format.duration),
  width: video.width, height: video.height, frames, minLuma, lufs: Number(measured.input_i),
  peakDbtp: Number(measured.input_tp), elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(1))};
console.log(JSON.stringify(result, null, 2));
