import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, Compass, Moon, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { GuidanceFeedback, RhythmData } from '../../../../packages/domain/src/index';
import { buildGuidance, defaultGuidance, type PlanEvent } from '../../../../packages/rhythm-engine/src/guidance';
import { audit } from '../../../../packages/storage/src/index';
import { dateLabel, Modal, timeLabel } from '../components';
import { FormError } from '../forms';

interface Props { data:RhythmData; now:string; compact?:boolean; saving:boolean; onSave:(data:RhythmData)=>Promise<void>; onConfigure:()=>void; onCheckin:()=>void; onReview:()=>void }
export function GuidancePanel({data,now,compact=false,saving,onSave,onConfigure,onCheckin,onReview}:Props) {
  const {events,insights}=buildGuidance(data,now), g=data.guidance??defaultGuidance();
  const [selected,setSelected]=useState<PlanEvent|null>(null),[reason,setReason]=useState<GuidanceFeedback['reason']>('busy'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const visible=compact?events.filter(e=>!e.outcome).slice(0,3):events;
  async function respond(event:PlanEvent,outcome:GuidanceFeedback['outcome']) {
    setBusy(true);setError('');
    try {
      const f:GuidanceFeedback={id:crypto.randomUUID(),atUtc:new Date().toISOString(),eventId:event.id,outcome,...(outcome==='hard'?{reason}:{})};
      await onSave(audit({...data,guidance:{...g,feedback:[...g.feedback.filter(item=>item.eventId!==event.id),f]}},'guidance_feedback',[f.id],f.atUtc));setSelected(null);
    } catch(e){setError(e instanceof Error?e.message:'Je reactie kon niet worden bewaard.');}finally{setBusy(false);}
  }
  return <section className="panel guidance-panel" aria-label="Persoonlijke begeleiding">
    <div className="section-heading"><div><span className="eyebrow"><Compass size={15}/> Jouw volgende stap</span><h2>Een haalbaar plan voor jou</h2></div>{compact&&<button className="text-button" onClick={onConfigure}>Mijn plan <ArrowRight size={16}/></button>}</div>
    <p className="muted">Jouw gekozen tijden en recente registraties geven richting. Je mag je plan altijd aanpassen.</p>
    {data.intent&&<div className="notice"><Moon size={20}/><span>Er loopt een rustmoment. Je hoeft nu geen dagplan af te werken. Leg na afloop vast wat er werkelijk gebeurde.</span></div>}
    <div className="guidance-layout"><div className="plan-timeline">
      {!visible.length&&<div className="plan-empty"><p>{events.length?'Je hebt op alle zichtbare momenten gereageerd.':'Kies je dagstart, bedtijd of een vast moment om je plan te vullen.'}</p><button className="button secondary" onClick={onConfigure}>Mijn plan aanpassen</button></div>}
      {visible.map(event=><article className={`plan-event ${event.outcome?'responded':''}`} key={event.id}>
        <div className="plan-time"><strong>{timeLabel(event.atUtc,data.settings.timezone)}</strong><small>{dateLabel(event.atUtc,data.settings.timezone)}</small></div>
        <div className="plan-content"><h3>{event.label}</h3><details className="plan-why"><summary>Waarom dit moment?</summary><p>{event.explanation}</p></details>
          {event.outcome?<span className="plan-response"><Check size={15}/>{event.outcome==='done'?'Gelukt':event.outcome==='hard'?'Lukte niet · meegenomen in je begeleiding':'Overgeslagen'}</span>:<div className="plan-actions"><button type="button" className="text-button" disabled={busy||saving} onClick={()=>void respond(event,'done')}>Gelukt</button><button type="button" className="text-button" disabled={busy||saving} onClick={()=>{setError('');setReason('busy');setSelected(event);}}>Lukt niet</button><button type="button" className="text-button" disabled={busy||saving} onClick={()=>void respond(event,'skip')}>Overslaan</button></div>}
        </div>
      </article>)}
    </div><div className="guidance-insights">{insights.slice(0,compact?2:4).map(insight=><article className="guidance-insight" key={insight.id}>
      <span className="inline-label"><Sparkles size={16}/> Gebaseerd op jouw gegevens</span><h3>{insight.title}</h3><p>{insight.text}</p>
      <details><summary>Waarom zie ik dit? <ChevronDown size={15}/></summary><p>{insight.source}</p><p>Zelfrapportage geeft context, geen diagnose of bewezen beste slaaptijd.</p></details>
      <button className="text-button" onClick={insight.action==='settings'?onConfigure:insight.action==='checkin'?onCheckin:onReview}>{insight.action==='settings'?'Mijn plan aanpassen':insight.action==='checkin'?'Hoe gaat het nu?':'Bekijk mijn registraties'}<ArrowRight size={15}/></button>
    </article>)}</div></div>
    <FormError error={selected?'':error}/>
    {!compact&&<GuidanceSettings data={data} saving={saving} onSave={onSave}/>}
    {selected&&<Modal title="Wat maakt het lastig?" onClose={()=>{setSelected(null);setError('');}}><form onSubmit={e=>{e.preventDefault();void respond(selected,'hard');}}>
      <p>Je hoeft deze afspraak niet te halen. Je reactie helpt je volgende stap kleiner of passender te maken.</p>
      <label>Wat speelt er?<select value={reason} onChange={e=>setReason(e.target.value as GuidanceFeedback['reason'])}><option value="busy">Mijn dag liep anders</option><option value="not_sleepy">Ik ben nog niet slaperig</option><option value="very_tired">Ik ben juist erg moe</option><option value="other">Iets anders</option></select></label>
      <FormError error={error}/><button className="button primary full" disabled={busy||saving}>{busy?'Bewaren…':'Neem dit mee in mijn plan'}</button>
    </form></Modal>}
  </section>;
}
function GuidanceSettings({data,saving,onSave}:Pick<Props,'data'|'saving'|'onSave'>) {
  const g=data.guidance??defaultGuidance();
  const [minutes,setMinutes]=useState(g.windDownMinutes),[checkin,setCheckin]=useState(g.checkinTime),[items,setItems]=useState(g.commitments),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  useEffect(()=>{const next=data.guidance??defaultGuidance();setMinutes(next.windDownMinutes);setCheckin(next.checkinTime);setItems(next.commitments);},[data.guidance?.windDownMinutes,data.guidance?.checkinTime,data.guidance?.commitments]);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setSaved(false);try{await onSave(audit({...data,guidance:{...g,windDownMinutes:minutes,checkinTime:checkin,commitments:items}},'guidance_plan_updated',[],new Date().toISOString()));setSaved(true);}catch(e){setError(e instanceof Error?e.message:'Bewaren is niet gelukt.');}finally{setBusy(false);}}
  return <details className="guidance-settings"><summary>Mijn routine en vaste momenten</summary><form onSubmit={submit}>
    <div className="form-grid"><label>Begin avondroutine<select value={minutes} onChange={e=>{setSaved(false);setMinutes(Number(e.target.value));}}>{[15,30,60].map(n=><option key={n} value={n}>{n} minuten vóór mijn gekozen bedtijd</option>)}</select></label><label>Dagelijkse check-in<input type="time" value={checkin} onChange={e=>{setSaved(false);setCheckin(e.target.value);}}/></label></div>
    <p className="field-hint">Kies zelf een rustig moment voor je routine. Leeg laten zet de check-in uit. Bedtijd en dagstart stel je bij je dagankers in.</p>
    <h3>Vaste momenten in mijn dag</h3><p className="field-hint">Bijvoorbeeld werk of een afspraak. Deze blijven in je accountdagboek en krijgen geen pushmelding.</p>
    {items.map((item,i)=><div className="commitment-row" key={item.id}><label>Omschrijving {i+1}<input maxLength={80} required value={item.label} onChange={e=>{setSaved(false);setItems(items.map(v=>v.id===item.id?{...v,label:e.target.value}:v));}}/></label><label>Tijdstip {i+1}<input type="time" required value={item.time} onChange={e=>{setSaved(false);setItems(items.map(v=>v.id===item.id?{...v,time:e.target.value}:v));}}/></label><button className="icon-button" type="button" aria-label={`Vast moment ${i+1} verwijderen`} onClick={()=>{setSaved(false);setItems(items.filter(v=>v.id!==item.id));}}><Trash2 size={18}/></button></div>)}
    <button className="text-button" type="button" disabled={items.length>=8} onClick={()=>{setSaved(false);setItems([...items,{id:crypto.randomUUID(),label:'',time:'09:00'}]);}}><Plus size={16}/>Vast moment toevoegen</button>
    <FormError error={error}/>{saved&&<p role="status">Je routine is bewaard. Werk je pushschema hieronder apart bij als je tijden zijn veranderd.</p>}<button className="button primary full" disabled={saving||busy}>{busy?'Bewaren…':'Bewaar mijn routine'}</button>
  </form></details>;
}
