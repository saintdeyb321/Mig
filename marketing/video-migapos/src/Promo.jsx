import React from 'react';
import {AbsoluteFill, Easing, Html5Audio, Img, Sequence, getStaticFiles, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {DemoPanel} from './DemoPanel.jsx';
import {montage, scenes} from './timeline.mjs';
import {logo, soundtrack} from './media.mjs';
import captions from './captions.json';

const glide = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)};
const ease = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)};
const featureNumbers = {pos: '01', inventory: '02', reports: '03', cash: '04'};

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

function Masthead({label, number}) {
  return <div className="masthead">
    <Img src={staticFile(logo)} alt="" className="mini-logo" />
    <span>MigaPOS</span><i /><span className="module-label">{label}</span>
    {number && <span className="chapter">{number}<em>/ 04</em></span>}
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
  const isMontage = scene.id === 'montage';
  const isHook = scene.id === 'hook';
  const beat = scene.duration / montage.length;
  const ticketChange = 2 * fps;
  const hasUpdatedTicket = scene.id === 'pos' && frame >= ticketChange;
  const asset = isMontage ? montage[Math.floor(frame / beat)] : hasUpdatedTicket ? 'ticket-updated' : scene.asset;
  const panelFrame = isMontage ? frame % beat : hasUpdatedTicket ? frame - ticketChange : frame;
  const panelLength = isMontage ? beat : scene.id === 'pos'
    ? (hasUpdatedTicket ? scene.duration - ticketChange : ticketChange) : scene.duration;

  const enter = isHook ? 1 : interpolate(frame, [0, 8], [0, 1], ease);
  const exit = interpolate(frame, [scene.duration - 8, scene.duration - 1], [1, 0], ease);
  const panelIn = isHook ? 1 : interpolate(panelFrame, [0, 7], [0, 1], glide);
  const panelOut = interpolate(panelFrame, [panelLength - 7, panelLength - 1], [1, 0], ease);
  const zoom = interpolate(panelFrame, [0, panelLength - 1], [isHook ? 0.97 : 0.955, 1], glide);
  const titleY = (1 - enter) * 24 - (1 - exit) * 10;
  const panelY = (1 - panelIn) * 34 - (1 - panelOut) * 15;
  return <div className="safe-area">
    <Masthead label={scene.label} number={featureNumbers[scene.id]} />
    <h1 className="headline" style={{translate: `0 ${titleY}px`, opacity: 0.65 + enter * exit * 0.35}}>
      {scene.title}
    </h1>
    <div className="stage" style={{scale: zoom, translate: `0 ${panelY}px`, opacity: 0.65 + panelIn * panelOut * 0.35}}>
      <DemoPanel asset={asset} />
    </div>
  </div>;
}

function ClosingScene({title}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = interpolate(frame, [0, 0.9 * fps], [0.9, 1], glide);
  const lift = interpolate(frame, [0, 0.55 * fps], [24, 0], glide);
  return <div className="safe-area closing">
    <div className="closing-lockup">
      <div className="closing-halo" aria-hidden="true" style={{scale}} />
      <div className="closing-emblem" style={{scale}}>
        <Img src={staticFile(logo)} alt="Emblema de MigaPOS" />
      </div>
      <div className="closing-brand">MigaPOS</div>
      <h1 className="cta" style={{translate: `0 ${lift}px`}}>{title}</h1>
    </div>
  </div>;
}

export function Promo() {
  const hasSound = getStaticFiles().some(file => file.name === soundtrack);
  return <AbsoluteFill className="promo">
    <Galaxy />
    {hasSound && <Html5Audio src={staticFile(soundtrack)} />}
    {scenes.map(scene => <Sequence key={scene.id} name={scene.title.replace('\n', ' ')}
      from={scene.from} durationInFrames={scene.duration}>
      {scene.id === 'cta' ? <ClosingScene title={scene.title} /> : <FeatureScene scene={scene} />}
    </Sequence>)}
    <Subtitles />
  </AbsoluteFill>;
}
