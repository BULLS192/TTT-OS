drop policy if exists customer_intakes_admin_delete on public.customer_intakes;

create policy customer_intakes_admin_delete
  on public.customer_intakes
  for delete
  to authenticated
  using (
    private.is_ttt_admin(organization_id)
    and status = 'archived'
    and converted_job_id is null
  );
