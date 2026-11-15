import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createPhonePreviewServer } from '../scripts/phone-preview-server.mjs';

// UI + real Supabase JS client, with a deterministic HTTP fixture (no real emails).
// Database access rules are tested separately against the actual project using rls-vault.sql.
const server = createPhonePreviewServer(path.resolve('apps/prototype-web/dist'), () => null);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const rows = new Map(), requests = [];
const userA = '10000000-0000-4000-8000-000000000001', userB = '10000000-0000-4000-8000-000000000002';
const localPassword = 'local-key-never-upload', accountPassword = 'account-test-password';
const note = 'PRIVATE-ACCOUNT-BROWSER-SENTINEL';
const user = id => ({ id, aud: 'authenticated', role: 'authenticated', email: id === userA ? 'a@example.invalid' : 'b@example.invalid', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString(), identities: [], is_anonymous: false });
function token(id) { return Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iss: 'supabase' })).toString('base64url') + '.test-signature'; }
const session = id => ({ access_token: token(id), refresh_token: `test-refresh-${id}`, token_type: 'bearer', expires_in: 3600, user: user(id) });
async function context() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await c.route('https://*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), body = req.postDataJSON();
    requests.push({ path: url.pathname, method: req.method(), body });
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range' };
    const respond = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(json) });
    if (req.method() === 'OPTIONS') return respond({});
    if (url.pathname.endsWith('/token')) return respond(session(body.email === 'b@example.invalid' ? userB : userA));
    if (url.pathname.endsWith('/signup')) return respond({ user: user(userA), session: null });
    if (url.pathname.endsWith('/recover')) return respond({});
    if (url.pathname.endsWith('/logout')) return respond({});
    const id = req.headers().authorization?.includes(token(userB)) ? userB : userA;
    if (url.pathname.endsWith('/user')) return respond(user(id));
    if (url.pathname.endsWith('/encrypted_vaults')) {
      const queriedId = url.searchParams.get('user_id')?.replace('eq.', '') ?? body?.user_id;
      assert.equal(queriedId, id, 'The client must scope its requests to the current account');
      const object = req.headers().accept?.includes('vnd.pgrst.object');
      const represent = row => object ? row : row ? [row] : [];
      if (req.method() === 'GET') return respond(represent(rows.get(id)));
      if (req.method() === 'DELETE') { rows.delete(id); return respond([{ user_id: id }]); }
      const prior = rows.get(id);
      if (req.method() === 'POST' && prior) return respond({ code: '23505', message: 'conflict' }, 409);
      if (req.method() === 'PATCH' && Number(url.searchParams.get('revision')?.replace('eq.', '')) !== prior?.revision) return respond(represent(null));
      if (req.method() === 'PATCH' && url.searchParams.get('change_id') !== `eq.${prior?.change_id}`) return respond(represent(null));
      const row = { ...body, updated_at: new Date().toISOString() }; rows.set(id, row);
      return respond(represent(row), req.method() === 'POST' ? 201 : 200);
    }
    throw new Error(`Unexpected cloud route: ${url.pathname}`);
  });
  return c;
}
async function more(page) { await page.getByRole('navigation', { name: 'Mobiele navigatie' }).getByRole('button', { name: 'Meer', exact: true }).click(); }
async function login(page, email) {
  await more(page);
  await page.getByLabel('E-mailadres', { exact: true }).fill(email);
  await page.getByLabel('Accountwachtwoord', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Log in op mijn account', exact: true }).click();
  await page.getByText(email, { exact: true }).waitFor();
}
await mkdir('test-results', { recursive: true });
try {
  const a = await context(), page = await a.newPage();
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.getByRole('button', { name: 'Start mijn dagboek', exact: true }).click();
  await page.getByLabel('Wachtwoord', { exact: true }).fill(localPassword);
  await page.getByLabel('Herhaal wachtwoord', { exact: true }).fill(localPassword);
  await page.getByRole('dialog').getByRole('button', { name: 'Start mijn dagboek', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const nav = page.getByRole('navigation', { name: 'Mobiele navigatie' });
  await nav.getByRole('button', { name: 'Dagboek', exact: true }).click();
  await page.getByRole('button', { name: 'Notitie schrijven', exact: true }).click();
  await page.getByLabel('Wat wil je onthouden?', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Bewaar mijn notitie', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await more(page);
  await page.getByRole('button', { name: 'Account maken', exact: true }).click();
  await page.getByLabel('E-mailadres', { exact: true }).fill('a@example.invalid');
  await page.getByLabel('Accountwachtwoord', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Maak mijn account', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Controleer je e-mail' }).waitFor();
  assert.equal(requests.some(r => r.path.endsWith('/encrypted_vaults')), false, 'Registration must not upload the local diary');
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await login(page, 'a@example.invalid');
  await page.getByRole('button', { name: 'Ontgrendel lokaal dagboek', exact: true }).click();
  await page.getByLabel('Wachtwoord', { exact: true }).fill(localPassword);
  await page.getByRole('button', { name: 'Ontgrendel mijn dagboek', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Synchroniseer mijn slaap', { exact: false }).check();
  await page.getByRole('button', { name: 'Zet synchronisatie aan', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Synchronisatie staat aan' }).waitFor();
  assert.equal(rows.get(userA)?.revision, 1);
  assert.ok(!JSON.stringify(requests).includes(localPassword));
  assert.ok(!JSON.stringify(requests).includes(note));
  await page.screenshot({ path: 'test-results/cloud-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Uitloggen en dagboek vergrendelen', exact: true }).click();
  await page.getByRole('button', { name: 'Log in op mijn account', exact: true }).waitFor();
  assert.ok(!(await page.locator('main').innerText()).includes(note));
  await login(page, 'b@example.invalid');
  await page.getByText('Cloudkopie ophalen op dit apparaat', { exact: true }).click();
  await page.getByLabel('Kluiswachtwoord voor cloudkopie', { exact: true }).fill(localPassword);
  await page.getByLabel('Ik wil mijn lokale dagboek vervangen', { exact: false }).check();
  await page.getByRole('button', { name: 'Ontgrendel en haal cloudkopie op', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'ander account' }).waitFor();
  assert.equal(rows.has(userB), false);
  await page.getByRole('button', { name: 'Uitloggen en dagboek vergrendelen', exact: true }).click();
  await page.getByRole('button', { name: 'Wachtwoord vergeten', exact: true }).click();
  await page.getByLabel('E-mailadres', { exact: true }).fill('a@example.invalid');
  await page.getByRole('button', { name: 'Stuur herstellink', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Als dit adres bij een account hoort' }).waitFor();

  const b = await context(), second = await b.newPage(); second.setDefaultTimeout(12000);
  await second.goto(base); await login(second, 'a@example.invalid');
  await second.getByText('Cloudkopie ophalen op dit apparaat', { exact: true }).click();
  await second.getByLabel('Kluiswachtwoord voor cloudkopie', { exact: true }).fill(localPassword);
  await second.getByRole('button', { name: 'Ontgrendel en haal cloudkopie op', exact: true }).click();
  try { await second.getByRole('status').filter({ hasText: 'cloudkopie is ontgrendeld' }).waitFor(); }
  catch (error) { console.log(await second.locator('.cloud-panel').innerText()); throw error; }
  await second.getByRole('navigation', { name: 'Mobiele navigatie' }).getByRole('button', { name: 'Dagboek', exact: true }).click();
  await second.getByText(note, { exact: true }).waitFor();
  const resetPage = page;
  resetPage.setDefaultTimeout(12000);
  await resetPage.goto(base + '/?code=fixture-recovery-code');
  await resetPage.getByLabel('Nieuw accountwachtwoord', { exact: true }).fill('replacement-account-password');
  await resetPage.getByRole('button', { name: 'Bewaar mijn accountwachtwoord', exact: true }).click();
  await resetPage.getByRole('status').filter({ hasText: 'accountwachtwoord is gewijzigd' }).waitFor();
  assert.ok(requests.some(r => r.method === 'PUT' && r.path.endsWith('/user') && r.body.password === 'replacement-account-password'));
  assert.ok(!JSON.stringify(requests).includes(localPassword));
  assert.deepEqual(errors, []);
  await a.close(); await b.close();
  console.log('Cloud UI checks passed with HTTP fixtures: Supabase signup/login/logout, explicit encrypted opt-in, key never sent, second-device restore and cross-account protection. Real RLS is verified separately.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
