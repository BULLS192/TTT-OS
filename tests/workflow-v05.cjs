// Run: NODE_PATH=/path/to/node_modules node tests/workflow-v05.cjs
const {JSDOM}=require('jsdom');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const files=['app.js','checkin-v02.js','workflow-v03.js','google-sync-v02.js','document-preview-v04.js','workflow-v05.js'];
function boot(saved){const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://test.invalid',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.scrollTo=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});w.fetch=async()=>({ok:true,json:async()=>({Results:[]})});if(saved)for(const [k,v]of Object.entries(saved))w.localStorage.setItem(k,v);for(const f of files)require('node:vm').runInContext(fs.readFileSync(path.join(root,f),'utf8'),dom.getInternalVMContext(),{filename:f});return dom;}
(async()=>{
let dom=boot();let w=dom.window;
// Read-only initialization must not write a replacement database or connection.
assert.equal(w.localStorage.getItem('ttt-os-v0.2'),null);
w.eval("openJob('J-260911-002')");assert.ok(w.document.querySelector('#workExecutionForm'));assert.ok(w.document.querySelector('#documentCenter'));
assert.equal(w.localStorage.getItem('ttt-os-v0.2'),null);
const d=w.TTTV05Data;assert.equal(d.originalTotal({quote:{snapshot:{estimateTotal:0}},estimateTotal:999}),0);
// Prepare synthetic legacy records, including arbitrary unknown properties and media.
let fixture=w.eval('JSON.parse(JSON.stringify(db))');let j=fixture.jobs[0];j.status='Awaiting Final Authorization';j.checkIn={photos:[{name:'retained.jpg',group:'exterior'}],videos:[{name:'walkaround.mp4'}],conditionNotes:'Known scratch'};j.quote={id:'Q-TEST',status:'Approved',snapshot:{estimateTotal:2450,estimate:{parts:1750,labor:650,fees:50},services:['Audio'],equipment:[{category:'Audio',brand:'Test',model:'Amp',qty:1}],requestNotes:'Original scope'},approval:{id:'APR-TEST',signerName:'Test Customer',approvalMark:null}};j.unknownFutureField={keep:true};
const originalQuote=JSON.stringify(j.quote),originalCheckIn=JSON.stringify(j.checkIn);
const saved={'ttt-os-v0.2':JSON.stringify(fixture),'ttt-google-sync-endpoint-v1':'https://bridge.invalid/exec','ttt-google-sync-token-v1':'synthetic-test-token','ttt-google-auto-sync-v2':'false','ttt-google-sync-hashes-v2':'{"old":"hash"}'};
dom.window.close();dom=boot(saved);w=dom.window;
const $=s=>w.document.querySelector(s);const value=(s,v)=>{$(s).value=v;};
w.eval("openJob('J-260912-001')");$('#authorizeBtn').click();assert.equal(w.eval('job(currentJobId).workOrderId'),null);
value('#finalAuthName','Test Customer');$('#finalAuthCheck').checked=true;$('#authorizeBtn').click();
assert.equal(w.eval('job(currentJobId).finalAuthorization.termsVersion'),'0.5');assert.equal(w.eval('job(currentJobId).status'),'In Progress');
const wo=w.eval('job(currentJobId).workOrderId');assert.ok(wo);assert.equal(w.eval('job(currentJobId).workExecution.lines[0].model'),'Amp');
value('[name="serialNumber-0"]','SN-TEST');value('[name="installedLocation-0"]','Trunk');value('[name="laborHours-0"]','2.5');value('[name="status-0"]','Complete');$('#workExecutionForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(w.eval('job(currentJobId).workExecution.lines[0].serialNumber'),'SN-TEST');
value('#changeOrderForm [name="reason"]','Customer requested upgrade');value('#changeOrderForm [name="description"]','Add subwoofer');value('[name="partsDelta"]','100');value('[name="laborDelta"]','25');$('#changeOrderForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(w.eval('TTTV05Data.authorizedTotal(job(currentJobId))'),2450);
value('[data-approve-co] [name="signerName"]','Test Customer');$('[data-approve-co] [name="ack"]').checked=true;$('[data-approve-co]').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(w.eval('TTTV05Data.authorizedTotal(job(currentJobId))'),2575);assert.equal(w.eval('job(currentJobId).workExecution.lines.length'),2);
w.eval("setStatus('QC')");assert.equal(w.eval('job(currentJobId).status'),'In Progress');
assert.equal(w.eval('JSON.stringify(job(currentJobId).quote)'),originalQuote);assert.equal(w.eval('JSON.stringify(job(currentJobId).checkIn)'),originalCheckIn);
assert.equal(w.eval('job(currentJobId).unknownFutureField.keep'),true);
for(const key of Object.keys(saved).filter(k=>k!=='ttt-os-v0.2'))assert.equal(w.localStorage.getItem(key),saved[key]);
assert.ok($('#documentCenter'));assert.ok($('#sendQuoteGoogleBtn'));assert.ok($('#viewQuoteInOSBtn'));
w.TTTDocuments.generateInvoice(w.eval('job(currentJobId)'));assert.equal(w.eval('job(currentJobId).invoice.snapshot.total'),2575);assert.equal(w.eval('job(currentJobId).invoice.snapshot.estimate.parts'),1850);
for(const type of ['quote','checkin','workorder','invoice']){w.TTTDocuments.open(type,w.eval('job(currentJobId)'));assert.ok($('#documentViewerModal').classList.contains('open'));assert.ok($('#docViewerCanvas').innerHTML.length>100);w.TTTDocuments.close();}
// Verify the existing sync path transmits all v0.5 fields and handles edits made in flight.
let sent,release;w.fetch=async(url,options)=>{sent=JSON.parse(options.body);await new Promise(resolve=>{release=resolve});return {ok:true,text:async()=>JSON.stringify({ok:true,links:{jobFolderUrl:'https://drive.google.com/test'}})};};
const syncing=w.TTTSync.syncJob(w.eval('job(currentJobId)'));
assert.equal(sent.job.changeOrders[0].status,'Approved');assert.equal(sent.job.workExecution.lines[0].serialNumber,'SN-TEST');assert.equal(sent.token,'synthetic-test-token');
w.eval("job(currentJobId).workExecution.notes='Saved while syncing';save()"); release();await syncing; assert.equal(w.eval('job(currentJobId).syncState'),'queued');
const persisted=w.localStorage.getItem('ttt-os-v0.2');dom.window.close();dom=boot({...saved,'ttt-os-v0.2':persisted});w=dom.window;w.eval("openJob('J-260912-001')");assert.equal(w.eval('job(currentJobId).workOrderId'),wo);assert.equal(w.eval('TTTV05Data.authorizedTotal(job(currentJobId))'),2575);assert.equal(w.eval('job(currentJobId).workExecution.lines[0].installedLocation'),'Trunk');
dom.window.close();console.log('PASS: legacy data retention; authorization; execution; change orders; QC gate; invoice totals; four document previews; Google payload; reload persistence.');
})().catch(err=>{console.error(err);process.exit(1)});
