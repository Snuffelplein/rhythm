export type Source = 'user_reported' | 'healthkit';
export interface Interval {
    startUtc: string;
    endUtc: string;
}
export interface SleepSession extends Interval {
    id: string;
    originalTimezone: string;
    source: Source;
    kind: 'sleep' | 'nap';
    inBedAtUtc?: string;
    reviewStatus: 'unreviewed' | 'confirmed' | 'corrected';
    interruptions: Interval[];
    estimatedAwakeMinutes: number;
    createdAtUtc: string;
    updatedAtUtc: string;
}
export interface SleepIntent {
    id: string;
    startedAtUtc: string;
    originalTimezone: string;
}
export interface WakeMarker {
    id: string;
    atUtc: string;
    intentId?: string;
}
export interface CheckIn {
    id: string;
    atUtc: string;
    energy: number;
    sleepiness: number;
    sleepSessionId?: string;
}
export interface JournalEntry {
    id: string;
    atUtc: string;
    text: string;
    sleepSessionId?: string;
    audio?: { dataUrl: string; mimeType: string };
}
export interface AuditEvent {
    id: string;
    atUtc: string;
    type: string;
    objectIds: string[];
}
export interface Settings {
    timezone: string;
    goalBed: string;
    goalWake: string;
    theme: 'dark' | 'light';
}
export interface RhythmData {
    schemaVersion: 1;
    sessions: SleepSession[];
    intent: SleepIntent | null;
    wakeMarkers: WakeMarker[];
    checkins: CheckIn[];
    journal: JournalEntry[];
    audit: AuditEvent[];
    settings: Settings;
}
export interface Clock {
    now(): string;
}
export interface SleepRepository {
    load(): Promise<RhythmData | null>;
    save(data: RhythmData): Promise<void>;
    clear(): Promise<void>;
}
export interface AlarmScheduler {
    capability: 'native' | 'unavailable';
    schedule(localTime: string): Promise<{
        status: 'scheduled' | 'unavailable';
        platformId?: string;
    }>;
}
export interface HealthDataProvider {
    available: boolean;
    import(): Promise<SleepSession[]>;
}
export interface SpeechTranscriber {
    available: boolean;
    transcribe(audio: Blob): Promise<string>;
}
export interface JournalStructurer {
    suggest(text: string): Promise<{
        status: 'draft';
        fields: Partial<SleepSession>;
    }[]>;
}
export interface ReportExporter {
    export(data: RhythmData, includeJournal: boolean): string;
}
export const systemClock: Clock = { now: () => new Date().toISOString() };
export function emptyData(timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): RhythmData {
    return { schemaVersion: 1, sessions: [], intent: null, wakeMarkers: [], checkins: [], journal: [], audit: [], settings: { timezone, goalBed: '', goalWake: '', theme: 'dark' } };
}
export function assertData(value: unknown): asserts value is RhythmData {
    if (!value || typeof value !== 'object')
        throw new Error('Ongeldig lokaal gegevensbestand.');
    const data = value as Partial<RhythmData>;
    if (data.schemaVersion !== 1 || !Array.isArray(data.sessions) || !Array.isArray(data.checkins) || !Array.isArray(data.journal) || !Array.isArray(data.audit) || !Array.isArray(data.wakeMarkers) || !data.settings || !('intent' in data))
        throw new Error('Deze gegevensversie wordt niet ondersteund. De opslag is niet gewijzigd.');
}
