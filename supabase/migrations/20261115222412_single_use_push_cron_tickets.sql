-- Hosted pg_net queues are platform-readable; queue only an expiring, single-use
-- capability. The long-lived VAPID key remains in Vault and never enters pg_net.
create table rhythm_private.push_cron_tickets (
  token_hash text primary key,
  expires_at timestamptz not null
);
alter table rhythm_private.push_cron_tickets enable row level security;
revoke all on rhythm_private.push_cron_tickets from public,anon,authenticated;
create policy push_cron_tickets_no_clients on rhythm_private.push_cron_tickets
  as restrictive for all to anon,authenticated using(false) with check(false);

create function rhythm_private.consume_push_cron(p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise insufficient_privilege; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from rhythm_private.push_cron_tickets
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
  get diagnostics used=row_count;
  return used=1;
end $$;
revoke all on function rhythm_private.consume_push_cron(text) from public,anon,authenticated;
grant execute on function rhythm_private.consume_push_cron(text) to service_role;
create function public.rhythm_push_consume_cron(p_token text) returns boolean
language sql security invoker set search_path='' as $$ select rhythm_private.consume_push_cron(p_token); $$;
revoke all on function public.rhythm_push_consume_cron(text) from public,anon,authenticated;
grant execute on function public.rhythm_push_consume_cron(text) to service_role;

-- Retire/rotate the former static scheduler credential; no API accepts it now.
select vault.update_secret(cron_secret,encode(extensions.gen_random_bytes(32),'hex'),null,'Retired scheduler credential; current cron uses expiring single-use tickets')
from rhythm_private.push_config where singleton;
create or replace function public.rhythm_push_dispatch(p_action text,p_arg jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
  select case when p_action='config' then rhythm_private.push_dispatch(p_action,p_arg)-'cronToken'
    else rhythm_private.push_dispatch(p_action,p_arg) end;
$$;

create or replace function rhythm_private.invoke_push_worker() returns void
language plpgsql security invoker set search_path='' as $$
declare ticket text;
begin
  delete from rhythm_private.push_cron_tickets where expires_at<=now();
  if exists(select 1 from rhythm_private.push_jobs j join public.push_devices d on d.id=j.device_id join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
    where j.due_at<=now() and j.next_attempt_at<=now() and coalesce(d.paused_until,'-infinity')<=now() and (s.not_after is null or s.not_after>now())) then
    ticket=encode(extensions.gen_random_bytes(32),'hex');
    insert into rhythm_private.push_cron_tickets(token_hash,expires_at)
      values(encode(extensions.digest(ticket,'sha256'),'hex'),now()+interval '90 seconds');
    perform net.http_post(url:='https://hphwmhmssexnrhkcxdpi.supabase.co/functions/v1/rhythm-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-rhythm-cron',ticket),body:='{}',timeout_milliseconds:=10000);
  end if;
end $$;
