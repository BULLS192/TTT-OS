create unique index if not exists documents_source_unique_uq
on public.documents(organization_id,document_code,source_entity_type,source_entity_id)
where source_entity_id is not null and archived_at is null;
