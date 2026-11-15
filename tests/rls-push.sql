-- Trusted hosted-project test. All synthetic accounts/devices/jobs roll back.
-- Refuse to claim jobs when real devices exist; no provider call is made here.
begin;
lock table public.push_devices in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.push_devices) then raise exception 'Use an isolated project for queue tests when real devices exist'; end if;
end $$;
select set_config('rhythm.test_a',gen_random_uuid()::text,true),set_config('rhythm.test_b',gen_random_uuid()::text,true),
       set_config('rhythm.session_a',gen_random_uuid()::text,true),set_config('rhythm.session_b',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email) values
  (current_setting('rhythm.test_a')::uuid,'authenticated','authenticated',current_setting('rhythm.test_a')||'@example.invalid'),
  (current_setting('rhythm.test_b')::uuid,'authenticated','authenticated',current_setting('rhythm.test_b')||'@example.invalid');
insert into auth.sessions(id,user_id,not_after) values
  (current_setting('rhythm.session_a')::uuid,current_setting('rhythm.test_a')::uuid,now()+interval '1 hour'),
  (current_setting('rhythm.session_b')::uuid,current_setting('rhythm.test_b')::uuid,now()+interval '1 hour');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('rhythm.test_a'),'session_id',current_setting('rhythm.session_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
insert into public.push_devices(subscription,timezone,schedule) values (
  jsonb_build_object('endpoint','https://web.push.apple.com/SQL-FIXTURE','keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22))),
  'Europe/Amsterdam','[{"kind":"bed","time":"23:00"}]');
do $$ begin
  if (select count(*) from public.push_devices)<>1 then raise exception 'Owner cannot read device'; end if;
  update public.push_devices set schedule='[{"kind":"winddown","time":"22:30","anchorTime":"23:00","leadMinutes":30}]';
  begin perform public.rhythm_push_dispatch('config');raise exception 'Client can read service config';exception when insufficient_privilege then null;end;
  begin perform * from rhythm_private.push_config;raise exception 'Client can read private config';exception when insufficient_privilege then null;end;
  begin update public.push_devices set last_status='sent';raise exception 'Client can forge delivery status';exception when insufficient_privilege then null;end;
  begin update public.push_devices set subscription=jsonb_build_object('endpoint','https://attacker.invalid/x','keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)));raise exception 'Unsafe endpoint accepted';exception when raise_exception then if sqlerrm<>'Unsupported push endpoint' then raise;end if;end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('rhythm.test_b'),'session_id',current_setting('rhythm.session_b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare n integer; begin
  if (select count(*) from public.push_devices)<>0 then raise exception 'B can read A';end if;
  update public.push_devices set timezone='UTC';get diagnostics n=row_count;if n<>0 then raise exception 'B can update A';end if;
  delete from public.push_devices;get diagnostics n=row_count;if n<>0 then raise exception 'B can delete A';end if;
  begin
    insert into public.push_devices(user_id,subscription,timezone,schedule) values(current_setting('rhythm.test_a')::uuid,
      jsonb_build_object('endpoint','https://web.push.apple.com/OTHER-FIXTURE','keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22))),'UTC','[{"kind":"bed","time":"23:00"}]');
    raise exception 'B can insert as A';exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if rhythm_private.next_push_at('03:00','Europe/Amsterdam','2026-03-28T23:00:00Z',30)<>'2026-03-29T00:30:00Z'::timestamptz then raise exception 'Spring winddown offset incorrect';end if;
  if rhythm_private.next_push_at('02:30','Europe/Amsterdam','2026-10-24T22:00:00Z',0)<>'2026-10-25T01:30:00Z'::timestamptz then raise exception 'Fall repeated time incorrect';end if;
  if (select count(*) from rhythm_private.push_jobs)<>1 then raise exception 'Queue was not rebuilt';end if;
end $$;
update rhythm_private.push_jobs set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare jobs jsonb;begin
  jobs=public.rhythm_push_dispatch('claim');if jsonb_array_length(jobs)<>1 then raise exception 'Active queue not claimed';end if;
  if jsonb_array_length(public.rhythm_push_dispatch('claim'))<>0 then raise exception 'Lease permits duplicate immediate claim';end if;
  if public.rhythm_push_dispatch('authorize',jobs->0)<>'true'::jsonb then raise exception 'Own active job not authorized';end if;
  perform public.rhythm_push_dispatch('finish',(jobs->0)||'{"status":"sent"}'::jsonb);
  if jsonb_array_length(public.rhythm_push_dispatch('claim'))<>0 then raise exception 'Sent job repeats immediately';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('rhythm.test_a'),'session_id',current_setting('rhythm.session_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
update public.push_devices set paused_until=now()+interval '24 hours';
reset role;
update rhythm_private.push_jobs set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin if jsonb_array_length(public.rhythm_push_dispatch('claim'))<>0 then raise exception 'Paused device dispatched';end if;end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('rhythm.test_a'),'session_id',current_setting('rhythm.session_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
update public.push_devices set paused_until=null;
reset role;
update rhythm_private.push_jobs set due_at=now()-interval '1 day',next_attempt_at=now()-interval '1 day';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin if jsonb_array_length(public.rhythm_push_dispatch('claim'))<>0 then raise exception 'Stale backlog dispatched';end if;end $$;
reset role;
update rhythm_private.push_jobs set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare jobs jsonb;begin
  jobs=public.rhythm_push_dispatch('claim');if jsonb_array_length(jobs)<>1 then raise exception 'Cannot claim revocation fixture';end if;
  perform set_config('rhythm.claim_fixture',(jobs->0)::text,true);
end $$;
reset role;
delete from auth.sessions where id=current_setting('rhythm.session_a')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('rhythm.test_a'),'session_id',current_setting('rhythm.session_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if (select count(*) from public.push_devices)<>0 then raise exception 'Revoked session reads device';end if;end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin
  if public.rhythm_push_dispatch('authorize',current_setting('rhythm.claim_fixture')::jsonb)<>'false'::jsonb then raise exception 'Revocation after claim not enforced';end if;
end $$;
reset role;
insert into rhythm_private.push_cron_tickets(token_hash,expires_at) values
  (encode(extensions.digest(repeat('a',64),'sha256'),'hex'),now()+interval '90 seconds'),
  (encode(extensions.digest(repeat('b',64),'sha256'),'hex'),now()-interval '1 second');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin
  if not public.rhythm_push_consume_cron(repeat('a',64)) then raise exception 'Fresh cron ticket rejected';end if;
  if public.rhythm_push_consume_cron(repeat('a',64)) then raise exception 'Cron ticket replay accepted';end if;
  if public.rhythm_push_consume_cron(repeat('b',64)) then raise exception 'Expired cron ticket accepted';end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.push_devices;raise exception 'Anonymous role reads device';exception when insufficient_privilege then null;end;
  begin perform public.rhythm_push_dispatch('config');raise exception 'Anonymous role calls dispatch';exception when insufficient_privilege then null;end;
  begin perform public.rhythm_push_consume_cron(repeat('a',64));raise exception 'Anonymous role consumes cron ticket';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: hosted push owner isolation, column/private restrictions, endpoint validation, DST offsets, queue lease, pause, stale skip, session revocation and expiring single-use cron tickets; all fixtures rolled back; no notification sent' as result;
