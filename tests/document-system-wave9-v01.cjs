const fs=require('fs');
const vm=require('vm');

function ok(cond,msg){if(!cond)throw new Error(msg)}
const js=fs.readFileSync('document-system-v09.js','utf8');
const css=fs.readFileSync('document-system-v09.css','utf8');
const index=fs.readFileSync('index.html','utf8');

new vm.Script(js,{filename:'document-system-v09.js'});
ok(index.includes('document-system-v09.css'),'document system stylesheet is not loaded');
ok(index.includes('document-system-v09.js'),'document system runtime is not loaded');
ok(js.includes(".from('document_templates')"),'must use canonical document_templates registry');
ok(js.includes(".from('documents')"),'must use canonical documents table');
ok(!js.includes('document_records'),'parallel document_records store must not be introduced');
ok(js.includes("rpc('next_ttt_document_number'"),'must use canonical atomic document numbering');
ok(js.includes("document_status:'finalized'"),'finalized state is not written');
ok(js.includes('content_hash:contentHash'),'finalized documents must retain a content hash');
ok(js.includes("closest?.('#v05AuthorizeBtn, #authorizeBtn')"),'customer authorization workflow is not gated');
for(const area of ['Front','Rear','Driver Side / Left','Passenger Side / Right','Front Interior','Dashboard / Mileage']){
  ok(js.includes("'"+area+"'"),'required authorization photo area missing: '+area);
}
ok(js.includes('condition_photo_set:photoSet'),'authorization snapshot must retain exact photo set');
ok(js.includes("storage.from('job-media').upload"),'digital signature is not persisted to private job media');
ok(css.includes('.docsys-photo-grid'),'photo evidence layout missing');
console.log('document-system-wave9: PASS');