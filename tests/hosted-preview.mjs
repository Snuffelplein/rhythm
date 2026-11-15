import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// A fresh, ephemeral browser: no existing diary, account or production uploads.
const target = new URL(process.argv[2] ?? process.env.RHYTHM_TEST_URL ?? '');
assert.ok(!target.username && !target.password && !target.search && !target.hash && target.pathname === '/', 'Supply only the preview origin, without credentials or query parameters');
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
assert.ok(target.protocol === 'https:' || (local && target.protocol === 'http:'), 'Hosted checks require HTTPS');
const origin = target.origin;
const hosting = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = hosting.headers.find(rule => rule.source === '/(.*)').headers;
const evidence = { origin, checkedAt: new Date().toISOString(), local, status: 'running', checks: [] };
let browser;
try {
  const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'Preview must serve the app directly; authenticate protected previews before running this check');
  for (const { key, value } of expected) {
    assert.equal(response.headers.get(key), value, `Unexpected ${key} on actual hosting`);
  }
  const html = await response.text();
  assert.match(html, /<title>Rhythm/);
  evidence.checks.push('actual-response-security-headers');
  if (!local) {
    const http = new URL(origin); http.protocol = 'http:';
    const redirect = await fetch(http, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    assert.ok([301, 302, 307, 308].includes(redirect.status), 'HTTP must redirect to HTTPS');
    assert.equal(new URL(redirect.headers.get('location'), http).origin, origin, 'HTTP redirect must stay on the HTTPS origin');
    evidence.checks.push('http-to-https-redirect');
  }
  for (const pathname of ['/docs/README.md', '/.env', '/.git/config', '/packages/storage/src/index.ts']) {
    const result = await fetch(origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const body = await result.text();
    assert.ok([403, 404].includes(result.status) || (result.status === 200 && body === html), `Unexpected public source/private route: ${pathname}`);
  }
  evidence.checks.push('private-and-source-routes-not-served');
  const worker = await fetch(origin + '/sw.js', { signal: AbortSignal.timeout(15000) });
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('cache-control') ?? '', /no-cache|no-store|max-age=0/);
  assert.match(worker.headers.get('content-type') ?? '', /javascript/);
  evidence.checks.push('serviceworker-update-headers');

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
  // Block external mutations even if an unexpected auth flow runs.
  await context.route('**/*', route => {
    const request = route.request();
    return new URL(request.url()).origin !== origin && !['GET', 'HEAD'].includes(request.method()) ? route.abort() : route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Jouw ritme begint hier.' }).waitFor();
  const nav = page.getByRole('navigation', { name: 'Mobiele navigatie' });
  await nav.getByRole('button', { name: 'Meer', exact: true }).click();
  assert.ok((await page.locator('.version-note').innerText()).startsWith(`Rhythm ${packageInfo.version} ·`), 'Hosted app must match the checked-out release version');
  await nav.getByRole('button', { name: 'Vandaag', exact: true }).click();
  evidence.version = packageInfo.version;
  evidence.checks.push('expected-app-version');
  assert.equal(await page.evaluate(() => isSecureContext), true);
  await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.rhythmInlineTest=true'; document.body.append(script); });
  assert.equal(await page.evaluate(() => window.rhythmInlineTest), undefined, 'Actual CSP must block inline JavaScript');
  evidence.checks.push('secure-context-and-enforced-csp');
  const cdp = await context.newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest'); assert.deepEqual(parsed.errors, []);
  const manifest = JSON.parse(parsed.data); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.equal(new URL(icon.src, origin).origin, origin);
    const dimensions = await page.evaluate(async src => {
      const result = await fetch(src); const bitmap = await createImageBitmap(await result.blob());
      return `${bitmap.width}x${bitmap.height}`;
    }, icon.src);
    assert.equal(dimensions, icon.sizes);
  }
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker did not become ready')), 20000)),
    ]);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload();
  await page.getByRole('heading', { name: 'Jouw ritme begint hier.' }).waitFor();
  await page.getByRole('button', { name: 'Bekijk de demo', exact: true }).click();
  await page.getByText('Je bekijkt voorbeeldgegevens.', { exact: false }).waitFor();
  await page.getByRole('region', { name: 'Persoonlijke begeleiding' }).getByRole('heading', { name: 'Een haalbaar plan voor jou' }).waitFor();
  assert.deepEqual(errors, []);
  evidence.checks.push('standalone-manifest-icons-and-offline-demo');
  evidence.status = 'passed';
  console.log(`Hosted preview checks passed for ${origin}. Email delivery, Auth admin settings and physical iPhone remain separate checks.`);
} catch (error) {
  evidence.status = 'failed'; evidence.failure = error.message;
  throw error;
} finally {
  await browser?.close();
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/hosted-preview.json', JSON.stringify(evidence, null, 2));
}
