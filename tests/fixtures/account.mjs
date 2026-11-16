import assert from 'node:assert/strict';
export const userA='10000000-0000-4000-8000-000000000001',userB='10000000-0000-4000-8000-000000000002';
const expiry=Math.floor(Date.now()/1000)+86400;
const sessionId='20000000-0000-4000-8000-000000000001';
const user=id=>({id,aud:'authenticated',role:'authenticated',email:id===userA?'a@example.invalid':'b@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString(),identities:[],is_anonymous:false});
export const token=id=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,session_id:sessionId,role:'authenticated',exp:expiry})).toString('base64url')+'.synthetic';
export const session=id=>({access_token:token(id),refresh_token:`synthetic-refresh-${id}`,token_type:'bearer',expires_in:86400,expires_at:expiry,user:user(id)});
export function emptyAccount(completed=true){return {schemaVersion:1,sessions:[],intent:null,wakeMarkers:[],checkins:[],journal:[],audit:[],settings:{timezone:'Europe/Amsterdam',goalBed:'',goalWake:'',theme:'dark'},...(completed?{profile:{version:1,givenName:'Noor',birthDate:'',challenges:['daytime_tired'],duration:'months',context:'',goals:['understand'],completedAtUtc:'2026-11-15T08:00:00.000Z'}}:{})};}
export function visualAccount(now='2026-11-15T18:00:00.000Z'){const d=emptyAccount();d.settings.goalWake='07:30';d.settings.goalBed='23:00';for(let i=0;i<14;i++){if(i===4||i===9)continue;const day=new Date(Date.parse(now)-(13-i)*86400000).toISOString().slice(0,10);d.sessions.push({id:`visual-${i}`,startUtc:day+'T01:30:00.000Z',endUtc:day+'T05:45:00.000Z',originalTimezone:'Europe/Amsterdam',source:'user_reported',reviewStatus:'confirmed',kind:'sleep',interruptions:[],estimatedAwakeMinutes:0,createdAtUtc:now,updatedAtUtc:now});}d.journal=[{id:'visual-note',atUtc:now,text:'Synthetische notitie voor visuele verificatie.'}];return d;}
export async function accountFixture(context,{data=emptyAccount(),seed=true,shared}={}){
 const state=shared??{rows:new Map(),revisions:new Map(),recoveries:new Map(),audio:new Map(),requests:[],failRead:false,dropReply:false};
 if(data&&!state.rows.has(userA))state.rows.set(userA,{user_id:userA,data:structuredClone(data),revision:1,change_id:crypto.randomUUID(),updated_at:new Date().toISOString()});
 if(seed)await context.addInitScript(({s})=>{if(!localStorage.getItem('rhythm.fixture.initialized')){localStorage.setItem('rhythm.auth.v1',JSON.stringify(s));localStorage.setItem('rhythm.fixture.initialized','1');}},{s:session(userA)});
 await context.route('https://*.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());let body;try{body=req.postDataJSON();}catch{}
  state.requests.push({path:url.pathname,method:req.method(),body});
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range'};
  const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return respond({});
  if(url.pathname.endsWith('/token'))return respond(session(body?.email==='b@example.invalid'||body?.refresh_token?.endsWith(userB)?userB:userA));
  if(url.pathname.endsWith('/signup'))return respond({user:user(userA),session:null});
  if(url.pathname.endsWith('/recover')||url.pathname.endsWith('/logout'))return respond({});
  const id=req.headers().authorization?.includes(token(userB))?userB:userA;
  if(url.pathname.endsWith('/user'))return respond(user(id));
  if(url.pathname.endsWith('/rpc/account_session_active'))return respond(true);
  if(url.pathname.endsWith('/encrypted_vaults'))return respond([]);
  if(url.pathname.endsWith('/push_devices')&&req.method()==='GET')return respond([]);
  if(url.pathname.includes('/storage/v1/object/')){
    const name=decodeURIComponent(url.pathname.split('/rhythm-audio/')[1]??'');assert.ok(name.startsWith(id+'/'),'Audio must be owner scoped');
    if(req.method()==='POST'){let bytes=req.postDataBuffer(),mime=req.headers()['content-type'];if(mime?.includes('multipart/form-data')){const form=await new Response(bytes,{headers:{'content-type':mime}}).formData();const file=form.get('');assert.ok(file instanceof Blob);bytes=Buffer.from(await file.arrayBuffer());mime=file.type;}if(state.audio.has(name))return respond({statusCode:'409',message:'already exists'},409);state.audio.set(name,{bytes,mime});return respond({Key:'rhythm-audio/'+name});}
    const file=state.audio.get(name);return file?route.fulfill({headers,contentType:file.mime,body:file.bytes}):respond({message:'missing'},404);
  }
  const object=req.headers().accept?.includes('vnd.pgrst.object');const represent=row=>object?row??null:row?[row]:[];
  if(url.pathname.endsWith('/account_data')){
   assert.equal(url.searchParams.get('user_id')?.replace('eq.','')??body?.user_id,id);
   if(req.method()==='GET'){if(state.failRead)return respond({message:'unavailable'},503);return respond(represent(state.rows.get(id)));}
   const old=state.rows.get(id);if(req.method()==='POST'&&old)return respond({code:'23505'},409);
   if(req.method()==='PATCH'&&(url.searchParams.get('revision')!==`eq.${old?.revision}`||url.searchParams.get('change_id')!==`eq.${old?.change_id}`))return respond(represent(null));
   assert.ok(!body.data.journal.some(n=>n.audio),'Inline audio must not go into account JSON');
   if(old){const versions=state.revisions.get(id)??[];versions.push({...old,saved_at:new Date().toISOString()});state.revisions.set(id,versions.slice(-10));}
   const row={...body,updated_at:new Date().toISOString()};state.rows.set(id,row);if(state.dropReply){state.dropReply=false;return route.abort();}return respond(represent(row));
  }
  if(url.pathname.endsWith('/account_revisions')){assert.equal(url.searchParams.get('user_id'),`eq.${id}`);const list=state.revisions.get(id)??[];const revision=url.searchParams.get('revision');return respond(revision?list.find(r=>r.revision===Number(revision.slice(3))):list.map(r=>({revision:r.revision,saved_at:r.saved_at})).reverse());}
  if(url.pathname.endsWith('/account_recovery')){if(req.method()==='POST'){assert.equal(body.user_id,id);const list=state.recoveries.get(id)??[];list.push({...body,saved_at:new Date().toISOString()});state.recoveries.set(id,list.slice(-10));return respond({});}assert.equal(url.searchParams.get('user_id'),`eq.${id}`);const list=state.recoveries.get(id)??[],key=url.searchParams.get('id');return respond(key?list.find(v=>v.id===key.slice(3)):list.map(({id,saved_at})=>({id,saved_at})));}
  throw new Error('Unexpected fixture endpoint '+url.pathname);
 });
 return state;
}
export async function login(page,email='a@example.invalid'){await page.getByLabel('E-mailadres',{exact:true}).fill(email);await page.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-account-password');await page.getByRole('button',{name:'Log in',exact:true}).click();}
export const more=page=>page.getByRole('navigation',{name:'Mobiele navigatie'}).getByRole('button',{name:'Meer',exact:true}).click();
