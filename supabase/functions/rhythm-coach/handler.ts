import {createClient} from '@supabase/supabase-js';
import {generateCoachAnswer,type CoachEnvironment} from './generate';
import {syntheticCoachProbe} from './probe';
import {assertData,type RhythmData} from '../../../packages/domain/src/index';
import {buildCoachContext,digest,currentCoaching,COACH_POLICY_VERSION} from '../../../packages/coaching/src/core';
export type {CoachEnvironment} from './generate';
export function createCoachHandler(env:CoachEnvironment,network:typeof fetch=fetch){
 const url=env.get('SUPABASE_URL')!,service=env.get('SUPABASE_SERVICE_ROLE_KEY')!,key=env.get('SUPABASE_ANON_KEY')??service;
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:network}});
 const dispatch=async(action:string,arg:Record<string,unknown>)=>{const {data,error}=await admin.rpc('rhythm_coach_dispatch',{p_action:action,p_arg:arg});if(error)throw new Error('storage');return data;};
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('origin')??'',allowed=origin==='https://rhythm-rho-bice.vercel.app'||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)||(env.get('RHYTHM_COACH_ALLOWED_ORIGINS')??'').split(',').includes(origin);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowed?origin:'https://rhythm-rho-bice.vercel.app','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
  if(origin&&!allowed)return reply({error:'Deze apporigin is niet toegelaten.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.headers.has('x-rhythm-probe')){
   const ticket=request.headers.get('x-rhythm-probe')!;if(request.method!=='POST'||!/^[a-f0-9-]{36}$/.test(ticket))return reply({error:'Ongeldige testaanvraag.'},401);
   try{const grant=await dispatch('probe_consume',{ticket});if(grant.accepted!==true)return reply({error:'Testticket is ongeldig of verlopen.'},401);return reply(await syntheticCoachProbe(grant.scenario,env,network));}catch(e){const code=e instanceof Error&&/^(provider:\d{3}|incomplete|unconfigured)$/.test(e.message)?e.message:'validation';return reply({error:'De vaste synthetische modeltest is niet geslaagd.',code},502);}
  }
  const token=request.headers.get('authorization');if(!token?.startsWith('Bearer '))return reply({error:'Log opnieuw in.'},401);
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:network,headers:{Authorization:token}}});
  let reservation:Record<string,unknown>|null=null;
  try{
   const {data:{user},error}=await client.auth.getUser(token.slice(7));if(error||!user||user.is_anonymous)return reply({error:'Log opnieuw in.'},401);
   const {data:active,error:inactive}=await client.rpc('account_session_active');if(inactive||active!==true)return reply({error:'Je sessie is niet meer actief.'},401);
   if(request.method==='GET')return reply({ready:!!env.get('OPENAI_API_KEY'),model:env.get('RHYTHM_COACH_MODEL')??'gpt-6-luna',dailyLimit:20});
   if(request.method!=='POST')return reply({error:'Deze actie wordt niet ondersteund.'},405);
   if(Number(request.headers.get('content-length'))>4096)return reply({error:'Aanvraag te groot.'},413);
   const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return reply({error:'Aanvraag te groot.'},413);}chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}const body=new TextDecoder().decode(bytes);
   let input;try{input=JSON.parse(body);}catch{return reply({error:'Ongeldige aanvraag.'},400);}if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['requestId','expectedStamp'].includes(k))||typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(input.requestId)||typeof input.expectedStamp!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedStamp))return reply({error:'Ongeldige aanvraag.'},400);
   const apiKey=env.get('OPENAI_API_KEY');if(!apiKey)return reply({error:'De online coach is nog niet geconfigureerd. Je lokale ruimte blijft werken.'},503);
   async function snapshot():Promise<RhythmData>{const {data:row,error}=await client.from('account_data').select('data').eq('user_id',user!.id).maybeSingle();if(error||!row)throw new Error('account');assertData(row.data);return row.data;}
   const data=await snapshot(),coach=currentCoaching(data),message=coach.messages.find(m=>m.id===input.requestId&&m.role==='user');
   if(!coach.consent.enabled||coach.consent.version!==1)return reply({error:'Zet online begeleiding eerst bewust aan.'},403);
   if(!message)return reply({error:'Synchroniseer dit bericht eerst met je account.'},409);
   const context=await buildCoachContext(data,message.id,new Date().toISOString());
   if(context.stamp!==input.expectedStamp)return reply({error:'Je gegevens zijn veranderd. Haal de actuele versie op en probeer opnieuw.'},409);
   const fingerprint=await digest({policyVersion:COACH_POLICY_VERSION,stamp:context.stamp,requestId:message.id,threadId:message.threadId,text:message.text});
   reservation={user_id:user.id,id:message.id,thread_id:message.threadId,fingerprint};
   const job=await dispatch('reserve',reservation);
   if(job.state==='done')return reply(job.result);
   if(job.state==='limited')return reply({error:'Je daglimiet of de gezamenlijke pilotlimiet is bereikt. Je plan en lokale invoer blijven beschikbaar.'},429);
   if(job.state!=='reserved')return reply({error:job.state==='working'?'Dit antwoord wordt nog verwerkt. Probeer straks hetzelfde bericht opnieuw.':'Deze aanvraag kan niet opnieuw worden uitgevoerd. Stuur zo nodig een nieuw bericht.'},409);
   const answer=await generateCoachAnswer(context,env,network);
   const latest=await snapshot();if(!currentCoaching(latest).consent.enabled||!(currentCoaching(latest).messages.some(m=>m.id===message.id)))throw new Error('revoked');
   const fresh=await buildCoachContext(latest,message.id,new Date().toISOString());if(fresh.stamp!==context.stamp)throw new Error('stale');
   const saved=await dispatch('finish',{...reservation,result:answer});if(saved.saved!==true)throw new Error('revoked');return reply(answer);
  }catch(error){if(reservation)await dispatch('fail',reservation).catch(()=>{});const kind=error instanceof Error?error.message:'';return reply({error:kind==='revoked'?'De gegevenskeuze of het gesprek is veranderd; dit antwoord is niet opgeslagen.':kind==='stale'?'Je situatie veranderde tijdens het antwoorden. Bespreek een actueel voorstel.':'Het antwoord kon niet veilig worden voltooid. Je invoer en plan zijn bewaard. Probeer later opnieuw of ga lokaal verder.'},kind==='stale'?409:502);}
 };
}
