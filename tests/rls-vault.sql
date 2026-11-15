-- Run on a test/new project through a trusted SQL connection. All fixtures roll back.
begin;
select set_config('rhythm.test_a', gen_random_uuid()::text, true);
select set_config('rhythm.test_b', gen_random_uuid()::text, true);
select set_config('rhythm.session_a', gen_random_uuid()::text, true);
select set_config('rhythm.session_b', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email)
values
  (current_setting('rhythm.test_a')::uuid, 'authenticated', 'authenticated', current_setting('rhythm.test_a') || '@example.invalid'),
  (current_setting('rhythm.test_b')::uuid, 'authenticated', 'authenticated', current_setting('rhythm.test_b') || '@example.invalid');

insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
(current_setting('rhythm.session_a')::uuid,current_setting('rhythm.test_a')::uuid,now(),now(),now()+interval '1 hour'),
(current_setting('rhythm.session_b')::uuid,current_setting('rhythm.test_b')::uuid,now(),now(),now()+interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rhythm.test_a'), 'session_id', current_setting('rhythm.session_a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
insert into public.encrypted_vaults(user_id, revision, change_id, envelope)
values(current_setting('rhythm.test_a')::uuid, 1, gen_random_uuid(), jsonb_build_object('version', 1, 'salt', encode(repeat('s',16)::bytea,'base64'), 'iv', encode(repeat('i',12)::bytea,'base64'), 'ciphertext', encode(repeat('c',32)::bytea,'base64')));
do $$
declare affected integer;
begin
  if (select count(*) from public.encrypted_vaults) <> 1 then raise exception 'Owner cannot read own vault'; end if;
  update public.encrypted_vaults set revision=2 where user_id=current_setting('rhythm.test_a')::uuid and revision=99;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Compare-and-set failed'; end if;
  update public.encrypted_vaults set revision=2, change_id=gen_random_uuid() where user_id=current_setting('rhythm.test_a')::uuid and revision=1;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner cannot update own vault'; end if;
  begin
    update public.encrypted_vaults set revision=8 where user_id=current_setting('rhythm.test_a')::uuid;
    raise exception 'Revision skip was accepted';
  exception when serialization_failure then null;
  end;
  begin
    update public.encrypted_vaults set revision=3, envelope='{}'::jsonb where user_id=current_setting('rhythm.test_a')::uuid;
    raise exception 'Unencrypted/malformed payload was accepted';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('rhythm.test_b'), 'session_id', current_setting('rhythm.session_b'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $$
declare affected integer;
begin
  if (select count(*) from public.encrypted_vaults) <> 0 then raise exception 'B can read A'; end if;
  update public.encrypted_vaults set revision=3 where user_id=current_setting('rhythm.test_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B can update A'; end if;
  delete from public.encrypted_vaults where user_id=current_setting('rhythm.test_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B can delete A'; end if;
  begin
    insert into public.encrypted_vaults(user_id,revision,change_id,envelope)
    values(current_setting('rhythm.test_a')::uuid,1,gen_random_uuid(),jsonb_build_object('version',1,'salt',encode(repeat('s',16)::bytea,'base64'),'iv',encode(repeat('i',12)::bytea,'base64'),'ciphertext',encode(repeat('c',32)::bytea,'base64')));
    raise exception 'B can insert as A';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id=current_setting('rhythm.session_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('rhythm.test_a'),'session_id',current_setting('rhythm.session_a'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin if (select count(*) from public.encrypted_vaults) <> 0 then raise exception 'Expired session retains access'; end if; end $$;
reset role;
delete from auth.sessions where id=current_setting('rhythm.session_a')::uuid;
set local role authenticated;
do $$ declare affected integer; begin
  if (select count(*) from public.encrypted_vaults) <> 0 then raise exception 'Revoked session retains access'; end if;
  update public.encrypted_vaults set revision=3 where user_id=current_setting('rhythm.test_a')::uuid;
  get diagnostics affected = row_count; if affected <> 0 then raise exception 'Revoked session can update'; end if;
  delete from public.encrypted_vaults where user_id=current_setting('rhythm.test_a')::uuid;
  get diagnostics affected = row_count; if affected <> 0 then raise exception 'Revoked session can delete'; end if;
end $$;
reset role;
insert into auth.sessions(id,user_id,not_after) values(current_setting('rhythm.session_a')::uuid,current_setting('rhythm.test_a')::uuid,now()+interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rhythm.test_a'), 'session_id', current_setting('rhythm.session_a'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $$ begin
  if (select count(*) from public.encrypted_vaults) <> 0 then raise exception 'Anonymous account can read vault'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rhythm.test_a'), 'session_id', current_setting('rhythm.session_a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $$ declare affected integer; begin
  delete from public.encrypted_vaults where user_id=current_setting('rhythm.test_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner cannot delete own vault'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.encrypted_vaults;
    raise exception 'Unauthenticated role has access';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: owner CRUD, account isolation, anonymous denial, revision CAS and ciphertext validation; fixtures rolled back' as result;
