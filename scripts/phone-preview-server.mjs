import { createServer } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

const types = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const escape = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const securityHeaders = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers.find(item => item.source === '/(.*)').headers;

export function createPhonePreviewServer(directory, getLink) {
  const root = path.resolve(directory);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    for (const { key, value } of securityHeaders) response.setHeader(key, value);
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (pathname === '/__phone/status') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ url: getLink() })); return;
      }
      if (pathname === '/__phone') {
        // This local helper contains its own static style; it never contains diary data.
        const link = getLink();
        const qr = link ? await QRCode.toDataURL(link, { width: 320, margin: 2, errorCorrectionLevel: 'M' }) : null;
        response.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
        response.end(`<!doctype html><html lang="nl"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhythm op je iPhone</title>${link ? '' : '<meta http-equiv="refresh" content="2">'}<style>body{font:500 18px/1.7 system-ui;background:#0b0f1a;color:#f8fafc;max-width:640px;margin:45px auto;padding:24px;text-align:center}h1{font-size:34px;line-height:1.2}p{color:#c2ccdc}a{color:#b8a4ff;overflow-wrap:anywhere}img{max-width:100%;height:auto;border-radius:18px}small{display:block;color:#acb8cd;margin-top:28px;font-size:14px}</style><h1>Rhythm op je iPhone.</h1>${link ? `<p>Open de camera op je iPhone en scan de QR-code.</p><img src="${qr}" width="320" height="320" alt="QR-code met de tijdelijke Rhythm-testlink"><p><a href="${escape(link)}" target="_blank" rel="noreferrer">${escape(link)}</a></p><p>Open de link in Safari. Je hoeft niets te installeren.</p>` : '<p>De testlink wordt aangemaakt… Dit scherm ververst automatisch.</p>'}<small>Houd het startvenster op de pc open. Dit is een tijdelijke preview. Gegevens blijven in de browser waarin je ze invoert.</small></html>`); return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const allowed = ['index.html', 'rhythm.svg', 'sw.js', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].includes(relative) || /^(assets|onnx)\/[a-zA-Z0-9_.-]+\.(js|mjs|css|wasm|svg|png|woff2)$/.test(relative);
      const filename = path.resolve(root, relative), within = path.relative(root, filename);
      if (!allowed || within.startsWith('..') || path.isAbsolute(within)) { response.writeHead(404); response.end('Niet gevonden'); return; }
      const info = await stat(filename);
      if (!info.isFile()) throw new Error('Not a static file');
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': relative === 'index.html' || relative === 'sw.js' ? 'no-cache' : 'public, max-age=3600' });
      if (request.method === 'HEAD') { response.end(); return; }
      createReadStream(filename).on('error', () => response.destroy()).pipe(response);
    } catch { if (!response.headersSent) response.writeHead(404); response.end('Niet gevonden'); }
  });
}
