import { useEffect, useRef, type ReactNode } from 'react';
import { X, Moon, CircleHelp } from 'lucide-react';
import type { RhythmData, SleepSession } from '../../../packages/domain/src/index';
import { dayKey, dayRange, daysEnding, durationLabel, ENGINE_VERSION, overlap, plotPieces, sessionMinutes, totalSleep } from '../../../packages/rhythm-engine/src/index';
export const timeLabel = (utc: string, timezone: string) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(utc));
export const dateLabel = (utc: string, timezone: string, full = false) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: full ? 'long' : 'short', ...(full ? { year: 'numeric' as const } : {}), timeZone: timezone }).format(new Date(utc));
export { Landscape } from './visuals';
export function Modal({ title, description, children, onClose }: {
    title: string;
    description?: string;
    children: ReactNode;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const d = ref.current; if (d && !d.open)
        d.showModal(); return () => { d?.close(); }; }, []);
    return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget)
        onClose(); }} aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">Jouw ritme</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Sluiten"><X size={22}/></button></div>{description && <p className="muted modal-description">{description}</p>}{children}</dialog>;
}
export function Actogram({ sessions, now, timezone, count = 14, onSelect, compact = false }: {
    sessions: SleepSession[];
    now: string;
    timezone: string;
    count?: number;
    onSelect?: (s: SleepSession) => void;
    compact?: boolean;
}) {
    const days = daysEnding(now, timezone, count);
    return <div className={`actogram ${compact ? 'compact' : ''}`}><div className="actogram-scroll"><div className="actogram-inner"><div className="actogram-axis"><span />{[0, 6, 12, 18, 24].map(h => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}</div>{days.map(date => {
            const daySessions = sessions.filter(s => overlap(s, dayRange(date, timezone)));
            const today = date === dayKey(now, timezone);
            return <div className={`actogram-row ${today ? 'is-today' : ''}`} key={date}><span className="day-label">{new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span><div className="day-track" aria-label={`${date}: ${daySessions.length ? `${daySessions.length} slaapblokken` : 'niet geregistreerd'}`}>{daySessions.length === 0 && <span className="no-data">niet geregistreerd</span>}{daySessions.flatMap(s => plotPieces(s, date, timezone).map((part, i) => {
                    const label = `${dateLabel(s.startUtc, timezone)} · ${timeLabel(s.startUtc, timezone)}–${timeLabel(s.endUtc, timezone)} · ${durationLabel(sessionMinutes(s))} · ${s.source === 'healthkit' ? 'HealthKit' : 'zelfrapportage'}${s.estimatedAwakeMinutes ? ' · wakkerduur geschat' : ''}`;
                    return <button key={`${s.id}-${i}`} className={`sleep-bar ${s.kind === 'nap' ? 'nap' : ''} ${s.estimatedAwakeMinutes ? 'estimated' : ''}`} style={{ left: `${part.left}%`, width: `${part.width}%` }} title={label} aria-label={label} onClick={() => onSelect?.(s)} disabled={!onSelect}/>;
                }))}</div></div>;
        })}</div></div><div className="chart-legend"><span><i className="legend-sleep"/>Slaap · zelf gerapporteerd</span><span><i className="legend-nap"/>Dutje</span><span><i className="legend-estimated"/>Geschatte wakkerduur</span></div><details className="chart-explanation"><summary><CircleHelp size={14}/> Wat zie ik hier?</summary><p>Elke rij is één lokale kalenderdag. Ieder blok is een slaapregistratie; wakkerperioden met bekende tijden zijn uitgespaard. Bij gestreepte blokken is wakkerduur geschat zonder exacte tijd: de balk toont het interval, het totaal trekt die schatting af. Lege delen zijn geen bewijs van wakker zijn. Bij een klokwissel kan de wandklok-as afwijken van de werkelijke duur. Gebruik de lijst voor exacte tijdstippen.</p></details></div>;
}
export function SessionList({ sessions, timezone, onEdit, limit }: {
    sessions: SleepSession[];
    timezone: string;
    onEdit: (s: SleepSession) => void;
    limit?: number;
}) {
    const sorted = [...sessions].sort((a, b) => Date.parse(b.startUtc) - Date.parse(a.startUtc)).slice(0, limit);
    if (!sorted.length)
        return <div className="empty-state"><div className="empty-icon"><Moon size={24}/></div><h3>Ruimte voor jouw eerste slaapblok</h3><p>Ook een kort dutje of slaap overdag telt mee.</p></div>;
    return <div className="session-list">{sorted.map(s => <button className="session-row" key={s.id} onClick={() => onEdit(s)}><span className={`session-icon ${s.kind === 'nap' ? 'nap' : ''}`}><Moon size={18}/></span><span className="session-description"><strong>{timeLabel(s.startUtc, timezone)} <span className="muted">—</span> {timeLabel(s.endUtc, timezone)}</strong><span>{dateLabel(s.startUtc, timezone)}{dayKey(s.startUtc, timezone) !== dayKey(s.endUtc, timezone) ? ` → ${dateLabel(s.endUtc, timezone)}` : ''} · {s.kind === 'nap' ? 'Dutje' : 'Slaap'} · {s.source === 'healthkit' ? 'HealthKit' : 'Zelf gerapporteerd'}</span></span><span className="session-duration">{durationLabel(sessionMinutes(s))}<small>{s.estimatedAwakeMinutes ? 'wakkerduur geschat' : 'Bewerken'} →</small></span></button>)}</div>;
}
export function PrintReport({ data, now, includeJournal, demo }: {
    data: RhythmData;
    now: string;
    includeJournal: boolean;
    demo: boolean;
}) {
    const tz = data.settings.timezone, days = daysEnding(now, tz, 14), first = days[0]!, last = days.at(-1)!;
    const range = { startUtc: dayRange(first, tz).startUtc, endUtc: dayRange(last, tz).endUtc };
    const sessions = data.sessions.filter(s => overlap(s, range));
    const checkins = data.checkins.filter(c => Date.parse(c.atUtc) >= Date.parse(range.startUtc) && Date.parse(c.atUtc) < Date.parse(range.endUtc));
    return <section className="print-report"><header><h1>Rhythm <span>· Slaap- en ritmedagboek</span></h1><p>{first} t/m {last} · {tz}{demo ? ' · VOORBEELDGEGEVENS' : ''}</p></header><h2>Registratie en herkomst</h2><p>{sessions.length} slaapblokken · zelfrapportage, tenzij anders vermeld. Een dag met een slaapblok is niet automatisch volledig geregistreerd. Niet geregistreerd betekent niet dat er niet is geslapen.</p><Actogram sessions={sessions} now={now} timezone={tz}/><h2>Slaapblokken</h2><table><thead><tr><th>Start</th><th>Einde</th><th>Slaapduur</th><th>Bron / controle</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td>{dateLabel(s.startUtc, tz)} {timeLabel(s.startUtc, tz)}</td><td>{dateLabel(s.endUtc, tz)} {timeLabel(s.endUtc, tz)}</td><td>{s.inBedAtUtc ? `Inslapen: circa ${Math.round((Date.parse(s.startUtc) - Date.parse(s.inBedAtUtc)) / 60000)}m · ` : ''}{durationLabel(sessionMinutes(s))}{s.estimatedAwakeMinutes ? ` (−${s.estimatedAwakeMinutes}m geschat wakker)` : ''}{s.interruptions.length ? ` · ${s.interruptions.length} wakkerperioden` : ''}</td><td>{s.source} / {s.reviewStatus}<br />{s.originalTimezone}</td></tr>)}</tbody></table>{checkins.length > 0 && <><h2>Energie en slaperigheid</h2><table><thead><tr><th>Datum</th><th>Energie (1–5)</th><th>Slaperigheid (1–5)</th></tr></thead><tbody>{checkins.map(c => <tr key={c.id}><td>{dateLabel(c.atUtc, tz)} {timeLabel(c.atUtc, tz)}</td><td>{c.energy}</td><td>{c.sleepiness}</td></tr>)}</tbody></table></>}{data.wakeMarkers.some(m => Date.parse(m.atUtc) >= Date.parse(range.startUtc) && Date.parse(m.atUtc) < Date.parse(range.endUtc)) && <><h2>Losse wakker-markeringen</h2><p>Dit zijn momenten waarop de gebruiker aangaf wakker te zijn; er worden geen doorlopende wakkerperioden uit afgeleid.</p><ul>{data.wakeMarkers.filter(m => Date.parse(m.atUtc) >= Date.parse(range.startUtc) && Date.parse(m.atUtc) < Date.parse(range.endUtc)).map(m => <li key={m.id}>{dateLabel(m.atUtc, tz)} {timeLabel(m.atUtc, tz)}</li>)}</ul></>}{includeJournal && <><h2>Geselecteerde dagboekinhoud</h2>{data.journal.filter(j => Date.parse(j.atUtc) >= Date.parse(range.startUtc) && Date.parse(j.atUtc) < Date.parse(range.endUtc)).map(j => <p key={j.id}>{dateLabel(j.atUtc, tz)}: {j.text}</p>)}</>}<footer><p>Gegenereerd {dateLabel(now, tz, true)} {timeLabel(now, tz)} · prototype 0.4.0 · engine {ENGINE_VERSION} · UTC-opslag, lokale kalenderdagen. Slaapduur is intervalduur minus geregistreerde wakkerperioden en aanvullende geschatte wakkerduur. Een schatting zonder tijdstip wordt voor deeltotalen evenredig over de resterende intervalduur verdeeld.</p><p>Zelfrapportage en eventuele sensordata zijn schattingen. Dit dagboek geeft geen diagnose of behandeladvies. Vrije notities zijn {includeJournal ? 'op verzoek opgenomen' : 'uitgesloten'}. Correcties zijn in JSON via auditgebeurtenissen herleidbaar; deze prototypeversie bewaart nog geen volledige wijzigingssnapshots.</p></footer></section>;
}
