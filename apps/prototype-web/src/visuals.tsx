import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Moon, Sun, Sunrise } from 'lucide-react';
import type { DayScene } from './day-scene';

function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, visible] as const;
}

export function Landscape({ tone = 'dawn', scene }: { tone?: 'dawn' | 'night'; scene?: DayScene }) {
  const id = useId().replaceAll(':', '');
  const [ref, visible] = useVisible<SVGSVGElement>();
  const orbitStyle = (body: DayScene['sun']) => ({'--orbit-progress': body.progress, '--orbit-rise': body.elevation, opacity: body.opacity}) as CSSProperties;
  return <svg ref={ref} className={`landscape visual-landscape ${visible ? 'is-visible' : ''} ${scene ? 'scene-live' : `scene-${tone}`}`} data-phase={scene?.phase} viewBox="0 0 920 430" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={scene?.colors[0] ?? '#11152b'} stopOpacity={scene ? 1 : 0} /><stop offset=".48" stopColor={scene?.colors[1] ?? (tone === 'night' ? '#383667' : '#655086')} stopOpacity={scene ? 1 : .55} /><stop offset=".83" stopColor={scene?.colors[2] ?? (tone === 'night' ? '#71618b' : '#e995a0')} stopOpacity={scene ? 1 : .7} /><stop offset="1" stopColor={scene?.colors[2] ?? '#8b739e'} stopOpacity={scene ? 1 : .3} /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#ffd6a4" stopOpacity=".65" /><stop offset=".5" stopColor="#e896ad" stopOpacity=".2" /><stop offset="1" stopColor="#db86c8" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff0b9" /><stop offset="1" stopColor="#f0a6ac" /></linearGradient>
      <radialGradient id={`${id}-moon-glow`}><stop stopColor="#c5d5ff" stopOpacity=".25"/><stop offset="1" stopColor="#b7caff" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={scene?.colors[3] ?? '#655379'} /><stop offset="1" stopColor={scene?.colors[4] ?? '#302d50'} /></linearGradient>
      <linearGradient id={`${id}-middle`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={scene?.colors[4] ?? '#373451'} /><stop offset="1" stopColor={scene?.colors[5] ?? '#1e2540'} /></linearGradient>
      <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={scene?.colors[5] ?? '#1b2b43'} /><stop offset="1" stopColor="#0e182a" /></linearGradient>
      <linearGradient id={`${id}-tide`}><stop stopColor="#04cbb6" stopOpacity="0" /><stop offset=".23" stopColor="#05d5c2" stopOpacity=".8" /><stop offset=".52" stopColor="#8b75f0" stopOpacity=".45" /><stop offset="1" stopColor="#a684ff" stopOpacity="0" /></linearGradient>
    </defs>
    <path fill={`url(#${id}-sky)`} d="M0 0H920V430H0Z" />
    <g className="scene-stars ambient-motion" style={scene ? {opacity: scene.stars} : undefined}>{[[110,88],[211,40],[327,100],[713,56],[827,115],[623,24],[74,157],[390,30],[510,79],[560,141]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={i % 2 ? 1 : 1.5} fill="#e8dcff" opacity={.25 + (i % 3) * .1} />)}</g>
    {scene ? <>
      <g className="scene-celestial scene-live-sun" style={orbitStyle(scene.sun)}><ellipse rx="170" ry="130" fill={`url(#${id}-glow)`}/><circle r="32" fill={`url(#${id}-sun)`}/></g>
      <g className="scene-celestial scene-live-moon" style={orbitStyle(scene.moon)}><circle r="95" fill={`url(#${id}-moon-glow)`}/><path d="M8-29A31 31 0 1 0 8 29A25 25 0 0 1 8-29Z" fill="#e0e8ff"/></g>
    </> : <g className="scene-sun ambient-motion"><ellipse cx="460" cy="240" rx="230" ry="170" fill={`url(#${id}-glow)`} /><circle cx="460" cy="240" r="43" fill={`url(#${id}-sun)`} /></g>}
    <path className="scene-ridge-far ambient-motion" d="M-100 312Q-40 267 33 284L102 247 161 271 222 227 281 251 346 205 411 243 466 225 529 264 586 242 643 263 701 222 752 245 812 203 867 243 941 216 1020 254V470H-100Z" fill={`url(#${id}-far)`} />
    <path className="scene-ridge-middle ambient-motion" d="M-110 341Q-25 294 57 327T190 304L268 326 346 277 427 311 493 283 571 324 636 298 711 324 779 283 840 306 916 269 1030 314V470H-110Z" fill={`url(#${id}-middle)`} />
    <path className="scene-ridge-near ambient-motion" d="M-100 378Q20 326 131 356T329 347Q416 328 506 365T703 351Q832 317 1020 355V470H-100Z" fill={`url(#${id}-front)`} />
    <path className="scene-tide-glow ambient-motion" d="M-140 370Q-22 313 98 355T340 361Q455 339 560 376T828 366Q955 344 1090 367" fill="none" stroke={`url(#${id}-tide)`} strokeWidth="22" opacity=".1" />
    <path className="scene-tide ambient-motion" d="M-140 370Q-22 313 98 355T340 361Q455 339 560 376T828 366Q955 344 1090 367" fill="none" stroke={`url(#${id}-tide)`} strokeWidth="2" opacity=".7" />
  </svg>;
}

function arc(index: number, count: number): string {
  const point = (angle: number) => [160 + 132 * Math.cos(angle * Math.PI / 180), 160 + 132 * Math.sin(angle * Math.PI / 180)];
  const start = point(-90 + index * 360 / count + 1.8);
  const end = point(-90 + (index + 1) * 360 / count - 1.8);
  return `M ${start[0]} ${start[1]} A 132 132 0 0 1 ${end[0]} ${end[1]}`;
}

export function RhythmRing({ value, label, dayFlags, active, night = false, onOpen }: {
  value: string; label: string; dayFlags: boolean[]; active: boolean; night?: boolean; onOpen: () => void;
}) {
  const id = useId().replaceAll(':', '');
  const [ref, visible] = useVisible<HTMLDivElement>();
  const count = dayFlags.filter(Boolean).length;
  return <div ref={ref} className={`rhythm-ring ${active ? 'is-tracking' : ''} ${night ? 'is-night' : ''} ${visible ? 'is-visible' : ''}`}>
    <div className="ring-halo ambient-motion" aria-hidden="true" />
    <button className="rhythm-ring-face" onClick={onOpen} aria-label={`Bekijk jouw slaapritme: ${label}, ${value}. ${count} van ${dayFlags.length} dagen met een slaapblok.`}>
      <svg className="ring-art" viewBox="0 0 320 320" aria-hidden="true"><defs><linearGradient id={`${id}-ring`} x1="0" y1="0" x2="320" y2="290" gradientUnits="userSpaceOnUse"><stop stopColor="#11d8bd" /><stop offset=".48" stopColor="#8b74ff" /><stop offset="1" stopColor="#bc8bfd" /></linearGradient><radialGradient id={`${id}-core`}><stop stopColor="#34325b" stopOpacity=".8" /><stop offset="1" stopColor="#151d36" stopOpacity=".6" /></radialGradient></defs>
        <circle cx="160" cy="160" r="146" fill="none" stroke="#ad91ed" strokeOpacity=".12" />
        <circle cx="160" cy="160" r="124" fill={`url(#${id}-core)`} stroke="#c2a7ff" strokeOpacity=".17" />
        <circle cx="160" cy="160" r="132" fill="none" stroke="#9580d3" strokeOpacity=".18" strokeWidth="8" />
        {dayFlags.map((recorded, index) => <path key={index} d={arc(index, dayFlags.length)} pathLength="1" className={`ring-segment ${recorded ? 'recorded' : 'missing'}`} data-recorded={recorded} fill="none" stroke={recorded ? `url(#${id}-ring)` : '#43506b'} strokeWidth={recorded ? 8 : 5} strokeLinecap="round" style={{ animationDelay: `${index * 30}ms` }} />)}
        <circle className="ring-orbit ambient-motion" cx="160" cy="160" r="145" fill="none" stroke="#d8c6ff" strokeWidth="2" strokeDasharray="5 906" strokeLinecap="round" />
      </svg>
      <span className="ring-center" aria-hidden="true"><span className="ring-symbol ambient-motion">{active || night ? <Moon size={29} /> : <Sun size={29} />}</span><span className="ring-label">{label}</span><strong key={value} className="ring-value">{value}</strong><span className="ring-center-note">{active ? 'Rustmoment · nog geen slaapmeting' : 'Zelf gerapporteerd'}</span></span>
    </button>
    <p className="ring-caption"><span />{count} van {dayFlags.length} dagen met een slaapblok</p>
  </div>;
}

export function AnchorClock({ time, onEdit }: { time: string; onEdit: () => void }) {
  const [ref, visible] = useVisible<HTMLButtonElement>();
  return <div className="anchor-clock-scene"><button ref={ref} type="button" className={`anchor-clock ${visible ? 'is-visible' : ''}`} onClick={onEdit} aria-label={time ? `Dagstart aanpassen: ${time}` : 'Kies je gewenste dagstart'}>
    <span className="clock-landscape"><Landscape /></span>
    <span className="clock-content"><Sunrise size={25} /><span>Mijn dagstart</span><strong>{time || '—:—'}</strong><small>{time ? 'Jouw gekozen streeftijd' : 'Kies een tijd die bij je past'}</small></span>
    <span className="clock-rim ambient-motion" aria-hidden="true" />
  </button><p className="clock-caption">Daganker · tik om aan te passen</p></div>;
}

export function MetricValue({ value }: { value: string | number }) {
  return <span className="metric-value" key={value}>{value}</span>;
}
