-- Account-first storage: content is protected by Auth/RLS, not a separate vault password.
-- Existing encrypted_vaults and browser vaults are deliberately untouched.
create function rhythm_private.valid_account_data(payload jsonb,owner uuid) returns boolean
language sql immutable security invoker set search_path='' as $$
select coalesce(
  jsonb_typeof(payload)='object' and octet_length(payload::text)<=8000000 and payload->>'schemaVersion'='1'
  and payload ?& array['sessions','intent','wakeMarkers','checkins','journal','audit','settings']
  and not exists(select 1 from jsonb_object_keys(payload) k where k not in ('schemaVersion','sessions','intent','wakeMarkers','checkins','journal','audit','settings','guidance','profile'))
  and jsonb_typeof(payload->'sessions')='array' and jsonb_typeof(payload->'wakeMarkers')='array'
  and jsonb_typeof(payload->'checkins')='array' and jsonb_typeof(payload->'audit')='array'
  and jsonb_typeof(payload->'journal')='array' and jsonb_typeof(payload->'settings')='object'
  and (not payload ? 'profile' or jsonb_typeof(payload->'profile')='object')
  and not exists(select 1 from jsonb_array_elements(payload->'journal') n where n ? 'audio'
    or (n ? 'audioRef' and (coalesce(n->'audioRef'->>'path','') !~ ('^'||owner::text||'/[a-f0-9]{64}/[a-f0-9]{64}$'))))
,false);
$$;
revoke all on function rhythm_private.valid_account_data(jsonb,uuid) from public,anon;
grant execute on function rhythm_private.valid_account_data(jsonb,uuid) to authenticated,service_role;

create table public.account_data (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null check(rhythm_private.valid_account_data(data,user_id)),
  revision bigint not null default 1 check(revision>0),
  change_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.account_data enable row level security;
alter table public.account_data force row level security;
revoke all on public.account_data from public,anon,authenticated;
grant select,insert,update on public.account_data to authenticated;
grant all on public.account_data to service_role;
create policy account_owner_read on public.account_data for select to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create policy account_owner_create on public.account_data for insert to authenticated with check((select auth.uid())=user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select rhythm_private.has_active_session()));
create policy account_owner_update on public.account_data for update to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session())) with check((select auth.uid())=user_id and (select rhythm_private.has_active_session()));

create table public.account_revisions (
  user_id uuid not null references public.account_data(user_id) on delete cascade,
  revision bigint not null,
  change_id uuid not null,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  primary key(user_id,revision)
);
alter table public.account_revisions enable row level security;
alter table public.account_revisions force row level security;
revoke all on public.account_revisions from public,anon,authenticated;
grant select on public.account_revisions to authenticated;
grant all on public.account_revisions to service_role;
create policy account_revision_owner on public.account_revisions for select to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session()));

create table public.account_recovery (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  data jsonb not null check(rhythm_private.valid_account_data(data,user_id)),
  saved_at timestamptz not null default now(),
  primary key(user_id,id)
);
alter table public.account_recovery enable row level security;
alter table public.account_recovery force row level security;
revoke all on public.account_recovery from public,anon,authenticated;
grant select,insert,update,delete on public.account_recovery to authenticated;
grant all on public.account_recovery to service_role;
create policy recovery_owner_read on public.account_recovery for select to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create policy recovery_owner_create on public.account_recovery for insert to authenticated with check((select auth.uid())=user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select rhythm_private.has_active_session()));
create policy recovery_owner_update on public.account_recovery for update to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session())) with check((select auth.uid())=user_id and (select rhythm_private.has_active_session()));
create policy recovery_owner_delete on public.account_recovery for delete to authenticated using((select auth.uid())=user_id and (select rhythm_private.has_active_session()));

create function rhythm_private.guard_account_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then if new.revision<>1 then raise serialization_failure using message='Initial revision must be one';end if;
  elsif new.user_id<>old.user_id or new.revision<>old.revision+1 or new.change_id=old.change_id then raise serialization_failure using message='Account revision changed';
  end if;
  new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function rhythm_private.guard_account_revision() from public,anon,authenticated;
create trigger guard_account_revision before insert or update on public.account_data for each row execute function rhythm_private.guard_account_revision();

create function rhythm_private.backup_account_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.user_id is distinct from auth.uid() and coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise insufficient_privilege;end if;
  insert into public.account_revisions(user_id,revision,change_id,data) values(old.user_id,old.revision,old.change_id,old.data);
  delete from public.account_revisions where user_id=old.user_id and revision not in (select revision from public.account_revisions where user_id=old.user_id order by revision desc limit 10);
  return new;
end $$;
revoke all on function rhythm_private.backup_account_revision() from public,anon,authenticated;
create trigger backup_account_revision after update on public.account_data for each row execute function rhythm_private.backup_account_revision();

create function rhythm_private.limit_account_recovery() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is distinct from auth.uid() and coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise insufficient_privilege;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,1));
  delete from public.account_recovery where user_id=new.user_id and id not in (select id from public.account_recovery where user_id=new.user_id order by saved_at desc,id limit 10);
  return new;
end $$;
revoke all on function rhythm_private.limit_account_recovery() from public,anon,authenticated;
create trigger limit_account_recovery after insert on public.account_recovery for each row execute function rhythm_private.limit_account_recovery();

create function public.account_session_active() returns boolean language sql stable security invoker set search_path='' as $$ select rhythm_private.has_active_session(); $$;
revoke all on function public.account_session_active() from public,anon;
grant execute on function public.account_session_active() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rhythm-audio','rhythm-audio',false,10000000,array['audio/webm','audio/mp4','audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/aac','audio/flac','audio/x-flac']);
create policy account_audio_read on storage.objects for select to authenticated using(bucket_id='rhythm-audio' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select rhythm_private.has_active_session()));
create policy account_audio_create on storage.objects for insert to authenticated with check(bucket_id='rhythm-audio' and name~('^'||(select auth.uid()::text)||'/[a-f0-9]{64}/[a-f0-9]{64}$') and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select rhythm_private.has_active_session()));
create policy account_audio_update on storage.objects for update to authenticated using(bucket_id='rhythm-audio' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select rhythm_private.has_active_session())) with check(bucket_id='rhythm-audio' and name~('^'||(select auth.uid()::text)||'/[a-f0-9]{64}/[a-f0-9]{64}$') and (select rhythm_private.has_active_session()));
create policy account_audio_delete on storage.objects for delete to authenticated using(bucket_id='rhythm-audio' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select rhythm_private.has_active_session()));
