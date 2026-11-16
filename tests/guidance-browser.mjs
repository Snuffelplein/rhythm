import {accountFixture,visualAccount} from './fixtures/account.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Amsterdam',locale:'nl-NL',reducedMotion:'reduce'});
  await accountFixture(context);
const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.RHYTHM_TEST_URL??'http://127.0.0.1:4178');
  await page.locator('.app-shell').waitFor();
  const guidance=()=>page.getByRole('region',{name:'Dagankers en routine'});
  await guidance().getByRole('heading',{name:'Jouw dagankers en routine'}).waitFor();
  await guidance().getByRole('button',{name:'Mijn routine',exact:true}).click();
  await page.getByLabel('Gewenste dagstart',{exact:true}).fill('07:30');await page.getByLabel('Gewenst naar bed',{exact:true}).fill('23:00');await page.getByRole('button',{name:'Bewaar mijn dagankers',exact:true}).click();
  await guidance().locator('.plan-event').first().waitFor();
  await guidance().getByRole('button',{name:'Lukt niet',exact:true}).first().click();await page.getByLabel('Wat speelt er?').selectOption('not_sleepy');await page.getByRole('button',{name:'Neem dit mee in mijn plan',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await guidance().getByRole('heading',{name:'Je plan mag meebewegen'}).waitFor();await guidance().getByText(/geen opdracht om slaap af te dwingen/).waitFor();
  await guidance().locator('summary').filter({hasText:'Mijn routine en vaste momenten'}).click();await page.getByLabel('Dagelijkse check-in',{exact:true}).fill('16:00');await page.getByRole('button',{name:'Vast moment toevoegen',exact:true}).click();
  const malicious='PRIVATE-PLAN <img src=x onerror=alert(1)>';
  await page.getByLabel('Omschrijving 1',{exact:true}).fill(malicious);await page.getByLabel('Tijdstip 1',{exact:true}).fill('22:15');await page.getByRole('button',{name:'Bewaar mijn routine',exact:true}).click();await page.getByText('Je routine is bewaard.',{exact:false}).waitFor();
  assert.equal(await guidance().locator('img').count(),0);assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('PRIVATE-PLAN'));
  await page.reload();await page.locator('.app-shell').waitFor();
  await page.getByRole('navigation',{name:'Mobiele navigatie'}).getByRole('button',{name:'Wekker',exact:true}).click();await guidance().getByRole('heading',{name:'Je plan mag meebewegen'}).waitFor();await guidance().getByRole('heading',{name:malicious,exact:true}).first().waitFor();
  const reminders=page.getByRole('region',{name:'Pushherinneringen'});await reminders.getByLabel('Ik wil deze herinneringen.',{exact:false}).waitFor();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Page overflow at ${width}`);}
  await mkdir('test-results',{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/guidance-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Guidance UI passed: plan, personalized difficulty response, routine editing, encrypted restart, escaped labels, account gate and four widths.');
} finally {await browser.close();}
