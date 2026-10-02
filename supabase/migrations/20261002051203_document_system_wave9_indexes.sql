
create index if not exists documents_vehicle_idx
  on public.documents(organization_id,vehicle_id)
  where vehicle_id is not null and archived_at is null;
create index if not exists documents_supersedes_idx
  on public.documents(organization_id,supersedes_id)
  where supersedes_id is not null;
