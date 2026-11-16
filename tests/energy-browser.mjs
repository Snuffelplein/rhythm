import {accountFixture, userA} from './fixtures/account.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser = await chromium.launch({channel: 'msedge', headless: true});
const context = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'nl-NL'});
const state = await accountFixture(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', {recursive: true});
try {
  await page.goto(process.env.RHYTHM_TEST_URL ?? 'http://127.0.0.1:4178');
  const card = page.locator('.checkin-panel');
  await card.waitFor();
  const choice = card.getByRole('button', {name: 'Energie 2 van 5: Weinig', exact: true});
  await choice.click();
  const dialog = page.getByRole('dialog');
  const energy = dialog.getByRole('group', {name: 'Hoeveel energie heb je?', exact: true});
  assert.equal(await energy.getByRole('button', {name: '2 Weinig', exact: true}).getAttribute('aria-pressed'), 'true');
  assert.equal(state.rows.get(userA).data.checkins.length, 0, 'Selecting energy must not save a partial check-in');
  await dialog.getByRole('button', {name: 'Sluiten', exact: true}).click();
  await card.getByRole('button', {name: 'Korte check-in', exact: true}).click();
  assert.equal(await energy.locator('[aria-pressed="true"]').count(), 0, 'Generic check-in must not reuse a cancelled preset');
  await dialog.getByRole('button', {name: 'Sluiten', exact: true}).click();
  await choice.click();
  await dialog.getByRole('group', {name: 'Hoe slaperig voel je je?', exact: true}).getByRole('button', {name: '4 Erg', exact: true}).click();
  const synced = page.waitForResponse(response => response.url().includes('/account_data') && response.request().method() === 'PATCH');
  await dialog.getByRole('button', {name: 'Bewaar mijn check-in', exact: true}).click();
  await dialog.waitFor({state: 'hidden'});
  await synced;
  assert.equal(state.rows.get(userA).data.checkins.at(-1).energy, 2);
  assert.equal(state.rows.get(userA).data.checkins.at(-1).sleepiness, 4);
  assert.equal(await choice.getAttribute('aria-pressed'), 'true');
  assert.match(await card.innerText(), /Laatste check-in: 2\/5/);
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px must not overflow`);
    const bounds = await choice.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Energy targets must be at least 44px');
    await card.screenshot({path: `test-results/energy-dark-${width}.png`, animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  }
  await page.getByRole('button', {name: 'Licht thema', exact: true}).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await card.screenshot({path: 'test-results/energy-light-390.png', animations: 'disabled', style: '.toast,.mobile-nav{visibility:hidden!important}'});
  assert.deepEqual(errors, []);
  console.log('Energy checks passed: prefill, cancel, explicit save, separate sleepiness, 320/390px targets, light/dark.');
} finally {
  await browser.close();
}
