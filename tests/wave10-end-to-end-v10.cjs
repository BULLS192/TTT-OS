'use strict';

const fs=require('fs');
const assert=require('assert');
const rules=require('../wave10-rules-v10.js');

const index=fs.readFileSync('index.html','utf8');
const wave=fs.readFileSync('wave10-automation-v10.js','utf8');
const docs=fs.readFileSync('document-system-v09.js','utf8');
const workflow=fs.readFileSync('workflow-automation-v10.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002113614_wave10_document_artifacts_invoice_automation.sql','utf8');
const guards=fs.readdirSync('supabase/migrations').filter(x=>x.includes('wave10_admin_approval_guards')).map(x=>fs.readFileSync('supabase/migrations/'+x,'utf8')).join('\n');
const pdf=fs.readFileSync('supabase/functions/ttt-document-pdf/index.ts','utf8');

const checks=[
  ['Wave 10 scripts are loaded',()=>{assert(index.includes('wave10-rules-v10.js'));assert(index.includes('wave10-automation-v10.js'));}],
  ['canonical artifact table exists',()=>assert(migration.includes('create table if not exists public.document_artifacts'))],
  ['canonical artifact bucket is private',()=>assert(migration.includes("values('document-artifacts','document-artifacts',false"))],
  ['invoice generation RPC exists',()=>assert(migration.includes('create_invoice_from_job'))],
  ['payment trigger updates invoice balances',()=>assert(migration.includes('trg_payments_sync_invoice'))],
  ['canonical PDF Edge Function requires finalization',()=>assert(pdf.includes('Only finalized documents can receive a canonical PDF'))],
  ['canonical PDF is hashed',()=>assert(pdf.includes('crypto.subtle.digest("SHA-256",bytes)'))],
  ['Customer Approval Center has explicit acknowledgement',()=>assert(docs.includes('doc09ApprovalAck'))],
  ['approval preserves source-specific snapshots',()=>assert(docs.includes("const frozen={...(record.snapshot||{}),...snapshot(j,t)}"))],
  ['approval generates canonical PDF',()=>assert(docs.includes('ensureCanonicalPdf(record.id,false)'))],
  ['approved exceptions are recognized by workflow gates',()=>assert(workflow.includes("approvedOverride?.(j.id,code)"))],
  ['database requires admin for override approval',()=>assert(guards.includes('Admin approval is required for workflow overrides'))],
  ['legal release guard exists',()=>assert(guards.includes('Admin approval is required to release a document template'))],
  ['unreleased legal templates cannot be customer-delivered',()=>assert(wave.includes('not released for customer delivery yet'))],
  ['handover package is implemented',()=>assert(wave.includes('CUSTOMER HANDOVER PACKAGE'))],
  ['payment entry creates receipt workflow',()=>assert(wave.includes('Record Payment & Generate Receipt'))],
  ['Compliance Dashboard v2 action queue exists',()=>assert(wave.includes('WAVE 10 CONTROL LAYER'))]
];

const retail=rules.scenario('retail');
const retailCodes=rules.requiredForStage(retail);
checks.push(['Simulation A — retail tint/audio lifecycle',()=>{
  for(const code of ['Q','CHK','AUTH','WO','QC','INV','COMP','RCPT','WAR','TINT'])assert(retailCodes.includes(code),code+' missing');
}]);

const diagnostic=rules.scenario('diagnostic');
const diagnosticCodes=rules.requiredForStage(diagnostic);
checks.push(['Simulation B — SignalTrace diagnostic-to-repair lifecycle',()=>{
  for(const code of ['Q','CHK','AUTH','WO','QC','INV','COMP','RCPT','WAR','DIA','DFR'])assert(diagnosticCodes.includes(code),code+' missing');
}]);

const fleet=rules.scenario('fleet');
const fleetCodes=rules.requiredForStage(fleet);
checks.push(['Simulation C — dealer/fleet GPS-security lifecycle',()=>{
  for(const code of ['Q','CHK','AUTH','WO','QC','INV','COMP','RCPT','WAR','DEV','SUB','SEC','FWA','DRO'])assert(fleetCodes.includes(code),code+' missing');
}]);

checks.push(['Payment simulation — partial then full',()=>{
  const inv={total:1000};
  const partial=rules.financialSummary(inv,[{amount:250,status:'received'}]);
  assert.strictEqual(partial.balance,750);assert.strictEqual(partial.isPaid,false);
  const full=rules.financialSummary(inv,[{amount:250,status:'received'},{amount:750,status:'received'}]);
  assert.strictEqual(full.balance,0);assert.strictEqual(full.isPaid,true);
}]);

let passed=0;
for(const [name,fn] of checks){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){console.error('FAIL',name);console.error(err.message);process.exitCode=1;}
}
console.log('\n'+passed+'/'+checks.length+' Wave 10 checks passed.');
if(passed!==checks.length)process.exit(1);
