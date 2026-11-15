-- Supabase's bootstrap event trigger is administrative, never an app RPC.
-- Keep the event trigger active; remove unnecessary API-role execution rights.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
