import {accountFixture,visualAccount} from './fixtures/account.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'no-preference' });
await accountFixture(context,{data:visualAccount()});
const page = await context.newPage(); page.setDefaultTimeout(12000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.RHYTHM_TEST_URL ?? 'http://127.0.0.1:4178';
await mkdir('test-results', { recursive: true });
try {
  await page.clock.setFixedTime(new Date('2026-11-15T18:00:00Z'));
  await page.goto(base);

  await page.locator('.app-shell').waitFor();
  assert.equal(await page.locator('.ring-segment.recorded').count(), 12, 'Ring segments must match actual logged days');
  assert.match(await page.locator('.ring-caption').innerText(), /12 van 14/);
  const actionBounds = await page.getByRole('button', { name: 'Ik ga slapen', exact: true }).boundingBox();
  const navBounds = await page.getByRole('navigation', { name: 'Mobiele navigatie' }).boundingBox();
  assert.ok(actionBounds && navBounds && actionBounds.y + actionBounds.height <= navBounds.y, 'The primary sleep action must remain above the mobile tabbar');
  await page.waitForFunction(()=>document.querySelector('.rhythm-ring')?.classList.contains('is-visible'));
  const transform = await page.locator('.ring-orbit').evaluate(element => getComputedStyle(element).transform);
  await page.waitForFunction(before=>getComputedStyle(document.querySelector('.ring-orbit')).transform!==before,transform);
  assert.notEqual(await page.locator('.ring-orbit').evaluate(element => getComputedStyle(element).transform), transform, 'The orbit must actually animate');
  await page.locator('.app-footer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('.rhythm-ring')?.classList.contains('is-visible'));
  assert.equal(await page.locator('.ring-orbit').evaluate(element => getComputedStyle(element).animationPlayState), 'paused');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelector('.rhythm-ring')?.classList.contains('is-visible'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'test-results/visual-today-mobile-viewport.png', animations: 'disabled', style: '.toast{display:none!important}' });
  await page.screenshot({ path: 'test-results/visual-today-mobile.png', fullPage: true, animations: 'disabled', style: '.toast{display:none!important}' });
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px must not overflow`);
  }
  await page.screenshot({ path: 'test-results/visual-today-desktop.png', fullPage: true, animations: 'disabled', style: '.toast{display:none!important}' });
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: 'Mobiele navigatie' });
  await nav.getByRole('button', { name: 'Wekker', exact: true }).click();
  assert.equal(await page.locator('.clock-content strong').innerText(), '07:30');
  await page.screenshot({ path: 'test-results/visual-anchor-mobile-viewport.png', animations: 'disabled', style: '.toast{display:none!important}' });
  await page.getByRole('button', { name: 'Dagstart aanpassen: 07:30', exact: true }).click();
  assert.equal(await page.getByLabel('Gewenste dagstart', { exact: true }).evaluate(element => document.activeElement === element), true);
  await page.screenshot({ path: 'test-results/visual-anchor-mobile.png', fullPage: true, animations: 'disabled', style: '.toast{display:none!important}' });
  await nav.getByRole('button', { name: 'Dagboek', exact: true }).click();
  await page.screenshot({ path: 'test-results/visual-journal-mobile.png', fullPage: true, animations: 'disabled', style: '.toast{display:none!important}' });
  await nav.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.ring-orbit').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await page.locator('.scene-tide').first().evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.getByRole('button', { name: 'Korte check-in', exact: true }).click();
  assert.equal(await page.getByRole('dialog').evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Licht thema', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({ path: 'test-results/visual-light-mobile.png', fullPage: true, animations: 'disabled', style: '.toast{display:none!important}' });
  assert.deepEqual(errors, []);
  console.log('Visual checks passed: honest ring, actual motion, six widths, anchor interaction, journal, reduced motion and light theme.');
} catch (error) { await page.screenshot({ path: 'test-results/visual-failure.png', fullPage: true }); throw error; }
finally { await browser.close(); }
