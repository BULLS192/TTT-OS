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
