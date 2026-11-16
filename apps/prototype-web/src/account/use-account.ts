import { useCallback,useEffect,useRef,useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { RhythmData } from '../../../../packages/domain/src/index';
import { AccountConflict,AccountStore } from '../../../../packages/storage/src/account-sync';
import { forgetAccount,IndexedAccountCache,rememberAccount,rememberedAccount,type AccountSnapshot,type RememberedAccount } from '../../../../packages/storage/src/account-cache';
import { cloudClient } from '../cloud/client';
import { SessionRequired,SupabaseAccountRemote } from './remote';
export type AccountPhase='boot'|'auth'|'load-error'|'wizard'|'ready'|'recovery';
export type AccountSyncStatus='connecting'|'offline'|'pending'|'syncing'|'synced'|'error'|'conflict';
const disk=new IndexedAccountCache();
export function useAccount(){
  const client=cloudClient();
  const [phase,setPhaseState]=useState<AccountPhase>('boot'),phaseRef=useRef<AccountPhase>('boot');
  const [session,setSession]=useState<Session|null>(null),sessionRef=useRef<Session|null>(null);
  const [identity,setIdentityState]=useState<RememberedAccount|null>(null),identityRef=useRef<RememberedAccount|null>(null);
  const [row,setRow]=useState<AccountSnapshot|null>(null),[status,setStatus]=useState<AccountSyncStatus>('connecting');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[authBusy,setAuthBusy]=useState(false),[online,setOnline]=useState(navigator.onLine);
  const mounted=useRef(false),epoch=useRef(0),recovery=useRef(false),explicitLogout=useRef(false),restoreRunning=useRef(false);
  const bundle=useRef<{owner:string;store:AccountStore;remote:SupabaseAccountRemote}|null>(null),syncing=useRef(false);
  const setPhase=(p:AccountPhase)=>{phaseRef.current=p;setPhaseState(p);};
  const setIdentity=(value:RememberedAccount|null)=>{identityRef.current=value;setIdentityState(value);};
  const syncRef=useRef<()=>Promise<void>>(async()=>{});
  const beginRef=useRef<(s:Session|null,cached?:RememberedAccount|null)=>Promise<void>>(async()=>{});
  const isActive=(owner:string,token:number)=>mounted.current&&epoch.current===token&&identityRef.current?.owner===owner;
  async function begin(next:Session|null,cached?:RememberedAccount|null){
    const who=next?{owner:next.user.id,email:next.user.email??''}:cached;
    if(!client||!who){setPhase('auth');return;}
    if(bundle.current?.owner===who.owner){try{const local=await bundle.current.store.open();if(mounted.current){setRow(local);setPhase(recovery.current?'recovery':local.data.profile?.completedAtUtc?'ready':'wizard');}if(next&&navigator.onLine)void syncRef.current();}catch(e){if(mounted.current){setError(e instanceof Error?e.message:'Je account kon niet worden geladen.');setPhase(e instanceof SessionRequired?'auth':'load-error');}}return;}
    bundle.current?.store.stop();const token=++epoch.current;setIdentity(who);setRow(null);setError('');setStatus(navigator.onLine?'connecting':'offline');
    const remote=new SupabaseAccountRemote(client,who.owner,()=>isActive(who.owner,token)&&sessionRef.current?.user.id===who.owner);
    const store=new AccountStore(who.owner,disk,remote,local=>{if(isActive(who.owner,token)){setRow(local);if(!recovery.current)setPhase(local.data.profile?.completedAtUtc?'ready':'wizard');}});
    bundle.current={owner:who.owner,store,remote};
    try{
      const local=await store.open();if(!isActive(who.owner,token))return;
      setRow(local);if(next){try{rememberAccount(who);}catch{setError('Je browser kan dit account niet onthouden voor een offline herstart. Je invoer is wel bewaard.');}}setPhase(recovery.current?'recovery':local.data.profile?.completedAtUtc?'ready':'wizard');setStatus(navigator.onLine?(local.seq>local.confirmedSeq||!local.syncedAt?'pending':'synced'):'offline');
      if(next&&navigator.onLine)void syncRef.current();
    }catch(reason){if(!isActive(who.owner,token))return;setError(reason instanceof Error?reason.message:'Je account kon niet worden geladen.');setPhase(reason instanceof SessionRequired?'auth':'load-error');}
  }
  beginRef.current=begin;
  async function sync(){
    const current=bundle.current,owner=identityRef.current?.owner,token=epoch.current;
    if(!current||!owner||!navigator.onLine||sessionRef.current?.user.id!==owner||syncing.current||restoreRunning.current){if(!navigator.onLine)setStatus('offline');return;}
    syncing.current=true;setStatus('syncing');setError('');
    try{await current.store.sync();if(isActive(owner,token)){const latest=await current.store.current();setStatus(latest&&latest.seq>latest.confirmedSeq?'pending':'synced');}}
    catch(reason){if(isActive(owner,token)){if(reason instanceof SessionRequired){void logout();return;}setStatus(reason instanceof AccountConflict?'conflict':navigator.onLine?'error':'offline');setError(reason instanceof Error?reason.message:'Synchroniseren is nog niet gelukt.');}}
    finally{syncing.current=false;}
  }
  syncRef.current=sync;
  useEffect(()=>{
    mounted.current=true;const remembered=rememberedAccount();let fallback:ReturnType<typeof setTimeout>|undefined;
    if(!navigator.onLine&&remembered)void beginRef.current(null,remembered);else if(!navigator.onLine)setPhase('auth');
    if(remembered)fallback=setTimeout(()=>{if(phaseRef.current==='boot')void beginRef.current(null,remembered);},8000);
    if(!client){setError('Accounts zijn niet ingesteld.');setPhase('auth');return;}
    const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{
      sessionRef.current=next;setSession(next);
      if(event==='PASSWORD_RECOVERY'){recovery.current=true;setPhase('recovery');}
      if(next){explicitLogout.current=false;setTimeout(()=>{if(mounted.current)void beginRef.current(next);},0);}
      else if(event==='SIGNED_OUT'||event==='INITIAL_SESSION'){
        if(!navigator.onLine&&!explicitLogout.current&&rememberedAccount()){if(!bundle.current)queueMicrotask(()=>{if(mounted.current)void beginRef.current(null,rememberedAccount());});return;}
        bundle.current?.store.stop();bundle.current=null;epoch.current++;setIdentity(null);setRow(null);recovery.current=false;forgetAccount();setPhase('auth');
      }
    });
    const connected=()=>{setOnline(true);if(sessionRef.current)void syncRef.current();else void client.auth.getSession().then(({data})=>{if(data.session){sessionRef.current=data.session;setSession(data.session);return beginRef.current(data.session);}if(mounted.current&&bundle.current){setError('Log opnieuw in om online verder te synchroniseren. Je lokale invoer is bewaard.');setPhase('auth');}}).catch(()=>{if(mounted.current)setError('Je sessie kon nog niet worden gecontroleerd. Je lokale invoer is bewaard.');});};
    const disconnected=()=>{setOnline(false);setStatus('offline');};
    const visible=()=>{if(!document.hidden&&navigator.onLine)void syncRef.current();};
    const interval=setInterval(()=>{if(!document.hidden&&navigator.onLine)void syncRef.current();},30000);
    window.addEventListener('online',connected);window.addEventListener('offline',disconnected);document.addEventListener('visibilitychange',visible);
    return()=>{mounted.current=false;epoch.current++;bundle.current?.store.stop();bundle.current=null;subscription.unsubscribe();clearTimeout(fallback);clearInterval(interval);window.removeEventListener('online',connected);window.removeEventListener('offline',disconnected);document.removeEventListener('visibilitychange',visible);};
  },[client]);
  useEffect(()=>{if(!row||row.seq<=row.confirmedSeq||!online)return;const timer=setTimeout(()=>void syncRef.current(),600);return()=>clearTimeout(timer);},[row?.seq,row?.confirmedSeq,online]);
  const saveEpoch=epoch.current;
  const save=useCallback(async(next:RhythmData,base?:RhythmData)=>{const b=bundle.current;if(!b||b.owner!==identity?.owner||epoch.current!==saveEpoch)throw new Error('Accountactie is gestopt. Je invoer is niet naar een ander account verplaatst.');setError('');await b.store.save(next,base);if(epoch.current===saveEpoch)setStatus(navigator.onLine?'pending':'offline');},[identity?.owner,saveEpoch]);
  async function authenticate(kind:'login'|'signup'|'reset',email:string,password:string){
    if(!client)return;setAuthBusy(true);setError('');setMessage('');
    try{
      if(!navigator.onLine)throw new Error('Voor aanmelden is internet nodig. Blijf ingelogd om je account later offline te gebruiken.');
      const response=kind==='login'?await client.auth.signInWithPassword({email,password}):kind==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}):await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
      if(response.error)throw new Error(response.error.status===429?'Te veel pogingen. Wacht even en probeer opnieuw.':response.error.code==='email_not_confirmed'?'Bevestig je e-mailadres via de ontvangen e-mail en log daarna in.':'Dit is niet gelukt. Controleer je e-mailadres, wachtwoord en verbinding.');
      setMessage(kind==='signup'?'Controleer je e-mail om je account te bevestigen. Log daarna hier in.':kind==='reset'?'Als dit adres bekend is, ontvang je een herstelmail. Open die in dezelfde browser als deze aanvraag.':'');
    }catch(reason){setError(reason instanceof Error?reason.message:'Aanmelden is niet gelukt.');}finally{setAuthBusy(false);}
  }
  async function logout(){
    if(!client)return;explicitLogout.current=true;bundle.current?.store.stop();bundle.current=null;epoch.current++;forgetAccount();setIdentity(null);setRow(null);setSession(null);sessionRef.current=null;setPhase('auth');setError('');setMessage('Je bent uitgelogd. Eventuele wachtende invoer blijft bewaard voor ditzelfde account.');
    // Clear only this session and our remembered pointer, never an unsynced account cache.
    try{const {error}=await client.auth.signOut({scope:'local'});if(error)setMessage('Lokaal uitgelogd. Serverafmelding kon nog niet worden bevestigd; controleer dit later met internet.');}catch{setError('Afmelden kon niet volledig worden afgerond. Sluit dit venster en probeer later met internet opnieuw.');}
  }
  async function updatePassword(password:string){if(!client)return;setAuthBusy(true);setError('');try{const {error}=await client.auth.updateUser({password});if(error)throw new Error('Je wachtwoord kon niet worden gewijzigd. Probeer opnieuw.');recovery.current=false;const {data}=await client.auth.getSession();if(data.session){sessionRef.current=data.session;setSession(data.session);await begin(data.session);}else setPhase('auth');}catch(e){setError(e instanceof Error?e.message:'Dit is niet gelukt.');}finally{setAuthBusy(false);}}
  async function loadAudio(noteId:string){const b=bundle.current;if(!b)throw new Error('Je account is nog niet geladen.');const row=await b.store.current(),note=row?.data.journal.find(n=>n.id===noteId);if(!note?.audioRef)return;if(!navigator.onLine)throw new Error('Open deze opname eenmaal met internet om hem offline te bewaren.');const audio=await b.remote.download(note.audioRef);await b.store.cacheAudio(note.id,audio,note.audioRef.path);}
  async function restoreVersion(revision:number){const b=bundle.current;if(!b)return;restoreRunning.current=true;try{const data=await b.remote.version(revision);await b.store.replaceFromCloud(data);}finally{restoreRunning.current=false;}void syncRef.current();}
  async function useOnline(){const b=bundle.current;if(!b)return;restoreRunning.current=true;try{await b.store.replaceFromCloud();setStatus('synced');setError('');}finally{restoreRunning.current=false;}}
  async function restoreRecovery(id:string){const b=bundle.current;if(!b)return;restoreRunning.current=true;try{await b.store.replaceFromCloud(await b.remote.recoveryPoint(id));}finally{restoreRunning.current=false;}void syncRef.current();}
  return {phase,session,identity,row,data:row?.data??null,status,error,message,authBusy,online,pending:row?Math.max(0,row.seq-row.confirmedSeq):0,save,authenticate,logout,updatePassword,loadAudio,restoreVersion,restoreRecovery,useOnline,syncNow:sync,retry:()=>begin(sessionRef.current,identityRef.current??rememberedAccount()),versions:()=>bundle.current?.remote.versions()??Promise.resolve([]),recoveryPoints:()=>bundle.current?.remote.recoveryPoints()??Promise.resolve([])};
}
export type AccountController=ReturnType<typeof useAccount>;
