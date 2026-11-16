import {describe, expect, it} from 'vitest';
import {dayScene} from '../apps/prototype-web/src/day-scene';

describe('decorative local day scene', () => {
  it('shows night and a moon at local midnight, daylight and a sun at noon', () => {
    const night = dayScene('2026-11-15T23:00:00Z', 'Europe/Amsterdam');
    const noon = dayScene('2026-11-16T11:00:00Z', 'Europe/Amsterdam');
    expect(night.phase).toBe('night');
    expect(night.moon.opacity).toBe(1);
    expect(night.sun.opacity).toBe(0);
    expect(night.stars).toBeGreaterThan(.8);
    expect(noon.phase).toBe('day');
    expect(noon.sun.opacity).toBe(1);
    expect(noon.moon.opacity).toBe(0);
    expect(noon.stars).toBe(0);
    expect(noon.colors).not.toEqual(night.colors);
  });
  it('moves across the sky and rises then sets instead of looping every animation', () => {
    const scenes = [7, 12, 17].map(hour => dayScene(`2026-11-16T${String(hour).padStart(2, '0')}:00:00Z`, 'UTC'));
    expect(scenes[0]!.sun.progress).toBeLessThan(scenes[1]!.sun.progress);
    expect(scenes[1]!.sun.progress).toBeLessThan(scenes[2]!.sun.progress);
    expect(scenes[1]!.sun.elevation).toBeGreaterThan(scenes[0]!.sun.elevation);
    expect(scenes[1]!.sun.elevation).toBeGreaterThan(scenes[2]!.sun.elevation);
    expect(dayScene('2026-11-16T22:00:00Z', 'UTC').moon.progress).toBeLessThan(dayScene('2026-11-17T02:00:00Z', 'UTC').moon.progress);
  });
  it('uses the account timezone and its daylight saving offset', () => {
    expect(dayScene('2026-11-16T12:00:00Z', 'Europe/Amsterdam').hour).toBe(13);
    expect(dayScene('2026-07-16T12:00:00Z', 'Europe/Amsterdam').hour).toBe(14);
    expect(dayScene('2026-11-16T12:00:00Z', 'America/New_York').hour).toBe(7);
  });
  it('keeps colors and moon position continuous over midnight', () => {
    const before = dayScene('2026-11-16T23:59:00Z', 'UTC');
    const after = dayScene('2026-11-17T00:00:00Z', 'UTC');
    expect(before.colors).toEqual(after.colors);
    expect(Math.abs(before.moon.progress - after.moon.progress)).toBeLessThan(.002);
  });
  it('covers the full day with finite bounded orbit values and gradual palette changes', () => {
    let last = dayScene('2026-11-16T00:00:00Z', 'UTC');
    const phases = new Set([last.phase]);
    for (let minute = 1; minute < 1440; minute++) {
      const scene = dayScene(new Date(Date.parse('2026-11-16T00:00:00Z') + minute * 60000).toISOString(), 'UTC');
      phases.add(scene.phase);
      for (const body of [scene.sun, scene.moon]) for (const value of Object.values(body)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      const rgb = (colors: string[]) => colors.flatMap(color => color.match(/\d+/g)!.map(Number));
      expect(Math.max(...rgb(scene.colors).map((channel, i) => Math.abs(channel - rgb(last.colors)[i]!)))).toBeLessThanOrEqual(2);
      last = scene;
    }
    expect(phases.size).toBe(6);
  });
});
