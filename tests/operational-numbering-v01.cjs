'use strict';

const fs=require('fs');
const assert=require('assert');

const core=fs.readFileSync('app-core.js','utf8');
const allocator=fs.readFileSync('supabase/migrations/20260927055502_atomic_job_work_order_numbers.sql','utf8');
const hardening=fs.readFileSync('supabase/migrations/20260927055559_harden_operational_number_allocator_rls.sql','utf8');

const tests=[
  ['job creation requests a server number',()=>assert(core.includes('allocateOperationalNumber("job")'))],
  ['work-order creation requests a server number',()=>assert(core.includes('allocateOperationalNumber("work_order")'))],
  ['allocator uses Supabase RPC',()=>assert(core.includes('cloud.client.rpc("next_ttt_operational_number"'))],
  ['job form waits for allocation',()=>assert(core.includes('document.getElementById("jobForm").onsubmit=async e=>'))],
  ['work-order authorization waits for allocation',()=>assert(core.includes('async function authorizeWork(j)'))],
  ['local job-count numbering is removed',()=>assert(!core.includes('db.jobs.length+1'))],
  ['local work-order-count numbering is removed',()=>assert(!core.includes('db.jobs.filter(x=>x.workOrderId).length+1'))],
  ['Derek is not a fallback audit actor',()=>assert(!core.includes('return "usr_derek"'))],
  ['private atomic sequence table exists in migration',()=>assert(allocator.includes('private.operational_number_sequences'))],
  ['allocator uses Houston business date',()=>assert(allocator.includes("America/Chicago"))],
  ['allocator increments with ON CONFLICT',()=>assert(/on conflict[\s\S]*last_number\s*=\s*private\.operational_number_sequences\.last_number\s*\+\s*1/i.test(allocator))],
  ['anonymous RPC execution is revoked',()=>assert(/revoke all on function public\.next_ttt_operational_number\(uuid,text\) from public, anon/i.test(allocator))],
  ['allocator is hardened to security invoker',()=>assert(/alter function public\.next_ttt_operational_number\(uuid,text\) security invoker/i.test(hardening))],
  ['private sequence table has RLS',()=>assert(/alter table private\.operational_number_sequences enable row level security/i.test(hardening))],
  ['member select insert and update policies exist',()=>assert(
    hardening.includes('operational_numbers_member_select')&&
    hardening.includes('operational_numbers_member_insert')&&
    hardening.includes('operational_numbers_member_update')
  )]
];

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){console.error('FAIL',name);console.error(err.message);process.exitCode=1;}
}
console.log('\n'+passed+'/'+tests.length+' operational-numbering tests passed.');
if(passed!==tests.length)process.exit(1);
