import { Temporal } from '@js-temporal/polyfill';
import type { GuidancePreferences, RhythmData } from '../../domain/src/index';
import { dayRange, daysEnding, overlap, sessionMinutes } from './index';

export const defaultGuidance = (): GuidancePreferences => ({ windDownMinutes:30, checkinTime:'', commitments:[], feedback:[] });
export type ReminderKind = 'winddown' | 'bed' | 'wake' | 'checkin';
export interface ReminderTime {kind:ReminderKind;time:string;anchorTime?:string;leadMinutes?:number}
export interface PlanEvent { id:string; kind:ReminderKind|'commitment'; atUtc:string; label:string; explanation:string; outcome?:'done'|'hard'|'skip' }
export interface Insight { id:string; title:string; text:string; source:string; action:'checkin'|'settings'|'review' }
export function anchorAt(date:string,time:string,timezone:string):string {
  return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timezone,{disambiguation:'later'}).toInstant().toString();
}
export function reminderTimes(data:RhythmData):ReminderTime[] {
  const g=data.guidance??defaultGuidance(), rows:ReminderTime[]=[];
  if(data.settings.goalBed) {
    rows.push({kind:'winddown',time:Temporal.PlainTime.from(data.settings.goalBed).subtract({minutes:g.windDownMinutes}).toString({smallestUnit:'minute'}),anchorTime:data.settings.goalBed,leadMinutes:g.windDownMinutes});
    rows.push({kind:'bed',time:data.settings.goalBed});
  }
  if(data.settings.goalWake)rows.push({kind:'wake',time:data.settings.goalWake});
  if(g.checkinTime)rows.push({kind:'checkin',time:g.checkinTime});
  return rows;
}
const labels:Record<ReminderKind,string>={winddown:'Ruimte voor je avondroutine',bed:'Jouw gekozen bedtijd',wake:'Jouw gekozen dagstart',checkin:'Even bij jezelf inchecken'};
export function buildGuidance(data:RhythmData,now:string):{events:PlanEvent[];insights:Insight[];registeredDays:number} {
  const g=data.guidance??defaultGuidance(), tz=data.settings.timezone;
  const today=Temporal.Instant.from(now).toZonedDateTimeISO(tz).toPlainDate();
  const dateRange=[-1,0,1].map(n=>today.add({days:n}).toString());
  const from=Date.parse(now)-4*3600000, until=Date.parse(now)+24*3600000;
  const events:PlanEvent[]=[];
  for(const date of dateRange) {
    for(const row of reminderTimes(data)) {
      const atUtc=Temporal.Instant.from(anchorAt(date,row.anchorTime??row.time,tz)).subtract({minutes:row.leadMinutes??0}).toString(), id=`${row.kind}:${atUtc}`;
      if(Date.parse(atUtc)<from || Date.parse(atUtc)>until)continue;
      events.push({id,kind:row.kind,atUtc,label:labels[row.kind],explanation:row.kind==='winddown'?`${g.windDownMinutes} minuten vóór je eigen bedtijd. Een herinnering aan je routine; geen verplichting om te slapen.`:'Gebaseerd op jouw bevestigde tijd. Je kunt je plan aanpassen.',outcome:g.feedback.find(f=>f.eventId===id)?.outcome});
    }
    for(const item of g.commitments) {
      const atUtc=anchorAt(date,item.time,tz), id=`commitment:${item.id}:${atUtc}`;
      if(Date.parse(atUtc)>=from&&Date.parse(atUtc)<=until)events.push({id,kind:'commitment',atUtc,label:item.label,explanation:'Door jou toegevoegd vast moment. Alleen in je dagplan, zonder push.',outcome:g.feedback.find(f=>f.eventId===id)?.outcome});
    }
  }
  events.sort((a,b)=>Date.parse(a.atUtc)-Date.parse(b.atUtc));
  const days=daysEnding(now,tz,14), registeredDays=days.filter(date=>data.sessions.some(s=>overlap(s,dayRange(date,tz)))).length;
  const insights:Insight[]=[];
  const check=[...data.checkins].filter(c=>Date.parse(c.atUtc)<=Date.parse(now)&&Date.parse(c.atUtc)>Date.parse(now)-86400000).sort((a,b)=>Date.parse(b.atUtc)-Date.parse(a.atUtc))[0];
  if(check&&(check.energy<=2||check.sleepiness>=4))insights.push({id:'energy',title:'Maak je plan vandaag haalbaar',text:'Je meldt weinig energie of veel slaperigheid. Kies één klein moment, geef aan wat niet lukt en pas je herinneringen aan. Je hoeft je plan niet af te maken.',source:`Laatste check-in: energie ${check.energy}/5, slaperigheid ${check.sleepiness}/5.`,action:'checkin'});
  const difficult=g.feedback.filter(f=>f.outcome==='hard'&&Date.parse(f.atUtc)>Date.parse(now)-7*86400000&&Date.parse(f.atUtc)<=Date.parse(now));
  if(difficult.length) {
    const last=difficult.at(-1)!;
    const text=last.reason==='not_sleepy'?'Je gaf aan nog niet slaperig te zijn. Een gekozen bedtijd is geen opdracht om slaap af te dwingen. Bekijk je doel en leg vast wat er werkelijk gebeurt.':last.reason==='very_tired'?'Je gaf aan erg moe te zijn. Maak je routine kleiner en zet herinneringen zo nodig tijdelijk uit; je hoeft geen vaste tijd te halen.':'Je plan bleek lastig. Maak één afspraak kleiner of pas een gekozen tijd aan. Je oorspronkelijke registraties blijven behouden.';
    insights.push({id:'feedback',title:'Je plan mag meebewegen',text,source:`${difficult.length} keer “Lukt niet” in de afgelopen 7 dagen; gebaseerd op jouw reactie.`,action:'settings'});
  }
  // Compare the longest recorded block per local start date; do not infer missing sleep or diagnoses.
  const longest=(dates:string[])=>dates.flatMap(date=>{
    const sessions=data.sessions.filter(s=>Temporal.Instant.from(s.startUtc).toZonedDateTimeISO(tz).toPlainDate().toString()===date&&Date.parse(s.endUtc)<=Date.parse(now));
    const s=sessions.sort((a,b)=>sessionMinutes(b)-sessionMinutes(a))[0];
    if(!s)return [];
    const local=Temporal.Instant.from(s.startUtc).toZonedDateTimeISO(tz);return [local.hour*60+local.minute];
  });
  const recent=longest(days.slice(-7)), before=longest(days.slice(0,7));
  const circular=(x:number,ref:number)=>((x-ref+2160)%1440)-720;
  const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]!;};
  const clustered=(values:number[],ref:number)=>{const offsets=values.map(n=>circular(n,ref));return offsets.length>=3&&Math.max(...offsets)-Math.min(...offsets)<=360;};
  if(data.settings.goalBed&&recent.length>=3&&clustered(recent,recent[0]!)) {
    const [hour,minute]=data.settings.goalBed.split(':').map(Number), goal=hour!*60+minute!;
    const gap=median(recent.map(n=>circular(n,goal)));
    if(Math.abs(gap)>=90&&Math.abs(gap)<720)insights.push({id:'goal-gap',title:'Je doel en je registraties liggen uit elkaar',text:`Het langste geregistreerde blok per dag begon deze week meestal ongeveer ${Math.round(Math.abs(gap))} minuten ${gap>0?'na':'vóór'} je gekozen bedtijd. Bekijk of je doel haalbaar voelt en leg wakker liggen apart vast. Dit is geen voorstel om je slaap met dat verschil te verschuiven.`,source:`Eigen bedtijd ${data.settings.goalBed}; ${recent.length} geregistreerde dagen in de afgelopen 7 dagen.`,action:'settings'});
  }
  if(data.settings.goalBed) {
    const [h,m]=data.settings.goalBed.split(':').map(Number), bed=h!*60+m!;
    const conflicting=g.commitments.find(item=>{const [ch,cm]=item.time.split(':').map(Number);return Math.abs(circular(ch!*60+cm!,bed))<120;});
    if(conflicting)insights.push({id:'commitment',title:'Een vast moment ligt dicht bij je bedtijd',text:`“${conflicting.label}” staat om ${conflicting.time}, binnen twee uur van je gekozen bedtijd. Bekijk of deze afspraken samen haalbaar zijn; Rhythm verandert ze niet automatisch.`,source:'Gebaseerd op je eigen tijden, zonder aanname over de duur van je afspraak.',action:'settings'});
  }
  if(recent.length>=3&&before.length>=3&&clustered(recent,before[0]!)&&clustered(before,before[0]!)) {
    const ref=before[0]!, shift=median(recent.map(n=>circular(n,ref)))-median(before.map(n=>circular(n,ref)));
    if(Math.abs(shift)>=60&&Math.abs(shift)<720)insights.push({id:'shift',title:`Je geregistreerde slaap begint ${shift>0?'later':'eerder'}`,text:`De middelste begintijd van je langste geregistreerde blok per dag verschilt ongeveer ${Math.round(Math.abs(shift))} minuten tussen deze en de vorige 7 dagen. Bekijk de blokken voordat je je plan verandert. Dit vertelt niet wat de oorzaak is.`,source:`${recent.length} en ${before.length} dagen met een geregistreerd blok; ontbrekende dagen zijn onbekend.`,action:'review'});
  }
  if(!data.settings.goalBed&&!data.settings.goalWake)insights.push({id:'goals',title:'Kies een plan dat bij je dag past',text:'Kies eerst je eigen streeftijden en vaste momenten. Rhythm gebruikt die voor je dagplan; uit deze logs kunnen we geen optimale slaaptijd bepalen.',source:'Er zijn nog geen eigen dagankers ingesteld.',action:'settings'});
  if(!insights.length||registeredDays<7)insights.push({id:'coverage',title:'Een eerlijk beeld begint bij jouw registraties',text:'Leg ook slaap overdag en wakker liggen vast. Onvolledige dagen blijven onbekend; een leeg stuk in de grafiek betekent niet dat je wakker was.',source:`${registeredDays} van de afgelopen 14 dagen bevatten een slaapblok; dit zegt niet of die dagen volledig zijn.`,action:'review'});
  return {events,insights,registeredDays};
}
