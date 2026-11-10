import React from 'react';
import {AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {DemoPanel} from './DemoPanel.jsx';
import {montage, scenes} from './timeline.mjs';
import captions from './captions.json';

const logo = 'assets/brand/Logo_MP.png';
const glide = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)};

function Galaxy() {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames - 1], [-52, 72]);
  return <AbsoluteFill className="galaxy" aria-hidden="true">
    <div className="nebula" style={{translate: `${drift}px ${-drift}px`}} />
    <svg className="orbits" viewBox="0 0 1080 1920" fill="none">
      <g transform="rotate(-26 550 1010)">
        <ellipse cx="550" cy="1010" rx="560" ry="400" />
        <ellipse cx="550" cy="1010" rx="608" ry="445" opacity=".48" />
      </g>
      <circle cx="63" cy="593" r="4" /><circle cx="944" cy="600" r="5" />
      <circle cx="1002" cy="1350" r="3" /><circle cx="106" cy="1470" r="4" />
    </svg>
  </AbsoluteFill>;
}

function Masthead({label}) {
  return <div className="masthead">
    <Img src={staticFile(logo)} alt="" className="mini-logo" />
    <span>MigaPOS</span><i /><span className="module-label">{label}</span>
  </div>;
}

function Subtitles() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const timeMs = frame * 1000 / fps;
  const cue = captions.find(({startMs, endMs}) => startMs <= timeMs && timeMs < endMs);
  if (!cue || cue.renderAsTitle) return null;
  return <div className="subtitle"><span>{cue.text}</span></div>;
}

function FeatureScene({scene}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = interpolate(frame, [0, 0.48 * fps], [0, 1], glide);
  const isMontage = scene.id === 'montage';
  const beat = scene.duration / montage.length;
  const asset = isMontage ? montage[Math.floor(frame / beat)]
    : scene.id === 'pos' && frame >= 2 * fps ? 'ticket-updated' : scene.asset;
  const panelFrame = isMontage ? frame % beat : frame;
  const zoom = interpolate(panelFrame, [0, isMontage ? beat - 1 : scene.duration - 1], [0.96, 1], glide);
  return <div className="safe-area">
    <Masthead label={scene.label} />
    <h1 className="headline" style={{translate: `0 ${(1 - reveal) * 28}px`, opacity: 0.82 + reveal * 0.18}}>
      {scene.title}
    </h1>
    <div className="stage" style={{scale: zoom}}>
      <DemoPanel asset={asset} />
    </div>
  </div>;
}

function ClosingScene({title}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = interpolate(frame, [0, 0.9 * fps], [0.93, 1], glide);
  return <div className="safe-area closing">
    <div className="closing-lockup">
      <div className="closing-emblem" style={{scale}}>
        <Img src={staticFile(logo)} alt="Emblema de MigaPOS" />
      </div>
      <div className="closing-brand">MigaPOS</div>
      <h1 className="cta">{title}</h1>
    </div>
  </div>;
}

export function Promo() {
  return <AbsoluteFill className="promo">
    <Galaxy />
    {scenes.map(scene => <Sequence key={scene.id} name={scene.title.replace('\n', ' ')}
      from={scene.from} durationInFrames={scene.duration}>
      {scene.id === 'cta' ? <ClosingScene title={scene.title} /> : <FeatureScene scene={scene} />}
    </Sequence>)}
    <Subtitles />
  </AbsoluteFill>;
}
