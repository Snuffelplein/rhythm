import { Temporal } from '@js-temporal/polyfill';
import type { Interval, SleepSession } from '../../domain/src/index';
export const ENGINE_VERSION = '0.1.0';
export const ms = (value: string) => Temporal.Instant.from(value).epochMilliseconds;
export const minutes = (interval: Interval) => (ms(interval.endUtc) - ms(interval.startUtc)) / 60000;
export function localToUtc(local: string, timezone: string): string {
    try {
        return Temporal.PlainDateTime.from(local).toZonedDateTime(timezone, { disambiguation: 'reject' }).toInstant().toString();
    }
    catch {
        throw new Error('Dit tijdstip bestaat niet of komt twee keer voor bij een klokwissel. Kies een ondubbelzinnig tijdstip.');
    }
}
export function toLocal(utc: string, timezone: string): string {
    return Temporal.Instant.from(utc).toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}
export function dayKey(utc: string, timezone: string): string { return Temporal.Instant.from(utc).toZonedDateTimeISO(timezone).toPlainDate().toString(); }
export function dayRange(date: string, timezone: string): Interval {
    const start = Temporal.PlainDate.from(date).toZonedDateTime(timezone);
    return { startUtc: start.toInstant().toString(), endUtc: start.add({ days: 1 }).toInstant().toString() };
}
export function daysEnding(now: string, timezone: string, count: number): string[] {
    const end = Temporal.PlainDate.from(dayKey(now, timezone));
    return Array.from({ length: count }, (_, i) => end.subtract({ days: count - 1 - i }).toString());
}
export function overlap(a: Interval, b: Interval): boolean { return ms(a.startUtc) < ms(b.endUtc) && ms(b.startUtc) < ms(a.endUtc); }
export function mergeIntervals(intervals: Interval[]): Interval[] {
    const sorted = intervals.map(i => ({ startUtc: i.startUtc, endUtc: i.endUtc })).filter(i => ms(i.endUtc) > ms(i.startUtc)).sort((a, b) => ms(a.startUtc) - ms(b.startUtc));
    const result: Interval[] = [];
    for (const interval of sorted) {
        const previous = result.at(-1);
        if (previous && ms(interval.startUtc) <= ms(previous.endUtc))
            previous.endUtc = new Date(Math.max(ms(previous.endUtc), ms(interval.endUtc))).toISOString();
        else
            result.push({ ...interval });
    }
    return result;
}
export function sleepSegments(session: SleepSession): Interval[] {
    let segments: Interval[] = [{ startUtc: session.startUtc, endUtc: session.endUtc }];
    for (const awake of mergeIntervals(session.interruptions)) {
        segments = segments.flatMap(s => {
            if (!overlap(s, awake))
                return [s];
            const pieces: Interval[] = [];
            if (ms(awake.startUtc) > ms(s.startUtc))
                pieces.push({ startUtc: s.startUtc, endUtc: awake.startUtc });
            if (ms(awake.endUtc) < ms(s.endUtc))
                pieces.push({ startUtc: awake.endUtc, endUtc: s.endUtc });
            return pieces;
        });
    }
    return segments;
}
export function validateSession(session: SleepSession, existing: SleepSession[] = [], now?: string): void {
    if (minutes(session) <= 0)
        throw new Error('De eindtijd moet na de begintijd liggen. Controleer ook de datum.');
    if (session.inBedAtUtc && ms(session.inBedAtUtc) > ms(session.startUtc))
        throw new Error('Naar bed gaan moet vóór of op je geschatte slaapbegin liggen.');
    if (now && ms(session.endUtc) > ms(now))
        throw new Error('Een daadwerkelijke slaapregistratie kan niet in de toekomst eindigen.');
    if (!Number.isFinite(session.estimatedAwakeMinutes) || session.estimatedAwakeMinutes < 0)
        throw new Error('Vul een geldige wakkerduur in.');
    for (const i of session.interruptions)
        if (minutes(i) <= 0 || ms(i.startUtc) < ms(session.startUtc) || ms(i.endUtc) > ms(session.endUtc))
            throw new Error('Een wakkerperiode moet binnen het slaapblok vallen en een positieve duur hebben.');
    if (session.estimatedAwakeMinutes > sleepSegments(session).reduce((sum, s) => sum + minutes(s), 0))
        throw new Error('De geschatte wakkerduur is langer dan de resterende duur van het blok.');
    if (existing.some(s => s.id !== session.id && overlap(s, session)))
        throw new Error('Dit blok overlapt een bestaande registratie. Pas de tijden aan of bewerk het bestaande blok.');
}
export function totalSleep(sessions: SleepSession[], range: Interval): {
    minutes: number;
    estimated: boolean;
} {
    const clipped: Interval[] = [];
    let estimatedDeduction = 0;
    for (const s of new Map(sessions.map(s => [s.id, s])).values()) {
        const pieces = sleepSegments(s);
        const all = pieces.reduce((sum, p) => sum + minutes(p), 0);
        let inside = 0;
        for (const p of pieces) {
            const start = Math.max(ms(p.startUtc), ms(range.startUtc)), end = Math.min(ms(p.endUtc), ms(range.endUtc));
            if (end > start) {
                const part = { startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() };
                clipped.push(part);
                inside += minutes(part);
            }
        }
        // Unknown timing: distribute the estimated awake duration proportionally across the actual sleep segments.
        if (all > 0)
            estimatedDeduction += s.estimatedAwakeMinutes * inside / all;
    }
    return { minutes: Math.max(0, mergeIntervals(clipped).reduce((sum, i) => sum + minutes(i), 0) - estimatedDeduction), estimated: estimatedDeduction > 0 };
}
export function sessionMinutes(session: SleepSession): number { return totalSleep([session], session).minutes; }
export function durationLabel(value: number): string {
    const rounded = Math.max(0, Math.round(value));
    return `${Math.floor(rounded / 60)}u ${String(rounded % 60).padStart(2, '0')}m`;
}
export function plotPieces(session: SleepSession, date: string, timezone: string): {
    left: number;
    width: number;
}[] {
    const range = dayRange(date, timezone);
    return sleepSegments(session).filter(s => overlap(s, range)).map(s => {
        const start = Math.max(ms(s.startUtc), ms(range.startUtc)), end = Math.min(ms(s.endUtc), ms(range.endUtc));
        const a = Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(timezone);
        const b = Temporal.Instant.fromEpochMilliseconds(end).toZonedDateTimeISO(timezone);
        const left = (a.hour * 60 + a.minute) / 1440 * 100;
        const endMinute = end === ms(range.endUtc) ? 1440 : b.hour * 60 + b.minute;
        return { left, width: Math.max(0.2, endMinute / 1440 * 100 - left) };
    });
}
