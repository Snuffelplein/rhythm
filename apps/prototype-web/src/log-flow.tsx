import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Moon, Zap, BookOpen } from 'lucide-react';
import type { CheckIn, JournalEntry, RhythmData, SleepSession } from '../../../packages/domain/src/index';
import { CheckinForm, JournalForm, SessionForm } from './forms';
import { durationLabel, sessionMinutes } from '../../../packages/rhythm-engine/src/index';

export function LogFlow({ data, now, onSession, onCheckin, onJournal, onClose }: {
  data: RhythmData; now: string;
  onSession: (session: SleepSession) => Promise<void>;
  onCheckin: (checkin: CheckIn) => Promise<void>;
  onJournal: (entry: JournalEntry) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [session, setSession] = useState<SleepSession | null>(null);
  const [hasCheckin, setHasCheckin] = useState(false);
  const [hasJournal, setHasJournal] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return <div className="log-flow">
    <ol className="flow-steps" aria-label="Stappen slaapregistratie">
      {['Slaapblok', 'Hoe voel je je?', 'Dagboek'].map((label, index) =>
        <li key={label} aria-current={step === index ? 'step' : undefined} className={step > index ? 'passed' : step === index ? 'current' : ''}>
          <span>{step > index ? <Check size={13} /> : index + 1}</span>{label}
        </li>)}
    </ol>
    <div ref={heading} tabIndex={-1} className="flow-stage-heading" aria-live="polite">
      <h3>{['Wanneer heb je geslapen?', 'Hoe voel je je nu?', 'Wil je nog iets kwijt?', 'Je registratie staat klaar.'][step]}</h3>
      {step > 0 && step < 3 && <p><Check size={14} /> Je slaapblok is al veilig bewaard. Deze stap is optioneel.</p>}
    </div>
    <div className="flow-stage-content" key={step}>
    {step === 0 && <SessionForm data={data} now={now} onCancel={onClose}
      onSave={async value => { await onSession(value); setSession(value); setStep(1); }}
      onRemove={async () => {}} onTransform={async () => {}} submitLabel="Bewaar slaapblok en ga verder" />}
    {step === 1 && <CheckinForm now={new Date().toISOString()} timezone={data.settings.timezone}
      submitLabel="Bewaar en ga naar dagboek" onSkip={() => setStep(2)}
      onSave={async value => { await onCheckin({ ...value, sleepSessionId: session!.id }); setHasCheckin(true); setStep(2); }} />}
    {step === 2 && <JournalForm now={new Date().toISOString()} submitLabel="Bewaar en rond af" onSkip={() => setStep(3)}
      onSave={async value => { await onJournal({ ...value, sleepSessionId: session!.id }); setHasJournal(true); setStep(3); }} />}
    {step === 3 && <div className="flow-complete">
      <span className="complete-icon"><Check size={27} /></span>
      <p>Alles wat je hebt ingevuld, is opgeslagen. Je kunt het later terugvinden en aanpassen.</p>
      <ul><li><Moon size={17} /> Slaapblok <strong>{session && durationLabel(sessionMinutes(session))}</strong></li>
        <li><Zap size={17} /> Energie & slaperigheid <strong>{hasCheckin ? 'Bewaard' : 'Overgeslagen'}</strong></li>
        <li><BookOpen size={17} /> Dagboek <strong>{hasJournal ? 'Privé bewaard' : 'Overgeslagen'}</strong></li></ul>
      <button className="button primary full" onClick={onClose}>Klaar <ArrowRight size={17} /></button>
    </div>}
    </div>
  </div>;
}
