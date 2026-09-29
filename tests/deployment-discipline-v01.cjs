'use strict';

const fs=require('fs');
const assert=require('assert');

const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const e2e=fs.readFileSync('.github/workflows/ttt-browser-e2e.yml','utf8');
const regression=fs.readFileSync('.github/workflows/ttt-regression.yml','utf8');
const auth=fs.readFileSync('tests/e2e/authenticated-core-lifecycle.spec.cjs','utf8');
const publicSmoke=fs.readFileSync('tests/e2e/public-smoke.spec.cjs','utf8');

const tests=[
  ['feature-branch Vercel deployments are disabled',()=>assert.strictEqual(vercel.git?.deploymentEnabled?.['*'],false)],
  ['main production deployment remains enabled',()=>assert.strictEqual(vercel.git?.deploymentEnabled?.main,true)],
  ['Vercel production build is gated by pre-deploy checks',()=>assert.strictEqual(vercel.buildCommand,'node tests/predeploy-gate-v01.cjs')],
  ['Vercel still serves the static repository root',()=>assert.strictEqual(vercel.outputDirectory,'.')],
  ['GitHub regression runs the same pre-deploy gate',()=>assert(regression.includes('node tests/predeploy-gate-v01.cjs'))],
  ['GitHub regression uses the real production-readiness test path',()=>assert(regression.includes('node tests/regression-production-readiness-v01.cjs'))],
  ['browser E2E runs on deployment status',()=>assert(e2e.includes('deployment_status:'))],
  ['successful deployment status is sufficient to run E2E',()=>assert(e2e.includes("github.event.deployment_status.state == 'success'")&&!e2e.includes("github.event.deployment.ref == 'main'"))],
  ['browser E2E does not call Vercel deploy',()=>assert(!/vercel\s+(deploy|--prod|promote)/i.test(e2e))],
  ['public smoke verifies current runtime bootstrap',()=>assert(publicSmoke.includes('window.TTTCRM')&&publicSmoke.includes('window.TTTTessaAdmin')&&publicSmoke.includes('window.TTTWebsiteAnalytics'))],
  ['authenticated E2E requires repository secrets',()=>assert(auth.includes('TTT_E2E_EMAIL')&&auth.includes('TTT_E2E_PASSWORD'))],
  ['authenticated E2E cleans synthetic records by archiving',()=>assert(auth.includes("from('jobs').update({ archived_at: stamp")&&auth.includes("from('work_orders').update({ archived_at: stamp"))]
];

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){console.error('FAIL',name);console.error(err.message);process.exitCode=1;}
}
console.log('\n'+passed+'/'+tests.length+' deployment-discipline tests passed.');
if(passed!==tests.length)process.exit(1);
