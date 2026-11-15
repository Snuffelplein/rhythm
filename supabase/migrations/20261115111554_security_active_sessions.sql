-- Enforce logout revocation on sensitive ciphertext operations, even before JWT expiry.
create schema if not exists rhythm_private;
revoke all on schema rhythm_private from public, anon;
grant usage on schema rhythm_private to authenticated;
create function rhythm_private.has_active_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = (select auth.uid())
      and s.id = case when (select auth.jwt()) ->> 'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then ((select auth.jwt()) ->> 'session_id')::uuid else null end
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function rhythm_private.has_active_session() from public, anon;
grant execute on function rhythm_private.has_active_session() to authenticated;
alter policy vault_select_own on public.encrypted_vaults
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous','false') <> 'true' and (select rhythm_private.has_active_session()));
alter policy vault_insert_own on public.encrypted_vaults
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous','false') <> 'true' and (select rhythm_private.has_active_session()));
alter policy vault_update_own on public.encrypted_vaults
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous','false') <> 'true' and (select rhythm_private.has_active_session()))
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous','false') <> 'true' and (select rhythm_private.has_active_session()));
alter policy vault_delete_own on public.encrypted_vaults
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous','false') <> 'true' and (select rhythm_private.has_active_session()));
