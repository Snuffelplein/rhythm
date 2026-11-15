import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
// Only public bootstrap and denial checks. No account, device or notification is created.
const project='https://hphwmhmssexnrhkcxdpi.supabase.co';
const source=await readFile('apps/prototype-web/src/cloud/client.ts','utf8');
const key=source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];assert.ok(key);
const base=project+'/functions/v1/rhythm-reminders',results=[];
for(const item of [
  {name:'public-key-only',url:base+'?action=key',expected:[200]},
  {name:'no-auth-send',url:base,method:'POST',expected:[401]},
  {name:'invalid-cron-ticket',url:base,method:'POST',headers:{'x-rhythm-cron':'0'.repeat(64)},expected:[401]},
  {name:'invalid-user',url:base+'?action=test',method:'POST',headers:{Authorization:'Bearer SYNTHETIC-INVALID','Content-Type':'application/json'},body:'{}',expected:[401]},
  {name:'anonymous-device-read',url:project+'/rest/v1/push_devices?select=id&limit=1',headers:{apikey:key},expected:[401,403]},
  {name:'anonymous-service-rpc',url:project+'/rest/v1/rpc/rhythm_push_dispatch',method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{"p_action":"config"}',expected:[401,403,404]},
  {name:'anonymous-ticket-consume',url:project+'/rest/v1/rpc/rhythm_push_consume_cron',method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_token:'0'.repeat(64)}),expected:[401,403,404]},
]) {
  const response=await fetch(item.url,{method:item.method??'GET',headers:item.headers,body:item.body,signal:AbortSignal.timeout(30000)});
  assert.ok(item.expected.includes(response.status),`${item.name}: unexpected status ${response.status}`);
  if(item.name==='public-key-only') {const body=await response.json();assert.deepEqual(Object.keys(body).sort(),['publicKey','ready']);assert.equal(body.ready,true);assert.match(body.publicKey,/^[A-Za-z0-9_-]{87}$/);}
  results.push({check:item.name,status:response.status});
}
await mkdir('test-results',{recursive:true});await writeFile('test-results/push-hosted-http.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
console.log('Hosted push checks passed: public-key-only bootstrap and denial of anonymous/invalid send, table and service RPC requests. No notifications sent.');
