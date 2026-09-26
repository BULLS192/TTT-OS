-- TTT OS Core Operations Consolidation Wave
-- 2026-09-26
-- Supabase remains the authoritative operational database. Browser/local state is compatibility cache only.

create table if not exists public.work_orders (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  job_id text not null,
  status text not null default 'open',
  authorized_total numeric not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  final_authorization jsonb not null default '{}'::jsonb,
  notes text,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint work_orders_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade
);

create table if not exists public.change_orders (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  job_id text not null,
  work_order_id text not null,
  status text not null default 'Draft',
  reason text,
  description text not null default '',
  schedule_impact text,
  parts_delta numeric not null default 0,
  labor_delta numeric not null default 0,
  fees_delta numeric not null default 0,
  total_delta numeric not null default 0,
  signer_name text,
  approved_at timestamptz,
  approval_method text,
  previous_authorized_total numeric,
  revised_authorized_total numeric,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint change_orders_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade,
  constraint change_orders_work_order_fk foreign key (organization_id,work_order_id)
    references public.work_orders(organization_id,id) on update cascade
);

create table if not exists public.work_order_lines (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  work_order_id text not null,
  job_id text not null,
  change_order_id text,
  line_type text not null default 'service',
  category text,
  product_id text,
  brand text,
  model text,
  quantity numeric not null default 1,
  status text not null default 'Not Started',
  serial_number text,
  installed_location text,
  planned_labor_hours numeric,
  actual_labor_hours numeric,
  material_cost numeric,
  labor_cost numeric,
  technician_notes text,
  completion_notes text,
  sort_order integer not null default 0,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint work_order_lines_work_order_fk foreign key (organization_id,work_order_id)
    references public.work_orders(organization_id,id) on update cascade,
  constraint work_order_lines_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade,
  constraint work_order_lines_change_order_fk foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on update cascade,
  constraint work_order_lines_product_fk foreign key (organization_id,product_id)
    references public.products_services(organization_id,id) on update cascade
);

create table if not exists public.expense_allocations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('EXA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  expense_id text not null,
  line_item_id text,
  allocation_type text not null default 'General TTT Expense',
  job_id text,
  work_order_id text,
  amount numeric not null default 0,
  category text,
  note text,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint expense_allocations_expense_fk foreign key (organization_id,expense_id)
    references public.expenses(organization_id,id) on update cascade on delete cascade,
  constraint expense_allocations_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade,
  constraint expense_allocations_work_order_fk foreign key (organization_id,work_order_id)
    references public.work_orders(organization_id,id) on update cascade
);

create table if not exists public.inventory_wishlist (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('WISH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  product_id text,
  item_name text not null,
  desired_quantity numeric not null default 1,
  priority text not null default 'normal',
  needed_by date,
  reason text,
  preferred_vendor_company_id text,
  estimated_unit_cost numeric,
  status text not null default 'wishlist',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint inventory_wishlist_product_fk foreign key (organization_id,product_id)
    references public.products_services(organization_id,id) on update cascade,
  constraint inventory_wishlist_vendor_fk foreign key (organization_id,preferred_vendor_company_id)
    references public.companies(organization_id,id) on update cascade
);

create table if not exists public.inventory_reorder_alerts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('ROP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  inventory_item_id text not null,
  product_id text,
  status text not null default 'open',
  available_quantity numeric not null default 0,
  reorder_point numeric not null default 0,
  recommended_quantity numeric not null default 0,
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,id),
  constraint inventory_reorder_alert_item_fk foreign key (organization_id,inventory_item_id)
    references public.inventory_items(organization_id,id) on update cascade on delete cascade,
  constraint inventory_reorder_alert_product_fk foreign key (organization_id,product_id)
    references public.products_services(organization_id,id) on update cascade
);

create table if not exists public.discount_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('DISC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  code text not null,
  name text,
  discount_type text not null default 'percent',
  discount_value numeric not null default 0,
  campaign_name text,
  valid_from timestamptz,
  valid_until timestamptz,
  minimum_subtotal numeric not null default 0,
  max_uses integer,
  times_used integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  unique (organization_id,code),
  constraint discount_codes_type_chk check (discount_type in ('percent','amount'))
);

alter table public.quote_lines add column if not exists list_unit_price numeric;
alter table public.quote_lines add column if not exists discount_type text not null default 'percent';
alter table public.quote_lines add column if not exists discount_value numeric not null default 0;
alter table public.quote_lines add column if not exists discount_amount numeric not null default 0;
alter table public.quotes add column if not exists discount_type text not null default 'amount';
alter table public.quotes add column if not exists discount_value numeric not null default 0;
alter table public.quotes add column if not exists discount_code_id text;
alter table public.quotes add column if not exists discount_code text;
alter table public.quotes add column if not exists discount_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='quote_lines_discount_type_chk') then
    alter table public.quote_lines add constraint quote_lines_discount_type_chk check (discount_type in ('percent','amount'));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotes_discount_type_chk') then
    alter table public.quotes add constraint quotes_discount_type_chk check (discount_type in ('percent','amount'));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotes_discount_code_fk') then
    alter table public.quotes add constraint quotes_discount_code_fk
      foreign key (organization_id,discount_code_id) references public.discount_codes(organization_id,id) on update cascade;
  end if;
end $$;

update public.quote_lines set list_unit_price=unit_price where list_unit_price is null;

create index if not exists work_orders_job_idx on public.work_orders(organization_id,job_id) where archived_at is null;
create index if not exists work_order_lines_job_idx on public.work_order_lines(organization_id,job_id) where archived_at is null;
create index if not exists work_order_lines_work_order_idx on public.work_order_lines(organization_id,work_order_id) where archived_at is null;
create index if not exists change_orders_job_idx on public.change_orders(organization_id,job_id) where archived_at is null;
create index if not exists expense_allocations_expense_idx on public.expense_allocations(organization_id,expense_id) where archived_at is null;
create index if not exists expense_allocations_job_idx on public.expense_allocations(organization_id,job_id) where archived_at is null;
create index if not exists expense_allocations_work_order_idx on public.expense_allocations(organization_id,work_order_id) where archived_at is null;
create index if not exists inventory_wishlist_status_idx on public.inventory_wishlist(organization_id,status) where archived_at is null;
create unique index if not exists inventory_reorder_alert_open_uq on public.inventory_reorder_alerts(organization_id,inventory_item_id) where status='open';

alter table public.work_orders enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.change_orders enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.inventory_wishlist enable row level security;
alter table public.inventory_reorder_alerts enable row level security;
alter table public.discount_codes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['work_orders','work_order_lines','change_orders','expense_allocations','inventory_wishlist','inventory_reorder_alerts','discount_codes']
  loop
    execute format('drop policy if exists %I_member_select on public.%I',t,t);
    execute format('drop policy if exists %I_member_insert on public.%I',t,t);
    execute format('drop policy if exists %I_member_update on public.%I',t,t);
    execute format('create policy %I_member_select on public.%I for select to authenticated using (private.is_ttt_member(organization_id))',t,t);
    execute format('create policy %I_member_insert on public.%I for insert to authenticated with check (private.is_ttt_member(organization_id))',t,t);
    execute format('create policy %I_member_update on public.%I for update to authenticated using (private.is_ttt_member(organization_id)) with check (private.is_ttt_member(organization_id))',t,t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function private.sync_inventory_reorder_alert()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare avail numeric; rec numeric;
begin
  if new.archived_at is not null or new.reorder_point is null then
    update public.inventory_reorder_alerts set status='resolved',resolved_at=now(),updated_at=now()
    where organization_id=new.organization_id and inventory_item_id=new.id and status='open';
    return new;
  end if;
  avail := coalesce(new.quantity_on_hand,0)-coalesce(new.quantity_reserved,0);
  rec := coalesce(new.reorder_quantity,greatest(coalesce(new.reorder_point,0)*2-avail,0),0);
  if avail <= new.reorder_point then
    insert into public.inventory_reorder_alerts(
      organization_id,inventory_item_id,product_id,status,available_quantity,reorder_point,recommended_quantity,first_triggered_at,last_triggered_at,updated_at
    ) values(new.organization_id,new.id,new.product_id,'open',avail,new.reorder_point,rec,now(),now(),now())
    on conflict (organization_id,inventory_item_id) where status='open'
    do update set product_id=excluded.product_id,available_quantity=excluded.available_quantity,reorder_point=excluded.reorder_point,
      recommended_quantity=excluded.recommended_quantity,last_triggered_at=now(),updated_at=now();
  else
    update public.inventory_reorder_alerts set status='resolved',resolved_at=now(),available_quantity=avail,updated_at=now()
    where organization_id=new.organization_id and inventory_item_id=new.id and status='open';
  end if;
  return new;
end $$;
revoke all on function private.sync_inventory_reorder_alert() from public,anon,authenticated;
drop trigger if exists inventory_reorder_alert_trigger on public.inventory_items;
create trigger inventory_reorder_alert_trigger
after insert or update of quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,archived_at
on public.inventory_items for each row execute function private.sync_inventory_reorder_alert();

create or replace view public.job_cost_summary with (security_invoker=true) as
select j.organization_id,j.id as job_id,j.customer_id,j.vehicle_id,j.status,
  coalesce(q.total,j.estimate_total,0) as quoted_revenue,
  coalesce(co.approved_change_total,0) as approved_change_revenue,
  coalesce(q.total,j.estimate_total,0)+coalesce(co.approved_change_total,0) as authorized_revenue,
  coalesce(wl.material_cost,0) as material_cost,coalesce(wl.labor_cost,0) as labor_cost,
  coalesce(ex.expense_cost,0) as allocated_expenses,
  coalesce(wl.material_cost,0)+coalesce(wl.labor_cost,0)+coalesce(ex.expense_cost,0) as actual_cost,
  (coalesce(q.total,j.estimate_total,0)+coalesce(co.approved_change_total,0))
   -(coalesce(wl.material_cost,0)+coalesce(wl.labor_cost,0)+coalesce(ex.expense_cost,0)) as gross_profit
from public.jobs j
left join public.quotes q on q.organization_id=j.organization_id and q.id=j.primary_quote_id
left join lateral (
  select sum(total_delta) approved_change_total from public.change_orders c
  where c.organization_id=j.organization_id and c.job_id=j.id and c.archived_at is null and lower(c.status)='approved'
) co on true
left join lateral (
  select sum(coalesce(material_cost,0)) material_cost,sum(coalesce(labor_cost,0)) labor_cost from public.work_order_lines l
  where l.organization_id=j.organization_id and l.job_id=j.id and l.archived_at is null
) wl on true
left join lateral (
  select sum(coalesce(amount,0)) expense_cost from public.expense_allocations e
  where e.organization_id=j.organization_id and e.job_id=j.id and e.archived_at is null
) ex on true
where j.archived_at is null;
grant select on public.job_cost_summary to authenticated;

-- Compatibility backfill: existing Job JSON remains readable while the relational tables become authoritative.
insert into public.work_orders(organization_id,id,job_id,status,authorized_total,started_at,completed_at,final_authorization,notes,source_json,created_at,updated_at)
select j.organization_id,j.work_order_id,j.id,coalesce(j.status,'open'),coalesce(j.estimate_total,0),
  nullif(j.source_json->'workExecution'->>'startedAt','')::timestamptz,
  nullif(j.source_json->'workExecution'->>'completedAt','')::timestamptz,
  coalesce(j.source_json->'finalAuthorization','{}'::jsonb),j.source_json->'workExecution'->>'notes',
  jsonb_build_object('jobId',j.id,'workOrderId',j.work_order_id),j.created_at,j.updated_at
from public.jobs j where j.archived_at is null and j.work_order_id is not null
on conflict (organization_id,id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['work_orders','work_order_lines','change_orders','expense_allocations','inventory_wishlist','inventory_reorder_alerts','discount_codes']
  loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
