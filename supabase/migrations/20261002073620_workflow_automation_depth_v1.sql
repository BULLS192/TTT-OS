-- TTT OS workflow automation depth
-- Core automation, SignalTrace, document delivery and compliance controls.

alter table public.documents
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id text;

create index if not exists documents_source_entity_idx
  on public.documents(organization_id,source_entity_type,source_entity_id)
  where source_entity_id is not null and archived_at is null;

create table if not exists public.diagnostic_cases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('DIAG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  job_id text not null,
  status text not null default 'open'
    check (status in ('open','in_progress','findings_ready','repair_authorized','resolved','closed')),
  reported_symptom text,
  scan_notes text,
  isolate_notes text,
  trace_notes text,
  verify_notes text,
  resolve_notes text,
  root_cause_classification text,
  findings text,
  recommended_action text,
  estimate_next_authorization text,
  technician_person_id text,
  started_at timestamptz,
  completed_at timestamptz,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint diagnostic_cases_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade
);

create unique index if not exists diagnostic_cases_active_job_uq
  on public.diagnostic_cases(organization_id,job_id)
  where archived_at is null;
create index if not exists diagnostic_cases_status_idx
  on public.diagnostic_cases(organization_id,status)
  where archived_at is null;

create table if not exists public.document_deliveries (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('DLV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  document_id text not null,
  job_id text,
  customer_id text,
  channel text not null
    check (channel in ('email','sms','portal','download','print','vendor_email','other')),
  recipient text,
  status text not null default 'draft_opened'
    check (status in ('draft_opened','queued','sent','delivered','failed','downloaded','printed')),
  subject text,
  provider_ref text,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint document_deliveries_document_fk foreign key (organization_id,document_id)
    references public.documents(organization_id,id) on update cascade,
  constraint document_deliveries_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade
);

create index if not exists document_deliveries_document_idx
  on public.document_deliveries(organization_id,document_id,created_at desc);
create index if not exists document_deliveries_job_idx
  on public.document_deliveries(organization_id,job_id,created_at desc)
  where job_id is not null;

create table if not exists public.workflow_exceptions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('WEX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  job_id text,
  control_code text not null,
  severity text not null default 'warning'
    check (severity in ('info','warning','blocking','critical')),
  status text not null default 'open'
    check (status in ('open','approved','resolved','void')),
  reason text not null,
  resolution text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint workflow_exceptions_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade
);

create index if not exists workflow_exceptions_job_idx
  on public.workflow_exceptions(organization_id,job_id,status)
  where archived_at is null and job_id is not null;
create index if not exists workflow_exceptions_open_idx
  on public.workflow_exceptions(organization_id,severity,created_at desc)
  where archived_at is null and status='open';

alter table public.diagnostic_cases enable row level security;
alter table public.document_deliveries enable row level security;
alter table public.workflow_exceptions enable row level security;

revoke all on public.diagnostic_cases from anon;
revoke all on public.document_deliveries from anon;
revoke all on public.workflow_exceptions from anon;

grant select,insert,update on public.diagnostic_cases to authenticated;
grant select,insert,update on public.document_deliveries to authenticated;
grant select,insert,update on public.workflow_exceptions to authenticated;

do $$
declare t text;
begin
  foreach t in array array['diagnostic_cases','document_deliveries','workflow_exceptions']
  loop
    execute format('drop policy if exists %I_member_select on public.%I',t,t);
    execute format('drop policy if exists %I_member_insert on public.%I',t,t);
    execute format('drop policy if exists %I_member_update on public.%I',t,t);
    execute format('create policy %I_member_select on public.%I for select to authenticated using (private.is_ttt_member(organization_id))',t,t);
    execute format('create policy %I_member_insert on public.%I for insert to authenticated with check (private.is_ttt_member(organization_id))',t,t);
    execute format('create policy %I_member_update on public.%I for update to authenticated using (private.is_ttt_member(organization_id)) with check (private.is_ttt_member(organization_id))',t,t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['diagnostic_cases','document_deliveries','workflow_exceptions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

notify pgrst,'reload schema';
