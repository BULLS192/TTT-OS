-- Phase 2D: persist vehicle check-in evidence in private Supabase Storage.

create table public.job_media (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  job_id text not null,
  vehicle_id text,
  media_type text not null check (media_type in ('photo','video','document','other')),
  category text,
  area text,
  file_name text not null,
  mime text,
  size_bytes bigint,
  captured_at timestamptz,
  captured_by_user_id uuid references auth.users(id) on delete set null,
  storage_bucket text not null default 'job-media',
  storage_path text not null,
  storage_status text not null default 'uploaded',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,id),
  constraint job_media_job_fk foreign key (organization_id,job_id)
    references public.jobs(organization_id,id) on update cascade,
  constraint job_media_vehicle_fk foreign key (organization_id,vehicle_id)
    references public.vehicles(organization_id,id) on update cascade
);

create index job_media_org_job_idx on public.job_media(organization_id,job_id,captured_at desc);
create index job_media_org_vehicle_idx on public.job_media(organization_id,vehicle_id) where vehicle_id is not null;
create index job_media_captured_by_idx on public.job_media(captured_by_user_id);

alter table public.job_media enable row level security;
revoke all on public.job_media from anon;
grant select,insert,update on public.job_media to authenticated;

create policy job_media_member_select on public.job_media for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=job_media.organization_id and p.active=true));
create policy job_media_member_insert on public.job_media for insert to authenticated
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=job_media.organization_id and p.active=true));
create policy job_media_member_update on public.job_media for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=job_media.organization_id and p.active=true))
with check (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.organization_id=job_media.organization_id and p.active=true));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'job-media','job-media',false,52428800,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','application/octet-stream']
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "ttt job media select" on storage.objects for select to authenticated
using (
  bucket_id='job-media'
  and exists(select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1])
);

create policy "ttt job media insert" on storage.objects for insert to authenticated
with check (
  bucket_id='job-media'
  and exists(select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1])
);

create policy "ttt job media update" on storage.objects for update to authenticated
using (
  bucket_id='job-media'
  and exists(select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1])
)
with check (
  bucket_id='job-media'
  and exists(select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1])
);

create policy "ttt job media delete" on storage.objects for delete to authenticated
using (
  bucket_id='job-media'
  and exists(select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.organization_id::text=(storage.foldername(name))[1])
);

alter publication supabase_realtime add table public.job_media;
