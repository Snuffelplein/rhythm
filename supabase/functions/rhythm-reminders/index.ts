import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import * as webpush from 'npm:web-push@4.0.0';
import { isPushEndpoint, notificationFor } from './protocol.mjs';

const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function dispatch(action:string,arg:Record<string,unknown>={}) {
  const {data,error}=await admin.rpc('rhythm_push_dispatch',{p_action:action,p_arg:arg});
  if(error)throw new Error('Push storage unavailable');return data;
}
async function configuration() {
  let config=await dispatch('config');
  if(!config.publicKey){await dispatch('initialize',webpush.generateVAPIDKeys());config=await dispatch('config');}
  return config;
}
async function send(subscription:any,kind:string,config:any) {
  if(!isPushEndpoint(subscription?.endpoint))throw new Error('Unsupported endpoint');
  // Endpoint allowlist plus redirects disabled by the library prevent arbitrary fetch targets.
  await webpush.sendNotification(subscription,notificationFor(kind),{vapidDetails:{subject:'https://github.com/Snuffelplein/rhythm',publicKey:config.publicKey,privateKey:config.privateKey},TTL:300,urgency:'normal',topic:`rhythm-${kind}`,timeout:8000,contentEncoding:'aes128gcm'});
}
Deno.serve({port:Number(Deno.env.get('PORT')??8000),hostname:Deno.env.get('RHYTHM_BIND_HOST')??'0.0.0.0'},async request=>{
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'};
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try {
    const action=new URL(request.url).searchParams.get('action');
    if(request.method==='GET'&&action==='key') {
      const config=await configuration();return reply({publicKey:config.publicKey,ready:true});
    }
    if(request.method!=='POST')return reply({error:'Method not allowed'},405);
    if(request.headers.has('x-rhythm-cron')) {
      const ticket=request.headers.get('x-rhythm-cron')??'';
      if(!/^[a-f0-9]{64}$/.test(ticket))return reply({error:'Unauthorized'},401);
      const {data:accepted,error}=await admin.rpc('rhythm_push_consume_cron',{p_token:ticket});
      if(error||accepted!==true)return reply({error:'Unauthorized'},401);
      const config=await configuration();
      const jobs=await dispatch('claim');
      await Promise.all(jobs.map(async(job:any)=>{
        if(!await dispatch('authorize',{id:job.id,lease:job.lease}))return;
        let status='sent';try{await send(job.subscription,job.kind,config);}catch(error){status=[404,410].includes(Number((error as any)?.statusCode))?'gone':'error';}
        await dispatch('finish',{id:job.id,lease:job.lease,status});
      }));
      return reply({processed:jobs.length});
    }
    if(action!=='test')return reply({error:'Unauthorized'},401);
    const authorization=request.headers.get('authorization')??'';
    if(!authorization.startsWith('Bearer '))return reply({error:'Unauthorized'},401);
    const {data:{user},error}=await admin.auth.getUser(authorization.slice(7));
    if(error||!user||user.is_anonymous)return reply({error:'Unauthorized'},401);
    const text=await request.text();if(text.length>256)return reply({error:'Request too large'},413);
    const body=JSON.parse(text);
    if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/.test(body.id))return reply({error:'Invalid device'},400);
    // Own RLS SELECT also enforces that this caller's session has not been revoked.
    const own=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:device,error:denied}=await own.from('push_devices').select('id').eq('id',body.id).maybeSingle();
    if(denied||!device)return reply({error:'Device unavailable'},403);
    const subscription=await dispatch('test',{id:body.id,owner:user.id});
    await send(subscription,'test',await configuration());return reply({accepted:true},202);
  } catch {
    // Do not log request bodies, endpoint tokens, account tokens or provider error bodies.
    return reply({error:'De melding kon niet worden verwerkt. Probeer later opnieuw.'},503);
  }
});
