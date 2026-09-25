create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (slug, name)
values ('ttt', 'Thompson Transportation Technologies')
on conflict (slug) do update set name = excluded.name;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id text,
  display_name text not null default '',
  role text not null default 'pending',
  roles text[] not null default '{}'::text[],
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_person_id_unique on public.profiles(person_id) where person_id is not null;

create table public.app_state (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  state jsonb,
  revision bigint not null default 0,
  initialized_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.app_state (organization_id)
select id from public.organizations where slug='ttt'
on conflict (organization_id) do nothing;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events(organization_id,created_at desc);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.app_state enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.organizations,public.profiles,public.app_state,public.audit_events from anon;
grant select on table public.organizations to authenticated;
grant select on table public.profiles to authenticated;
grant select,insert,update on table public.app_state to authenticated;
grant select,insert on table public.audit_events to authenticated;

create policy organizations_member_select on public.organizations for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=organizations.id and p.active=true));
create policy profiles_self_select on public.profiles for select to authenticated
using (user_id=(select auth.uid()));
create policy app_state_member_select on public.app_state for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=app_state.organization_id and p.active=true));
create policy app_state_member_insert on public.app_state for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=app_state.organization_id and p.active=true));
create policy app_state_member_update on public.app_state for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=app_state.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=app_state.organization_id and p.active=true));
create policy audit_events_member_select on public.audit_events for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=audit_events.organization_id and p.active=true));
create policy audit_events_member_insert on public.audit_events for insert to authenticated
with check (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=audit_events.organization_id and p.active=true));

alter publication supabase_realtime add table public.app_state;
