begin;

create type public.ttt_user_role as enum (
  'owner_admin',
  'manager',
  'technician',
  'service_advisor',
  'office',
  'read_only'
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.ttt_user_role not null default 'read_only',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select on table public.user_profiles to authenticated;

create policy "users_read_own_active_profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.handle_new_ttt_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'TTT User'),
    'read_only'::public.ttt_user_role,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_ttt_user() from public;
revoke all on function private.handle_new_ttt_user() from anon;
revoke all on function private.handle_new_ttt_user() from authenticated;

create trigger on_ttt_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_ttt_user();

comment on table public.user_profiles is 'TTT OS authorization profile. Role and active status are server-controlled and must not be derived from user-editable auth metadata.';
comment on column public.user_profiles.active is 'False by default. A TTT administrator must explicitly activate the user before TTT OS access is granted.';
comment on column public.user_profiles.role is 'Authorization role controlled by TTT administration.';

commit;
