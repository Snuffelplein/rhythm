import type { RhythmData } from '../../domain/src/index';
import { ENGINE_VERSION, sessionMinutes } from '../../rhythm-engine/src/index';
export function exportJson(data: RhythmData, includeJournal = false): string {
    return JSON.stringify({ ...data, coaching:includeJournal?data.coaching:undefined, profile: includeJournal ? data.profile : undefined, guidance: includeJournal ? data.guidance : undefined, engineVersion: ENGINE_VERSION, generatedAtUtc: new Date().toISOString(), privacy: { journalIncluded: includeJournal }, journal: includeJournal ? data.journal : [] }, null, 2);
}
export function csvCell(value: string | number): string {
    const text = String(value), safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(data: RhythmData, type: 'sessions' | 'checkins'): string {
    const rows: (string | number)[][] = type === 'sessions'
        ? [['id', 'start_utc', 'end_utc', 'in_bed_at_utc', 'original_timezone', 'source', 'review_status', 'kind', 'sleep_minutes', 'estimated_awake_minutes', 'awake_intervals_json'], ...data.sessions.map(s => [s.id, s.startUtc, s.endUtc, s.inBedAtUtc ?? '', s.originalTimezone, s.source, s.reviewStatus, s.kind, Math.round(sessionMinutes(s)), s.estimatedAwakeMinutes, JSON.stringify(s.interruptions)])]
        : [['id', 'at_utc', 'energy_1_to_5', 'sleepiness_1_to_5', 'sleep_session_id'], ...data.checkins.map(c => [c.id, c.atUtc, c.energy, c.sleepiness, c.sleepSessionId ?? ''])];
    return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
