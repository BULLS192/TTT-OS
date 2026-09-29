create table if not exists public.login_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  display_name text not null default '',
  event_type text not null default 'login' check (event_type in ('login','logout','session_refresh','failed_login')),
  result text not null default 'success' check (result in ('success','failed')),
  occurred_at timestamptz not null default now(),
  ip_address text,
  city text,
  region text,
  country_code text,
  timezone text,
  user_agent text,
  device_label text,
  network text,
  client_device_id text,
  source text not null default 'ttt_os',
  source_request_id text,
  risk_level text not null default 'normal' check (risk_level in ('normal','review','high')),
  risk_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists login_activity_org_occurred_idx
  on public.login_activity(organization_id, occurred_at desc);
create index if not exists login_activity_user_occurred_idx
  on public.login_activity(user_id, occurred_at desc);
create unique index if not exists login_activity_source_request_unique
  on public.login_activity(source_request_id)
  where source_request_id is not null;

alter table public.login_activity enable row level security;
revoke all on table public.login_activity from anon;
grant select, insert on table public.login_activity to authenticated;

drop policy if exists login_activity_select_self_or_admin on public.login_activity;
create policy login_activity_select_self_or_admin
on public.login_activity
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = login_activity.organization_id
      and p.active = true
      and p.role = 'owner_admin'
  )
);

drop policy if exists login_activity_insert_self on public.login_activity;
create policy login_activity_insert_self
on public.login_activity
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = login_activity.organization_id
      and p.active = true
  )
);

insert into public.login_activity
(organization_id,user_id,user_email,display_name,event_type,result,occurred_at,ip_address,city,region,country_code,timezone,user_agent,device_label,network,source,source_request_id,risk_level,risk_reason,metadata)
values
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-25T03:46:57Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0d6ac-62fe-747f-86ae-6bf1111e5497','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-25T03:50:03Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (iPad; CPU OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.24 Mobile/15E148 Safari/604.1','iPad · Chrome 153','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0d6af-38d6-7cb9-bbb3-ac0c1710fe39','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-25T04:01:09Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0d6b9-6404-788a-843a-b2cb3654e2fa','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-25T09:09:25Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (iPad; CPU OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.24 Mobile/15E148 Safari/604.1','iPad · Chrome 153','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0d7d3-9cfc-7117-9c6f-b46d7129ce11','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-26T09:47:54Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (iPad; CPU OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.8037.55 Mobile/15E148 Safari/604.1','iPad · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0dd1d-3693-767f-ab7f-92586d7ad750','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','4e604243-3bdf-4ae7-84e3-42e529755a2f','kevinbullsyap@gmail.com','Kevin Yap','login','success','2026-09-26T09:47:56Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (iPad; CPU OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.8037.55 Mobile/15E148 Safari/604.1','iPad · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0dd1d-3f9b-7b38-9309-0bacc8be7034','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','f5d747a3-ed2e-40ae-b7e4-fb380cb1e72a','amjad.alkharoof@gmail.com','Amjad Kharoof','login','success','2026-09-27T00:09:07Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0e031-afad-7098-89a6-33dd1f0499c8','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','f5d747a3-ed2e-40ae-b7e4-fb380cb1e72a','amjad.alkharoof@gmail.com','Amjad Kharoof','login','success','2026-09-27T00:09:10Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0e031-badb-7d90-a67f-9595f571fc62','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','f5d747a3-ed2e-40ae-b7e4-fb380cb1e72a','amjad.alkharoof@gmail.com','Amjad Kharoof','login','success','2026-09-27T00:09:11Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0e031-bbb2-7eb2-8339-7867eed5a80b','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','19a79916-3251-4a4d-96de-6c07684b2d7d','dtnice123@gmail.com','Derek Thompson','login','success','2026-09-27T00:09:37Z','58.182.114.229','Ulu Bedok',null,'SG','Asia/Singapore','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','Windows · Chrome 154','StarHub Cable Vision Ltd Singapore Broadband Access Provider','supabase_history_import','01a0e032-22c8-7ee3-a4bf-4a1317ffc6d1','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb),
('f31450b1-b8b8-42a2-805c-27a564dfe61e','f5d747a3-ed2e-40ae-b7e4-fb380cb1e72a','amjad.alkharoof@gmail.com','Amjad Kharoof','login','success','2026-09-27T04:37:53Z','73.77.9.116','Houston','Texas','US','America/Chicago','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Safari/605.1.15','macOS · Safari 26.6.1','Comcast IP Services, L.L.C.','supabase_history_import','01a0e127-bcef-75cb-93fc-05041bcc8abf','normal','Imported from Supabase Auth + Edge logs','{"historical_import":true}'::jsonb)
on conflict do nothing;
