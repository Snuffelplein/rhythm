import {accountFixture, visualAccount} from './fixtures/account.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser = await chromium.launch({channel: 'msedge', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'nl-NL', timezoneId: 'America/New_York', reducedMotion: 'reduce'});
await accountFixture(context, {data: visualAccount('2026-11-16T12:00:00Z')});
const page = await context.newPage();
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
await mkdir('test-results', {recursive: true});
try {
  await page.clock.install({time: new Date('2026-11-15T23:00:00Z')});
  await page.goto(process.env.RHYTHM_TEST_URL ?? 'http://127.0.0.1:4178');
  const hero = page.locator('.rhythm-hero'), scene = hero.locator('.scene-live');
  await scene.waitFor();
  const changeTime = async (utc) => {await page.clock.setSystemTime(new Date(utc)); await page.clock.runFor(60001);};
  const positions = [];
  for (const [utc, phase] of [['2026-11-15T23:00Z', 'night'], ['2026-11-16T05:30Z', 'dawn'], ['2026-11-16T08:00Z', 'morning'], ['2026-11-16T12:00Z', 'day'], ['2026-11-16T16:30Z', 'dusk'], ['2026-11-16T19:00Z', 'evening']]) {
    await changeTime(utc);
    assert.equal(await scene.getAttribute('data-phase'), phase, 'Scene must use account timezone, not browser timezone');
    positions.push(await scene.locator('.scene-live-sun').evaluate(el => getComputedStyle(el).transform));
    await hero.screenshot({path: `test-results/day-scene-${phase}.png`, animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  }
  assert.ok(new Set(positions).size >= 4, 'Sun position must actually change');
  assert.equal(await scene.locator('.scene-tide').evaluate(el => getComputedStyle(el).animationName), 'none', 'Live landscape must not run an infinite decorative animation');
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  await changeTime('2026-11-16T00:00Z');
  assert.equal(await scene.getAttribute('data-phase'), 'evening', 'Hidden app must stop clock updates');
  await page.evaluate(() => {delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await scene.getAttribute('data-phase'), 'night', 'Returning to foreground must immediately catch up');
  const baseline = requests.length;
  await context.setOffline(true);
  await changeTime('2026-11-16T12:00Z');
  assert.equal(await scene.getAttribute('data-phase'), 'day', 'Time scene must keep working offline');
  assert.deepEqual(requests.slice(baseline).filter(url => !url.includes('.supabase.co/')), [], 'Changing time must not fetch images or other scene data');
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await hero.screenshot({path: `test-results/day-scene-mobile-${width}.png`, animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  }
  await changeTime('2026-11-16T23:00Z');
  await hero.screenshot({path: 'test-results/day-scene-night-mobile.png', animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  assert.equal(await scene.locator('.scene-live-moon').evaluate(el => Number(getComputedStyle(el).opacity)), 1);
  await changeTime('2026-11-16T12:00Z');
  await page.getByRole('button', {name: 'Licht thema', exact: true}).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await hero.screenshot({path: 'test-results/day-scene-light-mobile.png', animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  await page.getByRole('button', {name: 'Ik ga slapen', exact: true}).click();
  await hero.getByText('Naar bed sinds', {exact: true}).waitFor();
  assert.equal(await scene.getAttribute('data-phase'), 'day', 'Logging daytime rest must not turn the real-time sky into night');
  assert.deepEqual(errors, []);
  console.log('Day scene checks passed: six phases, actual movement, account timezone, hidden/resume, offline/no requests, mobile widths and light theme.');
} finally {await browser.close();}
