import {accountFixture,visualAccount} from './fixtures/account.mjs';
// Explicit opt-in test: downloads local models and a public speech fixture into an isolated browser context.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
const context=await chromium.launchPersistentContext('test-results/ai-profile',{channel:'msedge',headless:true,viewport:{width:1280,height:1000},locale:'nl-NL'});
await accountFixture(context);
const page=await context.newPage();page.setDefaultTimeout(180000);
const externalPosts=[];page.on('request',request=>{const url=new URL(request.url());if(url.protocol==='https:'&&!url.hostname.endsWith('.supabase.co')&&request.method()!=='GET'&&request.method()!=='HEAD')externalPosts.push(url.origin);});
let timer;
try{
  await page.goto(`${process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178'}/?testBuild=${Date.now()}`);
  // Retain model downloads between runs, but never run stale application code from the static shell cache.
  await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const key of await caches.keys())if(key.startsWith('rhythm-static-'))await caches.delete(key);});
  await page.goto('about:blank');
  await page.goto(process.env.RHYTHM_TEST_URL??'http://127.0.0.1:5173');
  await page.locator('.app-shell').waitFor();
  const nav=page.getByRole('navigation',{name:'Hoofdnavigatie'});
  await nav.getByRole('button',{name:'Meer',exact:true}).click();
  timer=setInterval(async()=>{try{console.log((await page.locator('.model-status').allTextContents()).join(' | '));}catch{}},15000);
  await page.getByRole('button',{name:'Download en laad Whisper',exact:true}).click();
  await page.locator('.model-status').filter({hasText:/Whisper is klaar|Whisper kon/}).waitFor();
  assert.match((await page.locator('.model-status').allTextContents()).join(' '),/Whisper is klaar/);
  console.log('Real Whisper model loaded');
  await nav.getByRole('button',{name:'Dagboek',exact:true}).click();
  await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();
  console.log('Fetching public speech fixture');
  const bytes=await page.evaluate(async()=>{const response=await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Public speech fixture unavailable');return Array.from(new Uint8Array(await response.arrayBuffer()));});
  await page.getByLabel('Audiobestand kiezen',{exact:true}).setInputFiles({name:'public-jfk-fixture.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});
  console.log('Transcribing public fixture locally');
  await page.getByRole('button',{name:'Omzetten met Whisper',exact:true}).click();
  await page.waitForTimeout(2000);
  await page.screenshot({path:'test-results/ai-transcribing.png'});
  await page.getByLabel('Transcriptie controleren',{exact:true}).or(page.getByRole('alert')).waitFor();
  assert.equal(await page.getByRole('alert').count(),0,await page.getByRole('alert').allTextContents());
  assert.ok((await page.getByLabel('Transcriptie controleren',{exact:true}).inputValue()).length>0);
  assert.equal(await page.getByLabel('Wat wil je onthouden?',{exact:true}).inputValue(),'','A transcript must remain a draft');
  await page.getByRole('button',{name:'Voeg gecontroleerde tekst toe',exact:true}).click();
  assert.ok((await page.getByLabel('Wat wil je onthouden?',{exact:true}).inputValue()).length>0);
  await page.getByRole('button',{name:'Sluiten',exact:true}).click();
  console.log('Real Whisper inference returned an editable draft');
  if(!process.argv.includes('--whisper-only')){
    await nav.getByRole('button',{name:'Meer',exact:true}).click();
    await page.getByRole('button',{name:'Download en laad Gemma',exact:true}).click();
    await page.locator('.model-status').filter({hasText:/Gemma is klaar|Gemma kon|Gemma heeft/}).waitFor();
    assert.match((await page.locator('.model-status').allTextContents()).join(' '),/Gemma is klaar/);
    console.log('Real Gemma model loaded');
    await nav.getByRole('button',{name:'Dagboek',exact:true}).click();
    await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();
    const note='Ik sliep in twee blokken. Vanmiddag voelde ik mij moe. Ik wil dit onthouden voor mijn dagboek.';
    await page.getByLabel('Wat wil je onthouden?',{exact:true}).fill(note);
    await page.getByRole('button',{name:'Samenvatten met Gemma',exact:true}).click();
    await page.getByLabel('Samenvatting controleren',{exact:true}).waitFor();
    assert.ok((await page.getByLabel('Samenvatting controleren',{exact:true}).inputValue()).length>0);
    assert.equal(await page.getByLabel('Wat wil je onthouden?',{exact:true}).inputValue(),note,'Gemma must not overwrite the original note');
    await page.getByRole('button',{name:'Voeg samenvatting toe',exact:true}).click();
    assert.ok((await page.getByLabel('Wat wil je onthouden?',{exact:true}).inputValue()).startsWith(note));
    await page.getByRole('button',{name:'Bewaar mijn notitie',exact:true}).click();
    console.log('Real Gemma inference returned a user-controlled summary');
  }
  assert.deepEqual(externalPosts,[],'Inference must not upload audio or text');
  console.log('Local AI smoke checks passed');
}catch(error){console.log('Model statuses:',await page.locator('.model-status').allTextContents());console.log('UI errors:',await page.getByRole('alert').allTextContents());throw error;}
finally{clearInterval(timer);await context.close();}
