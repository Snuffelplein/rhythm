import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { spawn } from 'node:child_process';
const deno=process.argv[2];assert.ok(deno,'Pass the path to a Deno 2 executable');
let config={publicKey:null,privateKey:null},initialized=0,jobs=[],finished=[];
const tickets=new Set(['a'.repeat(64)]);
const fixture=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const text=Buffer.concat(chunks).toString(),body=text?JSON.parse(text):{};
  res.setHeader('Content-Type','application/json');
  const reply=(data,status=200)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  if(req.url==='/rest/v1/rpc/rhythm_push_consume_cron')return reply(tickets.delete(body.p_token));
  if(req.url==='/rest/v1/rpc/rhythm_push_dispatch'){
    assert.equal(req.headers.authorization,'Bearer SYNTHETIC-SERVICE-ONLY');
    const action=body.p_action;
    if(action==='config')return reply(config);
    if(action==='initialize'){initialized++;config={...config,...body.p_arg};return reply({});}
    if(action==='claim')return reply(jobs);
    if(action==='authorize')return reply(true);
    if(action==='finish'){finished.push(body.p_arg);return reply({});}
    throw new Error('Unexpected RPC');
  }
  if(req.url.startsWith('/auth/v1/user'))return req.headers.authorization==='Bearer SYNTHETIC-USER'?reply({id:'10000000-0000-4000-8000-000000000001',is_anonymous:false}):reply({message:'Invalid token'},401);
  if(req.url.startsWith('/rest/v1/push_devices'))return reply(null);
  throw new Error('Unexpected fixture route '+req.url);
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const portProbe=createTcpServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
const child=spawn(deno,['run','--allow-env','--allow-net=127.0.0.1','--config','supabase/functions/rhythm-reminders/deno.json','supabase/functions/rhythm-reminders/index.ts'],{env:{...process.env,PORT:String(port),RHYTHM_BIND_HOST:'127.0.0.1',SUPABASE_URL:`http://127.0.0.1:${fixture.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC-SERVICE-ONLY',SUPABASE_ANON_KEY:'SYNTHETIC-ANON-ONLY'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
const base=`http://127.0.0.1:${port}`;
try {
  let ready=false;
  for(let i=0;i<100;i++){try{const response=await fetch(base+'?action=key');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Deno worker did not start: '+output);
  const key=await(await fetch(base+'?action=key')).json();assert.equal(key.ready,true);assert.equal(typeof key.publicKey,'string');assert.deepEqual(Object.keys(key).sort(),['publicKey','ready']);assert.equal(initialized,1);
  assert.equal((await fetch(base,{method:'POST'})).status,401);
  assert.equal((await fetch(base,{method:'POST',headers:{'x-rhythm-cron':'WRONG'}})).status,401);
  assert.equal((await fetch(base+'?action=test',{method:'POST',headers:{Authorization:'Bearer INVALID','Content-Type':'application/json'},body:'{}'})).status,401);
  const revoked=await fetch(base+'?action=test',{method:'POST',headers:{Authorization:'Bearer SYNTHETIC-USER','Content-Type':'application/json'},body:JSON.stringify({id:'20000000-0000-4000-8000-000000000001'})});assert.equal(revoked.status,403);
  const empty=await fetch(base,{method:'POST',headers:{'x-rhythm-cron':'a'.repeat(64)}});assert.deepEqual(await empty.json(),{processed:0});
  assert.equal((await fetch(base,{method:'POST',headers:{'x-rhythm-cron':'a'.repeat(64)}})).status,401,'Ticket cannot be replayed');
  jobs=[{id:crypto.randomUUID(),lease:crypto.randomUUID(),kind:'bed',subscription:{endpoint:'https://attacker.invalid/private'}}];
  tickets.add('b'.repeat(64));await fetch(base,{method:'POST',headers:{'x-rhythm-cron':'b'.repeat(64)}});assert.equal(finished[0].status,'error');
  console.log('Actual Deno worker passed against local HTTP fixtures: VAPID bootstrap, public-key-only response, invalid/revoked auth denial, cron authentication and unsafe endpoint rejection. No production requests or notifications.');
} finally {
  child.kill();await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>fixture.close(resolve));
}
