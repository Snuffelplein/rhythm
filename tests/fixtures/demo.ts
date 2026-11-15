import { emptyData, type RhythmData, type SleepSession } from '../../packages/domain/src/index';
import { daysEnding, localToUtc } from '../../packages/rhythm-engine/src/index';
export function demoData(now = new Date().toISOString()): RhythmData {
    const data = emptyData('Europe/Amsterdam');
    const days = daysEnding(now, data.settings.timezone, 14);
    const sessions: SleepSession[] = [];
    for (const [i, date] of days.entries()) {
        if (i === 4 || i === 9)
            continue;
        const startHour = 1 + (i % 4), endHour = 5 + (i % 3);
        sessions.push({ id: `demo-${i}-a`, startUtc: localToUtc(`${date}T${String(startHour).padStart(2, '0')}:30`, data.settings.timezone), endUtc: localToUtc(`${date}T${String(endHour).padStart(2, '0')}:45`, data.settings.timezone), originalTimezone: data.settings.timezone, source: 'user_reported', reviewStatus: 'confirmed', kind: 'sleep', interruptions: [], estimatedAwakeMinutes: i % 3 === 0 ? 20 : 0, createdAtUtc: now, updatedAtUtc: now });
        if (i % 3 !== 1)
            sessions.push({ id: `demo-${i}-b`, startUtc: localToUtc(`${date}T12:00`, data.settings.timezone), endUtc: localToUtc(`${date}T14:30`, data.settings.timezone), originalTimezone: data.settings.timezone, source: 'user_reported', reviewStatus: 'confirmed', kind: 'nap', interruptions: [], estimatedAwakeMinutes: 0, createdAtUtc: now, updatedAtUtc: now });
        data.checkins.push({ id: `demo-check-${i}`, atUtc: localToUtc(`${date}T16:00`, data.settings.timezone), energy: (i % 3) + 2, sleepiness: (i % 3) + 2 });
    }
    data.sessions = sessions;
    data.settings.goalBed = '23:00';
    data.settings.goalWake = '07:30';
    data.journal = [{ id: 'demo-note', atUtc: now, text: 'Vandaag in twee blokken geslapen. Fijn om het hele etmaal terug te zien. Vanmiddag voelde ik me wat energieker.' }];
    return data;
}
