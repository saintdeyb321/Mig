import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {reviewFrames, scenes, video} from '../src/timeline.mjs';

const captions = JSON.parse(readFileSync(new URL('../src/captions.json', import.meta.url)));

test('las siete escenas cubren 900 frames sin huecos y los fijos apuntan a sus escenas', () => {
  assert.deepEqual([video.width, video.height, video.fps, video.durationInFrames], [1080, 1920, 30, 900]);
  assert.equal(scenes.length, 7);
  let end = 0;
  for (const {from, duration} of scenes) {
    assert.equal(from, end);
    assert.ok(duration > 0);
    end += duration;
  }
  assert.equal(end, video.durationInFrames);
  assert.deepEqual(reviewFrames, [36, 315, 465, 615, 870]);
  assert.deepEqual(reviewFrames.map(frame => scenes.find(({from, duration}) => from <= frame && frame < from + duration).id),
    ['hook', 'inventory', 'reports', 'cash', 'cta']);
});

test('los nueve subtítulos están dentro de la composición y sus escenas', () => {
  assert.equal(captions.length, 9);
  const msPerFrame = 1000 / video.fps;
  let previousEnd = 0;
  for (const {text, startMs, endMs} of captions) {
    assert.ok(text.trim() && startMs >= previousEnd && endMs > startMs);
    assert.ok(scenes.some(({from, duration}) => from * msPerFrame <= startMs + 0.001
      && endMs <= (from + duration) * msPerFrame + 0.001));
    previousEnd = endMs;
  }
  assert.equal(previousEnd, 30000);
});
