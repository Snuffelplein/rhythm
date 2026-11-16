import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {accountFixture,session,userA} from './fixtures/account.mjs';
const base=process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178';
const template=await readFile('supabase/templates/recovery.html','utf8');
assert.ok(template.includes('{{ .TokenHash }}'));
assert.ok(!template.includes('.ConfirmationURL'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const pwa=await browser.newContext({viewport:{width:390,height:844}});
 const state=await accountFixture(pwa,{seed:false});const app=await pwa.newPage();app.setDefaultTimeout(12000);
 await app.goto(base);await app.getByRole('button',{name:'Wachtwoord vergeten?',exact:true}).click();await app.getByLabel('E-mailadres',{exact:true}).fill('a@example.invalid');await app.getByRole('button',{name:'Stuur herstelmail',exact:true}).click();await app.getByText(/Als dit adres bekend is/).waitFor();
 assert.ok(await app.evaluate(()=>!!localStorage.getItem('rhythm.auth.v1-code-verifier')),'PKCE proof exists only in the requesting context');
 const safari=await browser.newContext({viewport:{width:390,height:844}});
 await accountFixture(safari,{shared:state,data:null,seed:false});
 const recipient=await safari.newPage();recipient.setDefaultTimeout(12000);
 let verification=null,used=false;
 await safari.route('**/auth/v1/verify',async route=>{
  verification=route.request().postDataJSON();
  assert.equal(verification.type,'recovery');assert.equal(verification.token_hash,'synthetic-email-token-hash');assert.ok(!('code_verifier' in verification));
  if(used)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'otp_expired',message:'Synthetic one-use link already consumed'})});
  used=true;return route.fulfill({contentType:'application/json',body:JSON.stringify(session(userA))});
 });
 const emailHref=template.match(/href="([^"]+)"/)[1].replace('{{ .TokenHash }}','synthetic-email-token-hash').replaceAll('&amp;','&');
 const url=new URL(emailHref);assert.equal(url.origin,'https://rhythm-rho-bice.vercel.app');
 const link=new URL(url.pathname+url.search,base).href;
 await recipient.goto(link);await recipient.getByRole('heading',{name:'Een nieuw wachtwoord',exact:true}).waitFor();
 assert.ok(verification);assert.equal(await recipient.evaluate(()=>localStorage.getItem('rhythm.auth.v1-code-verifier')),null,'The receiving browser has no PKCE verifier');
 assert.ok(!recipient.url().includes('token_hash'));
 assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0);
 await recipient.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await recipient.getByLabel('Herhaal wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await recipient.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).click();await recipient.locator('.app-shell').waitFor();
 assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')&&r.body.password==='synthetic-cross-context-password').length,1);
 await app.getByRole('button',{name:'Terug naar inloggen',exact:true}).click();await app.getByLabel('E-mailadres',{exact:true}).fill('a@example.invalid');await app.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-cross-context-password');await app.getByRole('button',{name:'Log in',exact:true}).click();await app.locator('.app-shell').waitFor();assert.ok(state.requests.some(r=>r.path.endsWith('/token')&&r.body?.password==='synthetic-cross-context-password'));
 // The same email proof must not create a second session when clicked again.
 const replay=await safari.newPage();await replay.goto(link);await replay.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(await replay.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).count(),0);
 console.log('Cross-context recovery: prepared template, request in isolated PWA context, verify in separate browser without PKCE storage, password update, PWA re-login and replay denial passed. Synthetic Auth; no real email/template configuration claimed.');
}finally{await browser.close();}
