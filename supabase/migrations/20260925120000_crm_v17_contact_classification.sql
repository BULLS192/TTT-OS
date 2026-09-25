alter table public.contacts
  add column if not exists contact_type text not null default 'other';

update public.contacts c
set contact_type = case
  when exists (
    select 1 from public.leads l
    where l.organization_id = c.organization_id
      and l.contact_id = c.id
      and l.archived_at is null
  ) or exists (
    select 1 from public.opportunities o
    where o.organization_id = c.organization_id
      and o.contact_id = c.id
      and o.archived_at is null
  ) then 'prospect'
  when exists (
    select 1 from public.companies co
    where co.organization_id = c.organization_id
      and co.id = c.company_id
      and lower(coalesce(co.primary_type,'')) like '%distributor%'
  ) then 'distributor'
  when exists (
    select 1 from public.companies co
    where co.organization_id = c.organization_id
      and co.id = c.company_id
      and lower(coalesce(co.primary_type,'')) like '%supplier%'
  ) then 'supplier'
  when exists (
    select 1 from public.companies co
    where co.organization_id = c.organization_id
      and co.id = c.company_id
      and (
        lower(coalesce(co.primary_type,'')) like '%vendor%'
        or lower(coalesce(co.primary_type,'')) like '%representative%'
      )
  ) then 'vendor'
  when exists (
    select 1 from public.companies co
    where co.organization_id = c.organization_id
      and co.id = c.company_id
      and lower(coalesce(co.primary_type,'')) like '%partner%'
  ) then 'partner'
  when exists (
    select 1 from public.companies co
    where co.organization_id = c.organization_id
      and co.id = c.company_id
      and (
        lower(coalesce(co.primary_type,'')) like '%customer%'
        or lower(coalesce(co.primary_type,'')) like '%client%'
      )
  ) then 'customer'
  else 'other'
end
where contact_type = 'other';

create index if not exists contacts_org_contact_type_idx
  on public.contacts (organization_id, contact_type)
  where archived_at is null;
