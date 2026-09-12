// TTT OS v0.3 — Google Workspace synchronization client
(function(){
  const ENDPOINT_KEY='ttt-google-sync-endpoint-v1';
  const TOKEN_KEY='ttt-google-sync-token-v1';
  const MASTER_DB_URL='https://docs.google.com/spreadsheets/d/1WJp-FC97yB35p8SGAtkOEBKtjS6-rrB5yn6igo7Ej_E/edit';
  const QUOTE_TEMPLATE_URL='https://docs.google.com/document/d/14_fS3C6JBDQ4rwyxTBzjGcmQWEJenpthEUmqYndOijk/edit';
  const OPS_ROOT_URL='https://drive.google.com/drive/folders/14tX3xOze04Z-Gwt82UWSqK9__HxTbZq1';

  function endpoint(){return (localStorage.getItem(ENDPOINT_KEY)||'').trim()}
  function token(){return (localStorage.getItem(TOKEN_KEY)||'').trim()}
  function statusText(j){if(j.syncState==='synced')return 'Google synced';if(j.syncState==='error')return 'Sync error';return 'Not synced'}
  function statusClass(j){return j.syncState==='synced'?'synced':j.syncState==='error'?'error':'pending'}
  function cleanJob(j){const copy=JSON.parse(JSON.stringify(j));if(copy.quote?.approval?.approvalMark&&copy.quote.approval.approvalMark.length>1500000)copy.quote.approval.approvalMark=null;return copy}
  function payloadFor(j){return{source:'TTT OS v0.3',customer:customer(j.customerId)||null,vehicle:vehicle(j.vehicleId)||null,job:cleanJob(j)}}

  async function call(action,data={}){
    const url=endpoint();if(!url)throw new Error('Google sync endpoint is not configured in Settings.');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:token(),...data})});
    const text=await res.text();let body;try{body=JSON.parse(text)}catch{throw new Error(text||('HTTP '+res.status))}
    if(!res.ok||body.ok===false)throw new Error(body.error||('HTTP '+res.status));return body;
  }

  async function syncJob(j,quiet=false){
    if(!j)return; j.syncState='pending';save();injectSyncControls(j);
    try{const out=await call('syncJob',payloadFor(j));j.syncState='synced';j.syncedAt=new Date().toISOString();j.google={...(j.google||{}),...(out.links||{}),ids:out.ids||j.google?.ids};save();if(!quiet)toast('Synced '+j.id+' to Google Workspace');render();return out}
    catch(err){j.syncState='error';j.syncError=String(err.message||err);save();if(!quiet)toast('Google sync failed: '+j.syncError);injectSyncControls(j);throw err}
  }

  async function sendQuote(j){
    if(!j?.quote){toast('Generate the quotation first');return}
    try{await syncJob(j,true);const out=await call('sendQuote',payloadFor(j));j.quote.status='Sent';j.quote.sentAt=new Date().toISOString();j.status='Awaiting Approval';j.google={...(j.google||{}),...(out.links||{})};j.syncState='synced';j.syncedAt=new Date().toISOString();j.audit=j.audit||[];j.audit.push({at:j.syncedAt,actor:'usr_derek',action:'quote_sent_via_google',quoteId:j.quote.id});save();render();toast('Quotation emailed to '+(customer(j.customerId)?.email||'customer'))}
    catch(err){toast('Could not send quotation: '+String(err.message||err))}
  }

  async function testConnection(){try{const out=await call('health');document.getElementById('googleSyncStatus').textContent='Connected · '+(out.database||'TTT OS Master Database');toast('Google Workspace connection verified')}catch(err){document.getElementById('googleSyncStatus').textContent='Connection failed · '+String(err.message||err);toast('Connection test failed')}}
  async function syncAll(){if(!endpoint()){toast('Configure the Google sync endpoint first');return}let ok=0,fail=0;for(const j of db.jobs){try{await syncJob(j,true);ok++}catch{fail++}}render();toast('Google sync complete · '+ok+' synced'+(fail?' · '+fail+' failed':''))}

  function settingsHTML(){return '<article class="panel sync-settings" id="googleWorkspaceSync"><div class="panel-head"><div><p class="eyebrow">GOOGLE WORKSPACE</p><h3>Master Database & Document Sync</h3><p class="muted">TTT OS remains the operator interface. Sheets stores structured records; Drive stores generated documents and media links.</p></div><span class="badge">v0.3</span></div><div class="sync-settings-grid"><label>Apps Script web app endpoint<input id="googleSyncEndpoint" placeholder="https://script.google.com/macros/s/.../exec" value="'+esc(endpoint())+'"></label><label>Sync token<input id="googleSyncToken" type="password" placeholder="Shared sync token" value="'+esc(token())+'"></label></div><div class="sync-link-row"><a href="'+MASTER_DB_URL+'" target="_blank" rel="noopener">Open Master Database</a><a href="'+QUOTE_TEMPLATE_URL+'" target="_blank" rel="noopener">Open Quote Template</a><a href="'+OPS_ROOT_URL+'" target="_blank" rel="noopener">Open TTT Operations Drive</a></div><p class="sync-note">The endpoint is the one-time bridge between this Vercel app and Google Workspace. Once deployed, customer, vehicle, job, quote, approval, deposit, check-in and work-order data can be upserted into the existing Master Database.</p><div class="sync-actions"><button class="btn primary" id="saveGoogleSyncBtn">Save Connection</button><button class="btn secondary" id="testGoogleSyncBtn">Test Connection</button><button class="btn secondary" id="syncAllJobsBtn">Sync All Jobs</button></div><div class="sync-status" id="googleSyncStatus">'+(endpoint()?'Endpoint configured · ready to test':'Endpoint not configured yet')+'</div></article>'}

  function renderSettings(){const view=document.getElementById('settings');if(!view)return;let panel=document.getElementById('googleWorkspaceSync');if(!panel){view.insertAdjacentHTML('beforeend',settingsHTML());panel=document.getElementById('googleWorkspaceSync')}else{panel.outerHTML=settingsHTML();panel=document.getElementById('googleWorkspaceSync')}
    document.getElementById('saveGoogleSyncBtn').onclick=()=>{localStorage.setItem(ENDPOINT_KEY,document.getElementById('googleSyncEndpoint').value.trim());localStorage.setItem(TOKEN_KEY,document.getElementById('googleSyncToken').value.trim());document.getElementById('googleSyncStatus').textContent='Connection settings saved';toast('Google sync settings saved')};
    document.getElementById('testGoogleSyncBtn').onclick=testConnection;document.getElementById('syncAllJobsBtn').onclick=syncAll;
  }

  function injectSyncControls(j){const actions=document.querySelector('#jobDetailBody .detail-actions');if(!actions)return;actions.querySelector('.sync-inline')?.remove();const wrap=document.createElement('div');wrap.className='sync-inline';wrap.innerHTML='<span class="sync-chip '+statusClass(j)+'">'+esc(statusText(j))+'</span><button class="btn secondary" id="syncCurrentJobBtn" '+(endpoint()?'':'disabled title="Configure Google sync in Settings"')+'>Sync to Google</button>'+(j.quote&&endpoint()?'<button class="btn primary" id="sendQuoteGoogleBtn">Send Quote via Gmail</button>':'');actions.appendChild(wrap);document.getElementById('syncCurrentJobBtn')?.addEventListener('click',()=>syncJob(j));document.getElementById('sendQuoteGoogleBtn')?.addEventListener('click',()=>sendQuote(j))}

  const baseRender=render;render=function(){baseRender();renderSettings();if(currentJobId)injectSyncControls(job(currentJobId))};
  const baseRenderJobDetail=renderJobDetail;renderJobDetail=function(){baseRenderJobDetail();if(currentJobId)injectSyncControls(job(currentJobId))};
  window.TTTSync={syncJob,syncAll,sendQuote,testConnection};
  renderSettings();if(currentJobId)injectSyncControls(job(currentJobId));
})();
