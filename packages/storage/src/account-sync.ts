import { assertData, emptyData, type RhythmData } from '../../domain/src/index';
import { CacheChanged, type AccountCache, type AccountSnapshot } from './account-cache';

export interface AccountRemoteRow {data:RhythmData;revision:number;changeId:string;updatedAt:string}
export interface AccountRemote {
  read():Promise<AccountRemoteRow|null>;
  prepare(data:RhythmData):Promise<RhythmData>;
  write(data:RhythmData,revision:number|null,head:string|null,changeId:string):Promise<AccountRemoteRow|null>;
  recover(data:RhythmData,id:string):Promise<void>;
}
export class AccountConflict extends Error {constructor(){super('Een registratie is ook op een ander apparaat aangepast. Je eigen invoer is bewaard. Er wordt niets overschreven; probeer je herstelpunt of download eerst een kopie.');}}
export const stable=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)??'undefined';
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
export function wireData(data:RhythmData):RhythmData {
  return {...data,journal:data.journal.map(({audio,...note})=>audio&&!note.audioRef?{...note,audio}:note)};
}
function choose<T>(base:T|undefined,local:T|undefined,remote:T|undefined):T|undefined{if(same(local,remote))return local;if(same(local,base))return remote;if(same(remote,base))return local;throw new AccountConflict();}
function records<T extends {id:string}>(base:T[],local:T[],remote:T[]):T[]{const b=new Map(base.map(v=>[v.id,v])),l=new Map(local.map(v=>[v.id,v])),r=new Map(remote.map(v=>[v.id,v]));const out:T[]=[];for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){const item=choose(b.get(id),l.get(id),r.get(id));if(item)out.push(item);}return out.sort((a,b)=>{const x=a as T&{atUtc?:string;startUtc?:string},y=b as T&{atUtc?:string;startUtc?:string};return (x.atUtc??x.startUtc??x.id).localeCompare(y.atUtc??y.startUtc??y.id)||x.id.localeCompare(y.id);});}
export function mergeAccountData(base:RhythmData,local:RhythmData,remote:RhythmData):RhythmData {
  const settings={...remote.settings};for(const key of ['timezone','goalBed','goalWake','theme'] as const)(settings as Record<string,unknown>)[key]=choose(base.settings[key],local.settings[key],remote.settings[key]);
  let guidance=chooseIfUnchanged(base.guidance,local.guidance,remote.guidance);
  if(guidance===null&&local.guidance&&remote.guidance){const b=base.guidance;guidance={windDownMinutes:choose(b?.windDownMinutes,local.guidance.windDownMinutes,remote.guidance.windDownMinutes)!,checkinTime:choose(b?.checkinTime,local.guidance.checkinTime,remote.guidance.checkinTime)!,commitments:records(b?.commitments??[],local.guidance.commitments,remote.guidance.commitments),feedback:records(b?.feedback??[],local.guidance.feedback,remote.guidance.feedback)};}
  if(guidance===null)throw new AccountConflict();
  const merged:RhythmData={schemaVersion:1,settings,intent:choose(base.intent,local.intent,remote.intent)!,sessions:records(base.sessions,local.sessions,remote.sessions),wakeMarkers:records(base.wakeMarkers,local.wakeMarkers,remote.wakeMarkers),checkins:records(base.checkins,local.checkins,remote.checkins),journal:records(base.journal,local.journal,remote.journal),audit:records(base.audit,local.audit,remote.audit),...(guidance?{guidance}:{}),...(choose(base.profile,local.profile,remote.profile)?{profile:choose(base.profile,local.profile,remote.profile)}:{})};
  assertData(merged);return merged;
}
function chooseIfUnchanged<T>(b:T|undefined,l:T|undefined,r:T|undefined):T|undefined|null{try{return choose(b,l,r);}catch{return null;}}
export function preserveAudio(data:RhythmData,from:RhythmData):RhythmData{return {...data,journal:data.journal.map(note=>{const old=from.journal.find(n=>n.id===note.id);return !note.audio&&note.audioRef&&old?.audio&&old.audioRef?.path===note.audioRef.path?{...note,audio:old.audio}:note;})};}
function adoptReferences(data:RhythmData,original:RhythmData,prepared:RhythmData):RhythmData{return {...data,journal:data.journal.map(note=>{const old=original.journal.find(n=>n.id===note.id),ref=prepared.journal.find(n=>n.id===note.id)?.audioRef;return ref&&note.audio&&old?.audio?.dataUrl===note.audio.dataUrl?{...note,audioRef:ref}:note;})};}
export class AccountStore {
  private stopped=false;private running:Promise<void>|null=null;private opening:Promise<AccountSnapshot>|null=null;
  constructor(readonly owner:string,private cache:AccountCache,private remote:AccountRemote,private notify:(row:AccountSnapshot)=>void=()=>{}){}
  stop(){this.stopped=true;}
  private check(){if(this.stopped)throw new Error('Accountactie is gestopt.');}
  async current(){this.check();return await this.cache.read(this.owner);}
  open():Promise<AccountSnapshot>{return this.opening??=this.performOpen().finally(()=>{this.opening=null;});}
  private async performOpen():Promise<AccountSnapshot>{
    const cached=await this.current();if(cached){this.notify(cached);return cached;}
    // A failed read is never treated as an empty account.
    const remote=await this.remote.read();this.check();const data=remote?.data??emptyData();
    const row:AccountSnapshot={owner:this.owner,id:crypto.randomUUID(),seq:0,confirmedSeq:0,data,base:remote?.data??null,revision:remote?.revision??null,head:remote?.changeId??null,syncedAt:remote?.updatedAt??null,pending:null};
    try{await this.cache.write(row,null);}catch(e){if(e instanceof CacheChanged){const existing=await this.current();if(existing){this.notify(existing);return existing;}}throw e;}this.check();this.notify(row);return row;
  }
  async save(next:RhythmData,viewBase?:RhythmData):Promise<AccountSnapshot>{
    assertData(next);
    for(let attempt=0;attempt<5;attempt++){
      const old=await this.current();if(!old)throw new Error('Je account is nog niet geladen.');
      const data=viewBase?preserveAudio(mergeAccountData(wireData(viewBase),wireData(next),wireData(old.data)),next):next;
      const row={...old,id:crypto.randomUUID(),seq:old.seq+1,data};
      try{this.check();await this.cache.write(row,old.id);this.check();this.notify(row);return row;}catch(error){if(error instanceof CacheChanged)continue;throw error;}
    }throw new CacheChanged();
  }
  sync():Promise<void>{return this.running??=this.performSync().finally(()=>{this.running=null;});}
  private async change(transform:(row:AccountSnapshot)=>AccountSnapshot){for(let i=0;i<6;i++){const old=await this.current();if(!old)throw new Error('Account niet geladen.');const next={...transform(old),id:crypto.randomUUID()};try{this.check();await this.cache.write(next,old.id);this.check();this.notify(next);return next;}catch(e){if(e instanceof CacheChanged)continue;throw e;}}throw new CacheChanged();}
  private async performSync(){
    for(let attempt=0;attempt<4;attempt++){
      this.check();let local=await this.current();if(!local)return;let remote=await this.remote.read();this.check();
      if(local.pending&&remote?.changeId===local.pending.id){await this.change(row=>({...row,data:preserveAudio(mergeAccountData(row.base??emptyData(row.data.settings.timezone),wireData(row.data),remote!.data),row.data),base:remote!.data,revision:remote!.revision,head:remote!.changeId,syncedAt:remote!.updatedAt,pending:null}));local=(await this.current())!;}
      const original=local.data,prepared=await this.remote.prepare(original);this.check();
      if(!same(original,prepared))await this.change(row=>({...row,data:adoptReferences(row.data,original,prepared)}));
      const b=local.base??emptyData(local.data.settings.timezone),r=remote?.data??emptyData(local.data.settings.timezone);
      let merged:RhythmData;
      try{merged=mergeAccountData(b,wireData(prepared),r);}catch(e){if(e instanceof AccountConflict){await this.remote.recover(wireData(prepared),local.id);this.check();}throw e;}
      let accepted=remote;
      if(!remote||!same(merged,remote.data)){
        const changeId=crypto.randomUUID();
        await this.change(row=>({...row,pending:{id:changeId,data:merged}}));
        accepted=await this.remote.write(merged,remote?.revision??null,remote?.changeId??null,changeId);this.check();
        if(!accepted)continue;
      }
      const confirmed=accepted!;
      await this.change(row=>{
        const latest=adoptReferences(row.data,original,prepared);
        const data=preserveAudio(mergeAccountData(wireData(prepared),wireData(latest),confirmed.data),latest);
        return {...row,data,base:confirmed.data,revision:confirmed.revision,head:confirmed.changeId,syncedAt:confirmed.updatedAt,confirmedSeq:Math.max(row.confirmedSeq,local!.seq),pending:null};
      });
      const latest=(await this.current())!;if(latest.seq===latest.confirmedSeq)return;
    }throw new Error('Er komen tegelijk wijzigingen binnen. Je invoer is lokaal bewaard; de app probeert het opnieuw.');
  }
  async cacheAudio(noteId:string,audio:{dataUrl:string;mimeType:string},path:string){return this.change(row=>({...row,data:{...row.data,journal:row.data.journal.map(n=>n.id===noteId&&n.audioRef?.path===path?{...n,audio}:n)}}));}
  async replaceFromCloud(data?:RhythmData){
    const local=await this.current();if(!local)throw new Error('Account niet geladen.');const remote=await this.remote.read();this.check();if(!remote)throw new Error('Er is nog geen online kopie.');
    const prepared=await this.remote.prepare(local.data);await this.remote.recover(wireData(prepared),crypto.randomUUID());this.check();
    return this.change(row=>{if(row.seq!==local.seq||!same(wireData(row.data),wireData(local.data)))throw new Error('Er is tijdens het ophalen nieuwe invoer opgeslagen. Deze is behouden. Probeer herstellen opnieuw.');return {...row,data:preserveAudio(data??remote.data,row.data),base:remote.data,revision:remote.revision,head:remote.changeId,syncedAt:remote.updatedAt,pending:null,seq:row.seq+1,confirmedSeq:data?row.confirmedSeq:row.seq+1};});
  }
}
