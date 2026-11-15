import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhonePreviewServer } from './phone-preview-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'apps/prototype-web/dist');
const localOnly = process.argv.includes('--local-only');
const noOpen = process.argv.includes('--no-open');
const port = 5180;
let link = null, tunnel = null, stopping = false, opened = false;

async function build() {
  if (process.argv.includes('--skip-build')) return;
  console.log('Rhythm voorbereiden…');
  for (const args of [[path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', path.join(root, 'apps/prototype-web')]]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let details = ''; child.stdout.on('data', value => { details += value; }); child.stderr.on('data', value => { details += value; });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Bouwen is niet gelukt.\n${details}`)));
    });
  }
}

await build();
const server = createPhonePreviewServer(dist, () => link);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const localPage = `http://127.0.0.1:${port}/__phone`;
console.log(`QR-pagina op de pc: ${localPage}`);
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  tunnel?.kill(); server.close(); process.exit(code);
}
process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
process.once('exit', () => { tunnel?.kill(); });

if (localOnly) {
  console.log(`Lokale controlemodus: http://127.0.0.1:${port}`);
} else {
  const folder = path.join(root, 'test-results'); await mkdir(folder, { recursive: true });
  const config = path.join(folder, 'phone-preview-cloudflared.yml'); await writeFile(config, '{}\n');
  const windowsBinary = 'C:/Program Files (x86)/cloudflared/cloudflared.exe';
  const executable = process.env.RHYTHM_CLOUDFLARED || (existsSync(windowsBinary) ? windowsBinary : 'cloudflared');
  console.log('Tijdelijke HTTPS-testlink aanmaken…');
  tunnel = spawn(executable, ['tunnel', '--config', config, '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const timeout = setTimeout(() => { console.error('De testlink kon niet worden gemaakt. Controleer je internetverbinding en probeer opnieuw.'); void stop(1); }, 60000);
  function inspect(value) {
    output = (output + value.toString()).slice(-16000);
    const match = output.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com\b/);
    if (!match || opened) return;
    link = match[0]; opened = true; clearTimeout(timeout);
    console.log(`\nOpen op je iPhone: ${link}`);
    console.log(`Of scan de QR-code op de pc: ${localPage}`);
    console.log('Geen certificaat nodig. Houd dit venster open. Stoppen: Ctrl+C.');
    console.log('De link verandert bij een nieuwe start; gebruik de demo om de UI te testen.\n');
    if (!noOpen && process.platform === 'win32') {
      const browser = spawn('explorer.exe', [localPage], { windowsHide: true, stdio: 'ignore' }); browser.on('error', () => {}); browser.unref();
    }
  }
  tunnel.stdout.on('data', inspect); tunnel.stderr.on('data', inspect);
  tunnel.once('error', () => { clearTimeout(timeout); console.error('Cloudflared kon niet starten. Controleer de installatie.'); void stop(1); });
  tunnel.once('exit', code => { clearTimeout(timeout); if (!stopping) { console.error('De tijdelijke tunnel is gestopt. Start het mobiele venster opnieuw.'); void stop(code || 1); } });
}
