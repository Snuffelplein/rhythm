-- These tables are exclusively internal. Explicit restrictive denial documents
-- that granting a future client policy must never expose their rows.
create policy push_config_no_clients on rhythm_private.push_config
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy push_jobs_no_clients on rhythm_private.push_jobs
  as restrictive for all to anon,authenticated using(false) with check(false);

alter policy push_owner_insert on public.push_devices with check (
  (select auth.uid())=user_id
  and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and (select rhythm_private.has_active_session())
);
