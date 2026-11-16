import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema rhythm_private;create schema storage;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth,rhythm_private,storage to authenticated,service_role;
 create function rhythm_private.has_active_session() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.sessions where user_id=auth.uid() and id=(auth.jwt()->>'session_id')::uuid and (not_after is null or not_after>now()));$$;
 revoke all on function rhythm_private.has_active_session() from public;grant execute on function rhythm_private.has_active_session() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
 const file=(await readdir('supabase/migrations')).find(f=>f.endsWith('_account_storage.sql'));await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.exec("create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';");
 const coach=(await readdir('supabase/migrations')).find(f=>f.endsWith('_personal_coach.sql'));await db.exec(await readFile('supabase/migrations/'+coach,'utf8'));
 // The same assertions can be executed on hosted Supabase inside a full rollback.
 await db.exec(await readFile('tests/rls-coach.sql','utf8'));
 assert.equal((await db.query('select count(*)::int n from public.account_data')).rows[0].n,0);
 console.log('Coach database: private jobs, replay, per-account/global quotas, owner purge and revoked session checks passed.');
}finally{await db.close();}
