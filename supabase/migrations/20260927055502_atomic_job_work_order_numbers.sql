create table private.operational_number_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('job','work_order')),
  sequence_date date not null,
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, entity_type, sequence_date)
);

revoke all on table private.operational_number_sequences from public, anon, authenticated;

create or replace function public.next_ttt_operational_number(
  p_organization_id uuid,
  p_entity_type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_entity_type text := lower(trim(coalesce(p_entity_type,'')));
  v_business_date date := (now() at time zone 'America/Chicago')::date;
  v_next integer;
  v_prefix text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if v_entity_type not in ('job','work_order') then
    raise exception 'Unsupported operational number type: %', p_entity_type using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = v_user_id
      and p.organization_id = p_organization_id
      and p.active = true
  ) then
    raise exception 'Not authorized for organization' using errcode='42501';
  end if;

  v_prefix := case v_entity_type
    when 'job' then 'J'
    when 'work_order' then 'WO'
  end;

  insert into private.operational_number_sequences(
    organization_id, entity_type, sequence_date, last_number, updated_at
  )
  values (p_organization_id, v_entity_type, v_business_date, 1, now())
  on conflict (organization_id, entity_type, sequence_date)
  do update
    set last_number = private.operational_number_sequences.last_number + 1,
        updated_at = now()
  returning last_number into v_next;

  return v_prefix || '-' || to_char(v_business_date,'YYMMDD') || '-' || lpad(v_next::text,3,'0');
end;
$function$;

revoke all on function public.next_ttt_operational_number(uuid,text) from public, anon;
grant execute on function public.next_ttt_operational_number(uuid,text) to authenticated;
