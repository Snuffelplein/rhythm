import {accountFixture} from './fixtures/account.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateVAPIDKeys } from 'web-push';
const keys=generateVAPIDKeys(),id='10000000-0000-4000-8000-000000000001';
const user={id,aud:'authenticated',role:'authenticated',email:'push@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString(),identities:[],is_anonymous:false};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session={access_token:token,refresh_token:'push-test-refresh',token_type:'bearer',expires_in:3600,user};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await accountFixture(context);
 const requests=[];let device=null;
 await context.addInitScript(({publicKey})=>{
   let subscribed=false;window.pushPermissionRequests=0;
   Object.defineProperty(window,'Notification',{configurable:true,value:class {static permission='default';static async requestPermission(){window.pushPermissionRequests++;this.permission='granted';return 'granted';}}});
   const sub={endpoint:'https://web.push.apple.com/BROWSER-FIXTURE',toJSON:()=>({endpoint:'https://web.push.apple.com/BROWSER-FIXTURE',expirationTime:null,keys:{p256dh:publicKey,auth:'B'.repeat(22)}}),unsubscribe:async()=>{subscribed=false;return true;}};
   Object.defineProperty(ServiceWorkerRegistration.prototype,'pushManager',{configurable:true,get:()=>({getSubscription:async()=>subscribed?sub:null,subscribe:async()=>{subscribed=true;return sub;}})});
 },{publicKey:keys.publicKey});
 await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();requests.push({path:url.pathname,method:req.method(),body});
   const respond=(json,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(json)});
   if(req.method()==='OPTIONS')return respond({});
   if(url.pathname.endsWith('/token'))return respond(session);
   if(url.pathname.endsWith('/user'))return respond(user);
   if(url.pathname.endsWith('/logout'))return respond({});
   if(url.pathname.endsWith('/encrypted_vaults'))return respond([]);
   if(url.pathname.endsWith('/rhythm-reminders'))return respond(url.searchParams.get('action')==='key'?{publicKey:keys.publicKey,ready:true}:{accepted:true},url.searchParams.get('action')==='test'?202:200);
   if(url.pathname.endsWith('/push_devices')) {
     if(req.method()==='GET')return respond(device);
     if(req.method()==='DELETE'){device=null;return respond([]);}
     if(body.schedule)assert.ok(body.schedule.every(s=>Object.keys(s).sort().join(',')===(s.kind==='winddown'?'anchorTime,kind,leadMinutes,time':'kind,time')));
     assert.ok(!JSON.stringify(body).includes('guidance-browser-key'));
     device={id:'20000000-0000-4000-8000-000000000001',...device,...body,session_id:JSON.parse(Buffer.from(req.headers().authorization.split('.')[1],'base64url').toString()).session_id,last_status:'ready',last_sent_at:null};
     return respond(req.headers().prefer?.includes('return=representation')?device:null,req.method()==='POST'?201:200);
   }
   return route.fallback();
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178');
 const nav=()=>page.getByRole('navigation',{name:'Mobiele navigatie'});
 await page.locator('.app-shell').waitFor();
 await nav().getByRole('button',{name:'Wekker',exact:true}).click();await page.getByLabel('Gewenst naar bed',{exact:true}).fill('23:00');await page.getByRole('button',{name:'Bewaar mijn dagankers',exact:true}).click();
 const panel=page.getByRole('region',{name:'Pushherinneringen'}),enable=()=>panel.getByRole('button',{name:'Zet herinneringen aan',exact:true});
 await enable().waitFor();assert.equal(await enable().isDisabled(),true);assert.equal(await page.evaluate(()=>window.pushPermissionRequests),0);assert.equal(requests.filter(r=>r.path.endsWith('/push_devices')&&r.method==='POST').length,0);
 await panel.getByLabel('Ik wil deze herinneringen.',{exact:false}).check();await enable().click();await panel.getByText('Je herinneringen zijn ingepland.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.pushPermissionRequests),1);assert.deepEqual(device.schedule,[{kind:'winddown',time:'22:30',anchorTime:'23:00',leadMinutes:30},{kind:'bed',time:'23:00'}]);
 await panel.getByRole('button',{name:'Testmelding',exact:true}).click();await panel.getByText('Test verstuurd naar de pushdienst.',{exact:false}).waitFor();
 await page.mouse.move(0,0);await panel.getByRole('button',{name:'24 uur pauze',exact:true}).click();await panel.getByText('24 uur gepauzeerd',{exact:true}).waitFor();assert.ok(Date.parse(device.paused_until)>Date.now());
 await panel.getByRole('button',{name:'Zet uit op dit apparaat',exact:true}).click();await panel.getByText('Herinneringen op dit apparaat zijn uitgezet.',{exact:true}).waitFor();assert.equal(device,null);
 assert.deepEqual(errors,[]);console.log('Push UI passed with fixtures: no permission/upload before consent, selected schedule only, test request, pause and unsubscribe. No real notifications sent.');
} finally {await browser.close();}
