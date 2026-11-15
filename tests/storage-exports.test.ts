import { describe, it, expect } from 'vitest';
import { emptyData } from '../packages/domain/src/index';
import { BrowserVault, VAULT_KEY, mergeSessions, splitSession, upsertSession } from '../packages/storage/src/index';
import { exportCsv, exportJson, csvCell } from '../packages/exports/src/index';
import { sessionMinutes } from '../packages/rhythm-engine/src/index';
import { demoData } from './fixtures/demo';
class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    key(i: number) { return [...this.values.keys()][i] ?? null; }
    getItem(k: string) { return this.values.get(k) ?? null; }
    setItem(k: string, v: string) { this.values.set(k, v); }
    removeItem(k: string) { this.values.delete(k); }
}
describe('encrypted local storage', () => {
    it('round-trips sessions, journal and active intent without plaintext', async () => {
        const storage = new MemoryStorage(), vault = new BrowserVault(storage), data = emptyData();
        data.journal.push({ id: 'private', atUtc: '2026-11-15T12:00Z', text: 'SECRET-JOURNAL-TEXT' });
        data.intent = { id: 'active', startedAtUtc: '2026-11-15T12:00Z', originalTimezone: 'Europe/Amsterdam' };
        await vault.unlock('test-password');
        await vault.save(data);
        vault.lock();
        expect(storage.getItem(VAULT_KEY)).not.toContain('SECRET');
        expect(await new BrowserVault(storage).unlock('test-password')).toEqual(data);
    });
    it('a wrong password does not alter saved data', async () => {
        const storage = new MemoryStorage(), vault = new BrowserVault(storage);
        await vault.unlock('test-password');
        await vault.save(emptyData());
        const before = storage.getItem(VAULT_KEY);
        await expect(new BrowserVault(storage).unlock('wrong')).rejects.toThrow();
        expect(storage.getItem(VAULT_KEY)).toBe(before);
    });
    it('surfaces write failure instead of pretending persistence succeeded', async () => {
        const storage = new MemoryStorage(), vault = new BrowserVault(storage);
        await vault.unlock('test-password');
        storage.setItem = () => { throw new Error('quota'); };
        await expect(vault.save(emptyData())).rejects.toThrow('Opslaan');
    });
});
describe('editing and professional export', () => {
    it('splitting and merging preserve total sleep and awake gaps', () => {
        let data = demoData('2026-11-15T17:00Z');
        const original = data.sessions.find(s => s.estimatedAwakeMinutes === 0)!;
        const midpoint = new Date((Date.parse(original.startUtc) + Date.parse(original.endUtc)) / 2).toISOString();
        data = splitSession(data, original.id, midpoint, '2026-11-15T18:00Z');
        const children = data.sessions.filter(s => s.startUtc === original.startUtc || s.endUtc === original.endUtc);
        expect(children.reduce((n, s) => n + sessionMinutes(s), 0)).toBe(sessionMinutes(original));
        data = mergeSessions(data, children.map(s => s.id), '2026-11-15T18:01Z');
        expect(data.sessions.some(s => s.startUtc === original.startUtc && s.endUtc === original.endUtc)).toBe(true);
        expect(data.audit.map(a => a.type)).toEqual(['session_split', 'sessions_merged']);
    });
    it('merging two distant episodes does not turn their awake gap into sleep', () => {
        const data = demoData('2026-11-15T17:00Z'), a = data.sessions[0]!, b = data.sessions[1]!;
        const merged = mergeSessions({ ...data, sessions: [a, b] }, [a.id, b.id], '2026-11-15T18:00Z');
        expect(sessionMinutes(merged.sessions[0]!)).toBe(sessionMinutes(a) + sessionMinutes(b));
    });
    it('correction is audited and duplicate IDs are upserted', () => {
        const data = demoData('2026-11-15T17:00Z'), original = data.sessions[0]!;
        const result = upsertSession(data, { ...original, estimatedAwakeMinutes: 5 }, '2026-11-15T18:00Z');
        expect(result.sessions).toHaveLength(data.sessions.length);
        expect(result.audit.at(-1)?.type).toBe('session_corrected');
    });
    it('all default exports exclude private journal content', () => {
        const data = demoData('2026-11-15T17:00Z');
        data.journal[0]!.text = 'SECRET-JOURNAL-TEXT';
        expect(exportJson(data)).not.toContain('SECRET');
        expect(exportCsv(data, 'sessions')).not.toContain('SECRET');
        expect(exportCsv(data, 'checkins')).not.toContain('SECRET');
        expect(exportJson(data, true)).toContain('SECRET');
        expect(JSON.parse(exportJson(data)).engineVersion).toBe('0.1.0');
    });
    it('escapes CSV quotes and spreadsheet formulas', () => { expect(csvCell('a"b')).toBe('"a""b"'); expect(csvCell('=HYPERLINK("x")')).toMatch(/^"'/); });
});
