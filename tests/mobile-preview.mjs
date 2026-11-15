import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ca = await readFile('.certs/rootCA.pem');
const status = url => new Promise((resolve, reject) => {
  https.get(url, { ca }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
});
assert.equal(await status('https://localhost:5175/'), 200, 'The generated chain must validate against the development CA');
assert.equal((await fetch('http://127.0.0.1:5176/rhythm-dev-ca.cer')).status, 200);
assert.equal((await fetch('http://127.0.0.1:5176/rootCA-key.pem')).status, 404);
const keyUrl = `https://localhost:5175/@fs/${path.resolve('.certs/rootCA-key.pem').replaceAll('\\', '/')}`;
assert.equal(await status(keyUrl), 403, 'Vite must deny private development key files');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
// This isolated test does not install trust into the OS. A real phone must explicitly trust the public CA.
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto('https://localhost:5175');
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, crypto: Boolean(crypto.subtle), microphone: Boolean(navigator.mediaDevices?.getUserMedia) })), { secure: true, crypto: true, microphone: true });
  await page.getByRole('button', { name: 'Bekijk de demo', exact: true }).click();
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
    assert.ok(await page.locator('.hero-content p').evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16));
    assert.ok(await page.locator('.hero-actions .button').evaluate(element => parseFloat(getComputedStyle(element).fontWeight) >= 650));
    if (width === 390) await page.screenshot({ path: 'test-results/readability-mobile.png', fullPage: true, style: '.toast{display:none!important}' });
    if (width === 1440) await page.screenshot({ path: 'test-results/readability-desktop.png', fullPage: true, style: '.toast{display:none!important}' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: 'Mobiele navigatie' });
  for (const name of ['Slaap', 'Wekker', 'Dagboek', 'Meer', 'Vandaag']) {
    await nav.getByRole('button', { name, exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name);
  }
  await page.getByRole('button', { name: 'Korte check-in', exact: true }).click();
  await page.getByRole('group', { name: 'Hoeveel energie heb je?' }).getByRole('button', { name: '2 Weinig', exact: true }).click();
  await page.getByRole('group', { name: 'Hoe slaperig voel je je?' }).getByRole('button', { name: '4 Erg', exact: true }).click();
  assert.ok(await page.getByLabel('Moment van check-in', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16));
  await page.getByRole('dialog').screenshot({ path: 'test-results/readability-checkin.png' });
  await page.getByRole('button', { name: 'Bewaar mijn check-in', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('Mobile preview checks passed: trusted TLS chain, secure APIs, private-key protection, six viewport widths, readable typography, navigation and check-in.');
} finally { await browser.close(); }
