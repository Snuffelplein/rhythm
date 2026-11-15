import assert from 'node:assert/strict';
import path from 'node:path';
import { createPhonePreviewServer } from '../scripts/phone-preview-server.mjs';

const link = 'https://rhythm-example-preview-link.trycloudflare.com';
const server = createPhonePreviewServer(path.resolve('apps/prototype-web/dist'), () => link);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const index = await fetch(base);
  assert.equal(index.status, 200); const html = await index.text();
  assert.ok(html.includes('<div id="root">'));
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  assert.equal((await fetch(base + '/sw.js')).status, 200);
  const manifest = await fetch(base + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('content-type'), 'application/manifest+json');
  for (const icon of (await manifest.json()).icons) assert.equal((await fetch(base + icon.src)).status, 200);
  assert.equal((await fetch(base + '/icons/apple-touch-icon.png')).status, 200);
  const phonePage = await (await fetch(base + '/__phone')).text();
  assert.ok(phonePage.includes('data:image/png;base64,'));
  assert.ok(phonePage.includes(link));
  assert.deepEqual(await (await fetch(base + '/__phone/status')).json(), { url: link });
  for (const target of ['/docs/core-prd.md', '/.certs/rootCA-key.pem', '/@fs/C:/Users', '/.env', '/assets/private.pem', '/icons/private.pem', '/icons/unlisted.png', '/%2e%2e/package.json']) assert.equal((await fetch(base + target)).status, 404, target);
  assert.equal((await fetch(base, { method: 'POST', body: 'synthetic-test' })).status, 405);
  console.log('Phone preview checks passed: static app, assets, QR page, no source/key routes and no data-write endpoint.');
} finally { await new Promise(resolve => server.close(resolve)); }
