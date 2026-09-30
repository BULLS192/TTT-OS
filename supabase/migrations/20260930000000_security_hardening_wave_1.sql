-- TTT-OS security hardening wave 1.
-- Applied to Supabase project qvqxcjmplyjgcbxlveec on 2026-09-30.

create table if not exists private.public_api_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
revoke all on table private.public_api_rate_limits from public, anon, authenticated;

alter table public.login_activity alter column user_id drop not null;

create or replace function public.check_public_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) < 1 or length(p_key) > 300 then return false; end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then return false; end if;

  insert into private.public_api_rate_limits(rate_key,window_start,request_count,updated_at)
  values(p_key,now(),1,now())
  on conflict(rate_key) do update set
    window_start=case
      when private.public_api_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds)
      then now() else private.public_api_rate_limits.window_start end,
    request_count=case
      when private.public_api_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds)
      then 1 else private.public_api_rate_limits.request_count+1 end,
    updated_at=now()
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;
revoke all on function public.check_public_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.check_public_api_rate_limit(text,integer,integer) to service_role;

create or replace function public.security_admin_snapshot()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'sessions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_id',s.id,'user_id',u.id,'email',u.email,
        'display_name',p.display_name,'role',p.role,
        'created_at',s.created_at,'updated_at',s.updated_at,'not_after',s.not_after,
        'ip',host(s.ip),'user_agent',s.user_agent,'aal',s.aal
      ) order by s.updated_at desc)
      from auth.sessions s
      join auth.users u on u.id=s.user_id
      left join public.profiles p on p.user_id=u.id
      where p.organization_id=(select id from public.organizations where slug='ttt' limit 1)
    ),'[]'::jsonb),
    'mfa',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.id,'email',u.email,'display_name',p.display_name,'role',p.role,
        'verified_factors',coalesce(f.verified_factors,0),
        'factor_types',coalesce(f.factor_types,'[]'::jsonb)
      ) order by p.display_name)
      from auth.users u
      join public.profiles p on p.user_id=u.id
      left join lateral (
        select count(*) filter(where mf.status='verified') as verified_factors,
               coalesce(jsonb_agg(distinct mf.factor_type) filter(where mf.status='verified'),'[]'::jsonb) as factor_types
        from auth.mfa_factors mf
        where mf.user_id=u.id
      ) f on true
      where p.organization_id=(select id from public.organizations where slug='ttt' limit 1)
    ),'[]'::jsonb),
    'rls',(
      select jsonb_build_object(
        'total_tables',count(*),
        'rls_enabled',count(*) filter(where c.relrowsecurity),
        'rls_disabled',count(*) filter(where not c.relrowsecurity),
        'disabled_tables',coalesce(jsonb_agg(c.relname order by c.relname) filter(where not c.relrowsecurity),'[]'::jsonb)
      )
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'
    ),
    'storage',(
      select jsonb_build_object(
        'bucket_count',count(*),
        'public_bucket_count',count(*) filter(where b.public),
        'public_buckets',coalesce(jsonb_agg(b.name order by b.name) filter(where b.public),'[]'::jsonb)
      )
      from storage.buckets b
    )
  );
$$;
revoke all on function public.security_admin_snapshot() from public,anon,authenticated;
grant execute on function public.security_admin_snapshot() to service_role;

create or replace function public.security_revoke_session(
  p_session_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target_user uuid;
  v_target_email text;
  v_org uuid;
begin
  select s.user_id,u.email into v_target_user,v_target_email
  from auth.sessions s
  join auth.users u on u.id=s.user_id
  where s.id=p_session_id;

  if v_target_user is null then
    return jsonb_build_object('ok',true,'already_revoked',true);
  end if;

  select organization_id into v_org
  from public.profiles
  where user_id=p_actor_user_id and active=true and role='owner_admin';

  if v_org is null then raise exception 'admin_required'; end if;

  delete from auth.sessions where id=p_session_id;

  insert into public.audit_events(
    organization_id,actor_user_id,entity_type,entity_id,action,metadata
  )
  values(
    v_org,p_actor_user_id,'auth_session',p_session_id::text,'security.session_revoked',
    jsonb_build_object('target_user_id',v_target_user,'target_email',v_target_email)
  );

  return jsonb_build_object('ok',true,'target_user_id',v_target_user,'target_email',v_target_email);
end;
$$;
revoke all on function public.security_revoke_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_revoke_session(uuid,uuid) to service_role;

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  loop
    execute format('drop policy if exists %I on public.%I','mfa_enforced_when_enrolled',r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
       using (
         array[(select auth.jwt()->>''aal'')] <@ (
           select case when count(id)>0 then array[''aal2''] else array[''aal1'',''aal2''] end
           from auth.mfa_factors
           where user_id=(select auth.uid()) and status=''verified''
         )
       )
       with check (
         array[(select auth.jwt()->>''aal'')] <@ (
           select case when count(id)>0 then array[''aal2''] else array[''aal1'',''aal2''] end
           from auth.mfa_factors
           where user_id=(select auth.uid()) and status=''verified''
         )
       )',
      'mfa_enforced_when_enrolled',r.relname
    );
  end loop;
end;
$$;

-- After public callers are confirmed on ttt-public-api, these SECURITY DEFINER
-- routines are callable only by the Edge Function service role.
do $$
declare r record;
begin
  for r in
    select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_tessa_knowledge_runtime',
        'log_tessa_question',
        'log_tessa_question_v2',
        'log_website_event',
        'log_website_event_v2',
        'submit_customer_intake',
        'submit_tessa_project_request'
      )
  loop
    execute 'revoke all on function '||r.signature||' from public,anon,authenticated';
    execute 'grant execute on function '||r.signature||' to service_role';
  end loop;
end;
$$;
