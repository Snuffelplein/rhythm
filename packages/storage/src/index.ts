import { assertData, type RhythmData, type SleepRepository, type SleepSession } from '../../domain/src/index';
import { ms, validateSession } from '../../rhythm-engine/src/index';
export const VAULT_KEY = 'rhythm.vault.v1';
export interface Envelope {
    version: 1 | 2;
    salt: string;
    iv: string;
    ciphertext: string;
}
export function assertEnvelope(value: unknown): asserts value is Envelope {
    if (!value || typeof value !== 'object') throw new Error('Ongeldige versleutelde kluis.');
    const e = value as Partial<Envelope>;
    if ((e.version !== 1 && e.version !== 2) || Object.keys(e).sort().join(',') !== 'ciphertext,iv,salt,version' || typeof e.salt !== 'string' || e.salt.length !== 24 || typeof e.iv !== 'string' || e.iv.length !== 16 || typeof e.ciphertext !== 'string' || e.ciphertext.length > 8000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(e.salt) || !/^[A-Za-z0-9+/]+={0,2}$/.test(e.iv) || !/^[A-Za-z0-9+/]+={0,2}$/.test(e.ciphertext)) throw new Error('Ongeldige versleutelde kluis.');
    if (atob(e.salt).length !== 16 || atob(e.iv).length !== 12 || atob(e.ciphertext).length < 16) throw new Error('Ongeldige versleutelde kluis.');
}
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, version: 1 | 2 = 2): Promise<CryptoKey> {
    if (password.length > 1024) throw new Error('Het kluiswachtwoord is te lang.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: version === 1 ? 310000 : 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const algorithm = (iv: Uint8Array<ArrayBuffer>, version: 1 | 2 = 2): AesGcmParams => ({ name: 'AES-GCM', iv, ...(version === 2 ? { additionalData: new TextEncoder().encode('rhythm.vault.v2') } : {}) });
async function seal(data: RhythmData, key: CryptoKey, salt: Uint8Array<ArrayBuffer>): Promise<Envelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(algorithm(iv), key, new TextEncoder().encode(JSON.stringify(data)));
    return { version: 2, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
export class BrowserVault implements SleepRepository {
    private key: CryptoKey | null = null;
    private salt: Uint8Array<ArrayBuffer> | null = null;
    private current: RhythmData | null = null;
    private currentRaw: string | null = null;
    constructor(private storage: Storage) { }
    exists(): boolean { return this.storage.getItem(VAULT_KEY) !== null; }
    lock(): void { this.key = null; this.salt = null; this.current = null; this.currentRaw = null; }
    async unlock(password: string): Promise<RhythmData | null> {
        const raw = this.storage.getItem(VAULT_KEY);
        if (!raw) {
            if (password.length < 12)
                throw new Error('Kies een kluiswachtwoord met minstens 12 tekens.');
            this.salt = crypto.getRandomValues(new Uint8Array(16));
            this.key = await derive(password, this.salt);
            return null;
        }
        try {
            const envelope: unknown = JSON.parse(raw);
            assertEnvelope(envelope);
            let salt = decode(envelope.salt), key = await derive(password, salt, envelope.version);
            const decrypted = await crypto.subtle.decrypt(algorithm(decode(envelope.iv), envelope.version), key, decode(envelope.ciphertext));
            const value: unknown = JSON.parse(new TextDecoder().decode(decrypted));
            assertData(value);
            let currentRaw = raw;
            if (envelope.version === 1) {
                salt = crypto.getRandomValues(new Uint8Array(16)); key = await derive(password, salt);
                currentRaw = JSON.stringify(await seal(value, key, salt));
                if (this.storage.getItem(VAULT_KEY) !== raw) throw new Error('changed');
                this.storage.setItem(VAULT_KEY, currentRaw);
            }
            this.key = key;
            this.salt = salt;
            this.current = structuredClone(value);
            this.currentRaw = currentRaw;
            return structuredClone(value);
        }
        catch {
            this.lock();
            throw new Error('Ontgrendelen is niet gelukt. Controleer je wachtwoord. Je opgeslagen gegevens zijn niet gewijzigd.');
        }
    }
    async load(): Promise<RhythmData | null> { if (!this.key)
        throw new Error('Ontgrendel je lokale kluis om gegevens te laden.'); return this.current ? structuredClone(this.current) : null; }
    async save(data: RhythmData): Promise<void> {
        if (!this.key || !this.salt)
            throw new Error('Je kluis is vergrendeld.');
        const expected = this.currentRaw, key = this.key;
        const snapshot = structuredClone(data); assertData(snapshot);
        if (this.storage.getItem(VAULT_KEY) !== expected) throw new Error('Je dagboek is in een ander venster gewijzigd. Vergrendel en open het opnieuw vóór opslaan.');
        const envelope = await seal(snapshot, key, this.salt);
        try {
            if (this.storage.getItem(VAULT_KEY) !== expected) throw new Error('Je dagboek is in een ander venster gewijzigd.');
            const raw = JSON.stringify(envelope);
            this.storage.setItem(VAULT_KEY, raw);
            if (this.key === key) { this.current = snapshot; this.currentRaw = raw; }
        }
        catch {
            throw new Error('Opslaan is niet gelukt. Mogelijk is de browseropslag vol of niet beschikbaar. Houd dit scherm open en exporteer je gegevens.');
        }
    }
    async clear(): Promise<void> { this.storage.removeItem(VAULT_KEY); this.lock(); }
    encrypted(): string | null { return this.storage.getItem(VAULT_KEY); }
    async forCloud(): Promise<Envelope> {
        if (!this.key || !this.salt || !this.current) throw new Error('Ontgrendel eerst je dagboek.');
        if (this.storage.getItem(VAULT_KEY) !== this.currentRaw) throw new Error('Je dagboek is in een ander venster gewijzigd. Vergrendel en open het opnieuw vóór synchroniseren.');
        const data: RhythmData = { ...this.current, journal: this.current.journal.map(({ audio: _audio, ...entry }) => entry) };
        return seal(data, this.key, this.salt);
    }
    async restoreCloud(envelope: unknown, password: string, canCommit: () => boolean = () => true, beforeCommit?: (raw: string) => Promise<void>): Promise<RhythmData> {
        const originalRaw = this.storage.getItem(VAULT_KEY);
        assertEnvelope(envelope);
        let salt = decode(envelope.salt), key = await derive(password, salt, envelope.version);
        let data: RhythmData;
        try {
            const raw = await crypto.subtle.decrypt(algorithm(decode(envelope.iv), envelope.version), key, decode(envelope.ciphertext));
            const value: unknown = JSON.parse(new TextDecoder().decode(raw));
            assertData(value); data = value;
        } catch { throw new Error('De cloudkopie kon niet worden ontgrendeld. Controleer je kluiswachtwoord; je lokale dagboek is niet gewijzigd.'); }
        // Keep local recordings only when they still belong to the same unchanged note.
        const previous = this.current;
        data = { ...data, journal: data.journal.map(({ audio: _remoteAudio, ...entry }) => {
            const audio = previous?.journal.find(note => note.id === entry.id && note.text === entry.text)?.audio;
            return audio ? { ...entry, audio } : entry;
        }) };
        if (envelope.version === 1) { salt = crypto.getRandomValues(new Uint8Array(16)); key = await derive(password, salt); }
        const encrypted = await seal(data, key, salt);
        // Commit only after decrypt/validation/encryption succeeded. Quota failure keeps the old vault/key.
        if (this.storage.getItem(VAULT_KEY) !== originalRaw) throw new Error('Je lokale dagboek is ondertussen gewijzigd. Haal de cloudkopie opnieuw op.');
        if (!canCommit()) throw new Error('Ophalen is gestopt. Je lokale kluis is niet gewijzigd.');
        const stored = JSON.stringify(encrypted);
        await beforeCommit?.(stored);
        if (this.storage.getItem(VAULT_KEY) !== originalRaw || !canCommit()) throw new Error('Ophalen is gestopt. Je lokale kluis is niet gewijzigd.');
        this.storage.setItem(VAULT_KEY, stored);
        this.key = key; this.salt = salt; this.current = structuredClone(data);
        this.currentRaw = stored;
        return structuredClone(data);
    }
}
export function audit(data: RhythmData, type: string, objectIds: string[], atUtc: string): RhythmData {
    return { ...data, audit: [...data.audit, { id: crypto.randomUUID(), atUtc, type, objectIds }] };
}
export function upsertSession(data: RhythmData, session: SleepSession, now: string): RhythmData {
    validateSession(session, data.sessions, now);
    const exists = data.sessions.some(s => s.id === session.id);
    return audit({ ...data, sessions: [...data.sessions.filter(s => s.id !== session.id), session].sort((a, b) => ms(a.startUtc) - ms(b.startUtc)) }, exists ? 'session_corrected' : 'session_added', [session.id], now);
}
export function splitSession(data: RhythmData, id: string, atUtc: string, now: string): RhythmData {
    const original = data.sessions.find(s => s.id === id);
    if (!original || ms(atUtc) <= ms(original.startUtc) || ms(atUtc) >= ms(original.endUtc))
        throw new Error('Kies een splitspunt binnen het slaapblok.');
    if (original.estimatedAwakeMinutes > 0)
        throw new Error('Verdeel eerst de geschatte wakkerduur over concrete wakkerperioden of corrigeer het blok voordat je splitst.');
    const make = (startUtc: string, endUtc: string): SleepSession => ({ ...original, id: crypto.randomUUID(), startUtc, endUtc, inBedAtUtc: startUtc === original.startUtc ? original.inBedAtUtc : undefined, updatedAtUtc: now, interruptions: original.interruptions.flatMap(i => {
            const start = Math.max(ms(startUtc), ms(i.startUtc)), end = Math.min(ms(endUtc), ms(i.endUtc));
            return end > start ? [{ startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() }] : [];
        }) });
    return audit({ ...data, sessions: [...data.sessions.filter(s => s.id !== id), make(original.startUtc, atUtc), make(atUtc, original.endUtc)].sort((a, b) => ms(a.startUtc) - ms(b.startUtc)) }, 'session_split', [id], now);
}
export function mergeSessions(data: RhythmData, ids: string[], now: string): RhythmData {
    const sessions = data.sessions.filter(s => ids.includes(s.id)).sort((a, b) => ms(a.startUtc) - ms(b.startUtc));
    const first = sessions[0], last = sessions.at(-1);
    if (sessions.length !== 2 || !first || !last)
        throw new Error('Selecteer twee slaapblokken.');
    const interruptions = sessions.flatMap(s => s.interruptions);
    if (ms(first.endUtc) < ms(last.startUtc))
        interruptions.push({ startUtc: first.endUtc, endUtc: last.startUtc });
    const merged: SleepSession = { ...first, id: crypto.randomUUID(), endUtc: last.endUtc, source: 'user_reported', reviewStatus: 'corrected', interruptions, estimatedAwakeMinutes: sessions.reduce((n, s) => n + s.estimatedAwakeMinutes, 0), updatedAtUtc: now };
    validateSession(merged, data.sessions.filter(s => !ids.includes(s.id)));
    return audit({ ...data, sessions: [...data.sessions.filter(s => !ids.includes(s.id)), merged].sort((a, b) => ms(a.startUtc) - ms(b.startUtc)) }, 'sessions_merged', ids, now);
}
