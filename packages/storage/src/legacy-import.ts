import { BrowserVault,VAULT_KEY } from './index';
import { SYNC_KEY } from './cloud-sync';
import { stable } from './account-sync';
import { assertData,type RhythmData } from '../../domain/src/index';
// Work on an in-memory copy: even a v1 envelope upgrade never touches the old vault.
export async function readLegacy(raw:string,password:string):Promise<RhythmData>{const map=new Map([[VAULT_KEY,raw]]);const memory={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}} as Storage;const vault=new BrowserVault(memory);try{const data=await vault.unlock(password);if(!data)throw new Error('Deze oude kluis is leeg.');return data;}finally{vault.lock();}}
export function legacyLocal(storage:Storage,owner:string){const binding=storage.getItem(SYNC_KEY);if(binding){const value=JSON.parse(binding) as {owner?:string};if(value.owner&&value.owner!==owner)throw new Error('De oude lokale kluis hoort bij een ander account. Log met dat account in om hem te importeren.');}return storage.getItem(VAULT_KEY);}
export function mergeLegacy(current:RhythmData,old:RhythmData):RhythmData{
  function union<T extends {id:string}>(a:T[],b:T[]):T[]{const rows=new Map(a.map(v=>[v.id,v]));for(const v of b){const existing=rows.get(v.id);if(existing&&stable(existing)!==stable(v))throw new Error('Er bestaat al een gewijzigde registratie met hetzelfde nummer. Download beide kopieën voordat je deze samenvoegt.');rows.set(v.id,v);}return [...rows.values()];}
  const next={...current,sessions:union(current.sessions,old.sessions),wakeMarkers:union(current.wakeMarkers,old.wakeMarkers),checkins:union(current.checkins,old.checkins),journal:union(current.journal,old.journal),audit:union(current.audit,old.audit)};
  if(!current.intent)next.intent=old.intent;
  else if(old.intent&&stable(current.intent)!==stable(old.intent))throw new Error('Beide kopieën hebben een lopend rustmoment. Rond eerst het huidige moment af.');
  if(old.guidance)next.guidance=current.guidance?{...current.guidance,commitments:union(current.guidance.commitments,old.guidance.commitments),feedback:union(current.guidance.feedback,old.guidance.feedback)}:old.guidance;
  next.settings={...current.settings,goalBed:current.settings.goalBed||old.settings.goalBed,goalWake:current.settings.goalWake||old.settings.goalWake};
  assertData(next);return next;
}
