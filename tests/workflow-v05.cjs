// Run: node tests/workflow-v05.cjs (requires Playwright).
// Synthetic records in an isolated browser context; never uses a user's profile.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'index.html':req.url.slice(1);
  if(!/^[\w.-]+$/.test(name)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TTT_BROWSER_CHANNEL?{channel:process.env.TTT_BROWSER_CHANNEL}:{})});
  const context=await browser.newContext(),page=await context.newPage(),origin=`http://127.0.0.1:${server.address().port}`;
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ttt-os-v0.2')),null);
  const retained=await page.evaluate(()=>{
   const j=db.jobs[0];j.status='Awaiting Final Authorization';
   j.checkIn={conditionNotes:'Existing scratch',photos:[{name:'retained.jpg'}],videos:[{name:'walkaround.mp4'}]};
   j.quote={id:'Q-TEST',status:'Approved',snapshot:{estimateTotal:2450,equipment:[{category:'Audio',brand:'Test',model:'Amp',qty:1}],requestNotes:'Original scope'}};
   j.unknownFutureField={keep:true};db.media.push({id:'retained-media',data:'synthetic-media'});
   const settings={'ttt-google-sync-endpoint-v1':'https://bridge.invalid/exec','ttt-google-sync-token-v1':'synthetic-test-token','ttt-google-auto-sync-v2':'false','ttt-google-sync-hashes-v2':'{"old":"hash"}','unrelated-key':'keep'};
   Object.entries(settings).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem(DB_KEY,JSON.stringify(db));
   return {quote:j.quote,checkIn:j.checkIn,otherJob:db.jobs[1],media:db.media,customers:db.customers,vehicles:db.vehicles,settings};
  });
  const refresh=async()=>{
   await page.reload();await page.evaluate(()=>openJob('J-260912-001'));await page.locator('#v05FinalAuthorization').waitFor();
   // Assert durability at the queue boundary even if an extension replaces save.
   await page.evaluate(()=>{
    window.queueChecks=0;save=()=>{};const queue=window.TTTSync.queueJob; if(typeof queue!=="function")throw new Error("Sync keys: "+Object.keys(window.TTTSync));
    TTTSync.queueJob=j=>{const stored=JSON.parse(localStorage.getItem(DB_KEY)).jobs.find(x=>x.id===j.id);if(JSON.stringify(stored)!==JSON.stringify(j))throw new Error('Queued before local persistence');window.queueChecks++;queue(j);};
   });
  };
  const get=()=>page.evaluate(()=>JSON.parse(JSON.stringify(job(currentJobId))));
  await refresh();await page.locator('#v05AuthorizeBtn').click();assert.equal((await get()).workOrderId,null);
  await page.locator('#v05FinalAuthName').fill('Test Customer');await page.locator('#v05FinalAuthCheck').check();await page.locator('#v05AuthorizeBtn').click();await page.locator('#v05SaveWork').waitFor();
  assert.equal(await page.evaluate(()=>window.queueChecks),1);
  const authorized=await get();await refresh();assert.deepEqual((await get()).finalAuthorization,authorized.finalAuthorization);assert.equal((await get()).workOrderId,authorized.workOrderId);
  const fields={brand:'Installed brand',model:'Installed model',serialNumber:'SN-TEST',installedLocation:'Trunk',laborHours:'2.5',technicianNotes:'Wired and tested',completionNotes:'Customer settings saved'};
  for(const [k,v]of Object.entries(fields))await page.locator(`#v05WorkExecution [data-field="${k}"]`).fill(v);
  await page.locator('#v05WorkExecution [data-field="status"]').selectOption('Complete');await page.locator('#v05WorkNotes').fill('Overall notes retained');await page.locator('#v05SaveWork').click();
  assert.equal(await page.evaluate(()=>window.queueChecks),1);
  const execution=(await get()).workExecution;await refresh();assert.deepEqual((await get()).workExecution,execution);
  for(const [k,v]of Object.entries(fields))assert.equal(await page.locator(`#v05WorkExecution [data-field="${k}"]`).inputValue(),v);
  assert.equal(await page.locator('#v05WorkNotes').inputValue(),'Overall notes retained');
  await page.locator('#v05NewCO').click();await page.locator('#v05CODescription').fill('Add subwoofer');await page.locator('#v05COParts').fill('100');await page.locator('#v05COLabor').fill('25');await page.locator('#v05SaveCO').click();
  const draft=(await get()).changeOrders[0];await refresh();assert.deepEqual((await get()).changeOrders[0],draft);
  page.once('dialog',d=>d.accept('Test Customer'));await page.locator('[data-approve-co]').click();
  const approved=(await get()).changeOrders[0];await refresh();assert.deepEqual((await get()).changeOrders[0],approved);
  assert.equal(await page.evaluate(()=>TTTV05.authorizedTotal(job(currentJobId))),2575);
  assert.equal(await page.locator('#v05SendQC').isDisabled(),true);assert.equal(await page.locator('#nextActionBtn').isDisabled(),true);
  await page.locator('#v05WorkExecution [data-field="status"]').nth(1).selectOption('Complete');await page.locator('#v05SaveWork').click();await page.locator('#v05SendQC').click();await refresh();assert.equal((await get()).status,'QC');
  assert.deepEqual(await page.evaluate(()=>{const j=job(currentJobId);return {quote:j.quote,checkIn:j.checkIn,otherJob:db.jobs[1],media:db.media,customers:db.customers,vehicles:db.vehicles,settings:Object.fromEntries(Object.keys(localStorage).filter(k=>k!==DB_KEY).map(k=>[k,localStorage.getItem(k)]))};}),retained);
  assert.equal((await get()).unknownFutureField.keep,true);
  await page.locator('#documentCenter').waitFor();await page.locator('#sendQuoteGoogleBtn').waitFor();
  for(const type of ['quote','checkin','workorder','invoice']){await page.evaluate(t=>TTTDocuments.open(t,job(currentJobId)),type);assert.ok((await page.locator('#docViewerCanvas').innerHTML()).length>100);await page.evaluate(()=>TTTDocuments.close());}
  // Queue failure must leave a durable local record.
  await page.evaluate(()=>{TTTSync.queueJob=()=>{throw new Error('Synthetic queue failure');};});
  await page.locator('#v05WorkNotes').fill('Saved despite queue failure');await page.locator('#v05SaveWork').click();await refresh();assert.equal(await page.locator('#v05WorkNotes').inputValue(),'Saved despite queue failure');
  // Local write failure must prevent queuing unsaved changes.
  await page.evaluate(()=>{window.queueChecks=0;Storage.prototype.setItem=function(){throw new Error('Synthetic storage failure');};});
  await page.locator('#v05WorkNotes').fill('Must not persist');await page.locator('#v05SaveWork').click();assert.equal(await page.evaluate(()=>window.queueChecks),0);await refresh();assert.equal(await page.locator('#v05WorkNotes').inputValue(),'Saved despite queue failure');
  await page.evaluate(async()=>{
   let release;window.fetch=async(url,options)=>{window.sentPayload=JSON.parse(options.body);await new Promise(r=>{release=r;});return {ok:true,text:async()=>JSON.stringify({ok:true,links:{jobFolderUrl:'https://drive.google.com/test'}})};};
   const syncing=TTTSync.syncJob(job(currentJobId));document.getElementById('v05WorkNotes').value='Saved during sync';document.getElementById('v05SaveWork').click();release();await syncing;
  });
  const payload=await page.evaluate(()=>window.sentPayload);assert.equal(payload.job.workExecution.lines[0].serialNumber,'SN-TEST');assert.deepEqual(payload.job.finalAuthorization,authorized.finalAuthorization);assert.deepEqual(payload.job.changeOrders[0],approved);assert.equal(payload.token,'synthetic-test-token');assert.equal((await get()).syncState,'queued');
  await refresh();assert.equal(await page.locator('#v05WorkNotes').inputValue(),'Saved during sync');
  // Reproduce the reported job's validation failure after newer local edits.
  // Include stale response data to prove it can never replace the local record.
  await page.reload();
  await page.evaluate(()=>openJob('J-260911-002'));
  await page.locator('#v05SaveWork').waitFor();
  const failedSync=await page.evaluate(async()=>{
   const j=job(currentJobId),beforeSettings=Object.fromEntries(Object.keys(localStorage).filter(k=>k!==DB_KEY).map(k=>[k,localStorage.getItem(k)]));
   let release;
   window.fetch=async(url,options)=>{
    const stale=JSON.parse(options.body).job;
    await new Promise(r=>{release=r;});
    return {ok:true,text:async()=>JSON.stringify({ok:false,error:'Account Type must be Retail, Dealer, Fleet, Business, Consulting',job:stale})};
   };
   const syncing=TTTSync.syncJob(j).then(()=>{throw new Error('Expected validation rejection');},e=>e.message);
   document.querySelector('#v05WorkExecution [data-field="serialNumber"]').value='NEWER-LOCAL-SERIAL';
   document.getElementById('v05WorkNotes').value='Newer local work after sync started';
   document.getElementById('v05SaveWork').click();
   const newer=JSON.parse(localStorage.getItem(DB_KEY));
   release();const error=await syncing;
   const after=JSON.parse(localStorage.getItem(DB_KEY));
   // The failure may only update sync metadata, never business fields.
   const normalize=database=>{database.jobs.forEach(x=>{delete x.syncState;delete x.syncError;});return JSON.stringify(database);};
   if(normalize(newer)!==normalize(after))throw new Error('Failed sync overwrote newer local data');
   return {error,record:JSON.parse(JSON.stringify(j)),settings:beforeSettings};
  });
  assert.match(failedSync.error,/Account Type/);
  assert.equal(failedSync.record.syncState,'error');
  await page.reload();await page.evaluate(()=>openJob('J-260911-002'));await page.locator('#v05SaveWork').waitFor();
  assert.deepEqual(await get(),failedSync.record);
  assert.equal(await page.locator('#v05WorkNotes').inputValue(),'Newer local work after sync started');
  assert.equal(await page.locator('#v05WorkExecution [data-field="serialNumber"]').first().inputValue(),'NEWER-LOCAL-SERIAL');
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!==DB_KEY).map(k=>[k,localStorage.getItem(k)]))),failedSync.settings);
  assert.deepEqual(errors,['Synthetic queue failure','Synthetic storage failure']);
  console.log('PASS: browser refresh; local-before-sync ordering; authorization; execution fields; draft/approved change orders; QC; data/settings retention; four previews; sync payload/in-flight edits; storage/queue failures; Account Type rejection preserves newer local record on reload.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
