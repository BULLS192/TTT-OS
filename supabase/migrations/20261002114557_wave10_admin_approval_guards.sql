
create or replace function private.guard_wave10_exception_approval()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='approved' and old.status is distinct from 'approved' then
    if not private.is_ttt_admin(new.organization_id) then
      raise exception 'Admin approval is required for workflow overrides' using errcode='42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := coalesce(new.approved_at,now());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists workflow_exceptions_admin_approval on public.workflow_exceptions;
create trigger workflow_exceptions_admin_approval
before update on public.workflow_exceptions
for each row execute function private.guard_wave10_exception_approval();

create or replace function private.guard_wave10_template_release()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_table_name='document_template_versions' then
    if new.status='approved' and old.status is distinct from 'approved' then
      if not private.is_ttt_admin(new.organization_id) then
        raise exception 'Admin approval is required to release a document template version' using errcode='42501';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := coalesce(new.approved_at,now());
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  elsif tg_table_name='document_templates' then
    if new.release_status='approved' and old.release_status is distinct from 'approved' then
      if not private.is_ttt_admin(new.organization_id) then
        raise exception 'Admin approval is required to release a document template' using errcode='42501';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists document_template_versions_release_guard on public.document_template_versions;
create trigger document_template_versions_release_guard
before update on public.document_template_versions
for each row execute function private.guard_wave10_template_release();

drop trigger if exists document_templates_release_guard on public.document_templates;
create trigger document_templates_release_guard
before update on public.document_templates
for each row execute function private.guard_wave10_template_release();
