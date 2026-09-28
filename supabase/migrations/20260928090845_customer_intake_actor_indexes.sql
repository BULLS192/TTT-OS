create index if not exists customer_intakes_reviewed_by_idx
  on public.customer_intakes(reviewed_by)
  where reviewed_by is not null;

create index if not exists customer_intakes_converted_by_idx
  on public.customer_intakes(converted_by)
  where converted_by is not null;
