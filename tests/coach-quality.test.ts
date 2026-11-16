import {describe,it,expect} from 'vitest';
import {emptyData} from '../packages/domain/src/index';
import {currentCoaching,emptyCoaching,newUserMessage,buildCoachContext,validateCoachReply,normalizeCoachReply,displayCoachQuestion,type CoachReply,type CoachMessage} from '../packages/coaching/src/core';
import {coachQualityFixture} from '../packages/coaching/src/quality-fixtures';
import {generateCoachAnswer} from '../supabase/functions/rhythm-coach/generate';
const at='2026-11-16T12:00:00.000Z';
const reply=():CoachReply=>({type:'support',message:'Ga naar buiten en kies een rustige, afgebakende bezigheid. Neem een pauze als je merkt dat je gaat indommelen.',question:'',claims:[],plan:null});
describe('coach quality regressions',()=>{
 it('allows practical, conditional support and a bounded explanation without a broad word blacklist',async()=>{const f=await coachQualityFixture(1,at),c=await buildCoachContext(f.data,f.requestId,at);validateCoachReply(reply(),c);validateCoachReply({...reply(),message:'Ik stel geen slaapstoornis vast. Ik adviseer geen slaaprestrictie of medicijndosering; gewone daglichtblootstelling en een rustige bezigheid kunnen wel.'},c);for(const message of ['Je hebt narcolepsie.','Blijf wakker tot je morgen weer naar bed mag.','Neem melatonine.','Volg slaaprestrictie.','Neem 5 mg.'])expect(()=>validateCoachReply({...reply(),message},c)).toThrow();});
 it('allows a correctly cited chosen anchor but rejects an invented or uncited number',async()=>{const f=await coachQualityFixture(1,at),c=await buildCoachContext(f.data,f.requestId,at);const r={...reply(),message:'Je gekozen avondanker is 22:30; het is geen verplichting.',claims:[{sourceId:'anchors:chosen',field:'bed',value:'22:30'}]};validateCoachReply(r,c);expect(()=>validateCoachReply({...r,claims:[]},c)).toThrow();expect(()=>validateCoachReply({...r,message:'Je slaapt gemiddeld 8 uur.'},c)).toThrow();});
 it('does not render or feed back the same question twice',()=>{const r={...reply(),message:'Welke taak wil je afronden?',question:'Welke taak wil je afronden?'};expect(normalizeCoachReply(r).question).toBe('');expect(displayCoachQuestion(r.message,r.question)).toBe('');expect(displayCoachQuestion('Een concrete stap.','Wanneer sliep je voor het laatst?')).toBe('Wanneer sliep je voor het laatst?');});
 it('keeps the opening need through a long thread and includes separate assistant questions',async()=>{
  const data={...emptyData(),coaching:emptyCoaching()},thread=crypto.randomUUID();
  const first=newUserMessage(thread,'Mijn oorspronkelijke doel is mijn dag weer oppakken.','talk',at);data.coaching.messages=[first];const context=await buildCoachContext(data,first.id,at);
  for(let i=1;i<25;i++){const time=new Date(Date.parse(at)+i*1000).toISOString();data.coaching.messages.push(newUserMessage(thread,'Vervolg '+i,'talk',time));}
  const assistant:CoachMessage={id:crypto.randomUUID(),threadId:thread,atUtc:'2026-11-16T12:00:25Z',role:'assistant',text:'Hier is een stap.',focus:'talk',requestId:first.id,origin:'gpt',reply:{...reply(),question:'Wanneer sliep je voor het laatst?'},context};data.coaching.messages.push(assistant);
  const last=newUserMessage(thread,'Ga hiermee verder.','talk','2026-11-16T12:00:26Z');data.coaching.messages.push(last);const c=await buildCoachContext(data,last.id,last.atUtc);expect(c.history.length).toBeLessThanOrEqual(20);expect(c.history[0]!.text).toBe(first.text);expect(c.history.some(m=>m.text.includes('Wanneer sliep je voor het laatst?'))).toBe(true);
 });
 it('keeps the full current question without exceeding individual source-field limits',async()=>{const data={...emptyData(),coaching:emptyCoaching()},m=newUserMessage(crypto.randomUUID(),'x'.repeat(3995)+'EINDE','talk',at);data.coaching.messages=[m];const c=await buildCoachContext(data,m.id,at),s=c.sources.find(s=>s.kind==='request')!;expect(s.fields.text!+s.fields.continuation!).toBe(m.text);});
 it('sends actual chronological messages and the current user question last, with no pricier model change',async()=>{
  const f=await coachQualityFixture(0,at),c=await buildCoachContext(f.data,f.requestId,at);let body:any;
  const network:typeof fetch=async(_url,init)=>{body=JSON.parse(String(init!.body));return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply())}]}]});};
  await generateCoachAnswer(c,{get:name=>name==='OPENAI_API_KEY'?'synthetic-key':undefined},network);
  expect(body.model).toBe('gpt-6-luna');expect(body.input.at(-1).role).toBe('user');expect(body.input.at(-1).content).toBe(currentCoaching(f.data).messages.at(-1)!.text);expect(body.input.some((m:any)=>m.role==='assistant'&&m.content.includes('Wil je dat'))).toBe(true);expect(body.store).toBe(false);expect(body.max_output_tokens).toBe(2200);
 });
});
