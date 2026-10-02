
-- TTT Document System Waves 1-9
-- Central template registry + immutable finalized documents.

create table if not exists public.document_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  title text not null,
  wave integer not null check (wave between 1 and 9),
  category text not null,
  scope_type text not null,
  trigger_stage text,
  current_version text not null default 'v1',
  template_url text,
  legal_review_required boolean not null default false,
  customer_facing boolean not null default false,
  requires_signature boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,code)
);

alter table public.document_templates enable row level security;

drop policy if exists document_templates_member_select on public.document_templates;
drop policy if exists document_templates_admin_insert on public.document_templates;
drop policy if exists document_templates_admin_update on public.document_templates;

create policy document_templates_member_select
on public.document_templates for select to authenticated
using (private.is_ttt_member(organization_id));

create policy document_templates_admin_insert
on public.document_templates for insert to authenticated
with check (private.is_ttt_admin(organization_id));

create policy document_templates_admin_update
on public.document_templates for update to authenticated
using (private.is_ttt_admin(organization_id))
with check (private.is_ttt_admin(organization_id));

revoke all on table public.document_templates from anon;
grant select on table public.document_templates to authenticated;
grant insert,update on table public.document_templates to authenticated;

-- Reconcile the pre-existing private number allocator storage.
alter table private.document_number_sequences enable row level security;
revoke all on table private.document_number_sequences from public,anon,authenticated;

drop function if exists private.next_ttt_document_number(uuid,text);

create or replace function public.next_ttt_document_number(
  p_organization_id uuid,
  p_document_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_document_code,'')));
  v_year integer := extract(year from (now() at time zone 'America/Chicago'))::integer;
  v_next integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if v_code !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'Invalid document code: %', p_document_code using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id=v_user_id
      and p.organization_id=p_organization_id
      and p.active=true
  ) then
    raise exception 'Not authorized for organization' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.document_templates t
    where t.organization_id=p_organization_id
      and t.code=v_code
      and t.active=true
  ) then
    raise exception 'Unknown or inactive document code: %', v_code using errcode='22023';
  end if;

  insert into private.document_number_sequences(
    organization_id,document_type,document_year,last_number,updated_at
  )
  values(p_organization_id,v_code,v_year,1,now())
  on conflict(organization_id,document_type,document_year)
  do update set
    last_number=private.document_number_sequences.last_number+1,
    updated_at=now()
  returning last_number into v_next;

  return v_code||'-'||v_year||'-'||lpad(v_next::text,4,'0');
end;
$function$;

revoke all on function public.next_ttt_document_number(uuid,text) from public,anon;
grant execute on function public.next_ttt_document_number(uuid,text) to authenticated;

-- Extend the existing relational documents table instead of creating a second source of truth.
alter table public.documents add column if not exists document_code text;
alter table public.documents add column if not exists document_number text;
alter table public.documents add column if not exists document_status text not null default 'draft';
alter table public.documents add column if not exists template_version text;
alter table public.documents add column if not exists template_url text;
alter table public.documents add column if not exists vehicle_id text;
alter table public.documents add column if not exists work_order_id text;
alter table public.documents add column if not exists signer_name text;
alter table public.documents add column if not exists signature_method text;
alter table public.documents add column if not exists signed_at timestamptz;
alter table public.documents add column if not exists generated_at timestamptz;
alter table public.documents add column if not exists finalized_at timestamptz;
alter table public.documents add column if not exists content_hash text;
alter table public.documents add column if not exists snapshot jsonb not null default '{}'::jsonb;
alter table public.documents add column if not exists supersedes_id text;
alter table public.documents add column if not exists void_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='documents_status_chk') then
    alter table public.documents
      add constraint documents_status_chk
      check (document_status in ('draft','pending_signature','finalized','void'));
  end if;
  if not exists (select 1 from pg_constraint where conname='documents_template_fk') then
    alter table public.documents
      add constraint documents_template_fk
      foreign key (organization_id,document_code)
      references public.document_templates(organization_id,code)
      on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='documents_vehicle_fk') then
    alter table public.documents
      add constraint documents_vehicle_fk
      foreign key (organization_id,vehicle_id)
      references public.vehicles(organization_id,id)
      on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='documents_work_order_fk') then
    alter table public.documents
      add constraint documents_work_order_fk
      foreign key (organization_id,work_order_id)
      references public.work_orders(organization_id,id)
      on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='documents_supersedes_fk') then
    alter table public.documents
      add constraint documents_supersedes_fk
      foreign key (organization_id,supersedes_id)
      references public.documents(organization_id,id)
      on update cascade;
  end if;
end $$;

create unique index if not exists documents_number_uq
  on public.documents(organization_id,document_number)
  where document_number is not null;

create index if not exists documents_code_status_idx
  on public.documents(organization_id,document_code,document_status)
  where archived_at is null;

create index if not exists documents_work_order_idx
  on public.documents(organization_id,work_order_id)
  where work_order_id is not null and archived_at is null;

revoke all on table public.documents from anon;
revoke delete,truncate on table public.documents from authenticated;
grant select,insert,update on table public.documents to authenticated;

create or replace function private.prevent_finalized_document_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.finalized_at is not null then
    raise exception 'Finalized document % is immutable. Create a superseding record instead.', old.id
      using errcode='55000';
  end if;
  return new;
end;
$function$;

drop trigger if exists documents_finalized_immutable on public.documents;
create trigger documents_finalized_immutable
before update or delete on public.documents
for each row execute function private.prevent_finalized_document_mutation();

-- Seed the canonical Waves 1-9 template registry for every TTT organization.
insert into public.document_templates(
  organization_id,code,title,wave,category,scope_type,trigger_stage,current_version,
  template_url,legal_review_required,customer_facing,requires_signature,metadata
)
select o.id,v.code,v.title,v.wave,v.category,v.scope_type,v.trigger_stage,v.current_version,
       v.template_url,v.legal_review_required,v.customer_facing,v.requires_signature,v.metadata
from public.organizations o
cross join (values
('Q','Quotation / Estimate',1,'core_job','job','quote','v2','https://docs.google.com/document/d/1ocbr2sy3qzmjr9Pf9ts7cXtFu1tnNQ6QSEfVfB_Y7rQ/edit',false,true,true,'{"required_by_default":true}'::jsonb),
('CHK','Vehicle Check-In & Condition Report',1,'core_job','job','check_in','v2','https://docs.google.com/document/d/1OHRp7Nrb5kBLRA_RUPn0Bb73Vxv1yElmHIu56Wz1X38/edit',false,true,false,'{"required_by_default":true}'::jsonb),
('AUTH','Customer Authorization',1,'core_job','job','authorization','v3','https://docs.google.com/document/d/18AWadcqQEuW3_P-8Oy4KWm_8TMENsxpxLNZcZIVJs8I/edit',false,true,true,'{"required_by_default":true,"requires_checkin_photos":true}'::jsonb),
('WO','Work Order',1,'core_job','job','work','v2','https://docs.google.com/document/d/1hoSqYG6F1DCe64laL6XZ82J2GdxssUTPJMWxL8Y-c1Y/edit',false,false,false,'{"required_by_default":true}'::jsonb),
('CO','Change Order',1,'core_job','job','change_control','v2','https://docs.google.com/document/d/1SzAlLMW9pe4TYd77HRfZZwvQjjXenpo0YmhPIKEfoYY/edit',false,true,true,'{"conditional":"scope_or_price_change"}'::jsonb),
('QC','QC & Final Inspection Report',1,'core_job','job','quality_control','v2','https://docs.google.com/document/d/1pBFddUm-Wc9r7YXiSnQbyv6iZ0GZKEqpV6bhFVIim0Y/edit',false,false,true,'{"required_by_default":true}'::jsonb),
('INV','Invoice',1,'core_job','job','billing','v2','https://docs.google.com/document/d/1X6po_X1pqKjHrKT2SCjiihUCE9-iUT4Zo48Ez1xvMiY/edit',false,true,false,'{"required_by_default":true}'::jsonb),
('RCPT','Payment Receipt',1,'core_job','job','payment','v2','https://docs.google.com/document/d/1w92dNG-lodxnN6FNaOto5otmYhVRU3-ttU7tLDgkVJU/edit',false,true,false,'{"required_when":"payment_received"}'::jsonb),
('COMP','Job Completion & Handover Report',1,'core_job','job','handover','v2','https://docs.google.com/document/d/1mwmReWTzxFJgwYjaXQQBjeD1woecSqjpm2m_q4CMdo0/edit',false,true,true,'{"required_by_default":true}'::jsonb),
('WAR','Warranty Certificate',1,'core_job','job','warranty','v2','https://docs.google.com/document/d/1T0iPRCEUEy7B4O2I1AGhc2s7HeVUlgO5qFs8Za-JWGQ/edit',false,true,false,'{"required_when":"warranty_applies"}'::jsonb),
('PO','Purchase Order',5,'purchasing','vendor','purchasing','v2','https://docs.google.com/document/d/1_f8eyBTAzp_l_LE3KmHrMSFYkB613lgg7tdvK39mZOQ/edit',false,true,true,'{"conditional":"purchased_parts_or_materials"}'::jsonb),

('DIA','Inspection & Diagnostic Authorization',2,'diagnostics','job','diagnostic_authorization','v1','https://docs.google.com/document/d/1v-8VXMOZxutb3Nbyjiw78oe20_BT6WWVWVtusbk9OwM/edit',true,true,true,'{"required_for":["SignalTrace","Diagnostics"]}'::jsonb),
('DFR','Diagnostic Findings Report',2,'diagnostics','job','diagnostic_findings','v1','https://docs.google.com/document/d/1hAsgfQqkpnvINAg8-8kRFfURp_NBzBuWIJdPL5t6BwM/edit',false,true,false,'{"required_for":["SignalTrace","Diagnostics"],"process":["SCAN","ISOLATE","TRACE","VERIFY","RESOLVE"]}'::jsonb),
('DRA','Diagnostic-to-Repair Authorization',2,'diagnostics','job','repair_authorization','v1','https://docs.google.com/document/d/1XFVrdtim4-ibQfdJJCMqLUwOfrSiNXdPRPzs9Gt4yWk/edit',true,true,true,'{"conditional":"diagnostic_converts_to_repair"}'::jsonb),

('TNC','Terms & Conditions',3,'legal','system','terms','v0.1','https://docs.google.com/document/d/1s-kvmd2jrMfFGgouPA1pYYFM2PRArk-lEAd--xFXCu4/edit',true,true,false,'{"legal_review_required":true}'::jsonb),
('PRIV','Privacy Notice & Customer Data Policy',3,'legal','system','privacy','v0.1','https://docs.google.com/document/d/1TCCuptpdr9cmPnyWZM3M7uFX7ND5eAEOy8rghl6hBLg/edit',true,true,false,'{"legal_review_required":true}'::jsonb),
('MEDIA','Optional Media & Marketing Release',3,'customer_protection','job','media_consent','v1','https://docs.google.com/document/d/17Tol0HbtKRTR9x6LmW1nvF1Od85PilH5GVefyA2fUzs/edit',true,true,true,'{"optional":true}'::jsonb),
('CSE','Customer-Supplied Equipment Acknowledgement',3,'customer_protection','job','pre_work','v1','https://docs.google.com/document/d/1HNPH1WWgzXGWjzlRGvKnez5fooVoLgcIwkW5Kq03qTU/edit',true,true,true,'{"conditional":"customer_supplied_equipment"}'::jsonb),
('TINT','Window Tint Compliance & Exemption Record',3,'customer_protection','job','pre_work','v1','https://docs.google.com/document/d/1iJmsx8ONcY69VKP_693-GnbWrVIWhF6C2dJ5_LYd8Og/edit',true,true,true,'{"required_for":["Window Tint"]}'::jsonb),
('REL','Vehicle Release Authorization',3,'customer_protection','job','release','v1','https://docs.google.com/document/d/1P_gSjKxnGuJb35BFE1NPWN3J-wvpkiy9TKYtymzfPLc/edit',false,true,true,'{"conditional":"third_party_pickup"}'::jsonb),

('INC','Incident & Vehicle Damage Report',4,'risk','job','incident','v1','https://docs.google.com/document/d/1P908JcfKlpSpVee0NriFkWgjcbE5y3DrN8MKhSQw2S8/edit',false,false,false,'{"conditional":"incident"}'::jsonb),
('WCL','Warranty Claim & Comeback Report',4,'risk','job','warranty_claim','v1','https://docs.google.com/document/d/1GN7fIyX-brDyAxASTAR0GsNRRPLzY-GSkxETjAe-Jiw/edit',false,true,true,'{"conditional":"warranty_claim"}'::jsonb),
('CRR','Customer Complaint & Resolution Record',4,'risk','customer','complaint','v1','https://docs.google.com/document/d/1oHr7FNTvB5MG7pt6qrJO8eT947tuVMUFZpJAsxVpXkI/edit',false,false,false,'{"conditional":"formal_complaint"}'::jsonb),
('DEC','Declined Recommendation Acknowledgement',4,'risk','job','declined_work','v1','https://docs.google.com/document/d/1TiGWHm0AG_nrw_StWfRSz8C92CZ1rLPhfajBqeE6GxQ/edit',true,true,true,'{"conditional":"material_recommendation_declined"}'::jsonb),
('UNCL','Uncollected Vehicle & Extended Custody Record',4,'risk','job','extended_custody','v1','https://docs.google.com/document/d/1DngSuLXvrFvLvtbOz46X3_6FeqfH95sogG80Z-pVbJM/edit',true,false,false,'{"conditional":"vehicle_uncollected"}'::jsonb),

('GRN','Goods Receiving Report',5,'purchasing','vendor','receiving','v1','https://docs.google.com/document/d/1dC3VEW4cZP12mvbB8926DQ3soe-W2yBQx-hD0-42fi0/edit',false,false,true,'{"conditional":"goods_received"}'::jsonb),
('RMA','Return-to-Vendor & RMA Record',5,'purchasing','vendor','returns','v1','https://docs.google.com/document/d/1GM4-9vBQX14kuGLygA3F4MOANIiXPjw90iMXMy4XQMM/edit',false,true,false,'{"conditional":"vendor_return"}'::jsonb),
('IAJ','Inventory Adjustment Record',5,'inventory','inventory','adjustment','v1','https://docs.google.com/document/d/1hcttozTeX4v_TTf1Cp-4uy2bHmT1niyX0jsKcXjoT9w/edit',false,false,true,'{"conditional":"inventory_adjustment"}'::jsonb),
('STR','Stock Transfer Record',5,'inventory','inventory','transfer','v1','https://docs.google.com/document/d/1awkGlMX9rz3yDjExdiigWKrs9KEEzbcgTx2wdsP_RSA/edit',false,false,true,'{"conditional":"stock_transfer"}'::jsonb),

('CM','Credit Memo / Refund / Adjustment',6,'finance','account','adjustment','v1','https://docs.google.com/document/d/1WjboqPk0k0p_9DE-2Tvw_CHW6rnzclFg2r5iyPXLhrE/edit',false,true,false,'{"conditional":"financial_adjustment"}'::jsonb),
('DEP','Deposit Receipt',6,'finance','job','deposit','v1','https://docs.google.com/document/d/1xkZhOCp9kEBgBwKQDKpxm5KOBxER8fxWLDTO7T0swB4/edit',false,true,false,'{"conditional":"deposit_received"}'::jsonb),
('STM','Account Statement',6,'finance','account','statement','v1','https://docs.google.com/document/d/1TWIcZWafxAzuIHXvuoLu6pTHCuPIuYQAzP4MpwfR0j4/edit',false,true,false,'{"conditional":"account_statement"}'::jsonb),
('AP','Vendor Bill & AP Record',6,'finance','vendor','accounts_payable','v1','https://docs.google.com/document/d/1F4iDaixVEO8IWltyUahdUSup1qnW8Po0HFcGT-RhhLg/edit',false,false,true,'{"conditional":"vendor_bill"}'::jsonb),
('EXP','Expense Report',6,'finance','personnel','expense','v1','https://docs.google.com/document/d/1XLWh_OdgGfGmjIDk6anR2rqU3ai7cCihC29uMHrgFBc/edit',false,false,true,'{"conditional":"expense_report"}'::jsonb),

('DEV','Device & Credential Handoff',7,'connected_electronics','job','handoff','v1','https://docs.google.com/document/d/1P-0-2WMkvb5J8bJ0sOap6kDCLbkr6LhGv-zy0im8d3Q/edit',false,true,true,'{"conditional":"connected_device"}'::jsonb),
('SEC','Security & Immobilizer Handoff',7,'connected_electronics','job','handoff','v1','https://docs.google.com/document/d/1rpoSWPJU0CwUipbtN52u3Dl-09YPGAP5VkInVnwhb1U/edit',true,true,true,'{"conditional":"security_or_immobilizer"}'::jsonb),
('SUB','Subscription & Cellular Service Acknowledgement',7,'connected_electronics','job','handoff','v1','https://docs.google.com/document/d/1ga1hH_Jt2yEu7Bb9fYuezH68_xOZtFDlHPFiSb-SAWo/edit',true,true,true,'{"conditional":"subscription_or_cellular"}'::jsonb),

('MSA','Master Service Agreement',8,'b2b','account','account_setup','v0.1','https://docs.google.com/document/d/1pQ7Ahy3HYj0ehPFlYBxqYr3smQIVPCh1Xzmu2YY3C-Q/edit',true,true,true,'{"conditional":"commercial_account"}'::jsonb),
('CCA','Commercial Account & Credit Application',8,'b2b','account','credit_setup','v0.1','https://docs.google.com/document/d/1Tjz5oDBpHg4qNknb55h4Y1yObR047oqmvDXf9cKvOZc/edit',true,true,true,'{"conditional":"credit_terms_requested"}'::jsonb),
('FWA','Fleet Vehicle Work Authorization',8,'b2b','job','authorization','v1','https://docs.google.com/document/d/11YzBT6bWGG5LIQ9iiqtE3MV7xKAajf08TrUV1XXA7Zk/edit',false,true,false,'{"conditional":"fleet_job"}'::jsonb),
('DRO','Dealer Work Order & RO Reference',8,'b2b','job','dealer_intake','v1','https://docs.google.com/document/d/1KXifIRFiaqC0UBSiR5w4HQqaaKhWbrX7g98LZmCKJY8/edit',false,true,false,'{"conditional":"dealer_job"}'::jsonb),
('CSI','Monthly Statement & Consolidated Invoice',8,'b2b','account','billing','v1','https://docs.google.com/document/d/19T1E_gP-T1R4XO9eObSyhXJ7yC0N77hNStzhgnljv3k/edit',false,true,false,'{"conditional":"consolidated_billing"}'::jsonb),
('SLA','Service Level Agreement',8,'b2b','account','account_setup','v0.1','https://docs.google.com/document/d/1Lu5FWmZ34b3iRPtpcoGaC75EFAKpj651x-0yEuqMsu4/edit',true,true,true,'{"optional":true}'::jsonb),

('JDR','Job Audit & Document Register',9,'governance','job','audit','v1','https://docs.google.com/document/d/1S9muGgKi9S94ilosfHWmKF0GOeB1oX-lS7Tw12cqg_Y/edit',false,false,false,'{"system_native":true}'::jsonb),
('DVR','Document Version Register',9,'governance','system','governance','v1','https://docs.google.com/document/d/1LbH2tx2aAa5WmoSPl_4hqM0i2d1qDZ0XxJ8p7zU9GC8/edit',false,false,false,'{"system_native":true}'::jsonb),
('TSA','Technician Sign-Off & Accountability Record',9,'governance','job','technician_closeout','v1','https://docs.google.com/document/d/1tlgqStRhlhLC1LmpewgjwyO8BMWO1NlYahVhpbH1msc/edit',false,false,true,'{"system_native":true}'::jsonb),
('SER','Safety & Exception Report',9,'governance','system','exception','v1','https://docs.google.com/document/d/1riumtYPylsTf_ZGuPyLxlzU7OeWIq4Qf75B_N0uYePA/edit',false,false,false,'{"system_native":true}'::jsonb),
('TRN','Training & Competency Record',9,'governance','personnel','training','v1','https://docs.google.com/document/d/1cj4DSJcWxZw9d6Q7sks4ss8dvNsrAL8K2jYfshwRcnA/edit',false,false,true,'{"system_native":true}'::jsonb)
) as v(code,title,wave,category,scope_type,trigger_stage,current_version,template_url,legal_review_required,customer_facing,requires_signature,metadata)
on conflict(organization_id,code) do update set
  title=excluded.title,
  wave=excluded.wave,
  category=excluded.category,
  scope_type=excluded.scope_type,
  trigger_stage=excluded.trigger_stage,
  current_version=excluded.current_version,
  template_url=excluded.template_url,
  legal_review_required=excluded.legal_review_required,
  customer_facing=excluded.customer_facing,
  requires_signature=excluded.requires_signature,
  metadata=excluded.metadata,
  updated_at=now();

notify pgrst,'reload schema';
