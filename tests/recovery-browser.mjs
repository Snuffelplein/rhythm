import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {accountFixture,session,userA,userB,emptyAccount} from './fixtures/account.mjs';
const base=process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178';
const browser=await chromium.launch({channel:'msedge',headless:true});
async function setup(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL',reducedMotion:'reduce'});
 const state=await accountFixture(context,options),page=await context.newPage();page.setDefaultTimeout(12000);
 return {context,state,page};
}
const heading=page=>page.getByRole('heading',{name:'Een nieuw wachtwoord',exact:true});
async function replacePassword(page){await page.getByLabel('Wachtwoord',{exact:true}).fill('synthetic-replaced-password');await page.getByLabel('Herhaal wachtwoord',{exact:true}).fill('synthetic-replaced-password');await page.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).click();await page.locator('.app-shell').waitFor();}
try{
 // PKCE from the new explicit route, and existing root-code links.
 for(const marked of [true,false]){
  const {context,page,state}=await setup({seed:false});
  await page.goto(base);await page.getByRole('button',{name:'Wachtwoord vergeten?',exact:true}).click();await page.getByLabel('E-mailadres',{exact:true}).fill('a@example.invalid');await page.getByRole('button',{name:'Stuur herstelmail',exact:true}).click();await page.getByText(/Als dit adres bekend is/).waitFor();
  const request=state.requests.find(r=>r.path.endsWith('/recover'));assert.equal(request.redirectTo,new URL(base).origin+'/?auth=recovery');assert.equal(request.body.code_challenge_method,'s256');
  await page.goto(base+(marked?'/?auth=recovery&code=synthetic-code':'/?code=synthetic-code'));await heading(page).waitFor();assert.ok(!page.url().includes('code='));assert.equal(new URL(page.url()).searchParams.get('auth'),'recovery');
  assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0,'Do not load account content before finishing recovery');
  await page.reload();await heading(page).waitFor();await replacePassword(page);assert.ok(!page.url().includes('auth=recovery'));assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')).length,1);await context.close();
 }
 // Older / dashboard-issued recovery links carry verified bearer credentials in the fragment.
 {
  const {context,page,state}=await setup({seed:false});const s=session(userA);
  await page.goto(base+'/#'+new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token,expires_in:'86400',token_type:'bearer'}));await heading(page).waitFor();assert.equal(new URL(page.url()).hash,'');assert.ok(!(await page.evaluate(()=>sessionStorage.getItem('rhythm.recovery.v1'))).includes(s.access_token));await page.reload();await heading(page).waitFor();await replacePassword(page);assert.equal(state.rows.get(userA).data.profile.givenName,'Noor');await context.close();
 }
 // Route intent cannot turn an existing normal login into a verified recovery.
 {
  const {context,page,state}=await setup();await page.goto(base+'/?auth=recovery');await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(await heading(page).count(),0);assert.equal(await page.getByRole('button',{name:'Bewaar wachtwoord',exact:true}).count(),0);assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0);await page.reload();await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();await context.close();
 }
 // A link opened outside its requesting PKCE browser fails clearly, even with an existing login.
 {
  const {context,page,state}=await setup();await page.goto(base+'/?auth=recovery&code=synthetic-foreign-browser-code');await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();await page.getByText(/dezelfde browser/).waitFor();assert.equal(await heading(page).count(),0);assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')).length,0);assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0);await context.close();
 }
 // Expired links retain a useful recovery request form, not an ordinary landing page.
 {
  const {context,page}=await setup({seed:false});await page.goto(base+'/#error=access_denied&error_code=otp_expired&error_description=synthetic');await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();await page.getByText(/verlopen of al gebruikt/).waitFor();await page.getByRole('button',{name:'Stuur herstelmail',exact:true}).waitFor();assert.ok(!page.url().includes('error_description'));await context.close();
 }
 // Invalid legacy credentials are never treated as proof, and a valid different owner is explicit.
 {
  const {context,page,state}=await setup({seed:false});await context.route('**/rpc/account_session_active',r=>r.fulfill({contentType:'application/json',body:'false'}));const s=session(userA);await page.goto(base+'/#'+new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token}));await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(await heading(page).count(),0);assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')).length,0);await context.close();
 }
 {
  const {context,page,state}=await setup({seed:false});await context.route('**/auth/v1/verify',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(session(userA))}));await page.goto(base+'/?auth=recovery&type=recovery&token_hash=synthetic-token-hash');await heading(page).waitFor();assert.ok(!page.url().includes('token_hash'));await replacePassword(page);assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')).length,1);await context.close();
 }
 {
  const {context,page,state}=await setup({seed:false}),s=session(userA);await page.goto(base+'/#'+new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token}));await heading(page).waitFor();await page.evaluate(s=>{const channel=new BroadcastChannel('rhythm.auth.v1');channel.postMessage({event:'SIGNED_IN',session:s});setTimeout(()=>channel.close(),100);},session(userB));await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(await heading(page).count(),0);assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path.endsWith('/user')).length,0);await context.close();
 }
 {
  const {context,page,state}=await setup();await context.route('**/auth/v1/user',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'bad_jwt',message:'Synthetic rejection'})}));const s=session(userB);await page.goto(base+'/#'+new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token}));await page.getByRole('heading',{name:'Je herstellink openen',exact:true}).waitFor();assert.equal(state.requests.filter(r=>r.path.endsWith('/account_data')).length,0);assert.equal(await heading(page).count(),0);await context.close();
 }
 {
  const {context,page,state}=await setup();state.rows.set(userB,{user_id:userB,data:emptyAccount(),revision:1,change_id:crypto.randomUUID(),updated_at:new Date().toISOString()});const s=session(userB);await page.goto(base+'/#'+new URLSearchParams({type:'recovery',access_token:s.access_token,refresh_token:s.refresh_token}));await heading(page).waitFor();await page.getByText('b@example.invalid',{exact:true}).waitFor();assert.equal(await page.getByText('a@example.invalid',{exact:true}).count(),0);await replacePassword(page);assert.equal(state.rows.get(userA).data.coaching,undefined);await context.close();
 }
 console.log('Recovery browser: explicit/legacy PKCE routes, legacy token links, reload, password update, URL cleanup, expired/foreign-browser/forged links, no pre-recovery data reads and owner isolation passed. No real emails.');
}catch(e){for(const c of browser.contexts())for(const p of c.pages())console.log('Synthetic recovery page:',(await p.locator('body').innerText()).slice(0,1800));throw e;}finally{await browser.close();}
