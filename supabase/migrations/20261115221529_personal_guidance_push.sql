-- Push is an explicit, separate opt-in. No diary content or vault key is used here.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Queued requests contain the narrowly scoped cron token; app roles must not inspect them.
revoke all on schema net,cron from public,anon,authenticated;
revoke all on all tables in schema net,cron from public,anon,authenticated;
revoke execute on all functions in schema net,cron from public,anon,authenticated;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null default ((auth.jwt()->>'session_id')::uuid),
  subscription jsonb not null,
  endpoint text generated always as (subscription->>'endpoint') stored unique,
  timezone text not null,
  schedule jsonb not null,
  paused_until timestamptz,
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_test_at timestamptz,
  last_status text not null default 'ready'
);
alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;
revoke all on public.push_devices from public, anon, authenticated;
grant select, delete on public.push_devices to authenticated;
grant insert(user_id,subscription,timezone,schedule,paused_until), update(subscription,timezone,schedule,paused_until) on public.push_devices to authenticated;
grant all on public.push_devices to service_role;
create policy push_owner_select on public.push_devices for select to authenticated using ((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create policy push_owner_insert on public.push_devices for insert to authenticated with check ((select auth.uid())=user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false) and (select rhythm_private.has_active_session()));
create policy push_owner_update on public.push_devices for update to authenticated using ((select auth.uid())=user_id and (select rhythm_private.has_active_session())) with check ((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create policy push_owner_delete on public.push_devices for delete to authenticated using ((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create index push_devices_user on public.push_devices(user_id);
create index push_devices_session on public.push_devices(session_id);

create table rhythm_private.push_config (
  singleton boolean primary key default true check(singleton),
  public_key text,
  private_secret uuid,
  cron_secret uuid not null
);
insert into rhythm_private.push_config(singleton,cron_secret)
values(true,vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'rhythm_push_cron'));
create table rhythm_private.push_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.push_devices(id) on delete cascade,
  kind text not null,
  local_time time not null,
  lead_minutes integer not null default 0,
  due_at timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease uuid,
  unique(device_id,kind)
);
create index push_jobs_due on rhythm_private.push_jobs(due_at,next_attempt_at);
alter table rhythm_private.push_jobs enable row level security;
alter table rhythm_private.push_config enable row level security;
revoke all on rhythm_private.push_jobs,rhythm_private.push_config from public,anon,authenticated;

create function rhythm_private.next_push_at(p_time time,p_timezone text,p_after timestamptz,p_lead integer default 0)
returns timestamptz language sql stable set search_path='' as $$
  select (case when (((shifted at time zone p_timezone)::date + p_time) at time zone p_timezone)>shifted
    then (((shifted at time zone p_timezone)::date + p_time) at time zone p_timezone)
    else ((((shifted at time zone p_timezone)::date+1) + p_time) at time zone p_timezone) end) - make_interval(mins=>p_lead)
  from (select p_after+make_interval(mins=>p_lead) as shifted) s;
$$;

create function rhythm_private.validate_push_device() returns trigger language plpgsql set search_path='' as $$
declare entry jsonb; host text;
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone'; end if;
  if jsonb_typeof(new.subscription)<>'object' or octet_length(new.subscription::text)>4096
    or not (new.subscription ?& array['endpoint','keys'])
    or (select count(*) from jsonb_object_keys(new.subscription)) not between 2 and 3
    or exists(select 1 from jsonb_object_keys(new.subscription) k where k not in ('endpoint','keys','expirationTime'))
    or jsonb_typeof(new.subscription->'keys')<>'object'
    or (select count(*) from jsonb_object_keys(new.subscription->'keys'))<>2
    or coalesce(new.subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}=?$'
    or coalesce(new.subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$'
    then raise exception 'Invalid push subscription'; end if;
  if coalesce(new.subscription->>'endpoint','') !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|notify\.windows\.com)/[^?#]+$'
    and coalesce(new.subscription->>'endpoint','') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/[^?#]+$'
    then raise exception 'Unsupported push endpoint'; end if;
  if jsonb_typeof(new.schedule)<>'array' or jsonb_array_length(new.schedule) not between 1 and 4 then raise exception 'Choose 1 to 4 reminders'; end if;
  if (select count(distinct x->>'kind') from jsonb_array_elements(new.schedule) x)<>jsonb_array_length(new.schedule) then raise exception 'Duplicate reminder'; end if;
  for entry in select * from jsonb_array_elements(new.schedule) loop
    if jsonb_typeof(entry)<>'object'
      or coalesce(entry->>'kind','') not in ('winddown','bed','wake','checkin')
      or coalesce(entry->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid reminder'; end if;
    if entry->>'kind'='winddown' then
      if (select count(*) from jsonb_object_keys(entry))<>4 or coalesce(entry->>'anchorTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or jsonb_typeof(entry->'leadMinutes')<>'number' or coalesce(entry->>'leadMinutes','') not in ('15','30','60')
        then raise exception 'Invalid winddown reminder'; end if;
      if ((entry->>'anchorTime')::time-make_interval(mins=>(entry->>'leadMinutes')::integer))::time<>(entry->>'time')::time then raise exception 'Inconsistent winddown time'; end if;
    elsif (select count(*) from jsonb_object_keys(entry))<>2 then raise exception 'Invalid reminder fields'; end if;
  end loop;
  if current_user='authenticated' then
    new.session_id=((auth.jwt()->>'session_id')::uuid);
    if not rhythm_private.has_active_session() then raise insufficient_privilege; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,0));
    if tg_op='INSERT' and (select count(*) from public.push_devices where user_id=new.user_id)>=5 then raise exception 'At most 5 push devices per account'; end if;
  end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function rhythm_private.validate_push_device() from public,anon,authenticated;
create trigger validate_push_device before insert or update of subscription,timezone,schedule,paused_until on public.push_devices for each row execute function rhythm_private.validate_push_device();

-- Internal definer: users may change only their RLS-owned device, never the job queue.
create function rhythm_private.rebuild_push_jobs() returns trigger language plpgsql security definer set search_path='' as $$
declare entry jsonb;
begin
  delete from rhythm_private.push_jobs where device_id=new.id;
  for entry in select * from jsonb_array_elements(new.schedule) loop
    insert into rhythm_private.push_jobs(device_id,kind,local_time,lead_minutes,due_at)
    values(new.id,entry->>'kind',coalesce(entry->>'anchorTime',entry->>'time')::time,coalesce((entry->>'leadMinutes')::integer,0),rhythm_private.next_push_at(coalesce(entry->>'anchorTime',entry->>'time')::time,new.timezone,greatest(now(),coalesce(new.paused_until,now())),coalesce((entry->>'leadMinutes')::integer,0)));
  end loop;
  return new;
end $$;
revoke all on function rhythm_private.rebuild_push_jobs() from public,anon,authenticated;
create trigger rebuild_push_jobs after insert or update of subscription,timezone,schedule,paused_until on public.push_devices for each row execute function rhythm_private.rebuild_push_jobs();

-- The single exposed wrapper is invoker-only and callable solely by service_role.
create function rhythm_private.push_dispatch(p_action text,p_arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg rhythm_private.push_config; result jsonb; device public.push_devices; target rhythm_private.push_jobs;
begin
  if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise insufficient_privilege; end if;
  if p_action='config' then
    select * into cfg from rhythm_private.push_config where singleton;
    return jsonb_build_object('publicKey',cfg.public_key,'privateKey',(select decrypted_secret from vault.decrypted_secrets where id=cfg.private_secret),'cronToken',(select decrypted_secret from vault.decrypted_secrets where id=cfg.cron_secret));
  elsif p_action='initialize' then
    select * into cfg from rhythm_private.push_config where singleton for update;
    if cfg.public_key is null then
      if coalesce(p_arg->>'publicKey','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(p_arg->>'privateKey','') !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid VAPID keys'; end if;
      update rhythm_private.push_config set public_key=p_arg->>'publicKey',private_secret=vault.create_secret(p_arg->>'privateKey','rhythm_push_vapid') where singleton;
    end if;
    return '{}'::jsonb;
  elsif p_action='claim' then
    -- Skip stale reminders instead of sending an overnight backlog.
    update rhythm_private.push_jobs j set due_at=rhythm_private.next_push_at(j.local_time,d.timezone,now(),j.lead_minutes),attempts=0,lease=null,next_attempt_at=now()
      from public.push_devices d where d.id=j.device_id and (j.due_at<now()-interval '10 minutes' or (j.attempts>=3 and j.next_attempt_at<=now()));
    with due as (
      select j.id from rhythm_private.push_jobs j join public.push_devices d on d.id=j.device_id
      join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
      where j.due_at<=now() and j.next_attempt_at<=now() and j.attempts<3
        and coalesce(d.paused_until,'-infinity')<=now() and (s.not_after is null or s.not_after>now())
      order by j.due_at limit 30 for update of j skip locked
    ), claimed as (
      update rhythm_private.push_jobs j set attempts=j.attempts+1,lease=gen_random_uuid(),next_attempt_at=now()+interval '2 minutes'
      from due where due.id=j.id returning j.*
    ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'kind',c.kind,'subscription',d.subscription)),'[]') into result from claimed c join public.push_devices d on d.id=c.device_id;
    return result;
  elsif p_action='authorize' then
    return to_jsonb(exists(select 1 from rhythm_private.push_jobs j join public.push_devices d on d.id=j.device_id join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
      where j.id=(p_arg->>'id')::uuid and j.lease=(p_arg->>'lease')::uuid and coalesce(d.paused_until,'-infinity')<=now() and (s.not_after is null or s.not_after>now())));
  elsif p_action='finish' then
    select * into target from rhythm_private.push_jobs where id=(p_arg->>'id')::uuid and lease=(p_arg->>'lease')::uuid for update;
    if not found then return '{}'::jsonb; end if;
    if p_arg->>'status'='gone' then delete from public.push_devices where id=target.device_id;
    elsif p_arg->>'status'='sent' then
      select * into device from public.push_devices where id=target.device_id;
      update rhythm_private.push_jobs set due_at=rhythm_private.next_push_at(local_time,device.timezone,now(),lead_minutes),next_attempt_at=now(),attempts=0,lease=null where id=target.id;
      update public.push_devices set last_status='sent',last_sent_at=now() where id=target.device_id;
    else update public.push_devices set last_status='error' where id=target.device_id;
    end if;
    return '{}'::jsonb;
  elsif p_action='test' then
    update public.push_devices d set last_test_at=now()
      where d.id=(p_arg->>'id')::uuid and d.user_id=(p_arg->>'owner')::uuid
      and exists(select 1 from auth.sessions s where s.id=d.session_id and s.user_id=d.user_id and (s.not_after is null or s.not_after>now()))
      and (d.last_test_at is null or d.last_test_at<now()-interval '1 minute') returning * into device;
    if not found then raise exception 'Test unavailable or rate limited'; end if;
    return device.subscription;
  end if;
  raise exception 'Unknown action';
end $$;
revoke all on function rhythm_private.push_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function rhythm_private.push_dispatch(text,jsonb) to service_role;
grant usage on schema rhythm_private to service_role;
create function public.rhythm_push_dispatch(p_action text,p_arg jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select rhythm_private.push_dispatch(p_action,p_arg); $$;
revoke all on function public.rhythm_push_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function public.rhythm_push_dispatch(text,jsonb) to service_role;

create function rhythm_private.invoke_push_worker() returns void language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from rhythm_private.push_jobs j join public.push_devices d on d.id=j.device_id join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
    where j.due_at<=now() and j.next_attempt_at<=now() and coalesce(d.paused_until,'-infinity')<=now() and (s.not_after is null or s.not_after>now())) then
    perform net.http_post(url:='https://hphwmhmssexnrhkcxdpi.supabase.co/functions/v1/rhythm-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-rhythm-cron',(select decrypted_secret from vault.decrypted_secrets where id=(select cron_secret from rhythm_private.push_config where singleton))),body:='{}',timeout_milliseconds:=10000);
  end if;
end $$;
revoke all on function rhythm_private.invoke_push_worker() from public,anon,authenticated;
revoke all on function rhythm_private.next_push_at(time,text,timestamptz,integer) from public,anon,authenticated;
select cron.schedule('rhythm-push-minute','* * * * *','select rhythm_private.invoke_push_worker();');
