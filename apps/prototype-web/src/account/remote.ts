import type { SupabaseClient } from '@supabase/supabase-js';
import { assertData, type RhythmData, type JournalEntry } from '../../../../packages/domain/src/index';
import type { AccountRemote, AccountRemoteRow } from '../../../../packages/storage/src/account-sync';
export class SessionRequired extends Error {constructor(){super('Log opnieuw in om je account bij te werken. Je lokale invoer is bewaard.');}}
const columns='data,revision,change_id,updated_at';
function parsed(row:Record<string,unknown>,owner:string):AccountRemoteRow {
  assertData(row.data);if(!Number.isSafeInteger(row.revision)||Number(row.revision)<1||typeof row.change_id!=='string'||typeof row.updated_at!=='string')throw new Error('De online kopie is niet leesbaar. Je lokale gegevens zijn bewaard.');
  for(const note of row.data.journal)if(note.audio||note.audioRef&&!note.audioRef.path.startsWith(owner+'/'))throw new Error('De online opnameverwijzing is niet geldig.');
  return {data:row.data,revision:Number(row.revision),changeId:row.change_id,updatedAt:row.updated_at};
}
const timeout=()=>AbortSignal.timeout(15000);
const hash=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function audioBytes(audio:{dataUrl:string;mimeType:string}){const raw=audio.dataUrl.split(',')[1];if(!raw)throw new Error('Opname is niet leesbaar.');const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(bytes.length>10000000)throw new Error('Een opname mag maximaal 10 MB zijn.');return bytes;}
export class SupabaseAccountRemote implements AccountRemote {
  constructor(private client:SupabaseClient,readonly owner:string,private active:()=>boolean){}
  private check(){if(!this.active())throw new Error('Accountactie is gestopt.');}
  async read():Promise<AccountRemoteRow|null>{
    this.check();const {data,error}=await this.client.from('account_data').select(columns).eq('user_id',this.owner).abortSignal(timeout()).maybeSingle();this.check();
    if(error)throw new Error('Je accountgegevens zijn nog niet bereikbaar. Je lokale invoer blijft bewaard.');
    if(!data){const {data:active,error:denied}=await this.client.rpc('account_session_active').abortSignal(timeout());this.check();if(denied)throw new Error('Je account kon nog niet worden gecontroleerd. Probeer opnieuw met internet.');if(active!==true)throw new SessionRequired();return null;}
    return parsed(data,this.owner);
  }
  async prepare(data:RhythmData):Promise<RhythmData>{
    const journal:JournalEntry[]=[];
    for(const note of data.journal){this.check();if(!note.audio){journal.push(note);continue;}if(note.audioRef){journal.push(note);continue;}
      const bytes=audioBytes(note.audio),sha256=await hash(bytes),noteHash=await hash(new TextEncoder().encode(note.id)),path=`${this.owner}/${noteHash}/${sha256}`;
      this.check();const {error}=await this.client.storage.from('rhythm-audio').upload(path,new Blob([bytes],{type:note.audio.mimeType.split(';')[0]}),{contentType:note.audio.mimeType.split(';')[0],upsert:false});this.check();
      if(error&&String(error.statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message))throw new Error('Je opname wacht nog op upload. De opname en je notitie zijn lokaal bewaard.');
      if(error){const existing=await this.download({path,mimeType:note.audio.mimeType,sha256,size:bytes.length});if(existing.dataUrl!==note.audio.dataUrl)throw new Error('De bestaande online opname wijkt af. Je lokale opname is behouden.');}
      journal.push({...note,audioRef:{path,mimeType:note.audio.mimeType,sha256,size:bytes.length}});
    }return {...data,journal};
  }
  async write(data:RhythmData,revision:number|null,head:string|null,changeId:string):Promise<AccountRemoteRow|null>{
    this.check();assertData(data);if(data.journal.some(n=>n.audio))throw new Error('Opnamen moeten eerst naar de privéopslag.');
    const values={user_id:this.owner,data,revision:(revision??0)+1,change_id:changeId};
    const query=revision===null?this.client.from('account_data').insert(values):this.client.from('account_data').update(values).eq('user_id',this.owner).eq('revision',revision).eq('change_id',head);
    const {data:row,error}=await query.select(columns).abortSignal(timeout()).maybeSingle();this.check();
    if(error?.code==='23505')return null;if(error?.code==='42501')throw new SessionRequired();if(error)throw new Error('Synchroniseren is niet gelukt. Je gegevens wachten veilig op dit apparaat.');return row?parsed(row,this.owner):null;
  }
  async recover(data:RhythmData,id:string){this.check();const {error}=await this.client.from('account_recovery').upsert({user_id:this.owner,id,data},{onConflict:'user_id,id'}).abortSignal(timeout());this.check();if(error)throw new Error('De online versies verschillen. Je lokale invoer is bewaard; herstelpunt kon nog niet worden verstuurd.');}
  async download(ref:NonNullable<JournalEntry['audioRef']>){this.check();if(!ref.path.startsWith(this.owner+'/'))throw new Error('Opname hoort niet bij dit account.');const {data,error}=await this.client.storage.from('rhythm-audio').download(ref.path);this.check();if(error||!data)throw new Error('Deze opname is nog niet offline beschikbaar. Probeer met internet opnieuw.');const bytes=new Uint8Array(await data.arrayBuffer());if(bytes.length!==ref.size||await hash(bytes)!==ref.sha256)throw new Error('De opname kon niet worden gecontroleerd; de lokale kopie is niet vervangen.');let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {dataUrl:`data:${ref.mimeType};base64,${btoa(binary)}`,mimeType:ref.mimeType};}
  async versions(){const {data,error}=await this.client.from('account_revisions').select('revision,saved_at').eq('user_id',this.owner).order('revision',{ascending:false}).limit(10).abortSignal(timeout());this.check();if(error)throw new Error('Herstelpunten zijn nog niet bereikbaar.');return data??[];}
  async version(revision:number){const {data,error}=await this.client.from('account_revisions').select('data').eq('user_id',this.owner).eq('revision',revision).abortSignal(timeout()).single();this.check();if(error)throw new Error('Dit herstelpunt is niet bereikbaar.');assertData(data.data);return data.data;}
  async recoveryPoints(){this.check();const {data,error}=await this.client.from('account_recovery').select('id,saved_at').eq('user_id',this.owner).order('saved_at',{ascending:false}).limit(10).abortSignal(timeout());this.check();if(error)throw new Error('Herstelkopieën zijn nog niet bereikbaar.');return data??[];}
  async recoveryPoint(id:string){this.check();const {data,error}=await this.client.from('account_recovery').select('data').eq('user_id',this.owner).eq('id',id).abortSignal(timeout()).single();this.check();if(error)throw new Error('Deze herstelkopie is niet bereikbaar.');assertData(data.data);return data.data;}
}
