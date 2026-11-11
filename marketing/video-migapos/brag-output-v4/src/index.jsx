import React from 'react';
import {AbsoluteFill, Composition, Easing, Html5Audio, Img, OffthreadVideo, Sequence, interpolate,
  registerRoot, staticFile, useCurrentFrame} from 'remotion';
import timeline from '../timeline.json';
import {detailWindow, frameWindow, viewport} from './geometry.mjs';
import './style.css';

const cameraEase = {easing: Easing.bezier(0.32, 0.05, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const ease = (frame, from, to, initial = 0, final = 1) => interpolate(frame, [from, to], [initial, final], cameraEase);
const uiLogo = staticFile('logo.png');

function PhoneFull({screen, opacity}) {
  return <div className="phone-body" aria-hidden="true" style={{
    left: screen.left - 14, top: screen.top - 14, width: screen.width + 28, height: screen.height + 28, opacity,
  }}>
    <i className="phone-button volume" /><i className="phone-button power" />
  </div>;
}

function FeatureSpotlight({screen, opacity}) {
  return <div className="detail-frame" aria-hidden="true" style={{...screen, opacity}}>
    <span>Vista de detalle</span>
  </div>;
}

function Caption({cues}) {
  const frame = useCurrentFrame();
  const cue = cues.find(({from, to}) => from <= frame && frame < to);
  return cue ? <div className="caption"><span>{cue.text}</span></div> : null;
}

function Touch({tap, age, window}) {
  const left = (tap.x - window.x) * window.scale;
  const top = (tap.y - window.y) * window.scale;
  if (left < 0 || left > window.screen.width || top < 0 || top > window.screen.height) return null;
  return <i className="tap" aria-hidden="true" style={{left, top, scale: ease(age, 0, 12, 0.58, 1.36),
    opacity: ease(age, 1, 13, 0.88, 0)}} />;
}

function FocusMotion({beat, nextBeat}) {
  const frame = useCurrentFrame();
  const duration = beat.to - beat.from;
  const playing = beat.clip && frame < beat.play;
  const detail = beat.mode !== 'full';
  const filter = beat.mode === 'filter';
  const push = detail ? (filter ? 1 : ease(frame, beat.play + 4, beat.play + 24)) : 0;
  const pull = detail && nextBeat && nextBeat.mode !== 'filter' && duration > beat.play + 34
    ? ease(frame, duration - 14, duration - 1, 1, 0) : 1;
  const amount = Math.min(push, pull);
  const geometry = timeline.geometry[beat.shot];
  const crop = detail ? detailWindow(geometry) : viewport;
  const window = frameWindow(crop, amount);
  const style = {
    width: 390 * window.scale, height: 844 * window.scale,
    left: -window.x * window.scale, top: -window.y * window.scale,
  };
  const rate = beat.clip ? beat.clip.frames / beat.play : 1;
  const sourceFrame = frame * rate;
  return <>
    <PhoneFull screen={window.screen} opacity={ease(amount, 0.08, 0.48, 1, 0)} />
    <FeatureSpotlight screen={window.screen} opacity={ease(amount, 0.58, 0.94)} />
    <div className="screen" style={window.screen}>
      {playing ? <OffthreadVideo muted src={staticFile(`clips/${beat.shot}.mp4`)}
        playbackRate={rate} style={style} className="ui-media" /> :
        <Img src={staticFile(`shots/${beat.shot}.png`)} style={style} className="ui-media"
          alt="MigaPOS móvil, datos de demostración" />}
      {playing && beat.clip.taps.map((tap, index) => {
        const age = (sourceFrame - tap.frame) / rate;
        return age >= 0 && age <= 13 ? <Touch key={index} tap={tap} age={age} window={window} /> : null;
      })}
    </div>
  </>;
}

function Chapter({chapter}) {
  const frame = useCurrentFrame();
  const closing = chapter.id === 'cta';
  const arrival = ease(frame, 0, 17);
  const opacity = chapter.from === 0 ? 1 : ease(frame, 0, 11, 0.35, 1);
  return <AbsoluteFill>
    {closing ? <div className="closing" style={{opacity, translate: `0 ${18 * (1 - arrival)}px`}}>
      <Img className="emblem" src={uiLogo} alt="" />
      <b>MigaPOS</b>
      <h1>{chapter.title}</h1>
    </div> : <>
      <div className="chapter-name" style={{opacity}}>
        <span>Datos de demostración</span>
        <h1>{chapter.title}</h1>
      </div>
      <AbsoluteFill style={{opacity, translate: `0 ${13 * (1 - arrival)}px`}}>
        {chapter.beats.map((beat, index) => <Sequence key={beat.shot} name={beat.shot}
          from={beat.from} durationInFrames={beat.to - beat.from}>
          <FocusMotion beat={beat} nextBeat={chapter.beats[index + 1]} />
        </Sequence>)}
      </AbsoluteFill>
    </>}
    <Caption cues={chapter.cues} />
  </AbsoluteFill>;
}

function Tour() {
  const frame = useCurrentFrame();
  const drift = ease(frame, 0, timeline.duration - 1, -45, 44);
  return <AbsoluteFill className="ad">
    <div className="galaxy" style={{translate: `${drift}px 0`}} />
    <div className="brand"><Img src={uiLogo} alt="" /><b>MigaPOS</b></div>
    <Html5Audio src={staticFile('narration-v4.wav')} />
    {timeline.chapters.map(chapter => <Sequence key={chapter.id} name={chapter.title}
      from={chapter.from} durationInFrames={chapter.duration}>
      <Chapter chapter={chapter} />
    </Sequence>)}
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="MigaPOSV4" component={Tour} width={timeline.width} height={timeline.height}
  fps={timeline.fps} durationInFrames={timeline.duration} />);
