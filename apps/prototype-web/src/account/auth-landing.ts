import type {Session,SupabaseClient} from '@supabase/supabase-js';

export const recoveryRedirect=(origin:string)=>`${origin}/?auth=recovery`;
export function readAuthLanding(href:string){
 const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1));
 const param=(key:string)=>url.searchParams.get(key)??hash.get(key);
 const recovery=url.searchParams.get('auth')==='recovery'||param('type')==='recovery';
 const code=param('code'),access=param('access_token'),refresh=param('refresh_token'),tokenHash=param('token_hash');
 const failed=!!(param('error')||param('error_code')||param('error_description'));
 return {recovery,code,access,refresh,tokenHash,flowId:param('sb_flow_id'),failed,managed:recovery||!!code||failed};
}
// Capture before SDK initialization can consume the callback URL.
export const authLanding=typeof window==='undefined'?null:readAuthLanding(window.location.href);
const recoveryKey='rhythm.recovery.v1';
export function recoveryBinding(session:Session){
 try{const encoded=session.access_token.split('.')[1]!;const payload=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));return typeof payload.session_id==='string'?`${session.user.id}:${payload.session_id}`:null;}catch{return null;}
}
function savedRecovery(session:Session){
 try{const saved=JSON.parse(sessionStorage.getItem(recoveryKey)??'null');return !!saved&&saved.binding===recoveryBinding(session)&&saved.expires>Date.now();}catch{return false;}
}
export function rememberRecovery(session:Session){
 const binding=recoveryBinding(session);try{if(binding)sessionStorage.setItem(recoveryKey,JSON.stringify({binding,expires:Date.now()+30*60*1000}));}catch{/* The verified current flow still works if tab storage is unavailable. */}
 clearCallbackUrl(true);
}
export function clearRecovery(){try{sessionStorage.removeItem(recoveryKey);}catch{}clearCallbackUrl(false);}
function clearCallbackUrl(recovery:boolean){
 const url=new URL(location.href);
 for(const key of ['code','sb_flow_id','token_hash','type','access_token','refresh_token','expires_in','expires_at','token_type','provider_token','provider_refresh_token','error','error_code','error_description'])url.searchParams.delete(key);
 if(recovery)url.searchParams.set('auth','recovery');else url.searchParams.delete('auth');
 if(authLanding?.managed)url.hash='';
 history.replaceState(history.state,'',url.pathname+url.search+url.hash);
}
let completion:Promise<{session:Session;recovery:boolean}>|null=null;
export function completeAuthLanding(client:SupabaseClient){
 return completion??=(async()=>{
  if(!authLanding?.managed)throw new Error('Geen aanmeldlink.');
  // Remove callback credentials from history; only the normal SDK session is persisted.
  clearCallbackUrl(authLanding.recovery);
  await client.auth.initialize();
  if(authLanding.failed)throw new Error('Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe herstelmail aan.');
  let session:Session|null=null,isRecovery=authLanding.recovery;
  if(authLanding.code){
   const {data,error}=await client.auth.exchangeCodeForSession(authLanding.code,authLanding.flowId?{flowId:authLanding.flowId}:undefined);
   if(error||!data.session)throw new Error('Deze link kon niet worden bevestigd. Open hem in dezelfde browser waarin je de herstelmail aanvroeg, of vraag hieronder een nieuwe mail aan.');
   session=data.session;isRecovery ||= 'redirectType' in data&&data.redirectType==='recovery';
  }else if(authLanding.recovery&&authLanding.access&&authLanding.refresh){
   // Older/dashboard-issued links use token fragments, not PKCE codes.
   // setSession verifies the token with Auth (or refreshes it); URL intent grants no access.
   const {data,error}=await client.auth.setSession({access_token:authLanding.access,refresh_token:authLanding.refresh});
   if(error||!data.session)throw new Error('Deze herstellink is niet meer geldig. Vraag hieronder een nieuwe herstelmail aan.');
   session=data.session;
  }else if(authLanding.recovery&&authLanding.tokenHash){
   const {data,error}=await client.auth.verifyOtp({token_hash:authLanding.tokenHash,type:'recovery'});
   if(error||!data.session)throw new Error('Deze herstellink is niet meer geldig. Vraag hieronder een nieuwe herstelmail aan.');
   session=data.session;
  }else{
   const {data}=await client.auth.getSession();
   if(!data.session||!savedRecovery(data.session))throw new Error('Open de volledige link uit je herstelmail. Je kunt hieronder ook een nieuwe herstelmail aanvragen.');
   session=data.session;
  }
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user||user.id!==session.user.id)throw new Error('Je herstellink kon niet worden bevestigd. Vraag hieronder een nieuwe herstelmail aan.');
  if(isRecovery){const {data:active,error}=await client.rpc('account_session_active');if(error||active!==true)throw new Error('Je herstelsessie is niet meer geldig. Vraag hieronder een nieuwe herstelmail aan.');}
  if(isRecovery)rememberRecovery(session);
  return {session,recovery:isRecovery};
 })();
}
