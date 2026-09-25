alter table public.profiles add column if not exists email text;
create index if not exists profiles_organization_id_idx on public.profiles(organization_id);
create index if not exists app_state_updated_by_idx on public.app_state(updated_by);
create index if not exists audit_events_actor_user_id_idx on public.audit_events(actor_user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.handle_new_ttt_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare ttt_org_id uuid;
begin
  select id into ttt_org_id from public.organizations where slug='ttt';
  if ttt_org_id is null then raise exception 'TTT organization is not configured'; end if;
  insert into public.profiles(user_id,organization_id,person_id,display_name,email,role,roles,active)
  values(new.id,ttt_org_id,null,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,'pending','{}'::text[],false)
  on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_ttt_user() from public,anon,authenticated;

drop trigger if exists on_auth_user_created_ttt on auth.users;
create trigger on_auth_user_created_ttt after insert on auth.users
for each row execute function private.handle_new_ttt_user();
