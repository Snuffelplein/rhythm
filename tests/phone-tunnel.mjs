import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const { url } = await (await fetch('http://127.0.0.1:5180/__phone/status')).json();
assert.match(url ?? '', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'nl-NL' });
  // Certificate errors remain enabled: this must be a normally trusted HTTPS connection.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, crypto: Boolean(crypto.subtle), microphone: Boolean(navigator.mediaDevices?.getUserMedia) })), { secure: true, crypto: true, microphone: true });
  await page.getByRole('button', { name: 'Bekijk de demo', exact: true }).click();
  await page.getByRole('button', { name: 'Korte check-in', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/phone-tunnel.png' });
  console.log('Phone tunnel check passed: trusted public HTTPS, secure APIs and mobile demo.');
} finally { await browser.close(); }
