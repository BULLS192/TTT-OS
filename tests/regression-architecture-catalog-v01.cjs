'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert');

const ROOT=path.resolve(__dirname,'..');
const SELF=path.resolve(__filename);
const EXTENSIONS=new Set(['.js','.html','.md','.sql','.yml','.yaml','.json','.txt']);

function sourceFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...sourceFiles(full));
    else if(EXTENSIONS.has(path.extname(entry.name).toLowerCase())&&path.resolve(full)!==SELF)out.push(full);
  }
  return out;
}

const retiredPatterns=[
  /google\s+(workspace|drive|sheets?)/i,
  /apps?\s*script/i,
  /(back\s*up|backup).{0,60}google/i,
  /google.{0,60}(back\s*up|backup)/i,
  /workspace.{0,40}(bridge|mirror|sync|backup)/i,
  /(bridge|mirror|sync|backup).{0,40}workspace/i
];

const offenders=[];
for(const file of sourceFiles(ROOT)){
  const text=fs.readFileSync(file,'utf8');
  for(const pattern of retiredPatterns){
    if(pattern.test(text)){
      offenders.push(path.relative(ROOT,file)+': '+pattern);
      break;
    }
  }
}
assert.deepStrictEqual(offenders,[], 'Retired Google/Workspace architecture references found:\n'+offenders.join('\n'));

const catalogText=fs.readFileSync(path.join(ROOT,'product-catalog-v13.js'),'utf8');
const match=catalogText.match(/const PRODUCTS=(\[.*\]);\n  window\.TTTProductCatalog/s);
assert(match,'Supplier catalog PRODUCTS payload was not found');
const products=JSON.parse(match[1]);
const blackVue=products.filter(p=>p.brand==='BlackVue').length;
const jlAudio=products.filter(p=>p.brand==='JL Audio').length;
const unique=new Set(products.map(p=>[p.brand,p.model,p.variant,p.sku,p.sourceFile].join('|'))).size;

assert.strictEqual(products.length,940,'Raw supplier catalog must remain 940 rows');
assert.strictEqual(unique,862,'Canonical supplier-item identity count must remain 862');
assert.strictEqual(blackVue,84,'BlackVue source rows must remain 84');
assert.strictEqual(jlAudio,856,'JL Audio source rows must remain 856');

console.log('PASS retired Google/Workspace architecture scan');
console.log('PASS supplier catalog counts: 940 raw / 862 unique / 84 BlackVue / 856 JL Audio');
