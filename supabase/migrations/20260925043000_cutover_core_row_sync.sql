-- Phase 2C: cut core modules over to row-level Supabase synchronization.
-- app_state remains for modules not yet normalized, but no longer writes into core relational tables.

drop policy if exists personnel_admin_update on public.personnel;

create policy personnel_admin_or_self_update
on public.personnel
for update
to authenticated
using (
  private.is_ttt_admin(organization_id)
  or exists (
    select 1
    from public.profiles p
    where p.user_id=(select auth.uid())
      and p.organization_id=personnel.organization_id
      and p.person_id=personnel.id
      and p.active=true
  )
)
with check (
  private.is_ttt_admin(organization_id)
  or exists (
    select 1
    from public.profiles p
    where p.user_id=(select auth.uid())
      and p.organization_id=personnel.organization_id
      and p.person_id=personnel.id
      and p.active=true
  )
);

create or replace function private.preserve_job_creator()
returns trigger
language plpgsql
set search_path=''
as $$
declare creator_person_id text;
begin
  if tg_op='UPDATE' and old.created_by_user_id is not null then
    new.created_by_user_id=old.created_by_user_id;
  elsif new.created_by_user_id is null and coalesce(new.created_by_legacy_user_id,'')<>'' then
    select p.id into creator_person_id
    from public.personnel p
    where p.organization_id=new.organization_id
      and p.legacy_user_id=new.created_by_legacy_user_id
      and p.archived_at is null
    limit 1;

    if creator_person_id is not null then
      select pr.user_id into new.created_by_user_id
      from public.profiles pr
      where pr.organization_id=new.organization_id
        and pr.person_id=creator_person_id
      limit 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_job_creator() from public,anon,authenticated;

drop trigger if exists trg_preserve_job_creator on public.jobs;
create trigger trg_preserve_job_creator
before insert or update on public.jobs
for each row execute function private.preserve_job_creator();

-- IMPORTANT: once the row-level client is deployed, app_state must no longer be able
-- to overwrite core rows from an old/stale whole-app snapshot.
drop trigger if exists trg_sync_core_from_app_state on public.app_state;
