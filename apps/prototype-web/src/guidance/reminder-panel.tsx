import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, BellOff, Pause, Send } from 'lucide-react';
import type { RhythmData } from '../../../../packages/domain/src/index';
import { reminderTimes, type ReminderKind, type ReminderTime } from '../../../../packages/rhythm-engine/src/guidance';
import { cloudClient, supabasePublishableKey, supabaseUrl } from '../cloud/client';
import { FormError } from '../forms';

type Device={id:string;session_id:string;timezone:string;schedule:ReminderTime[];paused_until:string|null;last_status:string;last_sent_at:string|null};
const names:Record<ReminderKind,string>={winddown:'Avondroutine',bed:'Gekozen bedtijd',wake:'Dagstart',checkin:'Check-in'};
const scheduleTime=(row:ReminderTime)=>row.anchorTime?`${row.leadMinutes} min vóór ${row.anchorTime}`:row.time;
const workerReady=()=>Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('De app is nog niet klaar voor meldingen. Herlaad en probeer opnieuw.')),12000))]);
export function ReminderPanel({data,session,demo,onAccount}:{data:RhythmData;session:Session|null;demo:boolean;onAccount:()=>void}) {
  const client=cloudClient(), userId=session?.user.id;
  let sessionId:string|undefined;try{sessionId=JSON.parse(atob(session!.access_token.split('.')[1]!.replace(/-/g,'+').replace(/_/g,'/'))).session_id;}catch{}
  const [consent,setConsent]=useState(false),[chosen,setChosen]=useState<ReminderKind[]>(['winddown','bed','wake','checkin']);
  const [device,setDevice]=useState<Device|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const owner=useRef(userId);owner.current=userId;
  const mounted=useRef(false), generation=useRef(0);
  const supported=typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&isSecureContext;
  const available=reminderTimes(data), schedule=available.filter(row=>chosen.includes(row.kind));
  useEffect(()=>{
    mounted.current=true;const epoch=++generation.current;setDevice(null);setConsent(false);setError('');setMessage('');setBusy(false);
    if(supported&&userId&&!demo)void workerReady().then(async sw=>{
      const sub=await sw.pushManager.getSubscription();if(!sub||generation.current!==epoch)return;
      const {data:row}=await client!.from('push_devices').select('id,session_id,timezone,schedule,paused_until,last_status,last_sent_at').eq('endpoint',sub.endpoint).maybeSingle();
      if(mounted.current&&generation.current===epoch&&row){setDevice(row as Device);setChosen((row as Device).schedule.map(s=>s.kind));}
    }).catch(()=>{});
    return ()=>{mounted.current=false;generation.current++;};
  },[userId,demo,supported,client]);
  async function action(task:(active:()=>boolean)=>Promise<void>) {
    const epoch=generation.current, started=userId;setBusy(true);setError('');setMessage('');
    const active=()=>mounted.current&&generation.current===epoch&&owner.current===started;
    try{if(!started||demo)throw new Error('Log eerst in op je account.');await task(active);}catch(e){if(active())setError(e instanceof Error?e.message:'Dit is niet gelukt.');}finally{if(active())setBusy(false);}
  }
  function enable(){
    // Request immediately in the click gesture, as required by iOS.
    const permission=Notification.requestPermission();
    void action(async active=>{
      if(await permission!=='granted')throw new Error('Meldingen zijn niet toegestaan. Je dagplan blijft gewoon werken.');
      const response=await fetch(`${supabaseUrl}/functions/v1/rhythm-reminders?action=key`,{headers:{apikey:supabasePublishableKey},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('De herinneringendienst is niet bereikbaar. Er zijn geen meldingen ingepland.');
      const config=await response.json();if(!active())return;
      const sw=await workerReady();if(!active())return;
      let sub=await sw.pushManager.getSubscription();
      if(!sub){const padded=config.publicKey.replace(/-/g,'+').replace(/_/g,'/');sub=await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(padded),c=>c.charCodeAt(0))});}
      if(!active())return;
      const values={subscription:sub.toJSON(),timezone:data.settings.timezone,schedule,paused_until:null};
      const query=device?client!.from('push_devices').update(values).eq('id',device.id):client!.from('push_devices').insert({...values,user_id:userId});
      const {data:row,error:failed}=await query.select('id,session_id,timezone,schedule,paused_until,last_status,last_sent_at').single();
      if(failed)throw new Error('Inplannen is niet gelukt. Controleer je login en verbinding. Is dit apparaat aan een ander account gekoppeld, verwijder dan eerst de browserkoppeling.');
      if(active()){setDevice(row as Device);setConsent(false);setMessage('Je herinneringen zijn ingepland. Verstuur een testmelding en controleer je toestel.');}
    });
  }
  const sessionChanged=device&&device.session_id!==sessionId;
  const mismatch=device&&(JSON.stringify(device.schedule)!==JSON.stringify(schedule)||device.timezone!==data.settings.timezone||sessionChanged);
  const paused=device?.paused_until&&Date.parse(device.paused_until)>Date.now();
  return <section className="panel reminder-panel" aria-label="Pushherinneringen"><div className="inline-label"><Bell size={19}/> Optioneel, ook als de app gesloten is</div><h2>Een seintje op jouw moment</h2>
    <p>Herinneringen volgen je bevestigde tijden. Ze bepalen niet wanneer je moet slapen en zijn geen systeemwekker.</p>
    {!supported&&<div className="notice">Deze browser biedt hier nog geen push. Op iPhone: voeg Rhythm toe aan je beginscherm en open het appicoon. Je dagplan werkt ook zonder meldingen.</div>}
    {demo?<p className="field-hint">De demo verstuurt geen meldingen.</p>:!session?<><p className="field-hint">Herinneringen beheren vraagt een actieve online sessie. Je registraties blijven offline beschikbaar.</p><button className="button secondary" onClick={onAccount}>Naar mijn account</button></>:<>
      {device&&<div className="reminder-status"><strong>{sessionChanged?'Bevestig opnieuw om herinneringen voor deze login te hervatten':paused?'24 uur gepauzeerd':device.last_status==='error'?'Bezorgen is niet gelukt; controleer je toestel':'Herinneringen ingepland op dit apparaat'}</strong><small>{device.schedule.map(row=>`${names[row.kind]} ${scheduleTime(row)}`).join(' · ')} · {device.timezone}</small>{mismatch&&<p>Je lokale plan, selectie of login is veranderd. Bevestig hieronder om het pushschema bij te werken.</p>}</div>}
      <div className="reminder-options">{available.map(row=><label key={row.kind}><input type="checkbox" checked={chosen.includes(row.kind)} onChange={e=>setChosen(e.target.checked?[...chosen,row.kind]:chosen.filter(kind=>kind!==row.kind))}/><span>{names[row.kind]} <strong>{scheduleTime(row)}</strong></span></label>)}</div>
      {!available.length&&<p className="field-hint">Stel eerst je dagankers of check-inmoment in en bewaar je plan.</p>}
      <label className="push-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Ik wil deze herinneringen. Mijn gekozen tijden, tijdzone en pushadres worden daarvoor apart op de server bewaard. Mijn registraties worden apart in mijn account opgeslagen.</span></label>
      <div className="reminder-actions"><button className="button primary" disabled={!supported||!consent||!schedule.length||busy} onClick={enable}><Bell size={17}/>{busy?'Bezig…':device?'Bevestig pushschema':'Zet herinneringen aan'}</button>
      {device&&<><button className="button secondary" disabled={busy} onClick={()=>void action(async active=>{const {error}=await client!.from('push_devices').update({paused_until:new Date(Date.now()+86400000).toISOString()}).eq('id',device.id);if(error)throw new Error('Pauzeren is niet gelukt.');if(active()){setDevice({...device,paused_until:new Date(Date.now()+86400000).toISOString()});setMessage('Herinneringen zijn 24 uur gepauzeerd op dit apparaat.');}})}><Pause size={16}/>24 uur pauze</button>
      <button className="button secondary" disabled={busy} onClick={()=>void action(async active=>{const {error}=await client!.functions.invoke('rhythm-reminders?action=test',{body:{id:device.id}});if(error)throw new Error('De test kon niet worden verstuurd. Probeer na een minuut opnieuw.');if(active())setMessage('Test verstuurd naar de pushdienst. Controleer of je toestel de melding toont.');})}><Send size={16}/>Testmelding</button>
      <button className="text-button" disabled={busy} onClick={()=>void action(async active=>{const {error}=await client!.from('push_devices').delete().eq('id',device.id);if(error)throw new Error('Uitzetten is niet gelukt. Probeer online opnieuw.');const sw=await workerReady();await(await sw.pushManager.getSubscription())?.unsubscribe();if(active()){setDevice(null);setMessage('Herinneringen op dit apparaat zijn uitgezet.');}})}><BellOff size={16}/>Zet uit op dit apparaat</button></>}
      {!device&&supported&&<button className="text-button" disabled={busy} onClick={()=>void action(async active=>{const sw=await workerReady();await(await sw.pushManager.getSubscription())?.unsubscribe();if(active())setMessage('Browserkoppeling verwijderd. Je kunt nu opnieuw toestemming geven.');})}>Verwijder oude browserkoppeling</button>}
      </div><p className="field-hint">Uitloggen stopt nieuwe verzendingen voor deze sessie. Je kunt toestemming ook bij je telefooninstellingen intrekken. Netwerk en Focus kunnen bezorging vertragen; controleer je testmelding. Tijden volgen de hierboven opgeslagen tijdzone, ook op reis.</p>
    </>}
    <FormError error={error}/>{message&&<p role="status">{message}</p>}
  </section>;
}
