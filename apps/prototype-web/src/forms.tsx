import { useState, type FormEvent } from 'react';
import { Plus, Trash2, Scissors, Merge, LockKeyhole, ArrowRight, AlertCircle } from 'lucide-react';
import type { CheckIn, Interval, JournalEntry, RhythmData, SleepSession } from '../../../packages/domain/src/index';
import { localToUtc, toLocal } from '../../../packages/rhythm-engine/src/index';
import { mergeSessions, splitSession } from '../../../packages/storage/src/index';
import { VoiceComposer } from './ai/voice-composer';
export function FormError({ error }: {
    error: string;
}) { return error ? <p className="form-error" role="alert"><AlertCircle size={16}/>{error}</p> : null; }
export function VaultForm({ existing, onUnlock }: {
    existing: boolean;
    onUnlock: (password: string) => Promise<void>;
}) {
    const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function submit(e: FormEvent) { e.preventDefault(); setError(''); if (!existing && password !== repeat) {
        setError('De wachtwoorden komen niet overeen.');
        return;
    } setBusy(true); try {
        await onUnlock(password);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Ontgrendelen mislukt.');
    }
    finally {
        setBusy(false);
    } }
    return <form onSubmit={submit}><div className="privacy-callout"><LockKeyhole size={22}/><p>Je gegevens worden versleuteld in deze browser bewaard. Dit is je kluiswachtwoord: het blijft op je apparaat en is apart van je accountwachtwoord. Synchronisatie kun je zelf aanzetten bij Meer.</p></div><label>Wachtwoord<input type="password" autoComplete={existing ? 'current-password' : 'new-password'} minLength={existing ? 1 : 8} required value={password} onChange={e => setPassword(e.target.value)} autoFocus/></label>{!existing && <label>Herhaal wachtwoord<input type="password" autoComplete="new-password" minLength={8} required value={repeat} onChange={e => setRepeat(e.target.value)}/></label>}<p className="field-hint">{existing ? 'Ontgrendel om je eigen dagboek te openen.' : 'Bewaar dit wachtwoord goed. We kunnen het niet herstellen. Wis je browsergegevens, dan verdwijnt ook je dagboek. Exporteer regelmatig een eigen kopie.'}</p><FormError error={error}/><button className="button primary full" disabled={busy}>{busy ? 'Even geduld…' : existing ? 'Ontgrendel mijn dagboek' : 'Start mijn dagboek'}<ArrowRight size={18}/></button></form>;
}
export function SessionForm({ session, data, now, onSave, onRemove, onTransform, onCancel, submitLabel = 'Bevestig slaapblok' }: {
    session?: SleepSession;
    data: RhythmData;
    now: string;
    onSave: (s: SleepSession) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
    onTransform: (data: RhythmData) => Promise<void>;
    onCancel: () => void;
    submitLabel?: string;
}) {
    const tz = data.settings.timezone;
    const [start, setStart] = useState(toLocal(session?.startUtc ?? data.intent?.startedAtUtc ?? new Date(Date.parse(now) - 3600000).toISOString(), tz));
    const [end, setEnd] = useState(toLocal(session?.endUtc ?? now, tz));
    const [inBed, setInBed] = useState(session?.inBedAtUtc ? toLocal(session.inBedAtUtc, tz) : !session && data.intent ? toLocal(data.intent.startedAtUtc, tz) : '');
    const [kind, setKind] = useState<SleepSession['kind']>(session?.kind ?? 'sleep');
    const [awake, setAwake] = useState(String(session?.estimatedAwakeMinutes ?? 0));
    const [interruptions, setInterruptions] = useState<{
        start: string;
        end: string;
    }[]>((session?.interruptions ?? []).map(i => ({ start: toLocal(i.startUtc, tz), end: toLocal(i.endUtc, tz) })));
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [split, setSplit] = useState(''), [mergeId, setMergeId] = useState('');
    async function action(fn: () => Promise<void>) { setError(''); setBusy(true); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Opslaan is niet gelukt.');
    }
    finally {
        setBusy(false);
    } }
    async function submit(e: FormEvent) {
        e.preventDefault();
        await action(async () => {
            const periods: Interval[] = interruptions.map(i => ({ startUtc: localToUtc(i.start, tz), endUtc: localToUtc(i.end, tz) }));
            await onSave({ id: session?.id ?? crypto.randomUUID(), startUtc: localToUtc(start, tz), endUtc: localToUtc(end, tz), inBedAtUtc: inBed ? localToUtc(inBed, tz) : undefined, originalTimezone: session?.originalTimezone ?? tz, source: session?.source ?? 'user_reported', reviewStatus: session ? 'corrected' : 'confirmed', kind, interruptions: periods, estimatedAwakeMinutes: Number(awake), createdAtUtc: session?.createdAtUtc ?? now, updatedAtUtc: now });
        });
    }
    return <form onSubmit={submit}><p className="field-hint">Jouw schatting van wanneer je sliep. Je kunt alles later corrigeren. Tijdzone: {tz}.</p>{!session && data.intent && <div className="notice">Je had aangegeven naar bed te gaan. Controleer het slaapbegin: naar bed gaan betekent nog niet dat je direct sliep.</div>}<label>Naar bed gegaan (optioneel)<input type="datetime-local" value={inBed} onChange={e => setInBed(e.target.value)}/></label><div className="form-grid"><label>Slaapbegin (schatting)<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)}/></label><label>Einde slaapblok<input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)}/></label></div><div className="form-grid"><label>Soort blok<select aria-label="Soort blok" value={kind} onChange={e => setKind(e.target.value as SleepSession['kind'])}><option value="sleep">Slaap</option><option value="nap">Dutje</option></select></label><label>Extra wakker gelegen (minuten)<input type="number" min="0" step="1" required value={awake} onChange={e => setAwake(e.target.value)}/></label></div><p className="field-hint">Gebruik de extra wakkerduur alleen voor tijd die je hieronder nog niet met een begin en einde vastlegt. Het exacte tijdstip van die schatting blijft onbekend.</p><details className="form-details"><summary>Wakkerperioden met bekende tijden ({interruptions.length})</summary>{interruptions.map((i, index) => <div className="interruption-row" key={index}><label>Wakker vanaf<input aria-label={`Wakker vanaf ${index + 1}`} type="datetime-local" required value={i.start} onChange={e => setInterruptions(list => list.map((x, j) => j === index ? { ...x, start: e.target.value } : x))}/></label><label>Tot<input aria-label={`Wakker tot ${index + 1}`} type="datetime-local" required value={i.end} onChange={e => setInterruptions(list => list.map((x, j) => j === index ? { ...x, end: e.target.value } : x))}/></label><button type="button" className="icon-button" aria-label="Wakkerperiode verwijderen" onClick={() => setInterruptions(list => list.filter((_, j) => j !== index))}><Trash2 size={17}/></button></div>)}<button type="button" className="text-button" onClick={() => setInterruptions(list => [...list, { start, end }])}><Plus size={16}/>Wakkerperiode toevoegen</button></details><FormError error={error}/><div className="form-actions"><button type="button" className="button secondary" onClick={onCancel}>Annuleren</button><button className="button primary" disabled={busy}>{busy ? 'Opslaan…' : submitLabel}</button></div>{session && <details className="form-details advanced"><summary>Splitsen, samenvoegen of verwijderen</summary><p className="field-hint">Deze acties gebruiken het opgeslagen blok. Sla eventuele wijzigingen hierboven eerst op.</p><label>Splits op<input type="datetime-local" value={split} onChange={e => setSplit(e.target.value)}/></label><button type="button" className="button secondary full" disabled={!split || busy} onClick={() => action(() => onTransform(splitSession(data, session.id, localToUtc(split, tz), now)))}><Scissors size={16}/>Splits slaapblok</button><label>Samenvoegen met<select aria-label="Samenvoegen met" value={mergeId} onChange={e => setMergeId(e.target.value)}><option value="">Kies een ander blok</option>{data.sessions.filter(s => s.id !== session.id).map(s => <option key={s.id} value={s.id}>{toLocal(s.startUtc, tz).replace('T', ' ')} → {toLocal(s.endUtc, tz).replace('T', ' ')}</option>)}</select></label><p className="field-hint">De tijd tussen twee blokken blijft een wakkerperiode.</p><button type="button" className="button secondary full" disabled={!mergeId || busy} onClick={() => action(() => onTransform(mergeSessions(data, [session.id, mergeId], now)))}><Merge size={16}/>Samenvoegen</button><button type="button" className="button danger full" disabled={busy} onClick={() => { if (window.confirm('Dit slaapblok verwijderen?'))
        void action(() => onRemove(session.id)); }}><Trash2 size={16}/>Verwijder dit blok</button></details>}</form>;
}
const energyLabels = ['Leeg', 'Weinig', 'Gemiddeld', 'Veel', 'Vol energie'];
const sleepyLabels = ['Helemaal niet', 'Een beetje', 'Gemiddeld', 'Erg', 'Heel erg'];
export function CheckinForm({ now, timezone, onSave, onSkip, submitLabel = 'Bewaar mijn check-in' }: {
    now: string;
    timezone: string;
    onSave: (c: CheckIn) => Promise<void>;
    onSkip?: () => void;
    submitLabel?: string;
}) {
    const [energy, setEnergy] = useState<number | null>(null), [sleepiness, setSleepiness] = useState<number | null>(null), [at, setAt] = useState(toLocal(now, timezone)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function submit(e: FormEvent) { e.preventDefault(); if (energy === null || sleepiness === null) {
        setError('Kies je energie en slaperigheid, of sluit dit venster om over te slaan.');
        return;
    } setBusy(true); try {
        await onSave({ id: crypto.randomUUID(), atUtc: localToUtc(at, timezone), energy, sleepiness });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Opslaan is niet gelukt.');
    }
    finally {
        setBusy(false);
    } }
    return <form onSubmit={submit}><p className="muted">Hoe voelt het voor jou? Er is geen goed of fout antwoord.</p>{([{ name: 'Hoeveel energie heb je?', value: energy, set: setEnergy, labels: energyLabels }, { name: 'Hoe slaperig voel je je?', value: sleepiness, set: setSleepiness, labels: sleepyLabels }]).map(group => <fieldset className="rating-group" key={group.name}><legend>{group.name}</legend><div className="rating-options">{group.labels.map((label, index) => <button key={label} type="button" aria-label={`${index + 1} ${label}`} aria-pressed={group.value === index + 1} onClick={() => group.set(index + 1)} className={group.value === index + 1 ? 'selected' : ''}><strong>{index + 1}</strong><small>{label}</small></button>)}</div><p className="rating-selection" aria-live="polite">{group.value ? `${group.value} · ${group.labels[group.value - 1]}` : `1 · ${group.labels[0]} — 5 · ${group.labels[4]}`}</p></fieldset>)}<label>Moment van check-in<input type="datetime-local" required value={at} onChange={e => setAt(e.target.value)}/></label><FormError error={error}/><button className="button primary full" disabled={busy}>{busy ? 'Opslaan…' : submitLabel}</button>{onSkip && <button type="button" className="text-button full" disabled={busy} onClick={onSkip}>Energie overslaan</button>}</form>;
}
export function JournalForm({ now, onSave, onSkip, submitLabel = 'Bewaar mijn notitie' }: {
    now: string; onSave: (j: JournalEntry) => Promise<void>; onSkip?: () => void; submitLabel?: string;
}) {
    const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [audio, setAudio] = useState<Blob | null>(null), [keepAudio, setKeepAudio] = useState(false), [processing, setProcessing] = useState(false);
    async function submit(event: FormEvent) {
        event.preventDefault(); setBusy(true); setError('');
        try {
            if (!text.trim() && !(audio && keepAudio)) throw new Error('Schrijf iets of kies ervoor je opname te bewaren.');
            let savedAudio: JournalEntry['audio'];
            if (audio && keepAudio) {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('De opname kon niet worden gelezen.')); reader.readAsDataURL(audio);
                });
                savedAudio = { dataUrl, mimeType: audio.type };
            }
            await onSave({ id: crypto.randomUUID(), atUtc: now, text: text.trim(), ...(savedAudio ? { audio: savedAudio } : {}) });
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opslaan is niet gelukt.'); }
        finally { setBusy(false); }
    }
    return <form onSubmit={submit}>
        <label>Wat wil je onthouden?<textarea aria-label="Wat wil je onthouden?" autoFocus rows={5} maxLength={10000} value={text} onChange={event => setText(event.target.value)} placeholder="Hoe ging het slapen? Wat speelde er mee? Typ of spreek het in." /></label>
        <VoiceComposer text={text} onText={setText} onAudio={setAudio} onBusy={setProcessing} />
        {audio && <label className="checkbox-label"><input type="checkbox" checked={keepAudio} onChange={event => setKeepAudio(event.target.checked)} /><span>Opname bij mijn notitie bewaren<small>Alleen na deze keuze wordt audio in je versleutelde dagboek bewaard.</small></span></label>}
        <p className="field-hint">Deze notitie en eventuele audio blijven privé en staan standaard buiten je rapport en exports. Controleer AI-voorstellen voordat je ze toevoegt.</p>
        <FormError error={error} />
        <button className="button primary full" disabled={busy || processing || (!text.trim() && !(audio && keepAudio))}>{busy ? 'Opslaan…' : submitLabel}</button>
        {onSkip && <button type="button" className="text-button full" disabled={busy || processing} onClick={onSkip}>Dagboek overslaan</button>}
    </form>;
}
