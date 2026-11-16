import {accountFixture,visualAccount} from './fixtures/account.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL',timezoneId:'Europe/Amsterdam'});
await accountFixture(context);
const page=await context.newPage();page.setDefaultTimeout(15000);
const external=[];page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)&&!url.hostname.match(/^(127\.0\.0\.1|localhost)$/))external.push(request.url());});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await mkdir('test-results',{recursive:true});
try{
  await page.goto(process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178');
  await page.locator('.app-shell').waitFor();
  const nav=page.getByRole('navigation',{name:'Mobiele navigatie'});
  await nav.getByRole('button',{name:'Slaap',exact:true}).click();
  const before=await page.locator('.session-row').count();
  await page.getByRole('button',{name:'Slaapblok toevoegen',exact:true}).click();
  const today=new Date();today.setDate(today.getDate()-16);
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(today);
  await page.getByLabel('Slaapbegin (schatting)',{exact:true}).fill(`${date}T02:00`);
  await page.getByLabel('Einde slaapblok',{exact:true}).fill(`${date}T05:00`);
  await page.getByRole('button',{name:'Bewaar slaapblok en ga verder',exact:true}).click();
  await page.getByRole('heading',{name:'Hoe voel je je nu?',exact:true}).waitFor();
  await page.getByRole('dialog').screenshot({path:'test-results/logflow-energie.png'});
  await page.getByRole('button',{name:'Sluiten',exact:true}).click();
  assert.equal(await page.locator('.session-row').count(),before+1,'Saved sleep must survive closing the optional check-in');
  await nav.getByRole('button',{name:'Dagboek',exact:true}).click();
  await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}},configurable:true});});
  await page.getByRole('button',{name:'Inspreken',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Geen microfoontoegang'}).waitFor();
  await page.getByLabel('Wat wil je onthouden?',{exact:true}).fill('Typen blijft beschikbaar zonder microfoon of AI.');
  // Minimal synthetic WAV; no microphone recording and no real health data.
  const wav=Buffer.alloc(44+16000);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await page.getByLabel('Audiobestand kiezen',{exact:true}).setInputFiles({name:'synthetisch.wav',mimeType:'audio/wav',buffer:wav});
  assert.equal(await page.getByRole('button',{name:'Omzetten met Whisper',exact:true}).isDisabled(),true);
  await page.getByLabel('Opname bij mijn notitie bewaren',{exact:false}).check();
  await page.getByRole('button',{name:'Bewaar mijn notitie',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByLabel('Opgeslagen dagboekopname',{exact:true}).count(),1);
  await nav.getByRole('button',{name:'Meer',exact:true}).click();
  await page.getByText('Whisper & Gemma',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download en laad Whisper',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Download en laad Gemma',exact:true}).count(),1);
  // Capability failure must stay explicit and never fall back to sending journal content to a server.
  await page.evaluate(()=>{Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});});
  await page.getByRole('button',{name:'Download en laad Gemma',exact:true}).click();
  await page.getByText(/Gemma heeft WebGPU nodig/).waitFor();
  assert.deepEqual(external.filter(url=>!url.includes('.supabase.co/')),[],'AI models must not activate without opt-in');
  assert.deepEqual(errors,[]);
  console.log('Log flow mobile checks passed: persistence after close, skipped steps, microphone denied fallback, audio opt-in, model controls, no automatic external requests, unsupported GPU.');
}catch(error){await page.screenshot({path:'test-results/logflow-failure.png',fullPage:true});throw error;}
finally{await browser.close();}
