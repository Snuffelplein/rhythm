import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
  // Real local Postgres/RLS. Only Supabase platform extensions/services are stubs.
  // No network, hosted project, real keys, or user data are touched.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema rhythm_private; create schema vault; create schema cron; create schema net;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth,rhythm_private to authenticated,service_role;
    create function rhythm_private.has_active_session() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from auth.sessions where user_id=auth.uid() and id=(auth.jwt()->>'session_id')::uuid and (not_after is null or not_after>now())); $$;
    revoke all on function rhythm_private.has_active_session() from public; grant execute on function rhythm_private.has_active_session() to authenticated;
    create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text,name text);
    create function vault.create_secret(value text,p_name text) returns uuid language plpgsql as $$ declare k uuid=gen_random_uuid(); begin insert into vault.decrypted_secrets values(k,value,p_name);return k;end $$;
    create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab',n),'hex') $$;
    create table cron.job(name text,schedule text,command text);
    create function cron.schedule(n text,s text,c text) returns integer language plpgsql as $$ begin insert into cron.job values(n,s,c);return 1;end $$;
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
  `);
  const sql=(await readFile('supabase/migrations/20261115213713_personal_guidance_push.sql','utf8')).replace(/^create extension[^;]+;/gm,'');
  await db.exec(sql);
  assert.equal(new Date((await db.query(`select rhythm_private.next_push_at('03:00','Europe/Amsterdam','2026-03-28T23:00:00Z',30) t`)).rows[0].t).toISOString(),'2026-03-29T00:30:00.000Z');
  assert.equal(new Date((await db.query(`select rhythm_private.next_push_at('02:30','Europe/Amsterdam','2026-10-24T22:00:00Z',0) t`)).rows[0].t).toISOString(),'2026-10-25T01:30:00.000Z');
  const a=crypto.randomUUID(),b=crypto.randomUUID(),sa=crypto.randomUUID(),sb=crypto.randomUUID();
  await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into auth.sessions values($1,$2,now()+interval \'1 hour\'),($3,$4,now()+interval \'1 hour\')',[sa,a,sb,b]);
  async function role(user,session){await db.exec('reset role');await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,session_id:session,role:'authenticated',is_anonymous:false})]);await db.exec('set role authenticated');}
  const subscription={endpoint:'https://web.push.apple.com/FIXTURE',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)},expirationTime:null};
  const schedule=[{kind:'bed',time:'23:00'}];
  await role(a,sa);
  const {rows:[device]}=await db.query('insert into public.push_devices(subscription,timezone,schedule) values($1,$2,$3) returning id',[subscription,'Europe/Amsterdam',schedule]);
  assert.equal((await db.query('select * from public.push_devices')).rows.length,1);
  await db.query('update public.push_devices set schedule=$1 where id=$2',[[{kind:'winddown',time:'22:30',anchorTime:'23:00',leadMinutes:30}],device.id]);
  await assert.rejects(db.query(`update public.push_devices set last_status='sent'`),/permission denied/);
  await assert.rejects(db.query(`select public.rhythm_push_dispatch('config')`),/permission denied/);
  await assert.rejects(db.query('select * from rhythm_private.push_config'),/permission denied/);
  await assert.rejects(db.query('insert into public.push_devices(subscription,timezone,schedule) values($1,$2,$3)',[{...subscription,endpoint:'https://attacker.invalid/leak'},'UTC',schedule]),/Unsupported push endpoint/);
  await role(b,sb);
  assert.equal((await db.query('select * from public.push_devices')).rows.length,0);
  assert.equal((await db.query(`delete from public.push_devices where id=$1 returning id`,[device.id])).rows.length,0);
  await assert.rejects(db.query('insert into public.push_devices(user_id,subscription,timezone,schedule) values($1,$2,$3,$4)',[a,{...subscription,endpoint:'https://web.push.apple.com/OTHER'},'UTC',schedule]),/row-level security/);
  await db.exec('reset role');
  assert.equal((await db.query(`select count(*)::int n from rhythm_private.push_jobs`)).rows[0].n,1);
  await db.query(`update rhythm_private.push_jobs set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute'`);
  await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);await db.exec('set role service_role');
  const call=async(action,arg={})=>(await db.query('select public.rhythm_push_dispatch($1,$2) data',[action,arg])).rows[0].data;
  const jobs=await call('claim');assert.equal(jobs.length,1);assert.equal((await call('claim')).length,0,'Lease must prevent immediate duplicate dispatch');
  assert.equal(await call('authorize',jobs[0]),true);
  await call('finish',{...jobs[0],status:'sent'});assert.equal((await call('claim')).length,0);
  await db.exec('reset role');
  await db.query(`update rhythm_private.push_jobs set due_at=now()-interval '1 day',next_attempt_at=now()-interval '1 day'`);
  await db.exec('set role service_role');assert.equal((await call('claim')).length,0,'Do not deliver stale backlog');await db.exec('reset role');
  await db.query(`delete from auth.sessions where id=$1`,[sa]);await role(a,sa);assert.equal((await db.query('select * from public.push_devices')).rows.length,0,'Revoked token must not access devices');
  await db.exec('reset role');await db.query(`update rhythm_private.push_jobs set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute'`);await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);await db.exec('set role service_role');assert.equal((await call('claim')).length,0,'Revoked session must not dispatch');
  await db.exec('reset role; set role anon');await assert.rejects(db.query('select * from public.push_devices'),/permission denied/);
  console.log('Local Postgres passed: migration, owner RLS, restricted columns/private config, endpoint allowlist, queue lease, stale skip and session revocation. Supabase Vault/cron/net are local stubs; hosted deployment is untested.');
} finally {await db.close();}
