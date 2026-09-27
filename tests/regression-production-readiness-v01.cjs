'use strict';

const fs=require('fs');
const assert=require('assert');

const index=fs.readFileSync('index.html','utf8');
const core=fs.readFileSync('app-core.js','utf8');
const bootstrap=fs.readFileSync('app.js','utf8');

const tests=[
  ['production UI has no Reset demo control',()=>assert(!index.includes('Reset demo'))],
  ['production UI has no seedBtn element',()=>assert(!index.includes('id="seedBtn"'))],
  ['app core has no seedBtn handler',()=>assert(!core.includes('seedBtn'))],
  ['demo job J-260912-001 is not embedded',()=>assert(!core.includes('J-260912-001'))],
  ['demo job J-260911-002 is not embedded',()=>assert(!core.includes('J-260911-002'))],
  ['demo customer Jordan Lee is not embedded',()=>assert(!core.includes('Jordan Lee'))],
  ['demo customer Avery Martin is not embedded',()=>assert(!core.includes('Avery Martin'))],
  ['dashboard has no Derek-specific greeting',()=>assert(!index.includes('Good afternoon, Derek.'))],
  ['Supabase remains declared authoritative',()=>assert(index.includes('Supabase is the authoritative shared system of record'))],
  ['cloud sync remains loaded',()=>assert(bootstrap.includes('/cloud-sync.js'))],
  ['relational core remains loaded',()=>assert(bootstrap.includes('/core-relational-v05.js'))]
];

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){console.error('FAIL',name);console.error(err.message);process.exitCode=1;}
}
console.log('\n'+passed+'/'+tests.length+' production-readiness tests passed.');
if(passed!==tests.length)process.exit(1);
