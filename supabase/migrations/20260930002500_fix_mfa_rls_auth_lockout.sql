-- Hotfix: avoid direct authenticated-role reads from auth.mfa_factors inside RLS.
-- Supabase accepted password logins, but profile reads failed with 403 because the
-- restrictive policy queried auth.mfa_factors directly. This helper exposes only
-- a boolean decision for the current JWT/user.

create schema if not exists security_internal;
revoke all on schema security_internal from public, anon, authenticated;
grant usage on schema security_internal to authenticated;

create or replace function security_internal.mfa_access_ok()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when (select auth.uid()) is null then false
    when exists (
      select 1
      from auth.mfa_factors
      where user_id=(select auth.uid())
        and status='verified'
    )
      then (select auth.jwt()->>'aal')='aal2'
    else (select auth.jwt()->>'aal') in ('aal1','aal2')
  end;
$$;

revoke all on function security_internal.mfa_access_ok() from public, anon, authenticated;
grant execute on function security_internal.mfa_access_ok() to authenticated;

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relrowsecurity
  loop
    execute format('drop policy if exists %I on public.%I','mfa_enforced_when_enrolled',r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
       using ((select security_internal.mfa_access_ok()))
       with check ((select security_internal.mfa_access_ok()))',
      'mfa_enforced_when_enrolled',r.relname
    );
  end loop;
end;
$$;
