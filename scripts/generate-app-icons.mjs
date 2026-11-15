// Rasterize the existing vector logo; no external assets or image service.
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';

const logo = await readFile('apps/prototype-web/public/rhythm.svg', 'utf8');
const shapes = logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const directory = 'apps/prototype-web/public/icons';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [name, size, maskable] of [['apple-touch-icon', 180, false], ['icon-192', 192, false], ['icon-512', 512, false], ['icon-maskable-512', 512, true]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>body{margin:0;background:#0b0f1a}svg{display:block;width:100vw;height:100vh}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#0b0f1a"/><g${maskable ? ' transform="translate(12 12) scale(.7)"' : ''}>${shapes}</g></svg>`);
    await page.screenshot({ path: `${directory}/${name}.png` });
    await page.close();
  }
} finally { await browser.close(); }
console.log('Generated Rhythm app icons from the existing SVG logo.');
