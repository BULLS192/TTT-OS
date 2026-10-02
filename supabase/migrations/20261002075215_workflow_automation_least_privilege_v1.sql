revoke all on public.diagnostic_cases from authenticated;
revoke all on public.document_deliveries from authenticated;
revoke all on public.workflow_exceptions from authenticated;

grant select,insert,update on public.diagnostic_cases to authenticated;
grant select,insert,update on public.document_deliveries to authenticated;
grant select,insert,update on public.workflow_exceptions to authenticated;
