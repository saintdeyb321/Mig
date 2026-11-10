import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {scenes, video} from '../src/timeline.mjs';

const rate = 48000;
const twoPi = 2 * Math.PI;
const hz = note => 440 * 2 ** ((note - 69) / 12);
const chords = [[50, 57, 62, 65], [46, 53, 57, 62], [43, 50, 58, 62], [45, 52, 57, 64]];
const arpeggio = [1, 2, 3, 2, 0, 2];
const cueStarts = scenes.map(({from}) => from / video.fps);
const beatLength = 0.75;
const chordLength = 6 * beatLength;
const smooth = x => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function writeScore(path) {
  const duration = video.durationInFrames / video.fps;
  const count = duration * rate;
  const samples = new Float32Array(count * 2);
  const oscillators = chords.map(notes => notes.map(hz));
  let peak = 0;
  let energy = 0;
  let cue = 0;
  for (let sample = 0; sample < count; sample++) {
    const time = sample / rate;
    while (cue + 1 < cueStarts.length && time >= cueStarts[cue + 1]) cue++;
    const chordIndex = Math.floor(time / chordLength);
    const chord = oscillators[chordIndex % oscillators.length];
    const chordTime = time % chordLength;
    const blend = smooth(chordTime / 0.55);
    const previous = oscillators[(chordIndex + oscillators.length - 1) % oscillators.length];
    const beat = Math.floor(time / beatLength);
    const beatTime = time % beatLength;
    const frequency = chord[arpeggio[beat % arpeggio.length]] * 2;
    const pluck = smooth(beatTime / 0.026) * Math.exp(-7 * beatTime)
      * (0.11 * Math.sin(twoPi * frequency * beatTime) + 0.023 * Math.sin(twoPi * frequency * 2 * beatTime));
    const pulse = beat % 2 === 0 ? 0.14 * smooth(beatTime / 0.02) * Math.exp(-15 * beatTime)
      * Math.sin(twoPi * (46 * beatTime + 4 * (1 - Math.exp(-18 * beatTime)))) : 0;
    const cueTime = time - cueStarts[cue];
    const shimmer = 0.032 * smooth(cueTime / 0.045) * Math.exp(-8 * cueTime)
      * (Math.sin(twoPi * 660 * cueTime) + 0.38 * Math.sin(twoPi * 990 * cueTime));
    const fade = smooth(time / 0.26) * smooth((duration - time) / 1.15);
    for (let channel = 0; channel < 2; channel++) {
      let pad = 0;
      for (let voice = 0; voice < chord.length; voice++) {
        const detune = 1 + (channel ? 0.0016 : -0.0016) * voice;
        const current = Math.sin(twoPi * chord[voice] * detune * time);
        const tail = Math.sin(twoPi * previous[voice] * detune * time);
        pad += (current * blend + tail * (1 - blend)) * (voice === 0 ? 0.065 : 0.042);
      }
      const pan = beat % 2 === channel ? 1 : 0.68;
      const value = fade * (pad + pulse + pluck * pan + shimmer);
      samples[2 * sample + channel] = value;
      peak = Math.max(peak, Math.abs(value));
      energy += value ** 2;
    }
  }

  const gain = Math.min(0.43 / peak, 0.097 / Math.sqrt(energy / samples.length));
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, wav);
}
