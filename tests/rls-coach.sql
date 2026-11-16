-- Synthetic fixtures only; rollback also restores quotas. Never inspect real account content.
begin;
do $$begin if exists(select 1 from auth.users where id in ('c7d126bb-c431-4da5-a329-4165c84c8101','c7d126bb-c431-4da5-a329-4165c84c8102')) then raise exception 'Fixture IDs exist';end if;end $$;
insert into auth.users(id) values('c7d126bb-c431-4da5-a329-4165c84c8101'),('c7d126bb-c431-4da5-a329-4165c84c8102');
insert into auth.sessions(id,user_id,not_after) values('7711de61-d65a-4254-a597-da5f9770b101','c7d126bb-c431-4da5-a329-4165c84c8101',now()+interval '1 hour');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$declare arg jsonb;result jsonb;begin
 arg=jsonb_build_object('user_id','c7d126bb-c431-4da5-a329-4165c84c8101','id',gen_random_uuid(),'thread_id','7711de61-d65a-4254-a597-da5f9770b101','fingerprint',repeat('a',64));
 if public.rhythm_coach_dispatch('reserve',arg)->>'state'<>'reserved' then raise exception 'No reservation';end if;
 if public.rhythm_coach_dispatch('reserve',arg)->>'state'<>'working' then raise exception 'Duplicate paid request';end if;
 if public.rhythm_coach_dispatch('finish',arg||'{"result":{"reply":"synthetic"}}')->>'saved'<>'true' then raise exception 'No finish';end if;
 result=public.rhythm_coach_dispatch('reserve',arg);if result->>'state'<>'done' or result->'result'->>'reply'<>'synthetic' then raise exception 'No replay';end if;
 if public.rhythm_coach_dispatch('reserve',arg||jsonb_build_object('fingerprint',repeat('b',64)))->>'state'<>'stale' then raise exception 'Fingerprint not checked';end if;
 for i in 2..20 loop
  if public.rhythm_coach_dispatch('reserve',arg||jsonb_build_object('id',gen_random_uuid()))->>'state'<>'reserved' then raise exception 'Early limit';end if;
 end loop;
 if public.rhythm_coach_dispatch('reserve',arg||jsonb_build_object('id',gen_random_uuid()))->>'state'<>'limited' then raise exception 'Account quota absent';end if;
 if public.rhythm_coach_dispatch('reserve',arg||jsonb_build_object('user_id','c7d126bb-c431-4da5-a329-4165c84c8102','id',gen_random_uuid()))->>'state'<>'reserved' then raise exception 'Other account blocked';end if;
end $$;
reset role;
insert into rhythm_private.coach_probe_tickets(id,scenario) values('c7d126bb-c431-4da5-a329-4165c84c8103',0);
insert into rhythm_private.coach_probe_tickets(id,scenario,expires_at) values('c7d126bb-c431-4da5-a329-4165c84c8104',1,now()-interval '1 second');
set local role service_role;
do $$begin
 if public.rhythm_coach_dispatch('probe_consume','{"ticket":"c7d126bb-c431-4da5-a329-4165c84c8103"}')->>'accepted'<>'true' then raise exception 'Probe ticket not accepted';end if;
 if public.rhythm_coach_dispatch('probe_consume','{"ticket":"c7d126bb-c431-4da5-a329-4165c84c8103"}')->>'accepted'<>'false' then raise exception 'Probe replay accepted';end if;
 if public.rhythm_coach_dispatch('probe_consume','{"ticket":"c7d126bb-c431-4da5-a329-4165c84c8104"}')->>'accepted'<>'false' then raise exception 'Expired probe accepted';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c7d126bb-c431-4da5-a329-4165c84c8101","session_id":"7711de61-d65a-4254-a597-da5f9770b101","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.rhythm_coach_dispatch('reserve','{}');raise exception 'Client reserved quota';exception when insufficient_privilege then null;end;
 begin perform count(*) from rhythm_private.coach_jobs;raise exception 'Client read jobs';exception when insufficient_privilege then null;end;
 perform public.rhythm_coach_forget('7711de61-d65a-4254-a597-da5f9770b101');
end $$;
reset role;
do $$begin
 if exists(select 1 from rhythm_private.coach_jobs where user_id='c7d126bb-c431-4da5-a329-4165c84c8101') then raise exception 'Purge failed';end if;
 if not exists(select 1 from rhythm_private.coach_jobs where user_id='c7d126bb-c431-4da5-a329-4165c84c8102') then raise exception 'Other owner purged';end if;
end $$;
delete from auth.sessions where id='7711de61-d65a-4254-a597-da5f9770b101';
set local role authenticated;
do $$begin begin perform public.rhythm_coach_forget(null);raise exception 'Revoked session purged';exception when insufficient_privilege then null;end;end $$;
reset role;
update rhythm_private.coach_quota set count=200 where scope='global' and day=(now() at time zone 'UTC')::date;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$begin if public.rhythm_coach_dispatch('reserve',jsonb_build_object('user_id','c7d126bb-c431-4da5-a329-4165c84c8102','id',gen_random_uuid(),'thread_id',gen_random_uuid(),'fingerprint',repeat('a',64)))->>'state'<>'limited' then raise exception 'Global cap absent';end if;end $$;
reset role;
rollback;
