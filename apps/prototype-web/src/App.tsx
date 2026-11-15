import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, BedDouble, BookOpen, CalendarDays, Check, ChevronRight, Clock3, FileText, Fingerprint, Heart, Home, LockKeyhole, Menu, Moon, MoreHorizontal, Plus, Settings2, ShieldCheck, Sparkles, Sun, Sunrise, Watch, Waves, X, Zap } from 'lucide-react';
import { emptyData, type RhythmData, type SleepSession } from '../../../packages/domain/src/index';
import { dayRange, daysEnding, durationLabel, overlap, sessionMinutes, totalSleep, toLocal, validateSession } from '../../../packages/rhythm-engine/src/index';
import { audit, BrowserVault, upsertSession } from '../../../packages/storage/src/index';
import { exportCsv, exportJson } from '../../../packages/exports/src/index';
import { demoData } from '../../../tests/fixtures/demo';
import { Actogram, dateLabel, Landscape, Modal, PrintReport, SessionList, timeLabel } from './components';
import { CheckinForm, FormError, JournalForm, SessionForm, VaultForm } from './forms';
import { LogFlow } from './log-flow';
import { ModelControls } from './ai/model-controls';
import { releaseModels } from './ai/local-ai';
import { AnchorClock, MetricValue, RhythmRing } from './visuals';
import { HomeScreenCard } from './pwa';
import { useCloud } from './cloud/use-cloud';
import { CloudPanel } from './cloud/cloud-panel';
import { SYNC_KEY } from '../../../packages/storage/src/cloud-sync';
import { useAutoLock } from './security/auto-lock';
import { GuidancePanel } from './guidance/guidance-panel';
import { ReminderPanel } from './guidance/reminder-panel';
import { buildGuidance } from '../../../packages/rhythm-engine/src/guidance';
type Page = 'today' | 'sleep' | 'alarm' | 'journal' | 'more';
type Sheet = 'session' | 'checkin' | 'journal' | 'vault' | null;
const navigation = [{ id: 'today', label: 'Vandaag', icon: Home }, { id: 'sleep', label: 'Mijn slaap', icon: BedDouble }, { id: 'alarm', label: 'Wekker', icon: Clock3 }, { id: 'journal', label: 'Dagboek', icon: BookOpen }, { id: 'more', label: 'Meer', icon: MoreHorizontal }] as const;
function download(contents: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([contents], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function readVault(): BrowserVault | null { try {
    return new BrowserVault(window.localStorage);
}
catch {
    return null;
} }
export function App() {
    const [page, setPage] = useState<Page>('today'), [data, setData] = useState<RhythmData>(emptyData), [mode, setMode] = useState<'new' | 'personal' | 'demo'>('new');
    const [sheet, setSheet] = useState<Sheet>(null), [editing, setEditing] = useState<SleepSession | undefined>(), [notice, setNotice] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false), [now, setNow] = useState(new Date().toISOString());
    const [period, setPeriod] = useState(14), [includeJournal, setIncludeJournal] = useState(false), [report, setReport] = useState(false);
    const [intentToComplete, setIntentToComplete] = useState<string | null>(null);
    const [openPlan, setOpenPlan] = useState(new URLSearchParams(location.search).get('open') === 'plan');
    const vault = useRef<BrowserVault | null>(readVault());
    const pending = useRef<(() => void) | null>(null), noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingMutation = useRef<'start' | 'awake' | null>(null);
    const writeLock = useRef(false), viewGeneration = useRef(0);
    useAutoLock(mode === 'personal', () => leave(true));
    const tz = data.settings.timezone, demo = mode === 'demo', ready = mode !== 'new';
    useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 30000); return () => clearInterval(timer); }, []);
    useEffect(() => { document.documentElement.dataset.theme = data.settings.theme; }, [data.settings.theme]);
    useEffect(() => { const open = (event: MessageEvent) => { if (event.data?.type === 'rhythm-open-plan') setOpenPlan(true); }; navigator.serviceWorker?.addEventListener('message', open); return () => navigator.serviceWorker?.removeEventListener('message', open); }, []);
    useEffect(() => { if (openPlan && ready) { setPage('alarm'); setOpenPlan(false); if (new URLSearchParams(location.search).get('open') === 'plan') history.replaceState(null, '', location.pathname + location.hash); } }, [openPlan, ready]);
    useEffect(() => { const update = () => { document.documentElement.dataset.pageVisibility = document.hidden ? 'hidden' : 'visible'; }; update(); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
    useEffect(() => { if (!report)
        return; const timer = setTimeout(() => window.print(), 120); return () => clearTimeout(timer); }, [report]);
    useEffect(() => { const close = () => setReport(false); window.addEventListener('afterprint', close); return () => window.removeEventListener('afterprint', close); }, []);
    useEffect(() => () => { if (noticeTimer.current)
        clearTimeout(noticeTimer.current); }, []);
    function toast(text: string) { setNotice(text); if (noticeTimer.current)
        clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 4500); }
    function ensure(action: () => void, mutation?: 'start' | 'awake') { if (!ready) {
        pending.current = mutation ? null : action;
        pendingMutation.current = mutation ?? null;
        setSheet('vault');
    }
    else
        action(); }
    useEffect(() => { if (mode !== 'personal' || !pendingMutation.current)
        return; const mutation = pendingMutation.current; pendingMutation.current = null; if (mutation === 'start' && data.intent) {
        toast('Je bestaande registratie is hervat.');
        return;
    } run(mutation === 'start' ? start : markAwake); }, [mode]);
    async function commit(next: RhythmData) { if (writeLock.current)
        throw new Error('Een vorige wijziging wordt nog opgeslagen.'); writeLock.current = true; const epoch = viewGeneration.current; setSaving(true); setError(''); try {
        if (mode === 'personal') {
            if (!vault.current)
                throw new Error('Browseropslag is niet beschikbaar.');
            await vault.current.save(next);
        }
        else if (mode !== 'demo')
            throw new Error('Open eerst je dagboek.');
        if (viewGeneration.current === epoch) { setData(next); setNow(new Date().toISOString()); }
    }
    catch (e) {
        const text = e instanceof Error ? e.message : 'Opslaan is niet gelukt.';
        setError(text);
        throw e;
    }
    finally {
        writeLock.current = false;
        setSaving(false);
    } }
    function run(action: () => Promise<void>) { void action().catch(() => { }); }
    function openSession(session?: SleepSession, completeIntent = false) { ensure(() => { setEditing(session); setIntentToComplete(completeIntent ? data.intent?.id ?? null : null); setSheet('session'); }); }
    function enterDemo() { if (writeLock.current)
        return; viewGeneration.current++; releaseModels(); if (mode === 'personal')
        vault.current?.lock(); pending.current = null; pendingMutation.current = null; setData(demoData()); setMode('demo'); setPage('today'); setSheet(null); setError(''); toast('Voorbeeldgegevens geladen. Wijzigingen blijven alleen in deze demosessie.'); }
    function leave(force = false) { if (writeLock.current && !force)
        return; viewGeneration.current++; releaseModels(); vault.current?.lock(); pending.current = null; pendingMutation.current = null; setMode('new'); setData(emptyData()); setPage('today'); setSheet(null); setError(''); setIncludeJournal(false); setReport(false); setNotice(''); }
    async function unlock(password: string) { if (writeLock.current) throw new Error('Wacht tot de huidige opslagactie klaar is.'); if (!vault.current)
        throw new Error('Deze browser biedt geen lokale opslag. Gebruik een gewone browser of bekijk de demo.'); const epoch = viewGeneration.current; const stored = await vault.current.unlock(password); if (viewGeneration.current !== epoch) { vault.current.lock(); return; } const next = stored ?? emptyData(); if (!stored)
        await vault.current.save(next); if (viewGeneration.current !== epoch) { vault.current.lock(); return; } setData(next); setMode('personal'); setSheet(null); const action = pending.current; pending.current = null; action?.(); toast(stored ? 'Je dagboek is ontgrendeld.' : 'Je lokale dagboek is klaar.'); }
    async function start() { const at = new Date().toISOString(); await commit(audit({ ...data, intent: { id: crypto.randomUUID(), startedAtUtc: at, originalTimezone: tz } }, 'intent_started', [], at)); toast('Naar bed gaan vastgelegd. Bevestig na afloop wanneer je ongeveer sliep.'); }
    async function markAwake() { const at = new Date().toISOString(); await commit(audit({ ...data, wakeMarkers: [...data.wakeMarkers, { id: crypto.randomUUID(), atUtc: at, intentId: data.intent?.id }] }, 'awake_marked', [], at)); toast('Wakker zijn op dit moment vastgelegd. Je kunt de duur later aanvullen.'); }
    const cloud = useCloud({ vault, mode, data, saving, viewGeneration,
        onLock: () => { leave(true); setPage('more'); }, onRecovery: () => setPage('more'),
        onRestore: next => { releaseModels(); setData(next); setMode('personal'); setSheet(null); },
        beginRestore: () => { if (writeLock.current) throw new Error('Wacht tot opslaan klaar is.'); writeLock.current = true; setSaving(true); return () => { writeLock.current = false; setSaving(false); }; },
    });
    const range24 = { startUtc: new Date(Date.parse(now) - 86400000).toISOString(), endUtc: now };
    const recent = data.sessions.filter(s => overlap(s, range24)), total = totalSleep(data.sessions, range24), days = daysEnding(now, tz, 14);
    const lastCheck = [...data.checkins].filter(c => Date.parse(c.atUtc) <= Date.parse(now)).sort((a, b) => Date.parse(b.atUtc) - Date.parse(a.atUtc))[0];
    const moreGuidance = page === 'more' ? buildGuidance(data, now) : null;
    const loggedDays = moreGuidance?.registeredDays ?? 0, insightText = moreGuidance?.insights[0]?.text ?? 'Bekijk je dagplan voor een haalbare volgende stap.';
    const pageTitle = ({ today: 'Vandaag', sleep: 'Mijn slaap', alarm: 'Jouw dagstructuur', journal: 'Dagboek', more: 'Inzicht & instellingen' })[page];
    return <>
    <div className="app-shell">
      <aside className="sidebar"><a href="#vandaag" className="brand" onClick={e => { e.preventDefault(); setPage('today'); }}><img src="/rhythm.svg" alt=""/><span>Rhythm<span>Vind jouw ritme.</span></span></a><div className="nav-caption">Jouw dagelijkse ruimte</div><nav aria-label="Hoofdnavigatie">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon size={20}/><span>{label}</span>{page === id && <span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="privacy-sidebar"><ShieldCheck size={22}/><strong>Jouw data. Jouw ritme.</strong><p>Een persoonlijke plek. Lokaal loggen, met optionele versleutelde synchronisatie.</p></div><button className="workspace-button" onClick={() => ready ? leave() : setSheet('vault')}><span className="avatar"><Fingerprint size={22}/></span><span><strong>{demo ? 'Voorbeeldomgeving' : ready ? 'Mijn lokale dagboek' : 'Jouw eigen ruimte'}</strong><small>{demo ? 'Demo · niet opgeslagen' : ready ? 'Ontgrendeld op dit apparaat' : 'Begin wanneer jij wilt'}</small></span><ChevronRight size={17}/></button></div></aside>
      <div className="main-shell"><header className="topbar"><div className="mobile-brand"><img src="/rhythm.svg" alt="" /><strong>Rhythm</strong></div><div className="breadcrumb"><span>Mijn ruimte</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div><div className="topbar-actions"><span className="local-badge"><span />{demo ? 'Demomodus' : ready ? 'Lokaal versleuteld' : 'Offline als uitgangspunt'}</span><button className="icon-button" aria-label={data.settings.theme === 'dark' ? 'Licht thema' : 'Donker thema'} onClick={() => { const next = { ...data, settings: { ...data.settings, theme: data.settings.theme === 'dark' ? 'light' as const : 'dark' as const } }; if (ready)
        run(() => commit(next));
    else
        setData(next); }}>{data.settings.theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>{ready && <button className="icon-button" aria-label={demo ? 'Demo verlaten' : 'Dagboek vergrendelen'} onClick={() => leave()}><LockKeyhole size={18}/></button>}</div></header>
      {demo && <div className="demo-banner"><span><Sparkles size={15}/> Je bekijkt voorbeeldgegevens.<span className="demo-extra"> Alles wat je hier wijzigt, blijft in de demo.</span></span><button onClick={() => leave()}>Eigen dagboek <ArrowRight size={15}/></button></div>}
      <main id="main-content"><div className={`page-transition page-${page}`} key={page}><div className="page-heading"><div><div className="eyebrow">Een stap tegelijk</div><h1>{page === 'today' ? (ready ? 'Welkom terug' : 'Jouw ritme begint hier') : pageTitle}<span className="title-dot">.</span></h1><p>{page === 'today' ? (recent.length ? `${durationLabel(total.minutes)} slaap geregistreerd in de afgelopen 24 uur.` : 'Een rustig begin. Ieder slaapblok telt mee.') : page === 'sleep' ? 'Jouw hele etmaal, met ruimte voor ieder slaapblok.' : page === 'journal' ? 'Een plek voor hoe het écht met je gaat.' : page === 'alarm' ? 'Kleine ankers voor de dag die jij wilt.' : 'Je patroon begrijpen en je gegevens in eigen hand houden.'}</p></div><div className="heading-actions">{page === 'today' ? <span className="date-chip"><CalendarDays size={16}/>{dateLabel(now, tz, true)}</span> : page === 'sleep' ? <button className="button primary" onClick={() => openSession()}><Plus size={17}/>Slaapblok toevoegen</button> : page === 'journal' ? <button className="button primary" onClick={() => ensure(() => setSheet('journal'))}><Plus size={17}/>Notitie schrijven</button> : null}</div></div>
      {error && <div className="error-banner" role="alert">{error}<button className="icon-button" aria-label="Melding sluiten" onClick={() => setError('')}><X size={16}/></button></div>}
      {!ready && <div className="welcome-strip"><div><ShieldCheck size={22}/><span><strong>Een rustige plek voor jouw verhaal.</strong><small>{vault.current?.exists() ? 'Je lokale dagboek staat klaar om te ontgrendelen.' : 'Begin met een leeg dagboek of ontdek Rhythm met voorbeeldgegevens.'}</small></span></div><div><button className="text-button" onClick={enterDemo}>Bekijk de demo <ArrowRight size={16}/></button><button className="button secondary" onClick={() => setSheet('vault')}>{vault.current?.exists() ? 'Ontgrendel dagboek' : 'Start mijn dagboek'}</button></div></div>}
      {page === 'today' && <div className="dashboard-grid"><section className="primary-column"><section className={`hero-card rhythm-hero ${data.intent ? 'tracking' : ''}`}>
          <Landscape tone={data.intent ? 'night' : 'dawn'} />
          <RhythmRing value={data.intent ? timeLabel(data.intent.startedAtUtc, tz) : recent.length ? durationLabel(total.minutes) : '—'} label={data.intent ? 'Naar bed sinds' : 'Slaap in de laatste 24 uur'} active={Boolean(data.intent)} dayFlags={days.map(date => data.sessions.some(session => overlap(session, dayRange(date, tz))))} onOpen={() => setPage('sleep')} />
          <div className="hero-content"><span className="hero-kicker"><span className={data.intent ? 'status-pulse' : ''} />{data.intent ? 'Je registratie loopt' : 'Ieder slaapblok vertelt iets'}</span>
          <h2>{data.intent ? <>Een moment<br />voor rust.</> : <>Je ritme begrijpen.<br />Je dag terugvinden.</>}</h2>
          <p>{data.intent ? 'Naar bed gaan is vastgelegd. Bevestig na afloop wanneer je ongeveer sliep.' : 'Ook als je slaap verschuift. Hier krijgt jouw hele etmaal een plek.'}</p>
          <div className="hero-actions"><button className="button primary" disabled={saving} onClick={() => data.intent ? openSession(undefined, true) : ensure(() => run(start), 'start')}>{data.intent ? <Sunrise size={20} /> : <Moon size={20} />}{data.intent ? 'Ik ben wakker' : 'Ik ga slapen'}<ArrowRight size={18} /></button>
          <button className="hero-secondary" onClick={() => data.intent ? ensure(() => run(markAwake), 'awake') : openSession()}>{data.intent ? 'Ik lig wakker' : 'Slaap achteraf toevoegen'}<Plus size={16} /></button></div>
          {data.intent && <button className="cancel-intent" disabled={saving} onClick={() => run(async () => { await commit(audit({ ...data, intent: null }, 'intent_canceled', [], now)); toast('Rustmoment afgesloten zonder slaap toe te voegen.'); })}>Niet geslapen? Sluit dit rustmoment</button>}</div>
        </section><div className="stats-grid"><div className="stat-card"><span><Moon size={16}/>Geregistreerde slaap</span><strong><MetricValue value={recent.length ? durationLabel(total.minutes) : '—'} /></strong><small>Afgelopen 24 uur{total.estimated ? ' · schatting' : ''}</small></div><div className="stat-card"><span><Waves size={16}/>Slaapblokken</span><strong><MetricValue value={recent.length || '—'} /><em>{recent.length === 1 ? 'blok' : recent.length ? 'blokken' : ''}</em></strong><small>{recent.length ? 'Ook slaap overdag telt mee' : 'Nog geen registratie in 24 uur'}</small></div><div className="stat-card"><span><Zap size={16}/>Jouw energie</span><strong><MetricValue value={lastCheck ? lastCheck.energy : '—'} />{lastCheck && <em>/ 5</em>}</strong><small>{lastCheck ? `${dateLabel(lastCheck.atUtc, tz)} · ${timeLabel(lastCheck.atUtc, tz)}` : 'Hoe voelt het voor jou?'}</small></div></div>
        {ready && <GuidancePanel compact data={data} now={now} saving={saving} onSave={commit} onConfigure={() => { setPage('alarm'); document.getElementById('goal-wake')?.focus(); }} onCheckin={() => ensure(() => setSheet('checkin'))} onReview={() => setPage('sleep')}/>}<section className="panel"><div className="section-heading"><div><span className="eyebrow">Het grotere plaatje</span><h2>Jouw slaapritme</h2></div><button className="text-button" onClick={() => setPage('sleep')}>Bekijk alles <ArrowRight size={15}/></button></div><div className="chart-subheading"><span>Afgelopen 14 dagen</span><span className="source-pill">Zelf gerapporteerd</span></div><Actogram sessions={data.sessions} now={now} timezone={tz} compact onSelect={openSession}/></section>
        <section className="panel"><div className="section-heading"><h2>Recente slaapblokken</h2><button className="icon-button" aria-label="Slaapblok toevoegen" onClick={() => openSession()}><Plus size={20}/></button></div><SessionList sessions={data.sessions} timezone={tz} onEdit={openSession} limit={3}/></section>
      </section><aside className="secondary-column"><section className="panel checkin-panel"><span className="card-icon teal"><Heart size={21}/></span><h2>Hoe gaat het met je?</h2><p>Je gevoel geeft context aan de cijfers. Neem even een moment voor jezelf.</p><div className="energy-preview" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <span key={n} className={lastCheck?.energy === n ? 'chosen' : ''}><span>{['◡', '◡', '—', '◡', '◡'][n - 1]}</span></span>)}</div><div className="energy-captions"><span>Weinig energie</span><span>Vol energie</span></div><button className="button secondary full" onClick={() => ensure(() => setSheet('checkin'))}>Korte check-in <ArrowRight size={17}/></button><small className="subtle-center">Alleen als jij daar ruimte voor hebt.</small></section>
        <section className="panel insight-panel"><div className="inline-label"><Sparkles size={17}/><span>Jouw volgende stap</span></div><h2>Kijk wat nu haalbaar is.</h2><p>Je eigen tijden, registraties en reacties komen samen in je dagplan. Lukt iets niet? Geef het aan en maak je volgende stap kleiner.</p><button className="text-button" onClick={() => setPage('alarm')}>Bekijk mijn plan<ArrowRight size={15}/></button></section>
        <section className="panel routine-preview"><div className="section-heading"><h2>Jouw dagankers</h2><Sunrise size={20}/></div><p>Kleine vaste momenten, door jou gekozen.</p>{data.settings.goalWake ? <><div className="anchor-row"><span className="anchor-dot teal-dot"/><span>Gewenste dagstart<small>Eigen streeftijd</small></span><strong>{data.settings.goalWake}</strong></div>{data.settings.goalBed && <div className="anchor-row"><span className="anchor-dot violet-dot"/><span>Gewenst naar bed<small>Eigen streeftijd</small></span><strong>{data.settings.goalBed}</strong></div>}</> : <div className="routine-empty"><Sunrise size={25}/><span>Wat geeft jouw dag houvast?</span></div>}<button className="text-button" onClick={() => setPage('alarm')}>{data.settings.goalWake ? 'Bekijk je dagstructuur' : 'Kies je eigen ankers'}<ArrowRight size={15}/></button></section>
        <div className="quiet-note"><ShieldCheck size={17}/><p>Jouw verhaal blijft bij jou.<br />Delen doe je alleen als je dat wilt.</p></div>
      </aside></div>}
      {page === 'sleep' && <><section className="panel"><div className="section-heading"><div><span className="eyebrow">Jouw patroon, zonder oordeel</span><h2>Slaap door het etmaal</h2></div><div className="segmented" aria-label="Aantal dagen">{[7, 14, 30, 90].map(n => <button key={n} aria-pressed={period === n} className={period === n ? 'selected' : ''} onClick={() => setPeriod(n)}>{n} dagen</button>)}</div></div><Actogram sessions={data.sessions} now={now} timezone={tz} count={period} onSelect={openSession}/></section><section className="panel spaced"><div className="section-heading"><h2>Alle slaapblokken</h2><span className="muted">{data.sessions.length} registraties</span></div><p className="muted">Tik op een blok om tijden, wakkerperioden of de indeling aan te passen.</p><SessionList sessions={data.sessions} timezone={tz} onEdit={openSession}/></section></>}
      {page === 'journal' && <div className="content-two-columns"><section className="panel journal-panel"><div className="journal-intro"><Landscape tone="night" /><div><span className="eyebrow">Ruimte voor jouw verhaal</span><h2>Hoe voelt vandaag?</h2><p>De cijfers vertellen wanneer.<br />Jij vertelt hoe het was.</p></div></div><div className="section-heading"><h2>Jouw notities</h2><BookOpen size={20}/></div>{!data.journal.length ? <div className="empty-state"><BookOpen size={30}/><h3>Jouw verhaal achter de cijfers</h3><p>Een paar woorden over je dag zijn genoeg.</p><button className="button secondary" onClick={() => ensure(() => setSheet('journal'))}>Schrijf een notitie</button></div> : <div className="journal-list">{[...data.journal].reverse().map(j => <article className="journal-entry" key={j.id}><header><span>{dateLabel(j.atUtc, tz, true)} · {timeLabel(j.atUtc, tz)}</span><button className="icon-button" aria-label="Notitie verwijderen" onClick={() => { if (window.confirm('Deze notitie verwijderen?'))
        run(async () => { await commit(audit({ ...data, journal: data.journal.filter(x => x.id !== j.id) }, 'journal_deleted', [j.id], now)); toast('Notitie verwijderd.'); }); }}><X size={16}/></button></header><p>{j.text}</p><div className="note-landscape" aria-hidden="true"><Landscape tone="night" /></div>{j.audio && <audio controls preload="none" src={j.audio.dataUrl} aria-label="Opgeslagen dagboekopname" />}<span className="private-note"><LockKeyhole size={12}/>Privé · standaard buiten rapport</span></article>)}</div>}</section><aside><section className="panel"><div className="section-heading"><h2>Energie & slaperigheid</h2><button className="icon-button" aria-label="Check-in toevoegen" onClick={() => ensure(() => setSheet('checkin'))}><Plus size={20}/></button></div>{!data.checkins.length ? <p className="muted">Je check-ins krijgen hier een eigen plek, los van wanneer je slaapt.</p> : <div className="checkin-list">{[...data.checkins].sort((a, b) => Date.parse(b.atUtc) - Date.parse(a.atUtc)).map(c => <div className="checkin-row" key={c.id}><span>{dateLabel(c.atUtc, tz)}<small>{timeLabel(c.atUtc, tz)}</small></span><span><Zap size={14}/> {c.energy}/5<small>Energie</small></span><span><Moon size={14}/> {c.sleepiness}/5<small>Slaperigheid</small></span></div>)}</div>}</section><section className="panel spaced"><h3>Wakker gemarkeerd</h3><p className="field-hint">Een markering vertelt dat je op dat moment wakker was. Vul de duur eventueel later aan in je slaapblok.</p><button className="button secondary full" disabled={saving} onClick={() => ensure(() => run(markAwake), 'awake')}>Ik lig nu wakker <Plus size={16}/></button>{[...data.wakeMarkers].reverse().slice(0, 10).map(m => <div className="wake-marker" key={m.id}>{dateLabel(m.atUtc, tz)} · {timeLabel(m.atUtc, tz)}<span>Zelf gemarkeerd</span></div>)}</section></aside></div>}
      {page === 'alarm' && <><div className="content-two-columns"><section className="panel anchor-settings"><AnchorClock time={data.settings.goalWake} onEdit={() => document.getElementById('goal-wake')?.focus()} /><h2>Een ritme dat bij je leven past.</h2><p className="muted">Kies een gewenst moment voor je dagstart en om naar bed te gaan. Je kunt deze ankers altijd aanpassen of leeg laten.</p><GoalForm data={data} ready={ready} onSave={async (settings) => { if (!ready) {
        setSheet('vault');
        return;
    } await commit(audit({ ...data, settings }, 'settings_updated', [], now)); toast('Je dagankers zijn opgeslagen.'); }}/><div className="notice"><Clock3 size={20}/><span><strong>Deze webversie plant geen wekker.</strong><br />Stel voor een echte wekker de Klok-app op je telefoon in. Je streeftijden hieronder zijn alleen dagankers.</span></div></section><aside><section className="panel"><div className="inline-label"><ShieldCheck size={18}/>Zicht op wat werkt</div><h2>Jij houdt de regie.</h2><p>Een gekozen tijd is een oriëntatiepunt. Rhythm past je slaap- of wektijden nooit vanzelf aan.</p><div className="capability-row"><span>Eigen dagankers</span><span className="status-label">Beschikbaar</span></div><div className="capability-row"><span>Native iPhone-wekker</span><span className="muted">Latere fase</span></div><div className="capability-row"><span>Systeembevestiging alarm</span><span className="muted">Niet beschikbaar op web</span></div></section></aside></div>{ready && <GuidancePanel data={data} now={now} saving={saving} onSave={commit} onConfigure={() => { setPage('alarm'); document.getElementById('goal-wake')?.focus(); }} onCheckin={() => ensure(() => setSheet('checkin'))} onReview={() => setPage('sleep')}/>}<ReminderPanel data={data} session={cloud.session} demo={demo} onAccount={() => setPage('more')}/></>}
      {page === 'more' && <div className="content-two-columns"><div><CloudPanel cloud={cloud} onUnlock={() => setSheet('vault')} /><section className="panel"><span className="eyebrow">Van registreren naar begrijpen</span><h2>Wat weten we tot nu toe?</h2><div className="insight-stat"><strong>{loggedDays}<em>/14</em></strong><div><b>Dagen met een slaapblok</b><p>Dit telt dagen met een registratie. Het zegt niet dat alle slaap op die dagen is vastgelegd.</p></div></div><div className="coverage-track">{days.map(d => <span key={d} className={data.sessions.some(s => overlap(s, dayRange(d, tz))) ? 'recorded' : ''} title={`${d}: ${data.sessions.some(s => overlap(s, dayRange(d, tz))) ? 'slaapblok aanwezig' : 'niet geregistreerd'}`}/>)}</div><div className="insight-text"><Sparkles size={20}/><p>{insightText}</p></div><p className="field-hint">Beschrijvend inzicht · geen diagnose of voorspelling. Zonder betrouwbare gegevens tonen we geen driftgetal of biologische-klokscore.</p></section><section className="panel spaced"><div className="section-heading"><div><span className="eyebrow">Jouw verhaal kunnen delen</span><h2>Rapport & export</h2></div><FileText size={24}/></div><p className="muted">Maak lokaal een overzicht voor jezelf of een professional. CSV en JSON bevatten alle registraties; het afdrukbare rapport toont de afgelopen 14 dagen.</p><label className="checkbox-label"><input type="checkbox" checked={includeJournal} onChange={e => setIncludeJournal(e.target.checked)}/><span>Vrije dagboeknotities opnemen<small>Standaard uitgesloten. JSON bevat na deze keuze ook bewaarde audio; PDF bevat dagboektekst.</small></span></label><div className="export-grid"><button className="export-button" onClick={() => { setReport(false); requestAnimationFrame(() => setReport(true)); }}><FileText size={23}/><strong>PDF-rapport</strong><small>Afdrukken / bewaren als PDF</small><ArrowRight size={16}/></button><button className="export-button" onClick={() => { download(exportCsv(data, 'sessions'), `${demo ? 'demo-' : ''}rhythm-slaap.csv`, 'text/csv;charset=utf-8'); toast('CSV met slaapblokken aangemaakt.'); }}><ArrowDownToLine size={23}/><strong>Slaap CSV</strong><small>Alle slaapblokken</small><ArrowRight size={16}/></button><button className="export-button" onClick={() => { download(exportCsv(data, 'checkins'), `${demo ? 'demo-' : ''}rhythm-checkins.csv`, 'text/csv;charset=utf-8'); toast('CSV met check-ins aangemaakt.'); }}><Zap size={23}/><strong>Check-ins CSV</strong><small>Energie & slaperigheid</small><ArrowRight size={16}/></button><button className="export-button" onClick={() => { download(exportJson(data, includeJournal), `${demo ? 'demo-' : ''}rhythm-export.json`, 'application/json'); toast('JSON-export aangemaakt. Bewaar deze kopie op een veilige plek.'); }}><ArrowDownToLine size={23}/><strong>JSON-export</strong><small>Gegevens & herkomst</small><ArrowRight size={16}/></button></div><p className="field-hint">Exports zijn leesbare bestanden buiten je versleutelde kluis. Je kiest zelf waar je ze bewaart of met wie je ze deelt.</p>{report && <button className="text-button" onClick={() => setReport(false)}>Afdrukweergave sluiten</button>}</section></div><aside><section className="panel"><div className="section-heading"><h2>Jouw gegevens</h2><ShieldCheck size={21}/></div><div className="capability-row"><span>Opslag</span><span>{demo ? 'Alleen demogeheugen' : ready ? 'Versleutelde browserkluis' : 'Nog niet gestart'}</span></div><div className="capability-row"><span>Tijdzone</span><span>{tz}</span></div><div className="capability-row"><span>Wijzigingsgebeurtenissen</span><span>{data.audit.length}</span></div><button className="button secondary full" onClick={() => ready ? leave() : setSheet('vault')}><LockKeyhole size={16}/>{ready ? demo ? 'Verlaat demo' : 'Vergrendel dagboek' : 'Open mijn dagboek'}</button><button className="text-button full" onClick={enterDemo}>Bekijk voorbeeldgegevens <ArrowRight size={15}/></button>{mode === 'personal' && <button className="button danger full" onClick={() => { if (window.confirm('Alle gegevens in de lokale Rhythm-kluis definitief verwijderen? Eerder gedownloade exports blijven op je apparaat staan.'))
        run(async () => { await vault.current?.clear(); localStorage.removeItem(SYNC_KEY); leave(); toast('De lokale kluis is verwijderd.'); }); }}>Verwijder mijn lokale gegevens</button>}</section><section className="panel spaced"><div className="section-heading"><h2>Optionele uitbreidingen</h2><Watch size={21}/></div><div className="capability-row"><span>Apple Watch / HealthKit</span><span className="muted">Later op iPhone</span></div><h3 className="model-section-title">Whisper & Gemma</h3><ModelControls /><p className="field-hint">Je kunt nu al registreren, terugkijken en exporteren zonder deze uitbreidingen.</p></section><HomeScreenCard /><p className="version-note">Rhythm 0.6.0 · lokaal M0-prototype<br />Grip op je slaapritme. Structuur in je dag.</p></aside></div>}
      <footer className="app-footer"><span><Waves size={14}/>Op jouw tempo.</span><span>{demo ? 'Voorbeeldomgeving · wijzigingen worden niet bewaard' : ready ? 'Privé opgeslagen in deze browser' : 'Een nieuw begin is ook een begin.'}</span></footer></div></main></div>
      <nav className="mobile-nav" aria-label="Mobiele navigatie">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon size={21}/><span>{label === 'Mijn slaap' ? 'Slaap' : label}</span></button>)}</nav>
    </div>
    {notice && <div className="toast" role="status"><Check size={18}/>{notice}</div>}
    {sheet === 'vault' && <Modal title={vault.current?.exists() ? 'Welkom terug.' : 'Jouw eigen dagboek.'} onClose={() => { setSheet(null); pending.current = null; pendingMutation.current = null; }}><VaultForm existing={vault.current?.exists() ?? false} onUnlock={unlock}/></Modal>}
    {sheet === 'session' && <Modal title={editing ? 'Slaapblok aanpassen' : 'Even stilstaan bij je slaap.'} onClose={() => setSheet(null)}>
      {editing ? <SessionForm session={editing} data={data} now={now} onCancel={() => setSheet(null)}
        onSave={async session => { validateSession(session, data.sessions, new Date().toISOString()); await commit(upsertSession(data, session, new Date().toISOString())); setSheet(null); toast('Slaapblok aangepast.'); }}
        onRemove={async id => { await commit(audit({ ...data, sessions: data.sessions.filter(session => session.id !== id) }, 'session_deleted', [id], now)); setSheet(null); toast('Slaapblok verwijderd.'); }}
        onTransform={async next => { await commit(next); setSheet(null); toast('Slaapblokken aangepast.'); }} />
      : <LogFlow data={{...data, intent: intentToComplete ? data.intent : null}} now={new Date().toISOString()} onClose={() => setSheet(null)}
        onSession={async session => { const at = new Date().toISOString(); validateSession(session, data.sessions, at); await commit({ ...upsertSession(data, session, at), intent: intentToComplete === data.intent?.id ? null : data.intent }); }}
        onCheckin={async checkin => { await commit(audit({ ...data, checkins: [...data.checkins, checkin] }, 'checkin_added', [checkin.id], new Date().toISOString())); }}
        onJournal={async entry => { await commit(audit({ ...data, journal: [...data.journal, entry] }, 'journal_added', [entry.id], new Date().toISOString())); }} />}
    </Modal>}
    {sheet === 'checkin' && <Modal title="Even bij jezelf inchecken." onClose={() => setSheet(null)}><CheckinForm now={now} timezone={tz} onSave={async (c) => { await commit(audit({ ...data, checkins: [...data.checkins, c] }, 'checkin_added', [c.id], now)); setSheet(null); toast('Je check-in is bewaard.'); }}/></Modal>}
    {sheet === 'journal' && <Modal title="Hoe is het vandaag?" onClose={() => setSheet(null)}><JournalForm now={now} onSave={async (j) => { await commit(audit({ ...data, journal: [...data.journal, j] }, 'journal_added', [j.id], now)); setSheet(null); toast('Je notitie is privé opgeslagen.'); }}/></Modal>}
    {report && <PrintReport data={data} now={now} includeJournal={includeJournal} demo={demo}/>}
  </>;
}
function GoalForm({ data, ready, onSave }: {
    data: RhythmData;
    ready: boolean;
    onSave: (settings: RhythmData['settings']) => Promise<void>;
}) {
    const [bed, setBed] = useState(data.settings.goalBed), [wake, setWake] = useState(data.settings.goalWake), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { setBed(data.settings.goalBed); setWake(data.settings.goalWake); }, [data.settings.goalBed, data.settings.goalWake]);
    async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
        await onSave({ ...data.settings, goalBed: bed, goalWake: wake });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Opslaan is niet gelukt.');
    }
    finally {
        setBusy(false);
    } }
    return <form onSubmit={submit}><div className="form-grid"><label><span><Sunrise size={16}/>Gewenste dagstart</span><input id="goal-wake" type="time" value={wake} onChange={e => setWake(e.target.value)}/></label><label><span><Moon size={16}/>Gewenst naar bed</span><input type="time" value={bed} onChange={e => setBed(e.target.value)}/></label></div><FormError error={error}/><button className="button primary full" disabled={busy}>{busy ? 'Opslaan…' : ready ? 'Bewaar mijn dagankers' : 'Open eerst mijn dagboek'}<Check size={17}/></button></form>;
}
