-- Synthetic fixtures only. Entire probe is rolled back; no real user rows read.
begin;
do $$begin
 if exists(select 1 from auth.users where id in ('b7d126bb-c431-4da5-a329-4165c84c8101','b7d126bb-c431-4da5-a329-4165c84c8102')) then raise exception 'Fixture IDs already exist; stop';end if;
end $$;
insert into auth.users(id) values('b7d126bb-c431-4da5-a329-4165c84c8101'),('b7d126bb-c431-4da5-a329-4165c84c8102');
insert into auth.sessions(id,user_id,not_after) values('6711de61-d65a-4254-a597-da5f9770b101','b7d126bb-c431-4da5-a329-4165c84c8101',now()+interval '1 hour'),('6711de61-d65a-4254-a597-da5f9770b102','b7d126bb-c431-4da5-a329-4165c84c8102',now()+interval '1 hour');
select set_config('request.jwt.claims','{"sub":"b7d126bb-c431-4da5-a329-4165c84c8101","session_id":"6711de61-d65a-4254-a597-da5f9770b101","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
insert into public.account_data(data,change_id) values('{"schemaVersion":1,"sessions":[],"intent":null,"wakeMarkers":[],"checkins":[],"journal":[],"audit":[],"settings":{"timezone":"Europe/Amsterdam","theme":"dark","goalBed":"","goalWake":""}}','3870fb6f-9d9d-4a4d-8fb9-c68b59f74c01');
do $$begin
 if not public.account_session_active() then raise exception 'Active session false';end if;
 begin update public.account_data set revision=4,change_id=gen_random_uuid() where user_id=auth.uid();raise exception 'Bad revision accepted';exception when serialization_failure then null;end;
 begin insert into public.account_data(user_id,data,change_id) select 'b7d126bb-c431-4da5-a329-4165c84c8102',data,gen_random_uuid() from public.account_data where user_id=auth.uid();raise exception 'Wrong owner accepted';exception when insufficient_privilege then null;end;
 begin insert into public.account_revisions(user_id,revision,change_id,data) select auth.uid(),99,gen_random_uuid(),data from public.account_data where user_id=auth.uid();raise exception 'Client wrote backup';exception when insufficient_privilege then null;end;
 begin update public.account_data set data=jsonb_set(data,'{journal}','[{"id":"test","audio":{"dataUrl":"data:audio/wav;base64,AAAA"}}]'),revision=2,change_id=gen_random_uuid() where user_id=auth.uid();raise exception 'Inline audio accepted';exception when check_violation then null;end;
end $$;
update public.account_data set revision=2,change_id='3870fb6f-9d9d-4a4d-8fb9-c68b59f74c02' where user_id=auth.uid() and revision=1 and change_id='3870fb6f-9d9d-4a4d-8fb9-c68b59f74c01';
do $$declare n integer;begin
 update public.account_data set revision=2,change_id=gen_random_uuid() where user_id=auth.uid() and revision=1;get diagnostics n=row_count;if n<>0 then raise exception 'CAS failed';end if;
 if (select count(*) from public.account_revisions where user_id=auth.uid())<>1 then raise exception 'Backup missing';end if;
end $$;
insert into public.account_recovery(id,data) select gen_random_uuid(),data from public.account_data where user_id=auth.uid();
insert into storage.objects(bucket_id,name) values('rhythm-audio','b7d126bb-c431-4da5-a329-4165c84c8101/'||repeat('a',64)||'/'||repeat('b',64));
do $$begin
 begin insert into storage.objects(bucket_id,name) values('rhythm-audio','b7d126bb-c431-4da5-a329-4165c84c8102/'||repeat('a',64)||'/'||repeat('b',64));raise exception 'Wrong audio owner';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"b7d126bb-c431-4da5-a329-4165c84c8102","session_id":"6711de61-d65a-4254-a597-da5f9770b102","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.account_data where user_id='b7d126bb-c431-4da5-a329-4165c84c8101') or exists(select 1 from public.account_revisions where user_id='b7d126bb-c431-4da5-a329-4165c84c8101') or exists(select 1 from public.account_recovery where user_id='b7d126bb-c431-4da5-a329-4165c84c8101') or exists(select 1 from storage.objects where bucket_id='rhythm-audio' and name like 'b7d126bb-c431-4da5-a329-4165c84c8101/%') then raise exception 'Cross-account data visible';end if;
 update public.account_data set revision=3,change_id=gen_random_uuid() where user_id='b7d126bb-c431-4da5-a329-4165c84c8101';if found then raise exception 'Cross-account update';end if;
end $$;
reset role;
delete from auth.sessions where id='6711de61-d65a-4254-a597-da5f9770b101';
select set_config('request.jwt.claims','{"sub":"b7d126bb-c431-4da5-a329-4165c84c8101","session_id":"6711de61-d65a-4254-a597-da5f9770b101","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if public.account_session_active() or exists(select 1 from public.account_data where user_id=auth.uid()) or exists(select 1 from public.account_revisions where user_id=auth.uid()) or exists(select 1 from public.account_recovery where user_id=auth.uid()) then raise exception 'Revoked session access';end if;
end $$;
reset role;set local role anon;
do $$begin
 begin perform * from public.account_data;raise exception 'Anon read accepted';exception when insufficient_privilege then null;end;
 begin perform public.account_session_active();raise exception 'Anon RPC accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
