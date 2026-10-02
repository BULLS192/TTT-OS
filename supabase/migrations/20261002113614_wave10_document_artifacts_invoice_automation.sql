
-- Wave 10: end-to-end job and document automation

alter table public.documents
  add column if not exists presented_at timestamptz,
  add column if not exists approval_acknowledged_at timestamptz,
  add column if not exists approval_context jsonb not null default '{}'::jsonb;

alter table public.document_templates
  add column if not exists release_status text not null default 'approved'
    check (release_status in ('draft','legal_review','approved','retired')),
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz;

update public.document_templates
set release_status = case
  when legal_review_required then 'legal_review'
  else 'approved'
end
where release_status='approved' and legal_review_required=true;

create table if not exists public.document_template_versions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_code text not null,
  version text not null,
  status text not null default 'draft'
    check (status in ('draft','legal_review','approved','retired')),
  template_url text,
  effective_from timestamptz,
  effective_until timestamptz,
  content_hash text,
  approval_notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,document_code,version),
  foreign key (organization_id,document_code)
    references public.document_templates(organization_id,code) on update cascade on delete cascade
);

insert into public.document_template_versions(
  organization_id,document_code,version,status,template_url,effective_from,
  metadata,created_at,updated_at
)
select
  organization_id,code,current_version,release_status,template_url,effective_from,
  jsonb_build_object('seeded_from_registry',true),now(),now()
from public.document_templates
on conflict (organization_id,document_code,version) do nothing;

create table if not exists public.document_artifacts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default ('ART-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  document_id text not null,
  artifact_type text not null default 'canonical_pdf'
    check (artifact_type in ('canonical_pdf','render_preview','signed_export')),
  storage_bucket text not null default 'document-artifacts',
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  sha256 text not null,
  source_content_hash text,
  generated_at timestamptz not null default now(),
  generator text not null default 'ttt-document-pdf-v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (organization_id,id),
  unique (organization_id,document_id,artifact_type),
  foreign key (organization_id,document_id)
    references public.documents(organization_id,id) on update cascade
);

create index if not exists document_artifacts_document_idx
  on public.document_artifacts(organization_id,document_id,generated_at desc);
create index if not exists document_artifacts_created_by_idx
  on public.document_artifacts(created_by) where created_by is not null;
create index if not exists document_template_versions_status_idx
  on public.document_template_versions(organization_id,document_code,status);
create index if not exists document_template_versions_approved_by_idx
  on public.document_template_versions(approved_by) where approved_by is not null;
create index if not exists document_template_versions_created_by_idx
  on public.document_template_versions(created_by) where created_by is not null;
create index if not exists document_template_versions_updated_by_idx
  on public.document_template_versions(updated_by) where updated_by is not null;

alter table public.document_template_versions enable row level security;
alter table public.document_artifacts enable row level security;

revoke all on public.document_template_versions from anon,authenticated;
revoke all on public.document_artifacts from anon,authenticated;
grant select,insert,update on public.document_template_versions to authenticated;
grant select on public.document_artifacts to authenticated;

drop policy if exists document_template_versions_member_select on public.document_template_versions;
drop policy if exists document_template_versions_member_insert on public.document_template_versions;
drop policy if exists document_template_versions_member_update on public.document_template_versions;
create policy document_template_versions_member_select on public.document_template_versions
  for select to authenticated using (private.is_ttt_member(organization_id));
create policy document_template_versions_member_insert on public.document_template_versions
  for insert to authenticated with check (private.is_ttt_member(organization_id));
create policy document_template_versions_member_update on public.document_template_versions
  for update to authenticated using (private.is_ttt_member(organization_id))
  with check (private.is_ttt_member(organization_id));

drop policy if exists document_artifacts_member_select on public.document_artifacts;
create policy document_artifacts_member_select on public.document_artifacts
  for select to authenticated using (private.is_ttt_member(organization_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('document-artifacts','document-artifacts',false,26214400,array['application/pdf'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.sync_invoice_payment_totals()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_org uuid;
  v_invoice text;
  v_paid numeric;
  v_total numeric;
begin
  v_org := coalesce(new.organization_id,old.organization_id);
  v_invoice := coalesce(new.invoice_id,old.invoice_id);
  if v_invoice is null then return coalesce(new,old); end if;

  select coalesce(sum(p.amount),0)
  into v_paid
  from public.payments p
  where p.organization_id=v_org
    and p.invoice_id=v_invoice
    and p.archived_at is null
    and lower(p.status) in ('received','settled','paid');

  select i.total into v_total
  from public.invoices i
  where i.organization_id=v_org and i.id=v_invoice;

  update public.invoices
  set amount_paid=v_paid,
      balance_due=greatest(coalesce(v_total,0)-v_paid,0),
      status=case
        when lower(status) in ('void','cancelled','canceled') then status
        when v_paid >= coalesce(v_total,0) and coalesce(v_total,0)>0 then 'paid'
        when v_paid > 0 then 'partial'
        else status
      end,
      paid_at=case when v_paid >= coalesce(v_total,0) and coalesce(v_total,0)>0 then coalesce(paid_at,now()) else null end,
      updated_at=now()
  where organization_id=v_org and id=v_invoice;

  return coalesce(new,old);
end $$;

drop trigger if exists trg_payments_sync_invoice on public.payments;
create trigger trg_payments_sync_invoice
after insert or update or delete on public.payments
for each row execute function private.sync_invoice_payment_totals();

create or replace function public.create_invoice_from_job(
  p_organization_id uuid,
  p_job_id text
) returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.jobs%rowtype;
  v_quote public.quotes%rowtype;
  v_invoice_id text;
  v_change_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not private.is_ttt_member(p_organization_id) then
    raise exception 'Not authorized for organization' using errcode='42501';
  end if;

  select * into v_job
  from public.jobs
  where organization_id=p_organization_id and id=p_job_id and archived_at is null;

  if not found then raise exception 'Job not found'; end if;

  if v_job.primary_invoice_id is not null then
    select id into v_invoice_id from public.invoices
    where organization_id=p_organization_id and id=v_job.primary_invoice_id and archived_at is null;
    if v_invoice_id is not null then return v_invoice_id; end if;
  end if;

  if v_job.primary_quote_id is not null then
    select * into v_quote from public.quotes
    where organization_id=p_organization_id and id=v_job.primary_quote_id and archived_at is null;
  else
    select * into v_quote from public.quotes
    where organization_id=p_organization_id and job_id=p_job_id and archived_at is null
    order by approved_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_quote.id is null then
    raise exception 'An active Quote is required before generating an Invoice';
  end if;

  select coalesce(sum(total_delta),0) into v_change_total
  from public.change_orders
  where organization_id=p_organization_id
    and job_id=p_job_id
    and archived_at is null
    and (approved_at is not null or lower(status)='approved');

  insert into public.invoices(
    organization_id,quote_id,company_id,contact_id,customer_id,job_id,status,
    invoice_date,subtotal,discount_total,tax_total,total,amount_paid,balance_due,
    notes,metadata,created_by,updated_by
  )
  values(
    p_organization_id,v_quote.id,v_quote.company_id,v_quote.contact_id,v_quote.customer_id,p_job_id,'draft',
    current_date,v_quote.subtotal,v_quote.discount_total,v_quote.tax_total,
    v_quote.total+v_change_total,0,v_quote.total+v_change_total,
    'Generated from approved Quote and approved Change Orders',
    jsonb_build_object('generated_from_quote',v_quote.id,'approved_change_total',v_change_total),
    auth.uid(),auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.invoice_lines(
    organization_id,invoice_id,product_id,line_type,description,quantity,unit_price,taxable,line_total,sort_order,metadata
  )
  select
    organization_id,v_invoice_id,product_id,line_type,description,quantity,unit_price,taxable,line_total,sort_order,
    metadata || jsonb_build_object('source_quote_line_id',id)
  from public.quote_lines
  where organization_id=p_organization_id and quote_id=v_quote.id and archived_at is null
  order by sort_order,id;

  insert into public.invoice_lines(
    organization_id,invoice_id,line_type,description,quantity,unit_price,taxable,line_total,sort_order,metadata
  )
  select
    p_organization_id,v_invoice_id,'change_order',
    'Approved Change Order '||id||coalesce(': '||nullif(description,''),''),
    1,total_delta,false,total_delta,1000+row_number() over(order by created_at),
    jsonb_build_object('source_change_order_id',id)
  from public.change_orders
  where organization_id=p_organization_id
    and job_id=p_job_id
    and archived_at is null
    and (approved_at is not null or lower(status)='approved');

  update public.jobs
  set primary_invoice_id=v_invoice_id,updated_at=now(),last_synced_by=auth.uid()
  where organization_id=p_organization_id and id=p_job_id;

  return v_invoice_id;
end $$;

revoke all on function public.create_invoice_from_job(uuid,text) from public,anon;
grant execute on function public.create_invoice_from_job(uuid,text) to authenticated;

notify pgrst,'reload schema';
