import React from 'react';
import {
  AbsoluteFill, Composition, Easing, Html5Audio, Img, OffthreadVideo, Sequence,
  interpolate, registerRoot, staticFile, useCurrentFrame,
} from 'remotion';
import {duration, fps, height, starts, viewport, width} from '../timeline.mjs';
import gestures from './gestures.generated.json';
import './style.css';

const ease = {easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const ramp = (value, a, b, from, to) => interpolate(value, [a, b], [from, to], ease);
const logo = 'logo.png';

function Touches({clip, offset}) {
  const frame = useCurrentFrame() + offset;
  const {taps, swipes} = gestures[clip];
  return [...taps, ...swipes.map(mark => ({...mark, swipe: true}))].map(mark => {
    const age = frame - mark.frame;
    if (age < 0 || age > 13) return null;
    const y = mark.y - (mark.swipe ? ramp(age, 0, 12, 0, 44) : 0);
    return <div key={mark.frame} className="touch" style={{
      left: `${100 * mark.x / viewport.width}%`, top: `${100 * y / viewport.height}%`,
      opacity: ramp(age, 1, 13, 1, 0), scale: ramp(age, 0, 13, 0.58, 1.45),
    }} />;
  });
}

function Capture({clip, offset = 0}) {
  return <>
    <OffthreadVideo src={staticFile(`recordings/${clip}.mp4`)} trimBefore={offset}
      muted className="footage" />
    <Touches clip={clip} offset={offset} />
  </>;
}

const camera = [
  {at: 0, x: 537, y: 925, zoom: 0.96, roll: -6, yaw: 10},
  {at: 68, x: 513, y: 953, zoom: 1.04, roll: -2, yaw: 4},
  {at: 128, x: 500, y: 928, zoom: 1.08, roll: 0, yaw: 0},
  {at: 231, x: 490, y: 934, zoom: 1.05, roll: 1.2, yaw: -3},
  {at: 306, x: 520, y: 938, zoom: 0.98, roll: 2.2, yaw: -7},
  {at: 390, x: 507, y: 942, zoom: 1.02, roll: -1.7, yaw: 6},
  {at: 472, x: 496, y: 925, zoom: 1.07, roll: 0, yaw: 0},
  {at: 548, x: 535, y: 957, zoom: 0.93, roll: -4, yaw: 6},
  {at: 586, x: 802, y: 1120, zoom: 0.68, roll: 13, yaw: -14},
];

function Phone() {
  const frame = useCurrentFrame();
  const times = camera.map(key => key.at);
  const get = property => interpolate(frame, times, camera.map(key => key[property]), ease);
  const wash = [starts.stock, starts.reports, starts.reprise]
    .reduce((value, cut) => Math.max(value, Math.max(0, 1 - Math.abs(frame - cut) / 7)), 0);
  return <div className="phone" style={{
    left: get('x'), top: get('y'), opacity: ramp(frame, starts.cta, starts.cta + 23, 1, 0),
    transform: `translate(-50%, -50%) perspective(2300px) rotateY(${get('yaw')}deg) rotateZ(${get('roll')}deg) scale(${get('zoom')})`,
  }}>
    <i className="button button-volume" /><i className="button button-power" />
    <div className="rim"><div className="screen">
      <Sequence from={starts.pos} durationInFrames={starts.stock}>
        <Capture clip="pos" />
      </Sequence>
      <Sequence from={starts.stock} durationInFrames={starts.reports - starts.stock}>
        <Capture clip="stock" />
      </Sequence>
      <Sequence from={starts.reports} durationInFrames={starts.reprise - starts.reports}>
        <Capture clip="reports" />
      </Sequence>
      <Sequence from={starts.reprise} durationInFrames={starts.cta + 23 - starts.reprise}>
        <Capture clip="pos" offset={134} />
      </Sequence>
      <div className="match" style={{opacity: wash * 0.24}} />
    </div></div>
  </div>;
}

function Galaxy() {
  const frame = useCurrentFrame();
  const t = frame / (duration - 1);
  return <AbsoluteFill className="world">
    <div className="light" style={{transform: `translate(${-50 + 112 * t}px, ${-25 + 48 * t}px)`}} />
    <svg className="orbit" viewBox="0 0 1080 1920" aria-hidden="true">
      <defs><linearGradient id="orbit" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#5e78ff" stopOpacity=".65" /><stop offset=".54" stopColor="#9d68e6" stopOpacity=".26" />
        <stop offset="1" stopColor="#9c60d8" stopOpacity="0" />
      </linearGradient></defs>
      <ellipse cx="500" cy="940" rx="624" ry="427" transform="rotate(-28 500 940)" />
      <ellipse cx="500" cy="940" rx="655" ry="451" transform="rotate(-28 500 940)" opacity=".42" />
      <g fill="#b7a9ef" opacity=".55">
        <circle cx="65" cy="608" r="3" /><circle cx="938" cy="488" r="3.5" />
        <circle cx="1023" cy="1188" r="2.5" /><circle cx="122" cy="1441" r="3.5" />
      </g>
    </svg>
  </AbsoluteFill>;
}

const titleBeats = [
  {from: 0, label: 'Punto de venta móvil', title: 'Tu tienda,\nen movimiento.'},
  {from: 77, label: '01 / Ticket', title: 'Prepara el ticket.'},
  {from: starts.stock, label: '02 / Inventario', title: 'Stock por sede.'},
  {from: starts.reports, label: '03 / Reportes', title: 'Ventas por período.'},
  {from: starts.reprise, label: 'Punto de venta móvil', title: 'Tu tienda, de un vistazo.'},
];

function Editorial() {
  const frame = useCurrentFrame();
  const beat = titleBeats.findLast(({from}) => from <= frame);
  const hide = ramp(frame, starts.cta - 4, starts.cta + 5, 1, 0);
  const enter = beat.from === 0 ? 1 : ramp(frame, beat.from, beat.from + 10, 0, 1);
  const hasTwo = frame >= gestures.pos.taps[2].frame + 3;
  const showTicketProof = hasTwo && frame < starts.stock || frame >= starts.reprise + 15 && frame < starts.cta - 4;
  const proof = frame >= starts.reports && frame < starts.reprise
    ? {label: 'Período del reporte', value: 'Hoy'}
    : frame >= starts.stock && frame < starts.reports ? {label: 'Inventario demo', value: '100 disp.'}
      : showTicketProof ? {label: '2 unidades · Total', value: 'S/ 10.00'} : null;
  return <AbsoluteFill style={{opacity: hide}}>
    <div className="identity"><Img src={staticFile(logo)} /><b>MigaPOS</b><span>Datos de demostración</span></div>
    <div className="headline" style={{translate: `0 ${16 * (1 - enter)}px`, opacity: 0.75 + enter * 0.25}}>
      <span>{beat.label}</span>
      <h1 className={beat.from === 0 ? 'hero-title' : ''}>{beat.title}</h1>
    </div>
    {proof && <div className="proof"><span>{proof.label}</span><b>{proof.value}</b></div>}
  </AbsoluteFill>;
}

function EndCard() {
  const frame = useCurrentFrame();
  const settle = ramp(frame, 0, 15, 0, 1);
  return <div className="outro" style={{opacity: ramp(frame, 0, 9, 0.82, 1), translate: `0 ${20 * (1 - settle)}px`}}>
    <Img className="mark" src={staticFile(logo)} />
    <strong>MigaPOS</strong>
    <div className="cta">Solicita una demo <span aria-hidden="true">↗</span></div>
  </div>;
}

function Brag() {
  return <AbsoluteFill className="ad">
    <Galaxy />
    <Html5Audio src={staticFile('score.wav')} />
    <Phone />
    <Editorial />
    <Sequence from={starts.cta} durationInFrames={duration - starts.cta}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="MigaPOSMobileV2" component={Brag} width={width} height={height}
  fps={fps} durationInFrames={duration} />);
