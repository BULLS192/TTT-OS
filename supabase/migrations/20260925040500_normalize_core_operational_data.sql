-- Phase 2A: normalize core operational data while retaining app_state as a compatibility bridge.
-- Customers, vehicles, personnel and jobs become first-class relational records.

create table public.customers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  first_name text,
  middle_name text,
  last_name text,
  display_name text,
  phone text,
  email text,
  address1 text,
  address2 text,
  city text,
  state text,
  postal_code text,
  country text,
  notes text,
  source_revision bigint not null default 0,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id)
);

create table public.vehicles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  customer_id text,
  vin text,
  year text,
  make text,
  model text,
  trim text,
  color text,
  exterior_finish text,
  vehicle_type text,
  plate text,
  source_revision bigint not null default 0,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint vehicles_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on update cascade
);

create table public.personnel (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  legacy_user_id text,
  display_name text not null,
  first_name text,
  last_name text,
  relationship text,
  job_title text,
  department text,
  status text,
  email text,
  phone text,
  scheduling_eligible boolean not null default false,
  roles text[] not null default '{}'::text[],
  skills jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  scheduling_id text,
  start_date date,
  notes text,
  source_revision bigint not null default 0,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id)
);

create table public.jobs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  estimate_id text,
  work_order_id text,
  customer_id text,
  vehicle_id text,
  status text,
  appointment_local timestamp without time zone,
  appointment_timezone text not null default 'America/Chicago',
  parts_status text,
  duration text,
  request_notes text,
  estimate jsonb not null default '{}'::jsonb,
  estimate_total numeric(12,2),
  services jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  check_in jsonb,
  legacy_audit jsonb not null default '[]'::jsonb,
  created_by_legacy_user_id text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  source_revision bigint not null default 0,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint jobs_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on update cascade,
  constraint jobs_vehicle_fk foreign key (organization_id,vehicle_id)
    references public.vehicles(organization_id,id) on update cascade
);

create index customers_org_email_idx on public.customers(organization_id,lower(email)) where email is not null and email<>'';
create index customers_org_phone_idx on public.customers(organization_id,phone) where phone is not null and phone<>'';
create index customers_last_synced_by_idx on public.customers(last_synced_by);
create index vehicles_org_customer_idx on public.vehicles(organization_id,customer_id);
create unique index vehicles_org_vin_unique on public.vehicles(organization_id,upper(vin)) where vin is not null and vin<>'';
create index vehicles_last_synced_by_idx on public.vehicles(last_synced_by);
create index personnel_org_status_idx on public.personnel(organization_id,status);
create unique index personnel_org_auth_user_unique on public.personnel(organization_id,auth_user_id) where auth_user_id is not null;
create index personnel_auth_user_id_idx on public.personnel(auth_user_id);
create index personnel_last_synced_by_idx on public.personnel(last_synced_by);
create index jobs_org_status_idx on public.jobs(organization_id,status);
create index jobs_org_customer_idx on public.jobs(organization_id,customer_id);
create index jobs_org_vehicle_idx on public.jobs(organization_id,vehicle_id);
create index jobs_org_appointment_idx on public.jobs(organization_id,appointment_local);
create unique index jobs_org_work_order_unique on public.jobs(organization_id,work_order_id) where work_order_id is not null and work_order_id<>'';
create index jobs_created_by_user_id_idx on public.jobs(created_by_user_id);
create index jobs_last_synced_by_idx on public.jobs(last_synced_by);

alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.personnel enable row level security;
alter table public.jobs enable row level security;

revoke all on public.customers,public.vehicles,public.personnel,public.jobs from anon;
grant select,insert,update on public.customers,public.vehicles,public.jobs to authenticated;
grant select,insert,update on public.personnel to authenticated;

create policy customers_member_select on public.customers for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=customers.organization_id and p.active=true));
create policy customers_member_insert on public.customers for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=customers.organization_id and p.active=true));
create policy customers_member_update on public.customers for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=customers.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=customers.organization_id and p.active=true));

create policy vehicles_member_select on public.vehicles for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=vehicles.organization_id and p.active=true));
create policy vehicles_member_insert on public.vehicles for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=vehicles.organization_id and p.active=true));
create policy vehicles_member_update on public.vehicles for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=vehicles.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=vehicles.organization_id and p.active=true));

create policy jobs_member_select on public.jobs for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=jobs.organization_id and p.active=true));
create policy jobs_member_insert on public.jobs for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=jobs.organization_id and p.active=true));
create policy jobs_member_update on public.jobs for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=jobs.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=jobs.organization_id and p.active=true));

create policy personnel_member_select on public.personnel for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=personnel.organization_id and p.active=true));
create policy personnel_admin_insert on public.personnel for insert to authenticated
with check (private.is_ttt_admin(organization_id));
create policy personnel_admin_update on public.personnel for update to authenticated
using (private.is_ttt_admin(organization_id))
with check (private.is_ttt_admin(organization_id));

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using (user_id=(select auth.uid()) or private.is_ttt_admin(organization_id));

create or replace function private.sync_core_from_app_state()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='INSERT' or new.state->'customers' is distinct from old.state->'customers' then
    insert into public.customers(
      organization_id,id,first_name,middle_name,last_name,display_name,phone,email,address1,address2,city,state,postal_code,country,notes,
      source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
    )
    select new.organization_id,e->>'id',nullif(e->>'firstName',''),nullif(e->>'middleName',''),nullif(e->>'lastName',''),
      coalesce(nullif(e->>'name',''),nullif(trim(concat_ws(' ',e->>'firstName',e->>'middleName',e->>'lastName')),'')),
      nullif(e->>'phone',''),nullif(e->>'email',''),nullif(e->>'address1',''),nullif(e->>'address2',''),nullif(e->>'city',''),
      nullif(e->>'state',''),nullif(e->>'postalCode',''),nullif(e->>'country',''),nullif(e->>'notes',''),new.revision,e,null,
      coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),new.updated_by
    from jsonb_array_elements(coalesce(new.state->'customers','[]'::jsonb)) e
    where coalesce(e->>'id','')<>''
    on conflict (organization_id,id) do update set
      first_name=excluded.first_name,middle_name=excluded.middle_name,last_name=excluded.last_name,display_name=excluded.display_name,
      phone=excluded.phone,email=excluded.email,address1=excluded.address1,address2=excluded.address2,city=excluded.city,state=excluded.state,
      postal_code=excluded.postal_code,country=excluded.country,notes=excluded.notes,source_revision=excluded.source_revision,
      source_json=excluded.source_json,archived_at=null,updated_at=now(),last_synced_by=excluded.last_synced_by;
    update public.customers c set archived_at=coalesce(c.archived_at,now()),source_revision=new.revision,updated_at=now(),last_synced_by=new.updated_by
    where c.organization_id=new.organization_id and c.archived_at is null
      and not exists(select 1 from jsonb_array_elements(coalesce(new.state->'customers','[]'::jsonb)) e where e->>'id'=c.id);
  end if;

  if tg_op='INSERT' or new.state->'vehicles' is distinct from old.state->'vehicles' then
    insert into public.vehicles(
      organization_id,id,customer_id,vin,year,make,model,trim,color,exterior_finish,vehicle_type,plate,
      source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
    )
    select new.organization_id,e->>'id',nullif(e->>'customerId',''),nullif(e->>'vin',''),nullif(e->>'year',''),nullif(e->>'make',''),
      nullif(e->>'model',''),nullif(e->>'trim',''),nullif(e->>'color',''),nullif(e->>'wrap',''),nullif(e->>'type',''),nullif(e->>'plate',''),
      new.revision,e,null,coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),new.updated_by
    from jsonb_array_elements(coalesce(new.state->'vehicles','[]'::jsonb)) e
    where coalesce(e->>'id','')<>''
    on conflict (organization_id,id) do update set
      customer_id=excluded.customer_id,vin=excluded.vin,year=excluded.year,make=excluded.make,model=excluded.model,trim=excluded.trim,
      color=excluded.color,exterior_finish=excluded.exterior_finish,vehicle_type=excluded.vehicle_type,plate=excluded.plate,
      source_revision=excluded.source_revision,source_json=excluded.source_json,archived_at=null,updated_at=now(),last_synced_by=excluded.last_synced_by;
    update public.vehicles v set archived_at=coalesce(v.archived_at,now()),source_revision=new.revision,updated_at=now(),last_synced_by=new.updated_by
    where v.organization_id=new.organization_id and v.archived_at is null
      and not exists(select 1 from jsonb_array_elements(coalesce(new.state->'vehicles','[]'::jsonb)) e where e->>'id'=v.id);
  end if;

  if tg_op='INSERT' or new.state->'personnel' is distinct from old.state->'personnel' then
    insert into public.personnel(
      organization_id,id,auth_user_id,legacy_user_id,display_name,first_name,last_name,relationship,job_title,department,status,email,phone,
      scheduling_eligible,roles,skills,certifications,availability,scheduling_id,start_date,notes,
      source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
    )
    select new.organization_id,e->>'id',p.user_id,nullif(e->>'userId',''),coalesce(nullif(e->>'displayName',''),'Unnamed Person'),
      nullif(e->>'firstName',''),nullif(e->>'lastName',''),nullif(e->>'relationship',''),nullif(e->>'jobTitle',''),nullif(e->>'department',''),
      nullif(e->>'status',''),nullif(e->>'email',''),nullif(e->>'phone',''),coalesce((e->>'schedulingEligible')::boolean,false),
      coalesce(array(select jsonb_array_elements_text(coalesce(e->'roles','[]'::jsonb))),'{}'::text[]),
      coalesce(e->'skills','[]'::jsonb),coalesce(e->'certifications','[]'::jsonb),coalesce(e->'availability','{}'::jsonb),
      nullif(e->>'schedulingId',''),nullif(e->>'startDate','')::date,nullif(e->>'notes',''),new.revision,e,null,
      coalesce(nullif(e->>'createdAt','')::timestamptz,now()),coalesce(nullif(e->>'updatedAt','')::timestamptz,now()),new.updated_by
    from jsonb_array_elements(coalesce(new.state->'personnel','[]'::jsonb)) e
    left join public.profiles p on p.organization_id=new.organization_id and p.person_id=e->>'id'
    where coalesce(e->>'id','')<>''
    on conflict (organization_id,id) do update set
      auth_user_id=excluded.auth_user_id,legacy_user_id=excluded.legacy_user_id,display_name=excluded.display_name,first_name=excluded.first_name,
      last_name=excluded.last_name,relationship=excluded.relationship,job_title=excluded.job_title,department=excluded.department,status=excluded.status,
      email=excluded.email,phone=excluded.phone,scheduling_eligible=excluded.scheduling_eligible,roles=excluded.roles,skills=excluded.skills,
      certifications=excluded.certifications,availability=excluded.availability,scheduling_id=excluded.scheduling_id,start_date=excluded.start_date,
      notes=excluded.notes,source_revision=excluded.source_revision,source_json=excluded.source_json,archived_at=null,
      updated_at=excluded.updated_at,last_synced_by=excluded.last_synced_by;
    update public.personnel p set archived_at=coalesce(p.archived_at,now()),source_revision=new.revision,updated_at=now(),last_synced_by=new.updated_by
    where p.organization_id=new.organization_id and p.archived_at is null
      and not exists(select 1 from jsonb_array_elements(coalesce(new.state->'personnel','[]'::jsonb)) e where e->>'id'=p.id);
  end if;

  if tg_op='INSERT' or new.state->'jobs' is distinct from old.state->'jobs' then
    insert into public.jobs(
      organization_id,id,estimate_id,work_order_id,customer_id,vehicle_id,status,appointment_local,parts_status,duration,request_notes,
      estimate,estimate_total,services,equipment,check_in,legacy_audit,created_by_legacy_user_id,created_by_user_id,
      source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
    )
    select new.organization_id,e->>'id',nullif(e->>'estimateId',''),nullif(e->>'workOrderId',''),nullif(e->>'customerId',''),nullif(e->>'vehicleId',''),
      nullif(e->>'status',''),nullif(e->>'appointment','')::timestamp,nullif(e->>'partsStatus',''),nullif(e->>'duration',''),nullif(e->>'requestNotes',''),
      coalesce(e->'estimate','{}'::jsonb),nullif(e->>'estimateTotal','')::numeric,coalesce(e->'services','[]'::jsonb),coalesce(e->'equipment','[]'::jsonb),
      e->'checkIn',coalesce(e->'audit','[]'::jsonb),nullif(e->>'createdBy',''),creator.user_id,new.revision,e,null,
      coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),new.updated_by
    from jsonb_array_elements(coalesce(new.state->'jobs','[]'::jsonb)) e
    left join public.personnel lp on lp.organization_id=new.organization_id and lp.legacy_user_id=e->>'createdBy'
    left join public.profiles creator on creator.organization_id=new.organization_id and creator.person_id=lp.id
    where coalesce(e->>'id','')<>''
    on conflict (organization_id,id) do update set
      estimate_id=excluded.estimate_id,work_order_id=excluded.work_order_id,customer_id=excluded.customer_id,vehicle_id=excluded.vehicle_id,
      status=excluded.status,appointment_local=excluded.appointment_local,parts_status=excluded.parts_status,duration=excluded.duration,
      request_notes=excluded.request_notes,estimate=excluded.estimate,estimate_total=excluded.estimate_total,services=excluded.services,
      equipment=excluded.equipment,check_in=excluded.check_in,legacy_audit=excluded.legacy_audit,
      created_by_legacy_user_id=excluded.created_by_legacy_user_id,created_by_user_id=coalesce(jobs.created_by_user_id,excluded.created_by_user_id),
      source_revision=excluded.source_revision,source_json=excluded.source_json,archived_at=null,updated_at=now(),last_synced_by=excluded.last_synced_by;
    update public.jobs j set archived_at=coalesce(j.archived_at,now()),source_revision=new.revision,updated_at=now(),last_synced_by=new.updated_by
    where j.organization_id=new.organization_id and j.archived_at is null
      and not exists(select 1 from jsonb_array_elements(coalesce(new.state->'jobs','[]'::jsonb)) e where e->>'id'=j.id);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_core_from_app_state() from public,anon,authenticated;
drop trigger if exists trg_sync_core_from_app_state on public.app_state;
create trigger trg_sync_core_from_app_state after insert or update of state on public.app_state
for each row execute function private.sync_core_from_app_state();

alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.personnel;

-- One-time backfill from the already-initialized compatibility state.
with s as (select organization_id,state,revision,updated_by from public.app_state limit 1)
insert into public.customers(
  organization_id,id,first_name,middle_name,last_name,display_name,phone,email,address1,address2,city,state,postal_code,country,notes,
  source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
)
select s.organization_id,e->>'id',nullif(e->>'firstName',''),nullif(e->>'middleName',''),nullif(e->>'lastName',''),
  coalesce(nullif(e->>'name',''),nullif(trim(concat_ws(' ',e->>'firstName',e->>'middleName',e->>'lastName')),'')),
  nullif(e->>'phone',''),nullif(e->>'email',''),nullif(e->>'address1',''),nullif(e->>'address2',''),nullif(e->>'city',''),
  nullif(e->>'state',''),nullif(e->>'postalCode',''),nullif(e->>'country',''),nullif(e->>'notes',''),s.revision,e,null,
  coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),s.updated_by
from s cross join lateral jsonb_array_elements(coalesce(s.state->'customers','[]'::jsonb)) e
where coalesce(e->>'id','')<>''
on conflict (organization_id,id) do nothing;

with s as (select organization_id,state,revision,updated_by from public.app_state limit 1)
insert into public.vehicles(
  organization_id,id,customer_id,vin,year,make,model,trim,color,exterior_finish,vehicle_type,plate,
  source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
)
select s.organization_id,e->>'id',nullif(e->>'customerId',''),nullif(e->>'vin',''),nullif(e->>'year',''),nullif(e->>'make',''),
  nullif(e->>'model',''),nullif(e->>'trim',''),nullif(e->>'color',''),nullif(e->>'wrap',''),nullif(e->>'type',''),nullif(e->>'plate',''),
  s.revision,e,null,coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),s.updated_by
from s cross join lateral jsonb_array_elements(coalesce(s.state->'vehicles','[]'::jsonb)) e
where coalesce(e->>'id','')<>''
on conflict (organization_id,id) do nothing;

with s as (select organization_id,state,revision,updated_by from public.app_state limit 1)
insert into public.personnel(
  organization_id,id,auth_user_id,legacy_user_id,display_name,first_name,last_name,relationship,job_title,department,status,email,phone,
  scheduling_eligible,roles,skills,certifications,availability,scheduling_id,start_date,notes,
  source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
)
select s.organization_id,e->>'id',p.user_id,nullif(e->>'userId',''),coalesce(nullif(e->>'displayName',''),'Unnamed Person'),
  nullif(e->>'firstName',''),nullif(e->>'lastName',''),nullif(e->>'relationship',''),nullif(e->>'jobTitle',''),nullif(e->>'department',''),
  nullif(e->>'status',''),nullif(e->>'email',''),nullif(e->>'phone',''),coalesce((e->>'schedulingEligible')::boolean,false),
  coalesce(array(select jsonb_array_elements_text(coalesce(e->'roles','[]'::jsonb))),'{}'::text[]),
  coalesce(e->'skills','[]'::jsonb),coalesce(e->'certifications','[]'::jsonb),coalesce(e->'availability','{}'::jsonb),
  nullif(e->>'schedulingId',''),nullif(e->>'startDate','')::date,nullif(e->>'notes',''),s.revision,e,null,
  coalesce(nullif(e->>'createdAt','')::timestamptz,now()),coalesce(nullif(e->>'updatedAt','')::timestamptz,now()),s.updated_by
from s cross join lateral jsonb_array_elements(coalesce(s.state->'personnel','[]'::jsonb)) e
left join public.profiles p on p.organization_id=s.organization_id and p.person_id=e->>'id'
where coalesce(e->>'id','')<>''
on conflict (organization_id,id) do nothing;

with s as (select organization_id,state,revision,updated_by from public.app_state limit 1)
insert into public.jobs(
  organization_id,id,estimate_id,work_order_id,customer_id,vehicle_id,status,appointment_local,parts_status,duration,request_notes,
  estimate,estimate_total,services,equipment,check_in,legacy_audit,created_by_legacy_user_id,created_by_user_id,
  source_revision,source_json,archived_at,created_at,updated_at,last_synced_by
)
select s.organization_id,e->>'id',nullif(e->>'estimateId',''),nullif(e->>'workOrderId',''),nullif(e->>'customerId',''),nullif(e->>'vehicleId',''),
  nullif(e->>'status',''),nullif(e->>'appointment','')::timestamp,nullif(e->>'partsStatus',''),nullif(e->>'duration',''),nullif(e->>'requestNotes',''),
  coalesce(e->'estimate','{}'::jsonb),nullif(e->>'estimateTotal','')::numeric,coalesce(e->'services','[]'::jsonb),coalesce(e->'equipment','[]'::jsonb),
  e->'checkIn',coalesce(e->'audit','[]'::jsonb),nullif(e->>'createdBy',''),creator.user_id,s.revision,e,null,
  coalesce(nullif(e->>'createdAt','')::timestamptz,now()),now(),s.updated_by
from s cross join lateral jsonb_array_elements(coalesce(s.state->'jobs','[]'::jsonb)) e
left join public.personnel lp on lp.organization_id=s.organization_id and lp.legacy_user_id=e->>'createdBy'
left join public.profiles creator on creator.organization_id=s.organization_id and creator.person_id=lp.id
where coalesce(e->>'id','')<>''
on conflict (organization_id,id) do nothing;
