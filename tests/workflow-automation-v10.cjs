'use strict';

const fs=require('fs');
const assert=require('assert');

const index=fs.readFileSync('index.html','utf8');
const automation=fs.readFileSync('workflow-automation-v10.js','utf8');
const documents=fs.readFileSync('document-system-v09.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002073620_workflow_automation_depth_v1.sql','utf8');
const uniqueness=fs.readFileSync('supabase/migrations/20261002073902_document_source_uniqueness_v1.sql','utf8');
const leastPrivilege=fs.readFileSync('supabase/migrations/20261002075215_workflow_automation_least_privilege_v1.sql','utf8');

const checks=[
  ['workflow automation JS is loaded',()=>assert(index.includes('workflow-automation-v10.js'))],
  ['workflow automation CSS is loaded',()=>assert(index.includes('workflow-automation-v10.css'))],
  ['controlled document generator exists',()=>assert(automation.includes('async function ensureDocument'))],
  ['cross-module reconciliation exists',()=>assert(automation.includes('async function reconcileAll'))],
  ['job action gates exist',()=>assert(automation.includes('async function gateJobAction'))],
  ['SignalTrace diagnostic workflow exists',()=>assert(automation.includes('SCAN → ISOLATE → TRACE → VERIFY → RESOLVE'))],
  ['document delivery logging exists',()=>assert(automation.includes('async function logDelivery'))],
  ['compliance dashboard exists',()=>assert(automation.includes('Compliance & Workflow'))],
  ['customer authorization gate is enforced',()=>assert(automation.includes("action==='authorize'"))],
  ['QC gate is enforced',()=>assert(automation.includes("action==='leave_qc'"))],
  ['handover gate is enforced',()=>assert(automation.includes("action==='deliver'"))],
  ['document system does not write invalid generated status',()=>assert(!documents.includes("document_status:'generated'"))],
  ['signature-controlled docs use pending_signature',()=>assert(documents.includes("t.requires_signature?'pending_signature':'draft'"))],
  ['diagnostic cases table exists',()=>assert(migration.includes('create table if not exists public.diagnostic_cases'))],
  ['document delivery table exists',()=>assert(migration.includes('create table if not exists public.document_deliveries'))],
  ['workflow exception table exists',()=>assert(migration.includes('create table if not exists public.workflow_exceptions'))],
  ['new tables have RLS',()=>assert((migration.match(/enable row level security/g)||[]).length>=3)],
  ['new tables have explicit authenticated grants',()=>assert((migration.match(/grant select,insert,update/g)||[]).length>=3)],
  ['anon access is revoked',()=>assert((migration.match(/revoke all .* from anon/g)||[]).length>=3)],
  ['document source uniqueness is enforced',()=>assert(uniqueness.includes('documents_source_unique_uq'))],
  ['authenticated workflow grants are least privilege',()=>assert(leastPrivilege.includes('revoke all on public.diagnostic_cases from authenticated')&&leastPrivilege.includes('grant select,insert,update on public.diagnostic_cases to authenticated'))]
];

let passed=0;
for(const [name,fn] of checks){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){console.error('FAIL',name);console.error(err.message);process.exitCode=1;}
}
console.log('\n'+passed+'/'+checks.length+' workflow-automation checks passed.');
if(passed!==checks.length)process.exit(1);
