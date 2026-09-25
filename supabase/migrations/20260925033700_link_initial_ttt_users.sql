-- Link the three initial TTT OS logins to their personnel records.
-- The auth users are looked up by email so generated UUIDs are not hard-coded.
update public.profiles p
set display_name='Kevin Yap',
    email='kevinbullsyap@gmail.com',
    person_id='per_kevin',
    role='owner_admin',
    roles=array['owner_admin'],
    active=true,
    updated_at=now()
from auth.users u
where p.user_id=u.id and lower(u.email)=lower('kevinbullsyap@gmail.com');

update public.profiles p
set display_name='Derek Thompson',
    email='dtnice123@gmail.com',
    person_id='per_derek',
    role='partner',
    roles=array['partner'],
    active=true,
    updated_at=now()
from auth.users u
where p.user_id=u.id and lower(u.email)=lower('dtnice123@gmail.com');

update public.profiles p
set display_name='Amjad Kharoof',
    email='amjad.alkharoof@gmail.com',
    person_id='per_amjad',
    role='partner',
    roles=array['partner'],
    active=true,
    updated_at=now()
from auth.users u
where p.user_id=u.id and lower(u.email)=lower('amjad.alkharoof@gmail.com');


-- Admin-only profile management. Kevin is the sole owner_admin in the initial profile mapping.
create or replace function private.is_ttt_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id=(select auth.uid())
      and p.organization_id=target_org
      and p.active=true
      and p.role='owner_admin'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_ttt_admin(uuid) to authenticated;

create policy profiles_admin_select
on public.profiles
for select
to authenticated
using (private.is_ttt_admin(organization_id));

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (private.is_ttt_admin(organization_id))
with check (private.is_ttt_admin(organization_id));
