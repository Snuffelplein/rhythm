import type { CoachingData,CoachReply,CoachContext } from './types.ts';
const fail=():never=>{throw new Error('Ongeldige begeleidingsgegevens. Je eerdere gegevens zijn behouden.');};
function obj(v:unknown,keys:string[]):Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail();return v as Record<string,any>;}
function txt(v:unknown,max=500,empty=false){if(typeof v!=='string'||v.length>max||!empty&&!v.trim())fail();}
function date(v:unknown,empty=false){if(empty&&v==='')return;txt(v,40);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(v as string)||(!Number.isFinite(Date.parse(v as string))||new Date(v as string).toISOString().slice(0,10)!==(v as string).slice(0,10)))fail();}
function arr(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)fail();return v as any[];}
function entities(v:unknown,max:number,check:(x:any)=>void){const ids=new Set<string>();for(const x of arr(v,max)){txt(x?.id,128);if(ids.has(x.id))fail();ids.add(x.id);check(x);}}
function one(v:unknown,choices:unknown[]){if(!choices.includes(v))fail();}
function bool(v:unknown){if(typeof v!=='boolean')fail();}
const focus=(v:unknown)=>one(v,['talk','today','plan','review']);
function steps(value:unknown){entities(value,5,x=>{const s=obj(x,['id','kind','title','timeLocal','optional','sourceIds']);one(s.kind,['checkin','reflection','preparation','user_activity']);txt(s.title,160);if(typeof s.timeLocal!=='string'||s.timeLocal!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.timeLocal))fail();bool(s.optional);for(const id of arr(s.sourceIds,12))txt(id,128);});}
export function assertCoachReply(v:unknown):asserts v is CoachReply{
 const r=obj(v,['type','message','question','claims','plan']);one(r.type,['support','question','plan']);txt(r.message,2400);txt(r.question,500,true);
 for(const claim of arr(r.claims,8)){const c=obj(claim,['sourceId','field','value']);txt(c.sourceId,128);txt(c.field,80);txt(c.value,2000,true);}
 if(r.plan!==null){const p=obj(r.plan,['title','goal','scope','steps']);txt(p.title,120);txt(p.goal,400);one(p.scope,['today','daily']);steps(p.steps);if(!p.steps.length||r.type!=='plan')fail();}else if(r.type==='plan')fail();
}
export function assertCoachContext(v:unknown):asserts v is CoachContext{
 const c=obj(v,['version','stamp','asOfUtc','timezone','requestId','focus','sources','history','coverage','activePlanId','limitations']);if(c.version!==1)fail();txt(c.stamp,64);if(!/^[a-f0-9]{64}$/.test(c.stamp))fail();date(c.asOfUtc);txt(c.timezone,128);try{new Intl.DateTimeFormat('nl',{timeZone:c.timezone}).format(0);}catch{fail();}txt(c.requestId,128);focus(c.focus);
 entities(c.sources,160,s=>{obj(s,['id','kind','label','atUtc','fields']);txt(s.kind,40);txt(s.label,160);date(s.atUtc,true);if(!s.fields||typeof s.fields!=='object'||Array.isArray(s.fields)||Object.keys(s.fields).length>16)fail();for(const [k,v]of Object.entries(s.fields)){txt(k,80);txt(v,2000,true);}});
 for(const h of arr(c.history,20)){obj(h,['role','text','atUtc']);one(h.role,['user','assistant']);txt(h.text,4000);date(h.atUtc);}
 const coverage=obj(c.coverage,['sleepRecords','checkins','firstRecordUtc','recentRegisteredDays','windowDays','incomplete']);for(const key of ['sleepRecords','checkins','recentRegisteredDays','windowDays'])if(!Number.isInteger(coverage[key])||coverage[key]<0||coverage[key]>50000)fail();if(coverage.incomplete!==true)fail();if(coverage.firstRecordUtc!==null)date(coverage.firstRecordUtc);if(c.activePlanId!==null)txt(c.activePlanId,128);for(const l of arr(c.limitations,8))txt(l,400);
}
export function assertCoaching(v:unknown):asserts v is CoachingData{
 const c=obj(v,['version','consent','memories','messages','plans','activePlanId','feedback','forgotten']);if(c.version!==1)fail();const consent=obj(c.consent,['enabled','journal','atUtc','version']);bool(consent.enabled);bool(consent.journal);date(consent.atUtc,!consent.enabled);if(consent.version!==1)fail();
 entities(c.memories,100,m=>{obj(m,['id','revision','kind','value','atUtc','sourceMessageId']);if(!Number.isSafeInteger(m.revision)||m.revision<1)fail();one(m.kind,['goal','preference','constraint','experience']);txt(m.value,800);date(m.atUtc);if(m.sourceMessageId!==null)txt(m.sourceMessageId,128);});
 entities(c.messages,5000,m=>{obj(m,['id','threadId','atUtc','role','text','focus','requestId','origin','reply','context']);txt(m.threadId,128);date(m.atUtc);one(m.role,['user','assistant']);txt(m.text,4000);focus(m.focus);if(m.requestId!==null)txt(m.requestId,128);one(m.origin,['user','local','gpt']);if(m.role==='user'&&(m.origin!=='user'||m.reply!==null||m.context!==null))fail();if(m.reply!==null)assertCoachReply(m.reply);if(m.context!==null)assertCoachContext(m.context);});
 entities(c.plans,500,p=>{obj(p,['id','atUtc','basedOn','title','goal','scope','localDate','steps','sourceMessageId','sourceStamp']);date(p.atUtc);if(typeof p.localDate!=='string'||!/^\d{4}-\d\d-\d\d$/.test(p.localDate))fail();if(p.basedOn!==null)txt(p.basedOn,128);txt(p.title,120);txt(p.goal,400);one(p.scope,['today','daily']);steps(p.steps);if(!p.steps.length)fail();txt(p.sourceMessageId,128);txt(p.sourceStamp,64);if(!/^[a-f0-9]{64}$/.test(p.sourceStamp))fail();});
 if(c.activePlanId!==null){txt(c.activePlanId,128);if(!c.plans.some((p:any)=>p.id===c.activePlanId))fail();}
 entities(c.feedback,10000,f=>{obj(f,['id','planId','stepId','localDate','outcome','atUtc']);txt(f.planId,128);txt(f.stepId,128);txt(f.localDate,10);if(!/^\d{4}-\d\d-\d\d$/.test(f.localDate)||!Number.isFinite(Date.parse(f.localDate)))fail();one(f.outcome,['done','hard','skip']);date(f.atUtc);});
 entities(c.forgotten,10000,f=>{obj(f,['id','kind','targetId','atUtc','sourceMessageId']);if(f.sourceMessageId!==undefined)txt(f.sourceMessageId,128);one(f.kind,['memory','thread']);txt(f.targetId,128);date(f.atUtc);});
}
