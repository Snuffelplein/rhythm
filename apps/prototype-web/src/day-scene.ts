export type DayPhase = 'night' | 'dawn' | 'morning' | 'day' | 'dusk' | 'evening';

// Decorative clock-based light, not an astronomical sunrise or moon-phase model.
const palettes = {
  night: ['#080e23', '#18213e', '#34365c', '#343653', '#242d48', '#101d32'],
  dawn: ['#242b50', '#80617f', '#e7a49b', '#776985', '#414865', '#1c2d46'],
  morning: ['#284668', '#66869c', '#b7c5bd', '#718c9b', '#405e76', '#1b354c'],
  day: ['#29496f', '#628baa', '#a4bebd', '#6b899c', '#3e5e79', '#1b354e'],
  dusk: ['#2e2b52', '#986a86', '#eeac8d', '#796381', '#45445f', '#222d47'],
  evening: ['#171c38', '#493e69', '#9a718c', '#514565', '#303653', '#17253e'],
} satisfies Record<DayPhase, string[]>;
const frames: {hour: number; phase: DayPhase; stars: number}[] = [
  {hour: 0, phase: 'night', stars: .9}, {hour: 5, phase: 'night', stars: .9},
  {hour: 6.5, phase: 'dawn', stars: .15}, {hour: 9, phase: 'morning', stars: 0},
  {hour: 13, phase: 'day', stars: 0}, {hour: 17.5, phase: 'dusk', stars: .1},
  {hour: 20, phase: 'evening', stars: .65}, {hour: 22, phase: 'night', stars: .9},
  {hour: 24, phase: 'night', stars: .9},
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function mix(a: string, b: string, amount: number) {
  const channels = [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount));
  return `rgb(${channels.join(', ')})`;
}
function body(progress: number, visible: boolean) {
  return {progress: clamp(progress), elevation: Math.sin(Math.PI * clamp(progress)), opacity: visible ? clamp(Math.min(progress, 1 - progress) * 20) : 0};
}

export function dayScene(utc: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(utc));
  const hour = Number(parts.find(p => p.type === 'hour')!.value) + Number(parts.find(p => p.type === 'minute')!.value) / 60;
  const upper = frames.findIndex(frame => frame.hour > hour);
  const a = frames[upper - 1]!, b = frames[upper]!;
  const amount = (hour - a.hour) / (b.hour - a.hour);
  const colors = palettes[a.phase].map((color, i) => mix(color, palettes[b.phase][i]!, amount));
  const phase: DayPhase = hour < 5 || hour >= 22 ? 'night' : hour < 8 ? 'dawn' : hour < 11 ? 'morning' : hour < 16 ? 'day' : hour < 19 ? 'dusk' : 'evening';
  const moonHour = hour < 6 ? hour + 24 : hour;
  return {
    phase, hour, colors, stars: a.stars + (b.stars - a.stars) * amount,
    sun: body((hour - 6) / 12, hour >= 6 && hour < 18),
    moon: body((moonHour - 18) / 12, hour >= 18 || hour < 6),
  };
}
export type DayScene = ReturnType<typeof dayScene>;
