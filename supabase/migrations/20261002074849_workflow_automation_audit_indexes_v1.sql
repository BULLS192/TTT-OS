create index if not exists diagnostic_cases_created_by_idx on public.diagnostic_cases(created_by) where created_by is not null;
create index if not exists diagnostic_cases_updated_by_idx on public.diagnostic_cases(updated_by) where updated_by is not null;
create index if not exists document_deliveries_created_by_idx on public.document_deliveries(created_by) where created_by is not null;
create index if not exists workflow_exceptions_created_by_idx on public.workflow_exceptions(created_by) where created_by is not null;
create index if not exists workflow_exceptions_updated_by_idx on public.workflow_exceptions(updated_by) where updated_by is not null;
create index if not exists workflow_exceptions_approved_by_idx on public.workflow_exceptions(approved_by) where approved_by is not null;
