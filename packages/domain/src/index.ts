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
    audioRef?: { path: string; mimeType: string; sha256: string; size: number };
}
export type SleepChallenge = 'shifting' | 'falling_asleep' | 'split_sleep' | 'daytime_tired' | 'structure';
export type PersonalGoal = 'understand' | 'energy' | 'routine' | 'professional';
export interface UserProfile {
    version: 1;
    givenName: string;
    birthDate: string;
    challenges: SleepChallenge[];
    duration: 'recent' | 'months' | 'longer' | 'unspecified';
    context: string;
    goals: PersonalGoal[];
    completedAtUtc: string;
    onboardingStep?: number;
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
export interface GuidanceFeedback {
    id: string;
    atUtc: string;
    eventId: string;
    outcome: 'done' | 'hard' | 'skip';
    reason?: 'not_sleepy' | 'very_tired' | 'busy' | 'other';
}
export interface GuidancePreferences {
    windDownMinutes: number;
    checkinTime: string;
    commitments: { id: string; label: string; time: string }[];
    feedback: GuidanceFeedback[];
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
    guidance?: GuidancePreferences;
    profile?: UserProfile;
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
export { assertData } from './validation';
