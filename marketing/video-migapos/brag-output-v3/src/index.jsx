import React from 'react';
import {AbsoluteFill, Composition, Html5Audio, Img, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import timeline from '../timeline.json';
import './style.css';

const screenWidth = 762;
const screenHeight = 1032;
const scale = screenWidth / 390;
const cropHeight = screenHeight / scale;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const frameToBoard = timeline.runs.flatMap((frames, index) => Array(frames).fill(index));

function Phone({shot, reveal}) {
  const {area, focus} = timeline.geometry[shot];
  const [x, y, w, h] = focus;
  const [, areaY, , areaH] = area;
  const target = areaH < cropHeight * 0.9 ? areaY + areaH / 2 : y + Math.min(h, cropHeight) / 2;
  const cropTop = clamp(target - cropHeight / 2, 0, 844 - cropHeight);
  const rawTop = (y - cropTop) * scale;
  const targetTop = Math.max(9, rawTop);
  const targetLeft = clamp(x * scale, 9, screenWidth - 13);
  const targetWidth = Math.min(w * scale, screenWidth - targetLeft - 9);
  const targetHeight = Math.min(rawTop + h * scale, screenHeight - 9) - targetTop;
  const settled = 1 - (1 - reveal / 7) ** 3;
  return <div className="phone">
    <div className="rim">
      <div className="screen">
        <div className="capture" style={{scale: 0.985 + 0.015 * settled}}>
          <Img src={staticFile(`shots/${shot}.jpg`)} alt="Captura móvil de MigaPOS con datos de demostración"
            style={{width: screenWidth, height: 844 * scale, top: -cropTop * scale}} />
          {targetWidth > 14 && targetHeight > 14 && <div className="focus" aria-hidden="true" style={{
            left: targetLeft, top: targetTop, width: targetWidth, height: targetHeight,
            opacity: 0.65 + settled * 0.35,
          }} />}
        </div>
      </div>
    </div>
  </div>;
}

function Board({index}) {
  const [scene, title, shot, caption, reveal] = timeline.boards[index];
  const end = scene === 'cta';
  return <AbsoluteFill className="ad">
    <svg className="orbits" viewBox="0 0 1080 1920" aria-hidden="true">
      <ellipse cx="512" cy="830" rx="635" ry="398" transform="rotate(-27 512 830)" />
      <ellipse cx="512" cy="830" rx="670" ry="422" transform="rotate(-27 512 830)" opacity=".47" />
    </svg>
    {end ? <div className="closing">
      <Img className="emblem" src={staticFile('logo.png')} alt="" />
      <div className="wordmark">MigaPOS</div>
      <h1>{title}</h1>
    </div> : <>
      <div className="brand">
        <Img src={staticFile('logo.png')} alt="" />
        <b>MigaPOS</b><span>Datos de demostración</span>
      </div>
      <h1 className="title">{title}</h1>
      <Phone shot={shot} reveal={reveal} />
    </>}
    {caption && <div className="captions"><span>{caption}</span></div>}
  </AbsoluteFill>;
}

function Tour() {
  const frame = useCurrentFrame();
  return <>
    <Board index={frameToBoard[frame]} />
    <Html5Audio src={staticFile('narration.wav')} />
  </>;
}

function Boards() {
  return <Board index={useCurrentFrame()} />;
}

const format = {width: timeline.width, height: timeline.height, fps: timeline.fps};
registerRoot(() => <>
  <Composition id="MigaPOSV3" component={Tour} {...format} durationInFrames={timeline.duration} />
  <Composition id="MigaPOSV3Boards" component={Boards} {...format} durationInFrames={timeline.boards.length} />
</>);
