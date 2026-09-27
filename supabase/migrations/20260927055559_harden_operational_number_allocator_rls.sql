alter table private.operational_number_sequences enable row level security;

grant usage on schema private to authenticated;
grant select, insert, update on table private.operational_number_sequences to authenticated;

create policy operational_numbers_member_select
on private.operational_number_sequences
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = operational_number_sequences.organization_id
      and p.active = true
  )
);

create policy operational_numbers_member_insert
on private.operational_number_sequences
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = operational_number_sequences.organization_id
      and p.active = true
  )
);

create policy operational_numbers_member_update
on private.operational_number_sequences
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = operational_number_sequences.organization_id
      and p.active = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = operational_number_sequences.organization_id
      and p.active = true
  )
);

alter function public.next_ttt_operational_number(uuid,text) security invoker;
