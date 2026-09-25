-- Normalize TTT scheduling and warranty data out of app_state.
-- Production schema was verified before this migration was committed.

create table if not exists public.shop_resources (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null,
  resource_type text not null,
  active boolean not null default true,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id)
);

create table if not exists public.service_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  service text not null,
  default_minutes integer not null default 60 check (default_minutes >= 5),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  resource_type text,
  required_skill text,
  active boolean not null default true,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id)
);

create table if not exists public.scheduling_technicians (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  person_id text,
  display_name text not null,
  skills text[] not null default '{}'::text[],
  working_hours jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint scheduling_technicians_person_fk
    foreign key (organization_id,person_id)
    references public.personnel(organization_id,id)
    on delete set null
);

create table if not exists public.work_operations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  job_id text,
  work_order_id text,
  service text not null,
  template_id text,
  start_at timestamptz,
  local_start text,
  timezone text not null default 'America/Chicago',
  duration_minutes integer not null default 15 check (duration_minutes >= 5),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  technician_id text,
  resource_id text,
  status text not null default 'scheduled',
  actual_start timestamptz,
  actual_end timestamptz,
  notes text,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint work_operations_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on delete set null,
  constraint work_operations_template_fk foreign key (organization_id,template_id)
    references public.service_templates(organization_id,id) on delete set null,
  constraint work_operations_technician_fk foreign key (organization_id,technician_id)
    references public.scheduling_technicians(organization_id,id) on delete set null,
  constraint work_operations_resource_fk foreign key (organization_id,resource_id)
    references public.shop_resources(organization_id,id) on delete set null
);

create table if not exists public.warranties (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  job_id text,
  customer_id text,
  vehicle_id text,
  warranty_type text,
  status text not null default 'active',
  provider text,
  description text,
  starts_on date,
  expires_on date,
  terms jsonb not null default '{}'::jsonb,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint warranties_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on delete set null,
  constraint warranties_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete set null,
  constraint warranties_vehicle_fk foreign key (organization_id,vehicle_id)
    references public.vehicles(organization_id,id) on delete set null
);

create table if not exists public.scheduling_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists shop_resources_org_active_idx on public.shop_resources(organization_id,active) where archived_at is null;
create index if not exists service_templates_org_active_idx on public.service_templates(organization_id,active) where archived_at is null;
create index if not exists scheduling_technicians_org_person_idx on public.scheduling_technicians(organization_id,person_id) where archived_at is null;
create index if not exists work_operations_org_start_idx on public.work_operations(organization_id,start_at) where archived_at is null;
create index if not exists work_operations_org_job_idx on public.work_operations(organization_id,job_id) where archived_at is null;
create index if not exists work_operations_org_tech_start_idx on public.work_operations(organization_id,technician_id,start_at) where archived_at is null;
create index if not exists work_operations_org_template_idx on public.work_operations(organization_id,template_id) where archived_at is null;
create index if not exists work_operations_org_resource_start_idx on public.work_operations(organization_id,resource_id,start_at) where archived_at is null;
create index if not exists warranties_org_job_idx on public.warranties(organization_id,job_id) where archived_at is null;
create index if not exists warranties_org_expiry_idx on public.warranties(organization_id,expires_on) where archived_at is null;
create index if not exists warranties_org_customer_idx on public.warranties(organization_id,customer_id) where archived_at is null;
create index if not exists warranties_org_vehicle_idx on public.warranties(organization_id,vehicle_id) where archived_at is null;
create index if not exists scheduling_settings_updated_by_idx on public.scheduling_settings(updated_by);
create index if not exists shop_resources_updated_by_idx on public.shop_resources(updated_by);
create index if not exists service_templates_updated_by_idx on public.service_templates(updated_by);
create index if not exists scheduling_technicians_updated_by_idx on public.scheduling_technicians(updated_by);
create index if not exists work_operations_created_by_idx on public.work_operations(created_by);
create index if not exists work_operations_updated_by_idx on public.work_operations(updated_by);
create index if not exists warranties_created_by_idx on public.warranties(created_by);
create index if not exists warranties_updated_by_idx on public.warranties(updated_by);

alter table public.shop_resources enable row level security;
alter table public.service_templates enable row level security;
alter table public.scheduling_technicians enable row level security;
alter table public.work_operations enable row level security;
alter table public.warranties enable row level security;
alter table public.scheduling_settings enable row level security;

grant select,insert,update,delete on public.shop_resources,public.service_templates,public.scheduling_technicians,public.work_operations,public.warranties to authenticated;
grant select,insert,update on public.scheduling_settings to authenticated;

drop policy if exists shop_resources_member_select on public.shop_resources;
create policy shop_resources_member_select on public.shop_resources for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists shop_resources_admin_insert on public.shop_resources;
create policy shop_resources_admin_insert on public.shop_resources for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists shop_resources_admin_update on public.shop_resources;
create policy shop_resources_admin_update on public.shop_resources for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));
drop policy if exists shop_resources_admin_delete on public.shop_resources;
create policy shop_resources_admin_delete on public.shop_resources for delete to authenticated using (private.is_ttt_admin(organization_id));

drop policy if exists service_templates_member_select on public.service_templates;
create policy service_templates_member_select on public.service_templates for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists service_templates_admin_insert on public.service_templates;
create policy service_templates_admin_insert on public.service_templates for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists service_templates_admin_update on public.service_templates;
create policy service_templates_admin_update on public.service_templates for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));
drop policy if exists service_templates_admin_delete on public.service_templates;
create policy service_templates_admin_delete on public.service_templates for delete to authenticated using (private.is_ttt_admin(organization_id));

drop policy if exists scheduling_technicians_member_select on public.scheduling_technicians;
create policy scheduling_technicians_member_select on public.scheduling_technicians for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists scheduling_technicians_admin_insert on public.scheduling_technicians;
create policy scheduling_technicians_admin_insert on public.scheduling_technicians for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists scheduling_technicians_admin_update on public.scheduling_technicians;
create policy scheduling_technicians_admin_update on public.scheduling_technicians for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));
drop policy if exists scheduling_technicians_admin_delete on public.scheduling_technicians;
create policy scheduling_technicians_admin_delete on public.scheduling_technicians for delete to authenticated using (private.is_ttt_admin(organization_id));

drop policy if exists work_operations_member_select on public.work_operations;
create policy work_operations_member_select on public.work_operations for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists work_operations_member_insert on public.work_operations;
create policy work_operations_member_insert on public.work_operations for insert to authenticated with check (private.is_ttt_member(organization_id));
drop policy if exists work_operations_member_update on public.work_operations;
create policy work_operations_member_update on public.work_operations for update to authenticated using (private.is_ttt_member(organization_id)) with check (private.is_ttt_member(organization_id));
drop policy if exists work_operations_admin_delete on public.work_operations;
create policy work_operations_admin_delete on public.work_operations for delete to authenticated using (private.is_ttt_admin(organization_id));

drop policy if exists warranties_member_select on public.warranties;
create policy warranties_member_select on public.warranties for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists warranties_member_insert on public.warranties;
create policy warranties_member_insert on public.warranties for insert to authenticated with check (private.is_ttt_member(organization_id));
drop policy if exists warranties_member_update on public.warranties;
create policy warranties_member_update on public.warranties for update to authenticated using (private.is_ttt_member(organization_id)) with check (private.is_ttt_member(organization_id));
drop policy if exists warranties_admin_delete on public.warranties;
create policy warranties_admin_delete on public.warranties for delete to authenticated using (private.is_ttt_admin(organization_id));

drop policy if exists scheduling_settings_member_select on public.scheduling_settings;
create policy scheduling_settings_member_select on public.scheduling_settings for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists scheduling_settings_admin_insert on public.scheduling_settings;
create policy scheduling_settings_admin_insert on public.scheduling_settings for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists scheduling_settings_admin_update on public.scheduling_settings;
create policy scheduling_settings_admin_update on public.scheduling_settings for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));

insert into public.shop_resources(organization_id,id,name,resource_type,active,source_json)
select a.organization_id,r->>'id',coalesce(r->>'name',r->>'id'),coalesce(r->>'type','other'),coalesce((r->>'active')::boolean,true),r
from public.app_state a cross join lateral jsonb_array_elements(coalesce(a.state->'scheduling'->'resources','[]'::jsonb)) r
where r ? 'id' on conflict (organization_id,id) do nothing;

insert into public.service_templates(organization_id,id,service,default_minutes,buffer_minutes,resource_type,required_skill,active,source_json)
select a.organization_id,t->>'id',coalesce(t->>'service',t->>'id'),greatest(coalesce((t->>'defaultMinutes')::int,60),5),greatest(coalesce((t->>'bufferMinutes')::int,0),0),t->>'resourceType',t->>'skill',coalesce((t->>'active')::boolean,true),t
from public.app_state a cross join lateral jsonb_array_elements(coalesce(a.state->'scheduling'->'serviceTemplates','[]'::jsonb)) t
where t ? 'id' on conflict (organization_id,id) do nothing;

insert into public.scheduling_technicians(organization_id,id,person_id,display_name,skills,working_hours,active,source_json)
select a.organization_id,t->>'id',nullif(t->>'personId',''),coalesce(t->>'name',t->>'id'),coalesce(array(select jsonb_array_elements_text(coalesce(t->'skills','[]'::jsonb))),'{}'::text[]),coalesce(t->'workingHours','{}'::jsonb),coalesce((t->>'active')::boolean,true),t
from public.app_state a cross join lateral jsonb_array_elements(coalesce(a.state->'scheduling'->'technicians','[]'::jsonb)) t
where t ? 'id' on conflict (organization_id,id) do nothing;

insert into public.scheduling_settings(organization_id,settings)
select organization_id,coalesce(state->'scheduling'->'settings','{}'::jsonb)
from public.app_state on conflict (organization_id) do nothing;
