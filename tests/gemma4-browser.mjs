import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {accountFixture} from './fixtures/account.mjs';
const context=await chromium.launchPersistentContext('test-results/gemma4-profile',{channel:'msedge',headless:true,viewport:{width:1280,height:1000},locale:'nl-NL'});
await accountFixture(context);const page=await context.newPage();page.setDefaultTimeout(330000);const uploads=[];
page.on('request',r=>{if(r.url().startsWith('https:')&&!new URL(r.url()).hostname.endsWith('.supabase.co')&&!['GET','HEAD','OPTIONS'].includes(r.method()))uploads.push(r.url());});
const timer=setInterval(async()=>{try{console.log('Gemma4:',await page.locator('.model-status').allTextContents());}catch{}},20000);
page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('Browser:',m.text());});
page.on('requestfailed',r=>console.log('Download failed:',r.url(),r.failure()?.errorText));
try{
 await page.goto(process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178');await page.locator('.app-shell').waitFor();await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Meer',exact:true}).click();
 await page.getByRole('button',{name:'Download en laad Gemma',exact:true}).click();await page.locator('.model-status').filter({hasText:/Gemma is klaar|Gemma kon|Gemma heeft/}).waitFor();
 const status=(await page.locator('.model-status').allTextContents()).join(' ');assert.match(status,/Gemma is klaar.*Gemma 4 E2B/);
 await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Dagboek',exact:true}).click();await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();const note='Ik voelde me moe. Ik heb rustig gewandeld en wil dat morgen weer proberen.';await page.getByLabel('Wat wil je onthouden?',{exact:true}).fill(note);await page.getByRole('button',{name:'Samenvatten met Gemma',exact:true}).click();await page.getByLabel('Samenvatting controleren',{exact:true}).waitFor();const summary=await page.getByLabel('Samenvatting controleren',{exact:true}).inputValue();assert.ok(summary.trim());assert.equal(await page.getByLabel('Wat wil je onthouden?',{exact:true}).inputValue(),note);assert.deepEqual(uploads,[]);console.log('Gemma4 real inference:',summary);console.log('Gemma4: real download, inference, original preservation and no AI uploads passed.');
}catch(e){console.log('Gemma4 status:',await page.locator('.model-status').allTextContents());console.log('Gemma4 errors:',await page.getByRole('alert').allTextContents());throw e;}finally{clearInterval(timer);await context.close();}
