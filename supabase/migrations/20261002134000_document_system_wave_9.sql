-- TTT Document System v0.9 — Waves 1 through 9
-- Normalizes document templates, generated records, signatures/approvals, and immutable audit events.

create table if not exists public.document_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  document_code text not null,
  title text not null,
  wave integer not null check (wave between 1 and 9),
  category text not null,
  version text not null default '1.0',
  status text not null default 'active',
  customer_facing boolean not null default false,
  signature_required boolean not null default false,
  immutable_on_sign boolean not null default false,
  required_stage text,
  applies_when jsonb not null default '{}'::jsonb,
  drive_template_url text,
  source_json jsonb not null default '{}'::jsonb,
  effective_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,template_key)
);

create table if not exists public.document_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  template_key text not null,
  document_code text not null,
  document_number text,
  version integer not null default 1,
  status text not null default 'draft',
  job_id text,
  customer_id text,
  vehicle_id text,
  work_order_id text,
  quote_id text,
  invoice_id text,
  purchase_order_id text,
  warranty_id text,
  company_id text,
  parent_document_id text,
  terms_version text,
  payload jsonb not null default '{}'::jsonb,
  pdf_storage_bucket text,
  pdf_storage_path text,
  drive_file_url text,
  content_sha256 text,
  generated_at timestamptz,
  generated_by uuid references auth.users(id) on delete set null,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  signature_storage_path text,
  immutable_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint document_records_template_fk foreign key (organization_id,template_key)
    references public.document_templates(organization_id,template_key) on update cascade,
  constraint document_records_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade,
  constraint document_records_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on update cascade,
  constraint document_records_vehicle_fk foreign key (organization_id,vehicle_id)
    references public.vehicles(organization_id,id) on update cascade,
  constraint document_records_parent_fk foreign key (organization_id,parent_document_id)
    references public.document_records(organization_id,id) on update cascade
);

create table if not exists public.document_events (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  document_id text not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id,id),
  constraint document_events_document_fk foreign key (organization_id,document_id)
    references public.document_records(organization_id,id) on update cascade on delete cascade
);

create table if not exists public.document_requirements (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  workflow text not null default 'standard',
  required_stage text not null,
  blocking boolean not null default false,
  condition_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,template_key,workflow,required_stage),
  constraint document_requirements_template_fk foreign key (organization_id,template_key)
    references public.document_templates(organization_id,template_key) on update cascade
);

create index if not exists document_records_org_job_idx on public.document_records(organization_id,job_id,created_at desc) where archived_at is null;
create index if not exists document_records_org_customer_idx on public.document_records(organization_id,customer_id,created_at desc) where archived_at is null;
create index if not exists document_records_org_vehicle_idx on public.document_records(organization_id,vehicle_id,created_at desc) where archived_at is null;
create index if not exists document_records_org_template_idx on public.document_records(organization_id,template_key,status) where archived_at is null;
create index if not exists document_records_org_parent_idx on public.document_records(organization_id,parent_document_id) where parent_document_id is not null;
create index if not exists document_events_org_document_idx on public.document_events(organization_id,document_id,event_at desc);
create index if not exists document_templates_org_wave_idx on public.document_templates(organization_id,wave,status);
create unique index if not exists document_records_number_uq on public.document_records(organization_id,document_number) where document_number is not null and archived_at is null;

alter table public.document_templates enable row level security;
alter table public.document_records enable row level security;
alter table public.document_events enable row level security;
alter table public.document_requirements enable row level security;

grant select,insert,update on public.document_templates,public.document_records,public.document_events,public.document_requirements to authenticated;

drop policy if exists document_templates_member_select on public.document_templates;
create policy document_templates_member_select on public.document_templates for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists document_templates_admin_insert on public.document_templates;
create policy document_templates_admin_insert on public.document_templates for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists document_templates_admin_update on public.document_templates;
create policy document_templates_admin_update on public.document_templates for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));

drop policy if exists document_records_member_select on public.document_records;
create policy document_records_member_select on public.document_records for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists document_records_member_insert on public.document_records;
create policy document_records_member_insert on public.document_records for insert to authenticated with check (private.is_ttt_member(organization_id));
drop policy if exists document_records_member_update on public.document_records;
create policy document_records_member_update on public.document_records for update to authenticated
using (private.is_ttt_member(organization_id) and immutable_at is null)
with check (private.is_ttt_member(organization_id));

drop policy if exists document_events_member_select on public.document_events;
create policy document_events_member_select on public.document_events for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists document_events_member_insert on public.document_events;
create policy document_events_member_insert on public.document_events for insert to authenticated with check (private.is_ttt_member(organization_id));

drop policy if exists document_requirements_member_select on public.document_requirements;
create policy document_requirements_member_select on public.document_requirements for select to authenticated using (private.is_ttt_member(organization_id));
drop policy if exists document_requirements_admin_insert on public.document_requirements;
create policy document_requirements_admin_insert on public.document_requirements for insert to authenticated with check (private.is_ttt_admin(organization_id));
drop policy if exists document_requirements_admin_update on public.document_requirements;
create policy document_requirements_admin_update on public.document_requirements for update to authenticated using (private.is_ttt_admin(organization_id)) with check (private.is_ttt_admin(organization_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,20971520,array['application/pdf','image/png','image/jpeg','application/octet-stream'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "ttt documents select" on storage.objects;
create policy "ttt documents select" on storage.objects for select to authenticated
using (bucket_id='documents' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.organization_id::text=(storage.foldername(name))[1]));
drop policy if exists "ttt documents insert" on storage.objects;
create policy "ttt documents insert" on storage.objects for insert to authenticated
with check (bucket_id='documents' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.organization_id::text=(storage.foldername(name))[1]));
drop policy if exists "ttt documents update" on storage.objects;
create policy "ttt documents update" on storage.objects for update to authenticated
using (bucket_id='documents' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.organization_id::text=(storage.foldername(name))[1]))
with check (bucket_id='documents' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.organization_id::text=(storage.foldername(name))[1]));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='document_records') then
    alter publication supabase_realtime add table public.document_records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='document_events') then
    alter publication supabase_realtime add table public.document_events;
  end if;
end $$;
