create table if not exists public.customer_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_code text not null,
  source text not null default 'shop-qr',
  session_token uuid,
  first_name text not null,
  middle_name text,
  last_name text not null,
  phone text not null,
  email text,
  address1 text,
  address2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  customer_notes text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  vehicle_color text,
  vehicle_type text,
  plate text,
  vin text,
  requested_services text[] not null default '{}'::text[],
  request_notes text,
  referral_source text,
  contact_consent boolean not null default false,
  status text not null default 'new',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  converted_at timestamptz,
  converted_by uuid references auth.users(id) on delete set null,
  converted_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_intakes_status_chk check (status in ('new','reviewed','converted','archived')),
  constraint customer_intakes_code_uq unique (organization_id,intake_code)
);

create index if not exists customer_intakes_org_status_created_idx
  on public.customer_intakes(organization_id,status,created_at desc);
create index if not exists customer_intakes_session_idx
  on public.customer_intakes(organization_id,session_token)
  where session_token is not null;
create index if not exists customer_intakes_contact_idx
  on public.customer_intakes(organization_id,lower(email),phone)
  where status in ('new','reviewed');

alter table public.customer_intakes enable row level security;

revoke all on table public.customer_intakes from anon, authenticated;
grant select, update on table public.customer_intakes to authenticated;

drop policy if exists customer_intakes_member_select on public.customer_intakes;
drop policy if exists customer_intakes_member_update on public.customer_intakes;

create policy customer_intakes_member_select
  on public.customer_intakes
  for select
  to authenticated
  using (private.is_ttt_member(organization_id));

create policy customer_intakes_member_update
  on public.customer_intakes
  for update
  to authenticated
  using (private.is_ttt_member(organization_id))
  with check (private.is_ttt_member(organization_id));

create or replace function public.submit_customer_intake(
  p_payload jsonb,
  p_source text default 'shop-qr',
  p_session_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_id uuid := gen_random_uuid();
  v_code text := 'IN-' || to_char(now() at time zone 'America/Chicago','YYMMDD') || '-' ||
                 upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  v_first text := trim(coalesce(p_payload->>'firstName',''));
  v_last text := trim(coalesce(p_payload->>'lastName',''));
  v_phone text := trim(coalesce(p_payload->>'phone',''));
  v_email text := trim(coalesce(p_payload->>'email',''));
  v_notes text := trim(coalesce(p_payload->>'requestNotes',''));
  v_source text := lower(trim(coalesce(p_source,'shop-qr')));
  v_services text[] := '{}'::text[];
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid intake payload';
  end if;

  if length(v_first) < 1 or length(v_first) > 80
     or length(v_last) < 1 or length(v_last) > 80 then
    raise exception 'Name is required';
  end if;

  if length(v_phone) < 7 or length(v_phone) > 40 then
    raise exception 'A valid phone number is required';
  end if;

  if v_email <> '' and (length(v_email) > 320 or position('@' in v_email) < 2) then
    raise exception 'Invalid email address';
  end if;

  if coalesce(p_payload->>'contactConsent','false') <> 'true' then
    raise exception 'Contact consent is required';
  end if;

  if v_source !~ '^[a-z0-9_-]{1,40}$' then
    v_source := 'other';
  end if;

  if jsonb_typeof(p_payload->'services') = 'array' then
    select coalesce(array_agg(left(trim(s.value),100)), '{}'::text[])
      into v_services
    from jsonb_array_elements_text(p_payload->'services') as s(value)
    where trim(s.value) <> '';
  end if;

  if coalesce(array_length(v_services,1),0) > 12 then
    raise exception 'Too many service selections';
  end if;

  if coalesce(array_length(v_services,1),0) = 0 and v_notes = '' then
    raise exception 'Select a service or describe the requested work';
  end if;

  select id into v_org_id
  from public.organizations
  where slug = 'ttt'
  limit 1;

  if v_org_id is null then
    raise exception 'TTT organization is unavailable';
  end if;

  insert into public.customer_intakes (
    id,organization_id,intake_code,source,session_token,
    first_name,middle_name,last_name,phone,email,
    address1,address2,city,state,postal_code,country,customer_notes,
    vehicle_year,vehicle_make,vehicle_model,vehicle_trim,vehicle_color,vehicle_type,plate,vin,
    requested_services,request_notes,referral_source,contact_consent
  ) values (
    v_id,v_org_id,v_code,v_source,p_session_token,
    left(v_first,80),
    nullif(left(trim(coalesce(p_payload->>'middleName','')),80),''),
    left(v_last,80),
    left(v_phone,40),
    nullif(left(v_email,320),''),
    nullif(left(trim(coalesce(p_payload->>'address1','')),160),''),
    nullif(left(trim(coalesce(p_payload->>'address2','')),160),''),
    nullif(left(trim(coalesce(p_payload->>'city','')),100),''),
    nullif(left(trim(coalesce(p_payload->>'state','')),40),''),
    nullif(left(trim(coalesce(p_payload->>'postalCode','')),24),''),
    coalesce(nullif(left(trim(coalesce(p_payload->>'country','US')),60),''),'US'),
    nullif(left(trim(coalesce(p_payload->>'customerNotes','')),1000),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleYear','')),10),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleMake','')),80),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleModel','')),100),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleTrim','')),100),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleColor','')),80),''),
    nullif(left(trim(coalesce(p_payload->>'vehicleType','')),80),''),
    nullif(left(trim(coalesce(p_payload->>'plate','')),40),''),
    nullif(left(upper(regexp_replace(trim(coalesce(p_payload->>'vin','')),'[^A-Za-z0-9]','','g')),17),''),
    v_services,
    nullif(left(v_notes,3000),''),
    nullif(left(trim(coalesce(p_payload->>'referralSource','')),100),''),
    true
  );

  return jsonb_build_object('id',v_id,'intake_code',v_code);
end;
$$;

revoke execute on function public.submit_customer_intake(jsonb,text,uuid) from public;
grant execute on function public.submit_customer_intake(jsonb,text,uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='customer_intakes'
  ) then
    alter publication supabase_realtime add table public.customer_intakes;
  end if;
end
$$;
