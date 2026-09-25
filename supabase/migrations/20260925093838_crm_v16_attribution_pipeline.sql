alter table public.leads
  add column if not exists source_detail text,
  add column if not exists referral_contact_id text,
  add column if not exists referral_company_id text,
  add column if not exists referral_name text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

update public.opportunities
set
  stage = case lower(coalesce(stage,''))
    when 'identified' then 'prospecting'
    when 'researching' then 'prospecting'
    when 'contacted' then 'discovery'
    when 'evaluating' then 'evaluation'
    when 'quoted' then 'proposal'
    when 'negotiating' then 'proposal'
    when 'won' then 'closed_won'
    when 'lost' then 'closed_loss'
    else stage
  end,
  probability_pct = case lower(coalesce(stage,''))
    when 'identified' then 10
    when 'researching' then 10
    when 'contacted' then 20
    when 'evaluating' then 35
    when 'quoted' then 50
    when 'negotiating' then 50
    when 'won' then 100
    when 'lost' then 0
    else probability_pct
  end
where lower(coalesce(stage,'')) in ('identified','researching','contacted','evaluating','quoted','negotiating','won','lost');

alter table public.opportunities
  alter column stage set default 'prospecting',
  alter column probability_pct set default 10;

create index if not exists leads_org_source_idx on public.leads(organization_id,source) where archived_at is null;
create index if not exists leads_org_campaign_idx on public.leads(organization_id,campaign) where archived_at is null;
create index if not exists leads_org_referral_contact_idx on public.leads(organization_id,referral_contact_id) where referral_contact_id is not null and archived_at is null;
create index if not exists opportunities_org_stage_idx on public.opportunities(organization_id,stage) where archived_at is null;
