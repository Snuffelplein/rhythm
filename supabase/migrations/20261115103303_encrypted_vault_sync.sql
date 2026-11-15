-- Account identity lives in Supabase Auth. Only ciphertext and sync metadata live here.
create table public.encrypted_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0 and revision < 9007199254740991),
  change_id uuid not null,
  envelope jsonb not null,
  updated_at timestamptz not null default now(),
  constraint encrypted_envelope_only check (
    jsonb_typeof(envelope) = 'object'
    and envelope ?& array['version', 'salt', 'iv', 'ciphertext']
    and envelope - 'version' - 'salt' - 'iv' - 'ciphertext' = '{}'::jsonb
    and envelope -> 'version' = '1'::jsonb
    and jsonb_typeof(envelope -> 'salt') = 'string'
    and length(envelope ->> 'salt') = 24
    and jsonb_typeof(envelope -> 'iv') = 'string'
    and length(envelope ->> 'iv') = 16
    and jsonb_typeof(envelope -> 'ciphertext') = 'string'
    and length(envelope ->> 'ciphertext') between 24 and 2000000
  )
);
alter table public.encrypted_vaults enable row level security;
alter table public.encrypted_vaults force row level security;

revoke all on public.encrypted_vaults from public, anon, authenticated;
grant select, insert, update, delete on public.encrypted_vaults to authenticated;

create policy vault_select_own on public.encrypted_vaults for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy vault_insert_own on public.encrypted_vaults for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy vault_update_own on public.encrypted_vaults for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true')
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy vault_delete_own on public.encrypted_vaults for delete to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');

create function public.guard_vault_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.revision <> 1 then
    raise exception 'A new vault must start at revision 1' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.revision <> old.revision + 1) then
    raise exception 'Vault revision must advance by exactly one' using errcode = '40001';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.guard_vault_revision() from public, anon, authenticated;
create trigger guard_vault_revision before insert or update on public.encrypted_vaults
  for each row execute function public.guard_vault_revision();
