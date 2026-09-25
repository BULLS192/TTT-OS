-- Phase 2B: move expenses from browser-local storage to Supabase.
-- Receipts live in a private Storage bucket; the ledger and compliance policy live in Postgres.

create table public.expense_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  policies jsonb not null default '{"alcoholPct":30,"receiptThreshold":75}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.expenses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  expense_date date,
  expense_type text,
  merchant text,
  category text,
  purchased_by text,
  purchased_by_person_id text,
  payment_source text,
  subtotal numeric(12,2),
  sales_tax numeric(12,2),
  tip numeric(12,2),
  total numeric(12,2),
  business_purpose text,
  notes text,
  attendees text,
  business_relationship text,
  food_amount numeric(12,2),
  alcohol_amount numeric(12,2),
  meal_purpose text,
  meal_type text,
  job_ref text,
  customer_id text,
  vehicle_id text,
  work_order_id text,
  reimbursed boolean not null default false,
  receipt_name text,
  receipt_path text,
  line_items jsonb not null default '[]'::jsonb,
  allocation_summary jsonb not null default '{}'::jsonb,
  source_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  constraint expenses_job_fk foreign key (organization_id,job_ref)
    references public.jobs(organization_id,id) on update cascade
);

create index expenses_org_date_idx on public.expenses(organization_id,expense_date desc);
create index expenses_org_job_idx on public.expenses(organization_id,job_ref) where job_ref is not null and job_ref<>'';
create index expenses_created_by_idx on public.expenses(created_by);
create index expenses_updated_by_idx on public.expenses(updated_by);
create index expense_settings_updated_by_idx on public.expense_settings(updated_by);

alter table public.expense_settings enable row level security;
alter table public.expenses enable row level security;

revoke all on public.expense_settings,public.expenses from anon;
grant select,insert,update on public.expense_settings,public.expenses to authenticated;

create policy expense_settings_member_select on public.expense_settings for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expense_settings.organization_id and p.active=true));
create policy expense_settings_member_insert on public.expense_settings for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expense_settings.organization_id and p.active=true));
create policy expense_settings_member_update on public.expense_settings for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expense_settings.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expense_settings.organization_id and p.active=true));

create policy expenses_member_select on public.expenses for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expenses.organization_id and p.active=true));
create policy expenses_member_insert on public.expenses for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expenses.organization_id and p.active=true));
create policy expenses_member_update on public.expenses for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expenses.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=expenses.organization_id and p.active=true));

insert into public.expense_settings(organization_id)
select id from public.organizations where slug='ttt'
on conflict (organization_id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'expense-receipts','expense-receipts',false,20971520,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "ttt expense receipts select" on storage.objects for select to authenticated
using (
  bucket_id='expense-receipts'
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "ttt expense receipts insert" on storage.objects for insert to authenticated
with check (
  bucket_id='expense-receipts'
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "ttt expense receipts update" on storage.objects for update to authenticated
using (
  bucket_id='expense-receipts'
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1]
  )
)
with check (
  bucket_id='expense-receipts'
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "ttt expense receipts delete" on storage.objects for delete to authenticated
using (
  bucket_id='expense-receipts'
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

alter publication supabase_realtime add table public.expenses;
