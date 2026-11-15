import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SleepSession } from '../packages/domain/src/index';
import { dayRange, durationLabel, localToUtc, mergeIntervals, minutes, plotPieces, sessionMinutes, totalSleep, validateSession } from '../packages/rhythm-engine/src/index';
const session = (startUtc: string, endUtc: string, extra: Partial<SleepSession> = {}): SleepSession => ({ id: 'test', startUtc, endUtc, source: 'user_reported', reviewStatus: 'confirmed', kind: 'sleep', originalTimezone: 'Europe/Amsterdam', interruptions: [], estimatedAwakeMinutes: 0, createdAtUtc: startUtc, updatedAtUtc: endUtc, ...extra });
describe('absolute time and sleep intervals', () => {
    it('counts a session across midnight as one three-hour block', () => {
        const s = session(localToUtc('2026-11-14T23:30', 'Europe/Amsterdam'), localToUtc('2026-11-15T02:30', 'Europe/Amsterdam'));
        expect(sessionMinutes(s)).toBe(180);
        expect(plotPieces(s, '2026-11-14', 'Europe/Amsterdam')[0]?.width).toBeCloseTo(30 / 1440 * 100);
        expect(plotPieces(s, '2026-11-15', 'Europe/Amsterdam')[0]?.width).toBeCloseTo(150 / 1440 * 100);
    });
    it('counts split sleep as 8h30, excluding the gap', () => {
        const a = session('2026-11-15T01:30Z', '2026-11-15T04:00Z');
        const b = session('2026-11-15T10:00Z', '2026-11-15T16:00Z', { id: 'two' });
        expect(totalSleep([a, b], dayRange('2026-11-15', 'Europe/Amsterdam')).minutes).toBe(510);
    });
    it('uses actual elapsed time over DST, not wall-clock subtraction', () => {
        expect(minutes({ startUtc: localToUtc('2026-03-29T01:30', 'Europe/Amsterdam'), endUtc: localToUtc('2026-03-29T04:30', 'Europe/Amsterdam') })).toBe(120);
        expect(minutes(dayRange('2026-03-29', 'Europe/Amsterdam'))).toBe(1380);
        expect(minutes(dayRange('2026-10-25', 'Europe/Amsterdam'))).toBe(1500);
    });
    it('rejects nonexistent and ambiguous local timestamps', () => {
        expect(() => localToUtc('2026-03-29T02:30', 'Europe/Amsterdam')).toThrow();
        expect(() => localToUtc('2026-10-25T02:30', 'Europe/Amsterdam')).toThrow();
    });
    it('subtracts overlapping interruptions once', () => {
        const s = session('2026-11-15T00:00Z', '2026-11-15T04:00Z', { interruptions: [{ startUtc: '2026-11-15T01:00Z', endUtc: '2026-11-15T02:00Z' }, { startUtc: '2026-11-15T01:30Z', endUtc: '2026-11-15T02:30Z' }] });
        expect(sessionMinutes(s)).toBe(150);
    });
    it('supports unknown timing of awake duration without inventing intervals', () => {
        const s = session('2026-11-15T00:00Z', '2026-11-15T04:00Z', { estimatedAwakeMinutes: 45 });
        expect(sessionMinutes(s)).toBe(195);
        expect(s.interruptions).toEqual([]);
        expect(totalSleep([s], { startUtc: '2026-11-15T00:00Z', endUtc: '2026-11-15T02:00Z' })).toEqual({ minutes: 97.5, estimated: true });
    });
    it('unions overlapping sensor intervals instead of counting twice', () => {
        const a = session('2026-11-15T00:00Z', '2026-11-15T04:00Z');
        const b = session('2026-11-15T01:00Z', '2026-11-15T03:00Z', { id: 'b' });
        expect(totalSleep([a, b], dayRange('2026-11-15', 'UTC')).minutes).toBe(240);
    });
    it('rejects invalid, overlapping and impossible durations', () => {
        const s = session('2026-11-15T00:00Z', '2026-11-15T04:00Z');
        expect(() => validateSession({ ...s, endUtc: s.startUtc })).toThrow();
        expect(() => validateSession({ ...s, id: 'new' }, [s])).toThrow('overlapt');
        expect(() => validateSession({ ...s, estimatedAwakeMinutes: 241 })).toThrow();
    });
    it('formats rounded duration without a 60-minute remainder', () => expect(durationLabel(59.8)).toBe('1u 00m'));
    it('preserves time awake before sleep separately from sleep duration', () => {
        const s = session('2026-11-15T01:00Z', '2026-11-15T04:00Z', { inBedAtUtc: '2026-11-15T00:00Z' });
        validateSession(s);
        expect(sessionMinutes(s)).toBe(180);
        expect(() => validateSession({ ...s, inBedAtUtc: '2026-11-15T02:00Z' })).toThrow();
    });
    it('rejects future sleep records when a clock is provided', () => {
        const s = session('2026-11-15T01:00Z', '2026-11-15T04:00Z');
        expect(() => validateSession(s, [], '2026-11-15T03:00Z')).toThrow('toekomst');
    });
    it('does not subtract estimated awake duration twice for duplicate source IDs', () => {
        const s = session('2026-11-15T00:00Z', '2026-11-15T04:00Z', { estimatedAwakeMinutes: 30 });
        expect(totalSleep([s, s], dayRange('2026-11-15', 'UTC')).minutes).toBe(210);
    });
    it('normalization is idempotent and union duration never exceeds raw duration', () => {
        fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 1, max: 1000 }))), values => {
            const input = values.map(([start, length]) => ({ startUtc: new Date(start * 60000).toISOString(), endUtc: new Date((start + length) * 60000).toISOString() }));
            const merged = mergeIntervals(input);
            expect(mergeIntervals(merged)).toEqual(merged);
            expect(merged.reduce((n, i) => n + minutes(i), 0)).toBeLessThanOrEqual(input.reduce((n, i) => n + minutes(i), 0));
        }), { numRuns: 200 });
    });
});
