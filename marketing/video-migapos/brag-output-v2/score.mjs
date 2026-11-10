import {writeFileSync} from 'node:fs';
import {duration, fps, starts} from './timeline.mjs';

const rate = 48000;
const turn = 2 * Math.PI;
const hz = note => 440 * 2 ** ((note - 69) / 12);
const harmony = [[38, 57, 60, 65], [34, 53, 57, 62], [43, 55, 58, 62], [45, 57, 60, 64]].map(notes => notes.map(hz));
const melody = [1, 3, 2, 3, 1, 2, 3, 2];
const clamp = n => Math.max(0, Math.min(1, n));
const fade = x => (x = clamp(x), x * x * (3 - 2 * x));

export function writeScore(path, gestures) {
  const seconds = duration / fps;
  const frames = rate * seconds;
  const taps = gestures.pos.taps.map(({frame}) => frame / fps);
  const repriseTap = (starts.reprise + gestures.pos.taps[2].frame - 134) / fps;
  taps.push(repriseTap);
  const accents = Object.values(starts).slice(1).map(frame => frame / fps);
  const swipes = ['stock', 'reports'].map(name => (starts[name] + gestures[name].swipes[0].frame) / fps);
  const stereo = new Float32Array(frames * 2);
  let peak = 0;
  let energy = 0;
  for (let index = 0; index < frames; index++) {
    const t = index / rate;
    const bar = Math.floor(t / 2) % harmony.length;
    const chord = harmony[bar];
    const previous = harmony[(bar + harmony.length - 1) % harmony.length];
    const blend = fade((t % 2) / 0.31);
    const step = Math.floor(t * 4);
    const a = t % 0.25;
    const beat = t % 1;
    const pluckHz = chord[melody[step % melody.length]] * 2;
    const pluck = 0.075 * fade(a / 0.025) * Math.exp(-12 * a) *
      (Math.sin(turn * pluckHz * a) + 0.24 * Math.sin(turn * pluckHz * 2 * a));
    const kick = 0.15 * fade(beat / 0.012) * Math.exp(-15 * beat) *
      Math.sin(turn * (48 * beat + 1.5 * (1 - Math.exp(-23 * beat))));
    let foley = 0;
    for (const when of taps) {
      const age = t - when;
      if (age >= 0 && age < 0.13) foley += 0.06 * fade(age / 0.008) * Math.exp(-34 * age) * Math.sin(turn * 760 * age);
    }
    for (const when of swipes) {
      const age = t - when;
      if (age >= 0 && age < 0.37) foley += 0.024 * fade(age / 0.08) * Math.exp(-7 * age) *
        Math.sin(turn * (250 * age + 750 * age * age));
    }
    for (const when of accents) {
      const age = t - when;
      if (age >= 0 && age < 0.6) foley += 0.029 * fade(age / 0.035) * Math.exp(-5 * age) *
        (Math.sin(turn * 587.33 * age) + 0.5 * Math.sin(turn * 880 * age));
    }
    const envelope = fade(t / 0.23) * fade((seconds - t) / 0.95);
    for (let channel = 0; channel < 2; channel++) {
      let bed = 0;
      for (let voice = 0; voice < chord.length; voice++) {
        const detune = 1 + (channel === 0 ? -0.0018 : 0.0018) * voice;
        bed += 0.047 * (blend * Math.sin(turn * chord[voice] * detune * t)
          + (1 - blend) * Math.sin(turn * previous[voice] * detune * t));
      }
      const sample = envelope * (bed + kick + pluck * (step % 2 === channel ? 1 : 0.67) + foley);
      stereo[2 * index + channel] = sample;
      peak = Math.max(peak, Math.abs(sample));
      energy += sample ** 2;
    }
  }
  const gain = Math.min(0.42 / peak, 0.104 / Math.sqrt(energy / stereo.length));
  const wav = Buffer.alloc(44 + 2 * stereo.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(4 * rate, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let index = 0; index < stereo.length; index++) wav.writeInt16LE(Math.round(stereo[index] * gain * 32767), 44 + index * 2);
  writeFileSync(path, wav);
}
