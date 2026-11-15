import { describe,it,expect } from 'vitest';
import { emptyData,assertData } from '../packages/domain/src/index';
import { anchorAt,buildGuidance,defaultGuidance,reminderTimes } from '../packages/rhythm-engine/src/guidance';
import { daysEnding } from '../packages/rhythm-engine/src/index';
import { BrowserVault } from '../packages/storage/src/index';
import { exportJson } from '../packages/exports/src/index';
const now='2026-11-15T15:00:00Z';
describe('personal guidance',()=>{
  it('does not invent a bedtime when goals or reliable records are missing',()=>{
    const d=emptyData('Europe/Amsterdam'),result=buildGuidance(d,now);
    expect(result.events).toEqual([]);expect(result.insights.find(i=>i.id==='goals')).toBeDefined();expect(reminderTimes(d)).toEqual([]);
  });
  it('handles midnight, local DST gaps, and repeatable event identities',()=>{
    const d=emptyData('Europe/Amsterdam');d.settings.goalBed='00:15';d.settings.goalWake='07:30';d.guidance=defaultGuidance();
    expect(reminderTimes(d)).toContainEqual({kind:'winddown',time:'23:45',anchorTime:'00:15',leadMinutes:30});
    expect(anchorAt('2026-03-29','02:30','Europe/Amsterdam')).toBe('2026-03-29T01:30:00Z');
    expect(anchorAt('2026-10-25','02:30','Europe/Amsterdam')).toBe('2026-10-25T01:30:00Z');
    expect(buildGuidance(d,now).events).toEqual(buildGuidance(d,now).events);
    const event=buildGuidance(d,now).events.find(e=>e.kind==='winddown')!;
    expect(event.atUtc).toBe('2026-11-15T22:45:00Z');
  });
  it('keeps winddown a real thirty minutes before the bedtime across the spring clock change',()=>{
    const d=emptyData('Europe/Amsterdam');d.settings.goalBed='03:00';d.guidance=defaultGuidance();
    const events=buildGuidance(d,'2026-03-28T23:00:00Z').events;
    const winddown=events.find(e=>e.kind==='winddown')!,bed=events.find(e=>e.kind==='bed')!;
    expect(winddown.atUtc).toBe('2026-03-29T00:30:00Z');expect(Date.parse(bed.atUtc)-Date.parse(winddown.atUtc)).toBe(30*60000);
  });
  it('personalizes support from recent energy and explicit difficulty without prescribing sleep',()=>{
    const d=emptyData('UTC');d.guidance={...defaultGuidance(),feedback:[{id:'f',eventId:'bed:example',atUtc:now,outcome:'hard',reason:'not_sleepy'}]};
    d.checkins=[{id:'c',atUtc:now,energy:1,sleepiness:5}];
    const insights=buildGuidance(d,now).insights;
    expect(insights.find(i=>i.id==='energy')?.source).toContain('energie 1/5');expect(insights.find(i=>i.id==='feedback')?.text).toContain('geen opdracht');
    expect(buildGuidance({...d,checkins:[{...d.checkins[0]!,atUtc:'2026-11-13T12:00:00Z'}]},now).insights.some(i=>i.id==='energy')).toBe(false);
  });
  it('excludes guidance context from default exports and includes it only by explicit journal opt-in',()=>{
    const d=emptyData('UTC');d.guidance={...defaultGuidance(),commitments:[{id:'private',label:'PRIVATE-COMMITMENT',time:'09:00'}]};assertData(d);
    expect(exportJson(d)).not.toContain('PRIVATE-COMMITMENT');expect(exportJson(d,true)).toContain('PRIVATE-COMMITMENT');
  });
  it('rejects malformed coaching data and unsafe strings as enum values',()=>{
    for(const guidance of [{...defaultGuidance(),windDownMinutes:'30'},{...defaultGuidance(),commitments:[{id:'x',label:'x',time:'99:00'}]},{...defaultGuidance(),feedback:[{id:'x',atUtc:now,eventId:'bed:x',outcome:'force-sleep'}]}])expect(()=>assertData({...emptyData(),guidance})).toThrow();
  });
  it('keeps feedback attached to its occurrence and surfaces a conflicting commitment',()=>{
    const d=emptyData('UTC');d.settings.goalBed='23:00';d.guidance={...defaultGuidance(),commitments:[{id:'x',label:'Work',time:'23:30'}]};
    const event=buildGuidance(d,now).events.find(e=>e.kind==='bed')!;
    d.guidance.feedback=[{id:'f',eventId:event.id,atUtc:now,outcome:'done'}];
    expect(buildGuidance(d,now).events.find(e=>e.id===event.id)?.outcome).toBe('done');
    expect(buildGuidance(d,now).insights.some(i=>i.id==='commitment')).toBe(true);
  });
  it('recognizes a recorded shift across midnight without treating midnight as a 24-hour jump',()=>{
    const d=emptyData('UTC'),dates=daysEnding(now,'UTC',14);
    d.sessions=dates.map((date,i)=>{const startUtc=`${date}T${i<7?'23:00':'01:00'}:00Z`;return {id:`s${i}`,startUtc,endUtc:new Date(Date.parse(startUtc)+3600000).toISOString(),createdAtUtc:startUtc,updatedAtUtc:startUtc,source:'user_reported' as const,kind:'sleep' as const,originalTimezone:'UTC',reviewStatus:'confirmed' as const,interruptions:[],estimatedAwakeMinutes:0};});
    expect(buildGuidance(d,now).insights.find(i=>i.id==='shift')?.text).toContain('120 minuten');
    expect(buildGuidance(d,now).insights.find(i=>i.id==='shift')?.title).toContain('later');
  });
  it('does not present a stable shift when recorded starts are scattered around the whole day',()=>{
    const d=emptyData('UTC'),dates=daysEnding(now,'UTC',14);
    d.sessions=dates.map((date,i)=>{const startUtc=`${date}T${String([0,8,16][i%3]).padStart(2,'0')}:00:00Z`;return {id:`s${i}`,startUtc,endUtc:new Date(Date.parse(startUtc)+3600000).toISOString(),createdAtUtc:startUtc,updatedAtUtc:startUtc,source:'user_reported' as const,kind:'sleep' as const,originalTimezone:'UTC',reviewStatus:'confirmed' as const,interruptions:[],estimatedAwakeMinutes:0};});
    expect(buildGuidance(d,now).insights.some(i=>i.id==='shift')).toBe(false);
  });
  it('stores guidance encrypted and reads old schema-one vaults without guidance',async()=>{
    const values=new Map<string,string>();const storage:Storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,clear:()=>values.clear(),getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}};
    const vault=new BrowserVault(storage);await vault.unlock('guidance-test-password');const d=emptyData('UTC');await vault.save(d);
    expect(await new BrowserVault(storage).unlock('guidance-test-password')).toEqual(d);
    d.guidance={...defaultGuidance(),commitments:[{id:'x',label:'PRIVATE-PLAN',time:'09:00'}]};await vault.save(d);
    expect(vault.encrypted()).not.toContain('PRIVATE-PLAN');expect(await new BrowserVault(storage).unlock('guidance-test-password')).toEqual(d);
  });
});
