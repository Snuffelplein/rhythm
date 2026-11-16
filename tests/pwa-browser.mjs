import {accountFixture,visualAccount} from './fixtures/account.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createPhonePreviewServer } from '../scripts/phone-preview-server.mjs';

// Exercise the same restricted production server used by the phone QR preview.
const server = createPhonePreviewServer(path.resolve('apps/prototype-web/dist'), () => null);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  await mkdir('test-results', { recursive: true });
  const profile = await mkdtemp(path.resolve('test-results/pwa-profile-'));
  context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await accountFixture(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('.app-shell').waitFor();
  const cdp = await context.newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest');
  assert.deepEqual(parsed.errors, [], 'Browser must parse the manifest without errors');
  const manifest = JSON.parse(parsed.data);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes');
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /viewport-fit=cover/);
  assert.equal((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
  const icons = [...manifest.icons, { src: await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'), sizes: '180x180' }];
  for (const icon of icons) {
    const result = await page.evaluate(async src => {
      const response = await fetch(src);
      const bitmap = await createImageBitmap(await response.blob());
      return { status: response.status, type: response.headers.get('content-type'), size: `${bitmap.width}x${bitmap.height}` };
    }, icon.src);
    assert.deepEqual(result, { status: 200, type: 'image/png', size: icon.sizes });
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, [], 'Chromium installability checks must pass');

  // Simulate iPhone inset values; physical Safari and the OS install sheet remain device QA.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '47px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
  });
  assert.equal((await page.locator('.topbar').boundingBox()).y, 47);
  const nav = page.getByRole('navigation', { name: 'Mobiele navigatie' });
  const navBounds = await nav.boundingBox();
  assert.equal(Math.round(navBounds.y + navBounds.height), 844);
  for (const button of await nav.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    assert.ok(bounds.y + bounds.height <= 844 - 34, 'Navigation must stay above the home indicator');
  }
  await nav.getByRole('button', { name: 'Meer', exact: true }).click();
  await page.getByText('Toevoegen op je iPhone', { exact: true }).click();
  await page.getByText('Open als webapp', { exact: true }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.locator('.home-screen-card').screenshot({ path: 'test-results/pwa-home-screen-help.png' });
  await page.getByRole('button', { name: 'Mijn profiel aanpassen', exact: true }).click();
  const dialog = await page.getByRole('dialog').boundingBox();
  assert.ok(dialog.y >= 47 && dialog.y + dialog.height <= 844 - 34, 'Dialog must fit between the safe areas');
  await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    for (const [side, value] of [['top', '0px'], ['bottom', '21px'], ['left', '47px'], ['right', '47px']]) document.documentElement.style.setProperty(`--safe-${side}`, value);
  });
  const sidebar = await page.locator('.sidebar').boundingBox();
  assert.equal(sidebar.x, 47);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await context.setOffline(true);
  await page.reload();
  await page.locator('.app-shell').waitFor();
  for (const url of ['/manifest.webmanifest', ...icons.map(icon => icon.src)]) {
    assert.equal(await page.evaluate(async src => (await fetch(src)).status, url), 200, `${url} must work offline`);
  }
  await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Meer',exact:true}).click();
  await page.getByRole('button',{name:'Uitloggen',exact:true}).click();
  await page.getByRole('heading',{name:'Welkom terug',exact:true}).waitFor();
  await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-left','47px');document.documentElement.style.setProperty('--safe-right','47px');});
  let brand=await page.locator('.entry-brand').boundingBox();
  assert.ok(brand.x>=47,'Login must respect landscape notch');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','47px');document.documentElement.style.setProperty('--safe-left','0px');document.documentElement.style.setProperty('--safe-right','0px');});
  brand=await page.locator('.entry-brand').boundingBox();assert.ok(brand.y>=47,'Login must stay below status bar: '+JSON.stringify({brand,layout:await page.locator('.account-entry').evaluate(e=>({top:getComputedStyle(e).paddingTop,scroll:scrollY}))}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors, []);
  console.log('PWA checks passed: manifest, browser installability, PNG icons, iPhone help, simulated safe areas, offline shell and offline install assets. Physical iPhone installation remains device QA.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
