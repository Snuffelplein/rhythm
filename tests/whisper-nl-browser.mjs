// Explicit download/inference benchmark, separate from ordinary regression tests.
// Uses public CC-BY-4.0 FLEURS recordings, never the user's voice or health logs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { accountFixture } from './fixtures/account.mjs';
const root='test-results/whisper-nl',label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'current';
assert.match(label,/^[a-z0-9.-]+$/i);
await mkdir(root,{recursive:true});
let fixtures;
try{fixtures=JSON.parse(await readFile(root+'/fixtures.json','utf8'));}
catch{const response=await fetch('https://datasets-server.huggingface.co/rows?dataset=google%2Ffleurs&config=nl_nl&split=test&offset=0&length=3',{signal:AbortSignal.timeout(30000)});assert.equal(response.ok,true);const data=await response.json();fixtures=[];for(const {row} of data.rows){const audio=await fetch(row.audio[0].src,{signal:AbortSignal.timeout(30000)});assert.equal(audio.ok,true);const file=`${root}/${row.id}.wav`;await writeFile(file,Buffer.from(await audio.arrayBuffer()));fixtures.push({id:row.id,reference:row.transcription,file});}await writeFile(root+'/fixtures.json',JSON.stringify(fixtures,null,2));}
const words=text=>text.normalize('NFKC').toLocaleLowerCase('nl-NL').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];}
const context=await chromium.launchPersistentContext(root+'/browser',{channel:'msedge',headless:true,viewport:{width:1280,height:1000},reducedMotion:'reduce'});
const result={label,source:'google/fleurs nl_nl test first 3 rows; CC-BY-4.0',sourceUrl:'https://huggingface.co/datasets/google/fleurs',checkedAt:new Date().toISOString(),samples:[]};
let progress;
try{
 await accountFixture(context);const page=await context.newPage();page.setDefaultTimeout(300000);const uploads=[];page.on('request',r=>{const u=new URL(r.url());if(u.protocol==='https:'&&!u.hostname.endsWith('.supabase.co')&&!['GET','HEAD'].includes(r.method()))uploads.push(u.origin);});const base=process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178';
 await page.goto(base);await page.evaluate(async()=>{for(const sw of await navigator.serviceWorker.getRegistrations())await sw.unregister();for(const key of await caches.keys())if(key.startsWith('rhythm-static-'))await caches.delete(key);});await page.goto('about:blank');await page.goto(base);
 const nav=()=>page.getByRole('navigation',{name:'Hoofdnavigatie'});await nav().getByRole('button',{name:'Meer',exact:true}).click();
 if(process.argv.includes('--long')){
   const inputs=await Promise.all(fixtures.map(async f=>Array.from(await readFile(f.file))));
   const bytes=await page.evaluate(async inputs=>{
     const context=new OfflineAudioContext(1,1,16000),parts=[];
     for(const input of inputs){const decoded=await context.decodeAudioData(Uint8Array.from(input).buffer);assertRate(decoded.sampleRate);parts.push(decoded.getChannelData(0));}
     function assertRate(rate){if(rate!==16000)throw new Error('Unexpected fixture sample rate');}
     const gap=4800,length=3*parts.reduce((n,p)=>n+p.length+gap,0),buffer=new ArrayBuffer(44+length*2),v=new DataView(buffer);
     const label=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};label(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);label(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);label(36,'data');v.setUint32(40,length*2,true);let at=44;
     for(let i=0;i<3;i++)for(const part of parts){for(const sample of part){v.setInt16(at,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);at+=2;}at+=gap*2;}
     return Array.from(new Uint8Array(buffer));
   },inputs);
   const file=root+'/long.wav';await writeFile(file,Buffer.from(bytes));fixtures=[...fixtures,{id:'long-3x',file,reference:Array(3).fill(fixtures.map(f=>f.reference).join(' ')).join(' ')}];
 }
 const start=Date.now();progress=setInterval(async()=>{try{console.log((await page.locator('.model-status').allTextContents()).join(' | '));}catch{}},15000);
 await page.getByRole('button',{name:'Download en laad Whisper',exact:true}).click();await page.locator('.model-status').filter({hasText:/Whisper is klaar|Whisper kon/}).waitFor();assert.match((await page.locator('.model-status').allTextContents()).join(' '),/Whisper is klaar/);result.loadMs=Date.now()-start;
 await nav().getByRole('button',{name:'Dagboek',exact:true}).click();
 for(const fixture of fixtures){await page.getByRole('button',{name:'Notitie schrijven',exact:true}).click();await page.getByLabel('Audiobestand kiezen',{exact:true}).setInputFiles(fixture.file);const start=Date.now();await page.getByRole('button',{name:'Omzetten met Whisper',exact:true}).click();await page.getByLabel('Transcriptie controleren',{exact:true}).or(page.getByRole('dialog').getByRole('alert')).waitFor();assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);const transcript=await page.getByLabel('Transcriptie controleren',{exact:true}).inputValue(),reference=words(fixture.reference),errors=distance(reference,words(transcript));result.samples.push({id:fixture.id,reference:fixture.reference,transcript,errors,referenceWords:reference.length,wer:errors/reference.length,elapsedMs:Date.now()-start});console.log(JSON.stringify(result.samples.at(-1)));await page.getByRole('button',{name:'Sluiten',exact:true}).click();}
 const errors=result.samples.reduce((n,s)=>n+s.errors,0),count=result.samples.reduce((n,s)=>n+s.referenceWords,0);result.wer=errors/count;console.log(`Dutch benchmark ${label}: ${errors}/${count} word edits (${(result.wer*100).toFixed(1)}%); small exploratory sample, not a product accuracy guarantee.`);
 if(process.argv.includes('--check')){const short=result.samples.filter(s=>typeof s.id==='number'),shortWer=short.reduce((n,s)=>n+s.errors,0)/short.reduce((n,s)=>n+s.referenceWords,0);assert.ok(shortWer<0.35,'Dutch fixture word-error regression');for(const sample of result.samples.filter(s=>typeof s.id==='string'))assert.ok(sample.wer<0.4,'Long Dutch recording must not regress or truncate');}
 assert.deepEqual(uploads,[],'Transcription must not upload audio/text to an external AI service');
}finally{clearInterval(progress);await context.close();await writeFile(`${root}/${label}.json`,JSON.stringify(result,null,2));}
