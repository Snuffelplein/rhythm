import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { ensureMobileCertificates } from './mobile-certificates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateAddress = address => /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(address);
const addresses = Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal && privateAddress(item.address)).map(item => item.address);
const loopback = process.argv.includes('--loopback');
const host = loopback ? '127.0.0.1' : '0.0.0.0';
const port = 5175, certificatePort = 5176;
const certificates = ensureMobileCertificates(path.join(root, '.certs'), addresses);
const server = await createViteServer({
  root: path.join(root, 'apps/prototype-web'),
  configFile: path.join(root, 'apps/prototype-web/vite.config.ts'),
  server: { host, port, strictPort: true, https: { key: certificates.key, cert: certificates.cert } },
});
// Bootstrap serves the public CA only. No filesystem routes, private keys, app records or application endpoints.
const bootstrap = createHttpServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/rhythm-dev-ca.cer') {
    response.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="rhythm-dev-ca.cer"' });
    response.end(certificates.publicRoot);
  } else if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="nl"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhythm mobiel instellen</title><body style="font:600 18px/1.7 system-ui;max-width:600px;margin:40px auto;padding:20px"><h1>Rhythm op je telefoon</h1><p>Dit is een lokale ontwikkelomgeving. Installeer alleen dit certificaat als dit je eigen Rhythm-computer is.</p><p><a href="/rhythm-dev-ca.cer">Download het publieke ontwikkelcertificaat</a></p><p>Installeer het profiel op je iPhone en schakel volledig vertrouwen in bij Instellingen → Algemeen → Info → Vertrouwensinstellingen certificaten.</p><p>Open daarna het HTTPS-adres op poort 5175 dat in het startvenster staat. Je gegevens worden op deze telefoon bewaard; je pc-dagboek wordt niet automatisch gekopieerd.</p></body></html>');
  } else { response.writeHead(404); response.end('Niet gevonden'); }
});
await new Promise((resolve, reject) => { bootstrap.once('error', reject); bootstrap.listen(certificatePort, host, resolve); });
await server.listen();
console.log('\nRhythm · mobiel testen (lokale HTTPS-ontwikkeling)');
console.log('Computer en telefoon moeten op hetzelfde privénetwerk zitten.');
console.log('Eenmalig: vertrouw het publieke ontwikkelcertificaat op je telefoon.');
console.log(`SHA-256 certificaatvingerafdruk: ${new X509Certificate(certificates.root).fingerprint256}`);
for (const address of loopback ? ['127.0.0.1'] : addresses) {
  console.log(`Certificaat instellen: http://${address}:${certificatePort}`);
  console.log(`Rhythm openen:        https://${address}:${port}`);
}
if (!loopback && !addresses.length) console.log('Geen privé-wifi-/LAN-adres gevonden. Verbind de computer eerst met je thuisnetwerk.');
console.log('Geen Windows-certificaatopslag of firewallinstellingen gewijzigd.');
console.log('Houd dit venster open. Stoppen: Ctrl+C.\n');
async function stop() { bootstrap.close(); await server.close(); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
