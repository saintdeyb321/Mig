import assert from 'node:assert/strict';
import {mkdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {video} from '../src/timeline.mjs';
import {ffmpeg, probe, root} from './media-tools.mjs';

const preview = process.argv[2] === 'preview';
const path = join(root, 'out', preview ? 'preview-5s.mp4' : 'migapos-promo-30s.mp4');
const expectedFrames = preview ? 150 : video.durationInFrames;
const expectedSeconds = expectedFrames / video.fps;
const scale = preview ? 0.5 : 1;
const {streams, format} = probe(path);
const picture = streams.find(stream => stream.codec_type === 'video');
const audio = streams.find(stream => stream.codec_type === 'audio');
assert.ok(picture && audio, 'Se requieren pistas de video y audio.');
assert.equal(picture.codec_name, 'h264');
if (preview) {
  assert.ok(['yuv420p', 'yuvj420p'].includes(picture.pix_fmt));
} else {
  assert.equal(picture.pix_fmt, 'yuv420p');
  assert.equal(picture.color_space, 'bt709');
  assert.equal(picture.color_range, 'tv');
}
assert.deepEqual([picture.width, picture.height], [video.width * scale, video.height * scale]);
assert.equal(picture.avg_frame_rate, '30/1');
assert.equal(Number(picture.nb_frames), expectedFrames);
assert.ok(Math.abs(Number(picture.duration) - expectedSeconds) < 0.001, 'Duración de la pista de video incorrecta.');
assert.ok(Math.abs(Number(format.duration) - expectedSeconds) <= 1 / video.fps, 'Duración fuera de tolerancia.');
assert.equal(audio.codec_name, 'aac');
assert.equal(audio.channels, 2);

// Decode every H.264 frame and sample mean luminance as a 1×1 grayscale PNG.
const frames = ffmpeg(['-v', 'error', '-xerror', '-i', path, '-an', '-vf', 'scale=1:1',
  '-pix_fmt', 'gray', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], {encoding: 'buffer'}).stdout;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const luma = [];
let offset = 0;
while (offset < frames.length) {
  assert.ok(frames.subarray(offset, offset + 8).equals(signature), 'PNG de análisis inválido.');
  offset += 8;
  const idat = [];
  for (;;) {
    const size = frames.readUInt32BE(offset);
    const type = frames.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(frames.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
    if (type === 'IEND') break;
  }
  const pixel = inflateSync(Buffer.concat(idat));
  assert.equal(pixel.length, 2);
  luma.push(pixel[1]);
}
assert.equal(luma.length, expectedFrames);
const minLuma = Math.min(...luma);
assert.ok(minLuma > 16, `Fotograma posiblemente negro. Luma mínima: ${minLuma}.`);

const loudness = ffmpeg(['-v', 'info', '-xerror', '-i', path, '-vn', '-af',
  'loudnorm=print_format=json', '-c:a', 'pcm_s16le', '-f', 'null', '-']).stderr;
const measured = loudness.match(/\{\s*"input_i"[\s\S]+?\}/);
assert.ok(measured, 'No se pudieron medir los niveles de la pista.');
const {input_i: lufs, input_tp: peak} = JSON.parse(measured[0]);
assert.ok(Number(lufs) > -32 && Number(lufs) < -12, 'Nivel integrado fuera del margen.');
assert.ok(Number(peak) <= -1, 'Pico real demasiado alto.');

if (!preview) {
  const cache = join(root, '.cache');
  mkdirSync(cache, {recursive: true});
  for (const [name, second] of [['first', '0'], ['last', '29.96']]) {
    const frame = join(cache, `encoded-${name}.png`);
    ffmpeg(['-v', 'error', '-xerror', '-ss', second, '-i', path, '-frames:v', '1', '-vf', 'scale=360:640',
      '-c:v', 'png', '-update', '1', '-y', frame]);
    assert.ok(statSync(frame).size > 0, `No se pudo extraer el fotograma ${name}.`);
  }
}

console.log(JSON.stringify({
  path, bytes: statSync(path).size, seconds: Number(picture.duration), containerSeconds: Number(format.duration),
  codec: picture.codec_name, pixelFormat: picture.pix_fmt, width: picture.width, height: picture.height,
  fps: picture.avg_frame_rate, decodedFrames: luma.length, minLuma, audio: audio.codec_name,
  audioHz: Number(audio.sample_rate), channels: audio.channels, lufs: Number(lufs), peakDbtp: Number(peak),
}, null, 2));
