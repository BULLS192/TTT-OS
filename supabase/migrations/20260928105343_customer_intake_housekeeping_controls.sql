alter table public.customer_intakes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_reason text;

create index if not exists customer_intakes_archived_by_idx
  on public.customer_intakes(archived_by)
  where archived_by is not null;

revoke update on table public.customer_intakes from authenticated;
grant select, update, delete on table public.customer_intakes to authenticated;

drop policy if exists customer_intakes_member_update on public.customer_intakes;
drop policy if exists customer_intakes_admin_delete on public.customer_intakes;

create policy customer_intakes_member_update
  on public.customer_intakes
  for update
  to authenticated
  using (
    private.is_ttt_member(organization_id)
    and (status <> 'archived' or private.is_ttt_admin(organization_id))
  )
  with check (
    private.is_ttt_member(organization_id)
    and (status <> 'archived' or private.is_ttt_admin(organization_id))
  );

create policy customer_intakes_admin_delete
  on public.customer_intakes
  for delete
  to authenticated
  using (
    private.is_ttt_admin(organization_id)
    and status <> 'converted'
    and converted_job_id is null
  );
