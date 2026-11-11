import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {runBrowserFixture} from '../../../tests/helpers/browserHarness.mjs';

const cache = new URL('.cache/', import.meta.url);
const timeline = JSON.parse(await readFile(new URL('timeline.json', import.meta.url), 'utf8'));
const targets = timeline.chapters.map(({id, from, duration}) => [id, from / 30, (from + duration) / 30]);
const prefix = '/@fs/__WORKSPACE__marketing/video-migapos/brag-output-v4/';
await writeFile(new URL('playback.html', cache), `<!doctype html><html><meta charset="utf-8">
<style>body{margin:0;background:#0f1025}video{display:block;margin:auto;height:100vh;max-width:100vw}</style>
<video muted playsinline preload="auto" src="${prefix}preview-v4.mp4"></video>
<script type="module" src="${prefix}.cache/playback.js"></script></html>`);
await writeFile(new URL('playback.js', cache), `
const video = document.querySelector('video');
if (video.readyState < 1) await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, {once:true}));
await fetch('/__phase4-report', {method:'POST', body:JSON.stringify({ok:true})});
`);

await runBrowserFixture({
  htmlFile: new URL('playback.html', cache),
  route: '/preview-v4-playback',
  firebaseSdk: false,
  headers: {'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'"},
  setupPage: page => page.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true}),
  inspectPage: async page => {
    const expression = `(async (chapters) => {
      const video = document.querySelector('video');
      const observed = Object.fromEntries(chapters.map(([name]) => [name, 0]));
      let samples = 0;
      let previous = null;
      let longestGap = 0;
      const finished = new Promise((resolve, reject) => {
        video.addEventListener('ended', resolve, {once:true});
        video.addEventListener('error', () => reject(Error(video.error?.message)), {once:true});
      });
      const observe = (_, frame) => {
        const current = frame.mediaTime;
        if (previous !== null) longestGap = Math.max(longestGap, current - previous);
        previous = current;
        const chapter = chapters.find(([,start,end]) => start <= current && current < end);
        if (chapter) observed[chapter[0]]++;
        samples++;
        if (!video.ended) video.requestVideoFrameCallback(observe);
      };
      video.playbackRate = 4;
      video.requestVideoFrameCallback(observe);
      await video.play();
      await finished;
      return {observed, samples, longestGap, elapsed:video.currentTime, duration:video.duration,
        width:video.videoWidth, height:video.videoHeight, rate:video.playbackRate};
    })(${JSON.stringify(targets)})`;
    const response = await page.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}, 45000);
    assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
    const result = response.result.value;
    assert.deepEqual([result.width, result.height], [540, 960]);
    assert.ok(Object.values(result.observed).every(count => count >= 8), JSON.stringify(result.observed));
    assert.ok(result.elapsed >= timeline.duration / 30 - 0.08);
    await writeFile(new URL('playback-result.json', cache), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  },
});
