-- Additive: existing snapshots, vaults and push schedules remain intact.
create or replace function rhythm_private.valid_account_data(payload jsonb,owner uuid) returns boolean
language sql immutable security invoker set search_path='' as $$
select coalesce(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8000000 and payload->>'schemaVersion'='1'
 and payload ?& array['sessions','intent','wakeMarkers','checkins','journal','audit','settings']
 and not exists(select 1 from jsonb_object_keys(payload) k where k not in ('schemaVersion','sessions','intent','wakeMarkers','checkins','journal','audit','settings','guidance','profile','coaching'))
 and jsonb_typeof(payload->'sessions')='array' and jsonb_typeof(payload->'wakeMarkers')='array' and jsonb_typeof(payload->'checkins')='array' and jsonb_typeof(payload->'audit')='array' and jsonb_typeof(payload->'journal')='array' and jsonb_typeof(payload->'settings')='object'
 and (not payload ? 'profile' or jsonb_typeof(payload->'profile')='object')
 and (not payload ? 'coaching' or (jsonb_typeof(payload->'coaching')='object' and payload->'coaching'->>'version'='1' and jsonb_typeof(payload->'coaching'->'consent')='object' and jsonb_typeof(payload->'coaching'->'messages')='array' and jsonb_typeof(payload->'coaching'->'plans')='array' and jsonb_typeof(payload->'coaching'->'memories')='array' and jsonb_typeof(payload->'coaching'->'forgotten')='array'))
 and not exists(select 1 from jsonb_array_elements(payload->'journal') n where n ? 'audio' or (n ? 'audioRef' and coalesce(n->'audioRef'->>'path','') !~ ('^'||owner::text||'/[a-f0-9]{64}/[a-f0-9]{64}$'))),false);
$$;

create table rhythm_private.coach_quota(scope text not null,day date not null,count integer not null check(count>=0),primary key(scope,day));
create table rhythm_private.coach_jobs(
 user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,thread_id uuid not null,
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),state text not null check(state in ('working','done','failed')),
 result jsonb check(result is null or octet_length(result::text)<64000),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',primary key(user_id,id)
);
create index coach_jobs_expiry on rhythm_private.coach_jobs(expires_at);
create index coach_jobs_thread on rhythm_private.coach_jobs(user_id,thread_id);
alter table rhythm_private.coach_quota enable row level security;
alter table rhythm_private.coach_jobs enable row level security;
revoke all on rhythm_private.coach_quota,rhythm_private.coach_jobs from public,anon,authenticated;
create policy coach_quota_no_clients on rhythm_private.coach_quota as restrictive for all to anon,authenticated using(false) with check(false);
create policy coach_jobs_no_clients on rhythm_private.coach_jobs as restrictive for all to anon,authenticated using(false) with check(false);

create table rhythm_private.coach_probe_tickets(id uuid primary key default gen_random_uuid(),scenario integer not null check(scenario between 0 and 2),expires_at timestamptz not null default now()+interval '90 seconds');
alter table rhythm_private.coach_probe_tickets enable row level security;
revoke all on rhythm_private.coach_probe_tickets from public,anon,authenticated;
create policy coach_probe_no_clients on rhythm_private.coach_probe_tickets as restrictive for all to anon,authenticated using(false) with check(false);

create function rhythm_private.coach_dispatch(p_action text,p_arg jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid=(p_arg->>'user_id')::uuid;r uuid=(p_arg->>'id')::uuid;t uuid=(p_arg->>'thread_id')::uuid;j rhythm_private.coach_jobs;today date=(now() at time zone 'UTC')::date;t_probe integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise insufficient_privilege;end if;
 if p_action='probe_consume' then
  delete from rhythm_private.coach_probe_tickets where id=(p_arg->>'ticket')::uuid and expires_at>now() returning scenario into t_probe;
  return jsonb_build_object('accepted',found,'scenario',t_probe);
 elsif p_action='reserve' then
  if u is null or r is null or t is null or coalesce(p_arg->>'fingerprint','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value;end if;
  perform pg_catalog.pg_advisory_xact_lock(724836912);
  select * into j from rhythm_private.coach_jobs where user_id=u and id=r for update;
  if found then
   if j.fingerprint<>p_arg->>'fingerprint' or j.thread_id<>t or j.expires_at<=now() then return '{"state":"stale"}';end if;
   if j.state='done' then return jsonb_build_object('state','done','result',j.result);end if;
   return jsonb_build_object('state',case when j.state='working' and j.created_at>now()-interval '90 seconds' then 'working' else 'failed' end);
  end if;
  if coalesce((select count from rhythm_private.coach_quota where scope='global' and day=today),0)>=200 or coalesce((select count from rhythm_private.coach_quota where scope=u::text and day=today),0)>=20 then return '{"state":"limited"}';end if;
  insert into rhythm_private.coach_quota values('global',today,1),(u::text,today,1) on conflict(scope,day) do update set count=coach_quota.count+1;
  insert into rhythm_private.coach_jobs(user_id,id,thread_id,fingerprint,state) values(u,r,t,p_arg->>'fingerprint','working');
  return '{"state":"reserved"}';
 elsif p_action='finish' then
  update rhythm_private.coach_jobs set state='done',result=p_arg->'result' where user_id=u and id=r and fingerprint=p_arg->>'fingerprint' and state='working' and expires_at>now();return jsonb_build_object('saved',found);
 elsif p_action='fail' then
  update rhythm_private.coach_jobs set state='failed',result=null where user_id=u and id=r and state='working';return '{}';
 end if;
 raise invalid_parameter_value;
end $$;
revoke all on function rhythm_private.coach_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function rhythm_private.coach_dispatch(text,jsonb) to service_role;
create function public.rhythm_coach_dispatch(p_action text,p_arg jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select rhythm_private.coach_dispatch(p_action,p_arg);$$;
revoke all on function public.rhythm_coach_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function public.rhythm_coach_dispatch(text,jsonb) to service_role;

create function rhythm_private.coach_forget(p_thread_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not rhythm_private.has_active_session() then raise insufficient_privilege;end if;
 delete from rhythm_private.coach_jobs where user_id=auth.uid() and (p_thread_id is null or thread_id=p_thread_id);
end $$;
revoke all on function rhythm_private.coach_forget(uuid) from public,anon;
grant execute on function rhythm_private.coach_forget(uuid) to authenticated;
create function public.rhythm_coach_forget(p_thread_id uuid default null) returns void language sql security invoker set search_path='' as $$select rhythm_private.coach_forget(p_thread_id);$$;
revoke all on function public.rhythm_coach_forget(uuid) from public,anon;
grant execute on function public.rhythm_coach_forget(uuid) to authenticated;

-- Internal cleanup only: no network requests, credentials or notification scheduler.
select cron.schedule('rhythm-coach-cleanup','17 * * * *',$cron$delete from rhythm_private.coach_probe_tickets where expires_at<now(); delete from rhythm_private.coach_jobs where expires_at<now(); delete from rhythm_private.coach_quota where day<(now() at time zone 'UTC')::date-7;$cron$);
