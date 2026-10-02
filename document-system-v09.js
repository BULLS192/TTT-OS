// TTT OS v0.9 — canonical Wave 1-9 document orchestration.
// Uses production Supabase document_templates + documents. No parallel document store.
(function(){
'use strict';

const now=()=>new Date().toISOString();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getJob=()=>{try{return typeof currentJobId!=='undefined'&&currentJobId?job(currentJobId):null}catch(_){return null}};
const vehicleLabel=v=>[v?.year,v?.make,v?.model,v?.trim].filter(Boolean).join(' ');
const state={templates:[],documents:[],loaded:false,authBypassJob:null};
const client=()=>window.TTTCloud?.client;
const org=()=>window.TTTCloud?.organizationId;
const uid=()=>window.TTTCloud?.userId;

function docId(){return 'DOC-'+(crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)).toUpperCase()}
function template(code){return state.templates.find(t=>t.code===code)}
function jobDocs(j,code){return state.documents.filter(d=>d.job_id===j?.id&&(!code||d.document_code===code)&&!d.archived_at)}
function latest(j,code){return jobDocs(j,code).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null}
function finalized(j,code){return jobDocs(j,code).find(d=>d.document_status==='finalized'&&d.finalized_at)||null}
function serviceText(j){return [
  ...(j?.services||[]),
  ...(j?.equipment||[]).map(x=>x?.category),
  ...(j?.quote?.snapshot?.services||[]),
  ...(j?.quote?.snapshot?.equipment||[]).map(x=>x?.category)
].filter(Boolean).join(' ').toLowerCase()}
function isDiagnostic(j){return /signaltrace|diagnos|electrical fault|no.?start|parasitic|can.?bus|intermittent fault/.test(serviceText(j))}
function isTint(j){return /tint/.test(serviceText(j))}
function isConnected(j){return /gps|track|immobil|kill switch|alarm|remote start|security|cellular/.test(serviceText(j))}
function isSecurity(j){return /immobil|kill switch|alarm|security|remote start/.test(serviceText(j))}
function customerSupplied(j){return /customer supplied/i.test(j?.partsStatus||'')}
function paymentReceived(j){return (+j?.depositReceived||0)>0||/paid/i.test(j?.invoice?.status||'')}
function hasWarranty(j){return !!j?.warranty||/warranty/i.test(serviceText(j))}

function templateApplies(t,j){
  const m=t.metadata||{};
  if(t.scope_type==='system')return false;
  if(m.required_by_default)return true;
  const required=(m.required_for||[]).map(x=>String(x).toLowerCase());
  if(required.length){
    const text=serviceText(j);
    if(required.some(x=>text.includes(x.toLowerCase())))return true;
    if(required.some(x=>x.includes('diagnostic')||x.includes('signaltrace'))&&isDiagnostic(j))return true;
    if(required.some(x=>x.includes('window tint'))&&isTint(j))return true;
  }
  const c=String(m.conditional||m.required_when||'').toLowerCase();
  if(!c)return false;
  if(c.includes('scope')||c.includes('price_change'))return !!(j?.changeOrders||[]).length;
  if(c.includes('customer_supplied'))return customerSupplied(j);
  if(c.includes('third_party_pickup'))return !!j?.thirdPartyPickup;
  if(c.includes('warranty_claim'))return !!j?.warrantyClaim;
  if(c.includes('formal_complaint'))return !!j?.complaint;
  if(c.includes('incident'))return !!j?.incident;
  if(c.includes('uncollected'))return !!j?.uncollected;
  if(c.includes('goods_received'))return /parts received/i.test(j?.partsStatus||'');
  if(c.includes('vendor_return'))return !!j?.vendorReturn;
  if(c.includes('deposit_received'))return (+j?.depositReceived||0)>0;
  if(c.includes('connected_device'))return isConnected(j);
  if(c.includes('security_or_immobilizer'))return isSecurity(j);
  if(c.includes('subscription_or_cellular'))return /gps|track|cellular|subscription/.test(serviceText(j));
  if(c.includes('fleet_job'))return !!j?.fleetAccount;
  if(c.includes('dealer_job'))return !!j?.dealerAccount;
  if(c.includes('commercial_account'))return !!j?.commercialAccount;
  if(c.includes('credit_terms'))return !!j?.creditTermsRequested;
  if(c.includes('consolidated_billing'))return !!j?.consolidatedBilling;
  if(c.includes('payment_received'))return paymentReceived(j);
  if(c.includes('warranty_applies'))return hasWarranty(j);
  if(c.includes('purchased_parts'))return /parts ordered|parts need ordering|parts received/i.test(j?.partsStatus||'');
  if(c.includes('diagnostic_converts'))return !!j?.diagnosticRepairApproved;
  return false;
}

function statusFor(t,j){
  const d=latest(j,t.code);
  if(d)return d.document_status||'draft';
  if(existingSource(j,t.code))return 'source record';
  return templateApplies(t,j)?'required':'not applicable';
}
function existingSource(j,code){
  if(!j)return false;
  if(code==='Q')return !!j.quote;
  if(code==='CHK')return !!j.checkIn;
  if(code==='AUTH')return !!j.finalAuthorization;
  if(code==='WO')return !!j.workOrderId;
  if(code==='CO')return !!(j.changeOrders||[]).length;
  if(code==='INV')return !!j.invoice;
  if(code==='DEP'||code==='RCPT')return (+j.depositReceived||0)>0;
  return false;
}
function requiredTemplates(j){return state.templates.filter(t=>t.active&&templateApplies(t,j))}

async function load(){
  if(!window.TTTCloud?.ready||!client()||!org())return;
  const [tr,dr]=await Promise.all([
    client().from('document_templates').select('*').eq('organization_id',org()).eq('active',true).order('wave').order('code'),
    client().from('documents').select('*').eq('organization_id',org()).is('archived_at',null).order('created_at',{ascending:false})
  ]);
  if(tr.error){console.warn('TTT Document templates unavailable',tr.error);return}
  if(dr.error){console.warn('TTT Documents unavailable',dr.error);return}
  state.templates=tr.data||[];state.documents=dr.data||[];state.loaded=true;
  ensureCenter();renderCenter();if(getJob())injectJobRegister();
}

async function audit(doc,action,metadata={}){
  try{await window.TTTCloud?.audit?.('document',doc?.id||null,action,{document_code:doc?.document_code,document_number:doc?.document_number,...metadata})}catch(e){console.warn('Document audit failed',e)}
}
async function numberFor(code){
  const {data,error}=await client().rpc('next_ttt_document_number',{p_organization_id:org(),p_document_code:code});
  if(error)throw error;return data;
}
function snapshot(j,t){
  const c=j?customer(j.customerId)||{}:{},v=j?vehicle(j.vehicleId)||{}:{};
  return {
    document_code:t.code,template_version:t.current_version,template_url:t.template_url,
    captured_at:now(),customer:{id:c.id,name:c.name,email:c.email,phone:c.phone},
    vehicle:{id:v.id,name:vehicleLabel(v),vin:v.vin,plate:v.plate,plateState:v.plateState},
    job:j?{id:j.id,status:j.status,requestNotes:j.requestNotes,services:j.services||[],equipment:j.equipment||[],estimateTotal:j.estimateTotal,workOrderId:j.workOrderId}:null
  };
}
async function createDocument(code,j,extra={}){
  const t=template(code);if(!t)throw new Error('Unknown document template '+code);
  const num=await numberFor(code);
  const row={
    organization_id:org(),id:docId(),document_type:t.category||'document',title:t.title,
    document_code:t.code,document_number:num,document_status:t.requires_signature?'pending_signature':'draft',
    template_version:t.current_version,template_url:t.template_url,
    job_id:j?.id||null,customer_id:j?.customerId||null,vehicle_id:j?.vehicleId||null,
    work_order_id:j?.workOrderId||null,quote_id:j?.quote?.id||j?.quoteId||null,invoice_id:j?.invoice?.id||null,
    confidentiality:t.customer_facing?'customer':'internal',
    metadata:{wave:t.wave,scope_type:t.scope_type,trigger_stage:t.trigger_stage,...extra.metadata},
    snapshot:{...snapshot(j,t),...extra.snapshot},generated_at:now(),created_by:uid(),updated_by:uid()
  };
  const {data,error}=await client().from('documents').insert(row).select('*').single();
  if(error)throw error;state.documents.unshift(data);await audit(data,'created');return data;
}
async function updateDocument(d,patch,action='updated'){
  if(d.finalized_at)throw new Error('Finalized documents are immutable. Create a superseding record.');
  const {data,error}=await client().from('documents').update({...patch,updated_by:uid()}).eq('organization_id',org()).eq('id',d.id).select('*').single();
  if(error)throw error;Object.assign(d,data);await audit(d,action);return d;
}
async function hashObject(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function uploadSignature(j,canvas,d){
  if(!j||!canvas||canvas.dataset.hasInk!=='true')return null;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const path=org()+'/jobs/'+encodeURIComponent(j.id)+'/documents/'+encodeURIComponent(d.document_number)+'-signature.png';
  const {error}=await client().storage.from('job-media').upload(path,blob,{contentType:'image/png',cacheControl:'3600',upsert:false});
  if(error)throw error;return path;
}
async function signedPhotoUrls(j){
  const photos=j?.checkIn?.photos||[],out=[];
  for(const p of photos){
    let url='';if(p.storagePath){const {data}=await client().storage.from('job-media').createSignedUrl(p.storagePath,3600);url=data?.signedUrl||''}
    out.push({...p,url});
  }
  return out;
}
async function finalize(d,j,{signerName='',signerEmail='',signaturePath=null,formFields={},photoSet=[]}={}){
  const finalAt=now();
  const snap={...(d.snapshot||{}),form_fields:formFields,signature:{name:signerName,email:signerEmail,storage_path:signaturePath,signed_at:signerName?finalAt:null},condition_photo_set:photoSet};
  const contentHash=await hashObject({id:d.id,number:d.document_number,code:d.document_code,version:d.template_version,snapshot:snap});
  const patch={document_status:'finalized',snapshot:snap,content_hash:contentHash,finalized_at:finalAt,
    signer_name:signerName||null,signature_method:signerName?'TTT OS digital signature':null,signed_at:signerName?finalAt:null,updated_by:uid()};
  const {data,error}=await client().from('documents').update(patch).eq('organization_id',org()).eq('id',d.id).is('finalized_at',null).select('*').single();
  if(error)throw error;Object.assign(d,data);await audit(d,'finalized',{content_hash:contentHash,photo_count:photoSet.length});return d;
}

function templateCard(t,j){
  const s=j?statusFor(t,j):'template';
  const d=j?latest(j,t.code):null;
  const drive=t.template_url?'<a href="'+esc(t.template_url)+'" target="_blank" rel="noopener" class="docsys-template-link">Drive template</a>':'';
  const create=j&&templateApplies(t,j)&&!d&&!existingSource(j,t.code)?'<button class="btn secondary compact" data-docsys-create="'+esc(t.code)+'">Create record</button>':'';
  const open=d?'<button class="btn secondary compact" data-docsys-open="'+esc(d.id)+'">Open</button>':'';
  return '<article class="docsys-card"><div class="docsys-card-head"><span class="docsys-code">'+esc(t.code)+'</span><span class="docsys-status '+esc(s.replaceAll(' ','-'))+'">'+esc(s)+'</span></div><strong>'+esc(t.title)+'</strong><small>'+esc(t.category||'')+' · Wave '+esc(t.wave)+(t.customer_facing?' · Customer-facing':'')+(t.requires_signature?' · Signature':'')+'</small>'+(d?'<div class="docsys-number">'+esc(d.document_number||d.id)+'</div>':'')+drive+open+create+'</article>';
}
function ensureCenter(){
  if(document.getElementById('documents'))return;
  const main=document.querySelector('main.main');if(!main)return;
  const section=document.createElement('section');section.id='documents';section.className='view';
  section.innerHTML='<div class="section-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h2>Documents & Compliance</h2><p class="muted">Canonical Wave 1-9 registry from Supabase.</p></div></div><div id="documentSystemBody"></div>';main.appendChild(section);
  const settings=document.querySelector('[data-view="settings"]');
  if(settings&&!document.querySelector('[data-view="documents"]')){
    const b=document.createElement('button');b.className='nav-item';b.dataset.view='documents';b.textContent='Documents & Compliance';
    settings.parentElement?.insertBefore(b,settings);
    b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));section.classList.add('active');document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active');const h=document.getElementById('pageTitle');if(h)h.textContent='Documents & Compliance';renderCenter()};
  }
}
function waveName(n){return ({1:'Core Customer Job Pack',2:'Diagnostics & Pre-Repair',3:'Customer Protection & Legal',4:'Exceptions, Claims & Risk',5:'Purchasing & Inventory',6:'Finance & Accounting',7:'Connected Electronics & Security',8:'B2B, Dealer & Fleet',9:'Governance & Audit'})[n]||''}
function renderCenter(){
  ensureCenter();const root=document.getElementById('documentSystemBody');if(!root||!state.loaded)return;
  let h='<div class="docsys-stats"><div><span>Templates</span><strong>'+state.templates.length+'</strong></div><div><span>Customer-facing</span><strong>'+state.templates.filter(x=>x.customer_facing).length+'</strong></div><div><span>Signature-controlled</span><strong>'+state.templates.filter(x=>x.requires_signature).length+'</strong></div><div><span>Generated records</span><strong>'+state.documents.length+'</strong></div></div>';
  for(let w=1;w<=9;w++){const list=state.templates.filter(t=>t.wave===w);h+='<article class="panel docsys-wave"><div class="panel-head"><div><p class="eyebrow">WAVE '+w+'</p><h3>'+esc(waveName(w))+'</h3></div><span class="badge">'+list.length+' templates</span></div><div class="docsys-grid">'+list.map(t=>templateCard(t,null)).join('')+'</div></article>'}
  root.innerHTML=h;
}
function injectJobRegister(){
  const j=getJob(),root=document.getElementById('jobDetailBody');if(!j||!root||!state.loaded)return;
  document.getElementById('docsysJobPanel')?.remove();
  const req=requiredTemplates(j),done=req.filter(t=>finalized(j,t.code)||existingSource(j,t.code)).length;
  const html='<article class="panel detail-section docsys-job" id="docsysJobPanel"><div class="panel-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h3>Job Document Register</h3><p class="muted">Required and conditional records are driven by the production template registry.</p></div><span class="badge">'+done+' / '+req.length+' satisfied</span></div><div class="docsys-progress"><span style="width:'+(req.length?Math.round(done/req.length*100):100)+'%"></span></div><div class="docsys-grid">'+req.map(t=>templateCard(t,j)).join('')+'</div></article>';
  const dc=root.querySelector('#documentCenter');if(dc)dc.insertAdjacentHTML('beforebegin',html);else root.insertAdjacentHTML('beforeend',html);
  bindJobActions();
  reconcileExisting(j);
}
function bindJobActions(){
  const root=document.getElementById('jobDetailBody'),j=getJob();if(!root||!j)return;
  root.querySelectorAll('[data-docsys-create]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await createDocument(b.dataset.docsysCreate,j);await openDoc(d,j)}catch(e){console.error(e);toast('Could not create document: '+(e.message||e))}finally{b.disabled=false;injectJobRegister();renderCenter()}});
  root.querySelectorAll('[data-docsys-open]').forEach(b=>b.onclick=()=>{const d=state.documents.find(x=>x.id===b.dataset.docsysOpen);if(d)openDoc(d,j)});
}
async function reconcileExisting(j){
  if(!j||!state.loaded)return;
  const list=[
    ['Q',j.quote?.id,j.quote?.status],
    ['CHK',j.checkIn?.capturedAt,j.checkIn?'finalized':null],
    ['AUTH',j.finalAuthorization?.id,j.finalAuthorization?'finalized':null],
    ['WO',j.workOrderId,j.workOrderId?'finalized':null],
    ['INV',j.invoice?.id,j.invoice?.status]
  ];
  let changed=false;
  for(const [code,source,status] of list){
    if(!source||latest(j,code))continue;
    try{
      const d=await createDocument(code,j,{metadata:{reconciled_from_legacy:true},snapshot:{legacy_source_id:source}});
      if(status==='finalized'){
        await finalize(d,j,{signerName:code==='AUTH'?(j.finalAuthorization?.name||''):''});
      }else if(status){await updateDocument(d,{document_status:status==='Approved'?'finalized':'draft'},'legacy_reconciled')}
      changed=true;
    }catch(e){console.warn('Document reconcile skipped',code,e)}
  }
  if(changed){renderCenter();setTimeout(injectJobRegister,0)}
}
function defaultFields(t,j,d){
  const generic=['Related Record','Purpose / Scope','Details / Evidence','Notes / Exceptions','Approval / Closeout'];
  const byCode={
    DIA:['Reported Concern','Authorized Diagnostic Activities','Road-test / Scan / Disassembly Permission','Diagnostic Time / Fee Authorization','Condition Photo Acknowledgement','Terms & Conditions'],
    DFR:['Reported Symptom','SCAN','ISOLATE','TRACE','VERIFY','RESOLVE / Recommended Corrective Action'],
    DRA:['Diagnostic Findings Reference','Approved Repair Scope','Price / Schedule Impact','Customer Repair Authorization'],
    PRIV:['Information Collected','Purpose / Use','Vehicle / Photo Records','Connected Device Information','Retention / Access','Contact / Questions'],
    MEDIA:['Media Covered','Approved Channels','Restrictions','Optional Consent'],
    CSE:['Customer-Supplied Item','Model / Serial / Condition','Compatibility','Product Warranty Limitation','Workmanship Scope'],
    TINT:['Glass / Window Location','Existing VLT','Film / VLT Selection','Final Configuration','Exemption Reference'],
    INC:['Incident Description','Condition / Damage','Evidence','Immediate Actions','Customer Notification','Corrective Action'],
    WCL:['Claimed Concern','Inspection / Diagnosis','Coverage Determination','Corrective Action','Parts / Labor Disposition'],
    GRN:['PO / Vendor','Items Received','Quantities','Condition','Serial / IMEI / Lot','Discrepancies'],
    RMA:['Original PO','Item / Serial','Return Reason','RMA Number','Tracking','Credit / Replacement'],
    CM:['Invoice / Payment','Reason','Original Amount','Credit / Refund','Revised Balance'],
    DEV:['Installed Device','Serial / IMEI','App / Account Status','Credential Handoff','Features Demonstrated'],
    SEC:['Installed Security Equipment','Remote / Key Count','Immobilizer Verification','Credential Handling','Emergency Procedure'],
    SUB:['Provider / Plan','Device / Line','Recurring Charges','Renewal Responsibility','Customer Acknowledgement'],
    MSA:['Parties / Term','Services','Pricing / Rates','Authorized Contacts','Billing Terms','Warranty / Liability','Exhibits'],
    JDR:['Required Documents','Versions / Status','Approvals','Hashes / Finalized Dates','Exceptions'],
    DVR:['Template / Code','Version','Effective Date','Template URL','Status','Change Notes'],
    TSA:['Work Order / Operation','Technician','Tasks Completed','Serial Equipment','Start / Finish','Verification'],
    SER:['Hazard / Exception','Immediate Control','Evidence','Corrective Action','Owner / Closeout'],
    TRN:['Person','Skill / Process','Training','Assessment','Authorized Scope','Reviewer / Expiry']
  };
  return byCode[t.code]||generic;
}
function valueFor(label,j,d){
  const l=label.toLowerCase();
  if(l.includes('related record'))return j?.id||'';
  if(l.includes('purpose')||l.includes('scope'))return j?.requestNotes||'';
  if(l.includes('condition photo'))return j?.checkIn?((j.checkIn.photos||[]).length+' check-in photos'):'';
  if(l==='reported concern'||l==='reported symptom')return j?.requestNotes||'';
  return d?.snapshot?.form_fields?.[label]||'';
}
function collectFields(){const out={};document.querySelectorAll('#docsysModal .docsys-field').forEach(el=>{const k=el.querySelector('span')?.textContent||'';out[k]=el.querySelector('p')?.textContent?.trim()||''});return out}
function bindSignature(){
  const c=document.getElementById('docsysSignature');if(!c)return;const x=c.getContext('2d');x.lineWidth=2.2;x.lineCap='round';x.strokeStyle='#172033';c.dataset.hasInk='false';let down=false;
  const p=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};
  c.onpointerdown=e=>{down=true;c.setPointerCapture(e.pointerId);const q=p(e);x.beginPath();x.moveTo(q.x,q.y)};
  c.onpointermove=e=>{if(!down)return;const q=p(e);x.lineTo(q.x,q.y);x.stroke();c.dataset.hasInk='true'};
  c.onpointerup=c.onpointercancel=()=>down=false;
}
async function openDoc(d,j){
  const t=template(d.document_code);if(!t)return;
  const photos=t.code==='AUTH'?await signedPhotoUrls(j):[];
  let m=document.getElementById('docsysModal');if(!m){m=document.createElement('div');m.id='docsysModal';m.className='doc-modal';document.body.appendChild(m)}
  const c=j?customer(j.customerId)||{}:{},v=j?vehicle(j.vehicleId)||{}:{},editable=!d.finalized_at;
  const fields=defaultFields(t,j,d).map(label=>'<div class="docsys-field"><span>'+esc(label)+'</span><p contenteditable="'+editable+'">'+esc(valueFor(label,j,d))+'</p></div>').join('');
  const photoBlock=photos.length?'<section class="docsys-photo-section"><h4>VEHICLE CONDITION PHOTOS</h4><p><strong>'+photos.length+' check-in photographs</strong> form part of this authorization. The signature below acknowledges this complete image set.</p><div class="docsys-photo-grid">'+photos.map(p=>'<figure>'+(p.url?'<img src="'+esc(p.url)+'" alt="'+esc(p.area||'Check-in photo')+'">':'<div class="doc-placeholder">Photo unavailable</div>')+'<figcaption><strong>'+esc(p.area||p.category||'Check-in photo')+'</strong><small>'+esc(p.capturedAt||'')+'</small></figcaption></figure>').join('')+'</div></section>':'';
  m.innerHTML='<div class="doc-modal-backdrop" data-docsys-close></div><div class="doc-modal-shell"><div class="doc-toolbar"><div><strong>'+esc(t.title)+'</strong><span>'+esc(d.document_number||d.id)+'</span></div><div class="doc-toolbar-actions">'+(editable?'<button class="btn secondary" id="docsysSave">Save Draft</button><button class="btn primary" id="docsysFinalize">'+(t.requires_signature?'Sign & Finalize':'Finalize')+'</button>':'<span class="badge">Finalized / immutable</span>')+'<button class="btn secondary" id="docsysPrint">Print / Save PDF</button>'+(t.template_url?'<a class="btn secondary link-as-btn" target="_blank" rel="noopener" href="'+esc(t.template_url)+'">Drive Template</a>':'')+'<button class="btn primary" data-docsys-close>Close</button></div></div><div class="doc-canvas"><div class="doc-page docsys-page"><header><p class="eyebrow">THOMPSON TRANSPORTATION TECHNOLOGIES</p><h2>'+esc(t.title)+'</h2><div>'+esc(d.document_number||'Draft')+' · '+esc(t.current_version||'')+'</div></header><div class="doc-party-grid"><section><h4>CUSTOMER</h4><strong>'+esc(c.name||d.snapshot?.customer?.name||'')+'</strong><p>'+esc(c.email||d.snapshot?.customer?.email||'')+'</p></section><section><h4>VEHICLE / RECORD</h4><strong>'+esc(vehicleLabel(v)||d.snapshot?.vehicle?.name||'')+'</strong><p>VIN: '+esc(v.vin||d.snapshot?.vehicle?.vin||'—')+'</p></section></div><section class="docsys-fields">'+fields+'</section>'+photoBlock+(t.requires_signature&&editable?'<section class="docsys-sign"><h4>CUSTOMER / AUTHORIZED SIGNATURE</h4><label>Signer name<input id="docsysSignerName" value="'+esc(c.name||'')+'"></label><label>Signer email<input id="docsysSignerEmail" value="'+esc(c.email||'')+'"></label><canvas id="docsysSignature" width="900" height="220"></canvas><small>Sign with finger, stylus or mouse.</small></section>':'')+(d.content_hash?'<footer class="docsys-hash">Integrity SHA-256: '+esc(d.content_hash)+'</footer>':'')+'</div></div></div>';
  m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('doc-modal-open');
  m.querySelectorAll('[data-docsys-close]').forEach(x=>x.onclick=closeDoc);
  document.getElementById('docsysPrint').onclick=()=>window.print();
  if(t.requires_signature&&editable)bindSignature();
  document.getElementById('docsysSave')?.addEventListener('click',async()=>{await updateDocument(d,{snapshot:{...(d.snapshot||{}),form_fields:collectFields()}},'draft_saved');toast('Document draft saved')});
  document.getElementById('docsysFinalize')?.addEventListener('click',async()=>{
    try{
      let signerName='',signerEmail='',signaturePath=null;
      if(t.requires_signature){
        signerName=document.getElementById('docsysSignerName')?.value.trim()||'';signerEmail=document.getElementById('docsysSignerEmail')?.value.trim()||'';
        const canvas=document.getElementById('docsysSignature');if(!signerName||canvas?.dataset.hasInk!=='true'){toast('Signer name and signature are required');return}
        signaturePath=await uploadSignature(j,canvas,d);
      }
      const photoSet=photos.map(p=>({id:p.id,area:p.area||p.category,storagePath:p.storagePath,capturedAt:p.capturedAt}));
      await finalize(d,j,{signerName,signerEmail,signaturePath,formFields:collectFields(),photoSet});
      toast((d.document_number||t.title)+' finalized and locked');
      closeDoc();await load();
      if(t.code==='AUTH'&&j&&!j.finalAuthorization){
        state.authBypassJob=j.id;
        const name=document.getElementById('v05FinalAuthName');if(name)name.value=signerName;
        const check=document.getElementById('v05FinalAuthCheck');if(check)check.checked=true;
        setTimeout(()=>document.getElementById('v05AuthorizeBtn')?.click(),50);
      }
    }catch(e){console.error(e);toast('Could not finalize document: '+(e.message||e))}
  });
}
function closeDoc(){const m=document.getElementById('docsysModal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true')}document.body.classList.remove('doc-modal-open')}

async function requireAuthorizationDocument(e){
  const b=e.target?.closest?.('#v05AuthorizeBtn, #authorizeBtn');if(!b)return;
  const j=getJob();if(!j)return;
  if(state.authBypassJob===j.id){state.authBypassJob=null;return}
  if(finalized(j,'AUTH'))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!j.checkIn){toast('Complete vehicle check-in before customer authorization');return}\n  const photos=j.checkIn.photos||[];\n  const needed=['Front','Rear','Driver Side / Left','Passenger Side / Right','Front Interior','Dashboard / Mileage'];\n  const areas=new Set(photos.map(p=>p.area));\n  const missing=needed.filter(x=>!areas.has(x));\n  if(missing.length){toast('Complete required check-in photos before authorization: '+missing.join(', '));return}
  let d=latest(j,'AUTH');try{if(!d)d=await createDocument('AUTH',j);await openDoc(d,j)}catch(err){console.error(err);toast('Customer Authorization could not be opened: '+(err.message||err))}
}

function patch(){
  if(window.__tttDocCanonicalPatched)return;window.__tttDocCanonicalPatched=true;
  document.addEventListener('click',requireAuthorizationDocument,true);
  const base=window.render;
  if(typeof base==='function')window.render=function(){base();setTimeout(()=>{ensureCenter();if(getJob())injectJobRegister()},0)};
  window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(load,150));
  window.addEventListener('ttt:job-operational-change',()=>setTimeout(()=>{if(getJob())injectJobRegister()},100));
}
async function init(){
  ensureCenter();patch();let n=0;while(n++<120&&!window.TTTCloud?.ready)await new Promise(r=>setTimeout(r,150));
  if(window.TTTCloud?.ready)await load();
}
window.TTTDocumentSystem={load,createDocument,updateDocument,finalize,openDoc,requiredTemplates,get templates(){return state.templates},get documents(){return state.documents}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();