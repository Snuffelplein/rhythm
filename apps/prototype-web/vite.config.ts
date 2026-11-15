import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import hosting from '../../vercel.json' with { type: 'json' };
import { validatePublicConfig } from '../../scripts/validate-public-config.ts';
const require = createRequire(import.meta.url);
const runtimeDirectory = path.dirname(require.resolve('onnxruntime-web'));
const runtimeFiles = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];
const appFiles = ['/', '/index.html', '/rhythm.svg', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  validatePublicConfig(env, hosting.headers.find(item => item.source === '/(.*)')!.headers.find(header => header.key === 'Content-Security-Policy')!.value);
  return {
  preview: { headers: Object.fromEntries(hosting.headers.find(item => item.source === '/(.*)')!.headers.map(({ key, value }) => [key, value])) },
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.certs/**', '**/.git/**'] } },
  optimizeDeps: { include: ['@huggingface/transformers', '@mlc-ai/web-llm'] },
  worker: { format: 'es' },
  plugins: [{
    name: 'rhythm-offline-shell',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0]?.replace('/onnx/', '');
        if (!request.url?.startsWith('/onnx/') || !name || !runtimeFiles.includes(name)) { next(); return; }
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        response.end(readFileSync(path.join(runtimeDirectory, name)));
      });
    },
    generateBundle(_, bundle) {
      for (const name of runtimeFiles) this.emitFile({ type: 'asset', fileName: `onnx/${name}`, source: readFileSync(path.join(runtimeDirectory, name)) });
      const assets = [...appFiles, ...Object.keys(bundle).map(name => `/${name}`), ...runtimeFiles.map(name => `/onnx/${name}`)];
      const precache = [...appFiles, ...Object.entries(bundle).filter(([, value]) => (value.type === 'chunk' && value.isEntry) || value.fileName.endsWith('.css')).map(([name]) => `/${name}`)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE='rhythm-static-${Date.now()}';
const ASSETS=${JSON.stringify(assets)};
const PRECACHE=${JSON.stringify(precache)};
${readFileSync(new URL('./src/guidance/push-worker.js', import.meta.url), 'utf8')}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('rhythm-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;event.respondWith(caches.open(CACHE).then(async cache=>{if(event.request.mode==='navigate'){try{const fresh=await fetch(event.request);if(fresh.ok){await cache.put('/index.html',fresh.clone());return fresh;}}catch{}return (await cache.match('/index.html'))||Response.error();}const cached=await cache.match(event.request,{ignoreVary:true});if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}));});
` });
    },
  }],
  };
});
