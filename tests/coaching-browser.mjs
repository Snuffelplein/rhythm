import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {accountFixture,userA,emptyAccount} from './fixtures/account.mjs';
import {buildCoachContext} from '../test-results/coach-edge/core.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL',timezoneId:'Europe/Amsterdam'});
const state=await accountFixture(context,{data:emptyAccount()});let calls=0,purges=0;
await context.route('https://*.supabase.co/**/rhythm*coach*',async route=>{
 const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
 const send=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
 if(req.method()==='OPTIONS')return send({});
 if(req.url().includes('/rpc/rhythm_coach_forget')){purges++;return send(null);}
 if(req.method()==='GET')return send({ready:true,model:'gpt-6-luna',dailyLimit:20});
 calls++;const body=req.postDataJSON(),data=state.rows.get(userA).data,ctx=await buildCoachContext(data,body.requestId,new Date().toISOString());assert.equal(body.expectedStamp,ctx.stamp);assert.equal(data.coaching.consent.enabled,true);
 return send({model:'gpt-6-luna',context:ctx,reply:{type:'plan',message:'Laten we het vandaag haalbaar houden. Past dit bij je?',question:'Past dit bij je?',claims:[],plan:{title:'Een rustige stap voor vandaag',goal:'Meer grip ervaren',scope:'today',steps:[{id:'step',kind:'reflection',title:'Schrijf op wat je vandaag nodig hebt',timeLocal:'',optional:true,sourceIds:['request:'+body.requestId]}]}}});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
const base=process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178';
try{
 await page.goto(base);await page.getByRole('button',{name:'Help me met vandaag',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Vertel wat je bezighoudt').fill('Ik voel me gefrustreerd en wil eerst vertellen.');await dialog.getByRole('button',{name:'Bewaar en ga lokaal verder',exact:true}).click();await dialog.getByText('Lokale gespreksstarter · geen GPT',{exact:true}).waitFor();assert.equal(calls,0);
 await page.reload();await page.getByRole('button',{name:'Help me met vandaag',exact:true}).click();assert.equal(await dialog.getByText('Ik voel me gefrustreerd en wil eerst vertellen.',{exact:true}).count(),1);
 await dialog.getByRole('button',{name:'Geheugen',exact:true}).click();await dialog.getByLabel('In jouw woorden').fill('Op werkdagen heb ik een vaste ochtendafspraak.');await dialog.getByRole('button',{name:'Bewaren voor mijn begeleiding',exact:true}).click();await dialog.getByText('Jouw afspraak is opgeslagen.',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Gesprek',exact:true}).click();await dialog.getByText('Online begeleiding · uit',{exact:true}).click();await dialog.getByLabel('Online begeleiding toestaan',{exact:true}).check();await dialog.getByRole('button',{name:'Keuze opslaan',exact:true}).click();await dialog.getByText(/Opgeslagen. Alleen wanneer jij/).waitFor();
 await dialog.getByLabel('Vertel wat je bezighoudt').fill('Ik wil samen een klein plan voor vandaag.');await dialog.getByRole('button',{name:'Verstuur naar de coach',exact:true}).click();await dialog.getByRole('button',{name:'Dit plan past bij mij',exact:true}).waitFor();assert.equal(calls,1);assert.equal(((await dialog.locator('.coach-message.assistant').last().innerText()).match(/Past dit bij je\?/g)??[]).length,1,'Do not repeat a question in the message and the separate question field');assert.equal(state.rows.get(userA).data.coaching.activePlanId,null,'proposal must not activate');
 await dialog.getByRole('button',{name:'Dit plan past bij mij',exact:true}).click();await dialog.getByRole('button',{name:'Vandaag overslaan',exact:true}).waitFor();await dialog.getByRole('button',{name:'Te veel',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.coach-feedback [aria-pressed=true]')?.textContent==='Te veel');
 await page.screenshot({path:'test-results/coach-mobile-plan.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await dialog.getByRole('button',{name:'Geheugen',exact:true}).click();await dialog.getByRole('button',{name:'Vergeten',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.coach-memories article'));
 await dialog.getByRole('button',{name:'Gesprek',exact:true}).click();page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Gesprek verwijderen',exact:true}).click();await dialog.getByText('Wat zou vandaag voor jou lichter maken?',{exact:true}).waitFor();assert.equal(await dialog.locator('.coach-message').count(),0);
 await context.setOffline(true);await dialog.getByLabel('Vertel wat je bezighoudt').fill('Offline notitie blijft bewaard.');await dialog.getByRole('button',{name:'Bewaar en ga lokaal verder',exact:true}).click();await dialog.getByText('Offline notitie blijft bewaard.',{exact:true}).waitFor();assert.equal(calls,1);await context.setOffline(false);
 await dialog.getByRole('button',{name:'Nieuw gesprek',exact:true}).waitFor({state:'visible'});await page.waitForTimeout(1000);assert.ok(purges>0);assert.deepEqual(errors,[]);
 console.log('Coach browser: mobile local conversation/reload, explicit consent, proposed/confirmed plan, feedback, forgetting, cache purge and offline input passed.');
}finally{await browser.close();}
