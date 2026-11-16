import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {accountFixture,session,userA} from './fixtures/account.mjs';
const base=process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const pwa=await browser.newContext({viewport:{width:390,height:844}});
 const state=await accountFixture(pwa,{seed:false});const app=await pwa.newPage();app.setDefaultTimeout(12000);
 await app.goto(base);await app.evaluate(()=>localStorage.setItem('rhythm.auth.v1-code-verifier',JSON.stringify('synthetic-normal-pkce-proof')));await app.getByRole('button',{name:'Wachtwoord vergeten?',exact:true}).click();await app.getByLabel('E-mailadres',{exact:true}).fill('a@example.invalid');await app.getByRole('button',{name:'Stuur herstelmail',exact:true}).click();await app.getByText(/Als dit adres bekend is/).waitFor();
 const request=state.requests.find(r=>r.path.endsWith('/recover'));assert.equal(request.body.code_challenge??null,null);assert.equal(request.body.code_challenge_method??null,null);assert.equal(await app.evaluate(()=>JSON.parse(localStorage.getItem('rhythm.auth.v1-code-verifier'))),'synthetic-normal-pkce-proof','Recovery must preserve a normal pending PKCE flow');
 const safari=await browser.newContext({viewport:{width:390,height:844}});
 await accountFixture(safari,{shared:state,data:null,seed:false});
 const recipient=await safari.newPage();recipient.setDefaultTimeout(12000);
 let verification=null,used=false;
 const emailUrl=new URL('https://hphwmhmssexnrhkcxdpi.supabase.co/auth/v1/verify');emailUrl.searchParams.set('token','synthetic-standard-email-proof');emailUrl.searchParams.set('type','recovery');emailUrl.searchParams.set('redirect_to',request.redirectTo);const link=emailUrl.href;
 await safari.route('**/auth/v1/verify?*',async route=>{
  const url=new URL(route.request().url());verification={method:route.request().method(),type:url.searchParams.get('type'),token:url.searchParams.get('token')};assert.deepEqual(verification,{method:'GET',type:'recovery',token:'synthetic-standard-email-proof'});
  const landing=new URL(url.searchParams.get('redirect_to'));assert.equal(landing.origin,new URL(base).origin);assert.equal(landing.searchParams.get('auth'),'recovery');
  if(used)landing.hash=new URLSearchParams({error:'access_denied',error_code:'otp_expired'}).toString();
  else{used=true;const s=session(userA);landing.hash=new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token,expires_in:'86400',token_type:'bearer'}).toString();}
  return route.fulfill({status:303,headers:{location:landing.href},body:''});
 });
 await recipient.goto(link);await recipient.getByRole('heading',{name:'Een nieuw wachtwoord',exact:true}).waitFor();
 assert.ok(verification);assert.equal(await recipient.evaluate(()=>localStorage.getItem('rhythm.auth.v1-code-verifier')),null,'The receiving browser has no PKCE verifier');
 assert.equal(new URL(recipient.url()).hash,'');
 assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0);
 await recipient.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await recipient.getByLabel('Herhaal wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await recipient.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).click();await recipient.locator('.app-shell').waitFor();
 assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')&&r.body.password==='synthetic-cross-context-password').length,1);
 await app.getByRole('button',{name:'Terug naar inloggen',exact:true}).click();await app.getByLabel('E-mailadres',{exact:true}).fill('a@example.invalid');await app.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await app.getByRole('button',{name:'Log in',exact:true}).click();await app.locator('.app-shell').waitFor();assert.ok(state.requests.some(r=>r.path.endsWith('/token')&&r.body?.password==='synthetic-cross-context-password'));
 // The same email proof must not create a second session when clicked again.
 const replay=await safari.newPage();await replay.goto(link);await replay.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(await replay.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).count(),0);
 console.log('Cross-context recovery: standard mail request without PKCE challenge, isolated receiving browser, verified token-fragment callback, password update, PWA re-login, preserved normal PKCE proof and replay denial passed. Synthetic Auth; no custom SMTP or template required.');
}finally{await browser.close();}
