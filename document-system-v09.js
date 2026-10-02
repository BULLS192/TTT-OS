// TTT OS Document System v0.9 — Waves 1-9
(function(){
  'use strict';

  const ROOT_FOLDER='https://drive.google.com/drive/folders/1FT2CvsyYnBs0qpzdWhSUJ2FAzqizmSfq';
  const CORE_REQUIRED=['Q','CHK','AUTH','WO','QC','INV','RCPT','COMP','WAR','JDR'];
  const FLOW_ORDER={Q:10,CHK:20,AUTH:30,WO:40,CO:45,QC:50,INV:60,RCPT:70,COMP:80,WAR:90,JDR:100};
  let templates=[];
  let ready=false;
  const recordsByJob=new Map();

  const escHtml=v=>window.esc?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const now=()=>new Date().toISOString();
  const cloud=()=>window.TTTCloud?.client;
  const org=()=>window.TTTCloud?.organizationId;
  const user=()=>window.TTTCloud?.userId;
  const currentJob=()=>window.currentJobId&&typeof window.job==='function'?window.job(window.currentJobId):null;
  const vehicleLabel=v=>[v?.year,v?.make,v?.model,v?.trim].filter(Boolean).join(' ');
  const serviceText=j=>[
    ...(j?.services||[]),
    ...((j?.equipment||[]).flatMap(x=>[x?.category,x?.brand,x?.model,x?.note])),
    j?.requestNotes,j?.quote?.snapshot?.requestNotes
  ].filter(Boolean).join(' ').toLowerCase();

  function flags(j){
    const s=serviceText(j);
    return {
      diagnostic:/signaltrace|diagnostic|troubleshoot|electrical|no[- ]?start|parasitic|can bus|fault/.test(s),
      tint:/tint|window film|ceramic film/.test(s),
      connected:/gps|tracking|tracker|alarm|immobilizer|kill switch|remote start|dash ?cam|blackvue|cellular|lte|subscription/.test(s),
      security:/alarm|immobilizer|kill switch|security|remote start/.test(s),
      customerSupplied:/customer.?supplied/i.test(String(j?.partsStatus||''))||/customer.?supplied/.test(s),
      commercial:/dealer|fleet|commercial|b2b/.test([s,j?.accountName,j?.customerNotes].filter(Boolean).join(' ').toLowerCase()),
      incident:!!(j?.incidents?.length||j?.incident),
      warranty:!!(j?.warrantyClaim||j?.warrantyClaims?.length),
      complaint:!!(j?.complaints?.length||j?.complaint),
      declined:!!(j?.declinedRecommendations?.length),
      uncollected:!!j?.extendedCustody,
      thirdPartyRelease:!!j?.vehicleReleaseAuthorization,
      changes:!!j?.changeOrders?.length
    };
  }

  function templateState(t,j){
    const f=flags(j);
    let applicable=t.scope_type==='job'||['TNC','PRIV'].includes(t.code);
    let required=CORE_REQUIRED.includes(t.code);
    let reason=required?'Core job control':'Available when applicable';

    if(['DIA','DFR','DRA'].includes(t.code)){applicable=f.diagnostic;required=f.diagnostic;reason='Diagnostic / SignalTrace workflow';}
    if(t.code==='TINT'){applicable=f.tint;required=f.tint;reason='Window tint service';}
    if(t.code==='CSE'){applicable=f.customerSupplied;required=f.customerSupplied;reason='Customer-supplied equipment';}
    if(['DEV','SUB'].includes(t.code)){applicable=f.connected;required=f.connected;reason='Connected-device handoff';}
    if(t.code==='SEC'){applicable=f.security;required=f.security;reason='Security / immobilizer handoff';}
    if(t.code==='INC'){applicable=f.incident;required=f.incident;reason='Incident recorded';}
    if(t.code==='WCL'){applicable=f.warranty;required=f.warranty;reason='Warranty claim / comeback';}
    if(t.code==='CRR'){applicable=f.complaint;required=f.complaint;reason='Customer complaint';}
    if(t.code==='DEC'){applicable=f.declined;required=f.declined;reason='Recommendation declined';}
    if(t.code==='UNCL'){applicable=f.uncollected;required=f.uncollected;reason='Extended custody';}
    if(t.code==='REL'){applicable=true;required=f.thirdPartyRelease;reason='Third-party vehicle release when used';}
    if(t.code==='MEDIA'){applicable=true;required=false;reason='Optional marketing consent';}
    if(['MSA','CCA','FWA','DRO','CSI','SLA'].includes(t.code)){applicable=f.commercial;required=['FWA','DRO'].includes(t.code)&&f.commercial;reason='Commercial / dealer / fleet account';}
    if(['TSA'].includes(t.code)){applicable=!!j?.workOrderId;required=!!j?.workOrderId;reason='Technician accountability';}
    if(['SER'].includes(t.code)){applicable=!!j?.safetyExceptions?.length;required=applicable;reason='Safety / exception event';}
    if(['PO','GRN','RMA','IAJ','STR','CM','DEP','STM','AP','EXP','DVR','TRN'].includes(t.code)) applicable=false;
    if(['TNC','PRIV'].includes(t.code)){applicable=true;required=true;reason='Referenced customer policy';}
    if(t.code==='CO'){applicable=!!j?.workOrderId||f.changes;required=f.changes;reason=f.changes?'Change order exists':'Available for scope changes';}
    return {applicable,required,reason};
  }

  async function waitCloud(){
    for(let i=0;i<160;i++){
      if(cloud()&&org()) return true;
      await new Promise(r=>setTimeout(r,125));
    }
    return false;
  }

  async function loadTemplates(){
    if(!await waitCloud()) return;
    const {data,error}=await cloud().from('document_templates')
      .select('code,title,wave,category,scope_type,trigger_stage,current_version,template_url,legal_review_required,customer_facing,requires_signature,active,metadata')
      .eq('organization_id',org()).eq('active',true)
      .order('wave').order('code');
    if(error){console.error('Document template registry load failed',error);return;}
    templates=data||[];
    ready=true;
    installLibraryView();
    if(currentJob()) refreshJobCenter(currentJob());
  }

  async function loadRecords(j,force=false){
    if(!j||!cloud()) return [];
    if(!force&&recordsByJob.has(j.id)) return recordsByJob.get(j.id);
    const {data,error}=await cloud().from('documents').select('*')
      .eq('organization_id',org()).eq('job_id',j.id).is('archived_at',null)
      .order('created_at',{ascending:false});
    if(error){console.error('Document records load failed',error);return [];}
    recordsByJob.set(j.id,data||[]);
    return data||[];
  }

  function latestRecord(records,code){
    return (records||[]).filter(x=>x.document_code===code)
      .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]||null;
  }

  async function nextNumber(code){
    const {data,error}=await cloud().rpc('next_ttt_document_number',{
      p_organization_id:org(),
      p_document_code:code
    });
    if(error){
      console.error('Atomic document number allocation failed',error);
      throw error;
    }
    return data;
  }

  function snapshot(j,t){
    const c=typeof window.customer==='function'?window.customer(j.customerId):null;
    const v=typeof window.vehicle==='function'?window.vehicle(j.vehicleId):null;
    const photos=(j.checkIn?.photos||[]).map(p=>({
      id:p.id,group:p.group,area:p.area,fileName:p.fileName,capturedAt:p.capturedAt,
      storageBucket:p.storageBucket,storagePath:p.storagePath
    }));
    return {
      capturedAt:now(),
      template:{code:t.code,title:t.title,version:t.current_version,url:t.template_url,wave:t.wave},
      job:{id:j.id,status:j.status,workOrderId:j.workOrderId||null,requestNotes:j.requestNotes||'',services:j.services||[],equipment:j.equipment||[],estimateTotal:j.estimateTotal||0},
      customer:c?{id:c.id,name:c.name,phone:c.phone,email:c.email}:null,
      vehicle:v?{id:v.id,label:vehicleLabel(v),vin:v.vin,plate:v.plate,plateState:v.plateState,color:v.color}:null,
      quote:j.quote||null,
      finalAuthorization:j.finalAuthorization||null,
      changeOrders:j.changeOrders||[],
      checkIn:j.checkIn?{...j.checkIn,photos,videos:(j.checkIn.videos||[]).map(x=>({id:x.id,category:x.category,fileName:x.fileName,storagePath:x.storagePath}))}:null,
      workExecution:j.workExecution||null,
      source:'TTT-OS'
    };
  }

  async function ensureJDR(j){
    const records=await loadRecords(j,true);
    if(latestRecord(records,'JDR')) return;
    const t=templates.find(x=>x.code==='JDR'); if(!t) return;
    const number=await nextNumber('JDR');
    const payload={
      organization_id:org(),job_id:j.id,customer_id:j.customerId||null,vehicle_id:j.vehicleId||null,
      work_order_id:j.workOrderId||null,document_type:'job_document_register',title:t.title,
      document_code:'JDR',document_number:number,document_status:'draft',
      template_version:t.current_version,template_url:t.template_url,generated_at:now(),
      snapshot:{jobId:j.id,documents:records.map(r=>({code:r.document_code,number:r.document_number,status:r.document_status,hash:r.content_hash}))},
      metadata:{system_native:true,wave:9}
    };
    await cloud().from('documents').insert(payload);
    recordsByJob.delete(j.id);
  }

  async function createRecord(j,code){
    const t=templates.find(x=>x.code===code); if(!t) return;
    const state=templateState(t,j);
    if(code==='AUTH'&&!(j.checkIn?.photos||[]).length){toast('Customer Authorization requires completed check-in photographs');return;}
    if(['WO','QC','INV','COMP','WAR'].includes(code)&&!j.finalAuthorization&&code!=='WO'){/* status engine remains advisory for legacy jobs */}
    const number=await nextNumber(code);
    const payload={
      organization_id:org(),job_id:j.id,customer_id:j.customerId||null,vehicle_id:j.vehicleId||null,
      work_order_id:j.workOrderId||null,document_type:String(t.title).toLowerCase().replace(/[^a-z0-9]+/g,'_'),
      title:t.title,document_code:code,document_number:number,document_status:t.requires_signature?'pending_signature':'draft',
      template_version:t.current_version,template_url:t.template_url,generated_at:now(),
      snapshot:snapshot(j,t),metadata:{wave:t.wave,required:state.required,reason:state.reason,photo_ids:(j.checkIn?.photos||[]).map(p=>p.id)}
    };
    const {data,error}=await cloud().from('documents').insert(payload).select('*').single();
    if(error){console.error(error);toast('Could not create document record');return;}
    recordsByJob.delete(j.id);
    await ensureJDR(j);
    if(j.audit){j.audit.push({at:now(),actor:user()||'system',action:'document_generated',documentCode:code,documentNumber:number});if(typeof window.save==='function')window.save();}
    toast(number+' generated');
    await refreshJobCenter(j,true);
    openRecord(data,j);
  }

  async function sha256(value){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function gate(t,j){
    if(t.code==='AUTH'&&!(j.checkIn?.photos||[]).length) return 'Check-in photographs are required before authorization.';
    if(t.code==='QC'&&!j.workOrderId) return 'A Work Order is required before QC.';
    if(t.code==='INV'&&!j.workOrderId) return 'A Work Order is required before invoicing.';
    if(t.code==='COMP'&&j.status!=='Completed'&&j.status!=='Ready for Delivery'&&j.status!=='QC') return 'Complete work and QC before handover.';
    return '';
  }

  async function finalizeRecord(record,j,signature){
    const t=templates.find(x=>x.code===record.document_code);
    const blocked=gate(t,j); if(blocked){toast(blocked);return;}
    const frozen=snapshot(j,t);
    frozen.record={documentNumber:record.document_number,finalizedAt:now()};
    const contentHash=await sha256(JSON.stringify(frozen));
    const update={
      document_status:'finalized',
      snapshot:frozen,content_hash:contentHash,finalized_at:now(),
      generated_at:record.generated_at||now(),
      metadata:{...(record.metadata||{}),immutable:true,photo_ids:(j.checkIn?.photos||[]).map(p=>p.id)}
    };
    if(t.requires_signature){
      update.signer_name=signature?.name||'';
      update.signature_method=signature?.method||'TTT-OS digital signature';
      update.signed_at=now();
      update.metadata.signature_image=signature?.dataUrl||null;
      if(!update.signer_name){toast('Signer name is required');return;}
    }
    const {error}=await cloud().from('documents').update(update)
      .eq('organization_id',org()).eq('id',record.id);
    if(error){console.error(error);toast('Could not finalize document');return;}
    recordsByJob.delete(j.id);
    await ensureJDRUpdate(j);
    toast(record.document_number+' finalized');
    await refreshJobCenter(j,true);
  }

  async function ensureJDRUpdate(j){
    const records=await loadRecords(j,true);
    const jdr=latestRecord(records,'JDR'); if(!jdr) return;
    const snapshotValue={
      jobId:j.id,updatedAt:now(),
      documents:records.filter(x=>x.document_code!=='JDR').map(r=>({
        code:r.document_code,number:r.document_number,status:r.document_status,
        version:r.template_version,signedAt:r.signed_at,finalizedAt:r.finalized_at,hash:r.content_hash
      }))
    };
    await cloud().from('documents').update({snapshot:snapshotValue,generated_at:now()})
      .eq('organization_id',org()).eq('id',jdr.id).is('finalized_at',null);
    recordsByJob.delete(j.id);
  }

  async function signedPhotoUrls(j){
    const photos=j.checkIn?.photos||[]; const c=cloud(); if(!c) return [];
    return Promise.all(photos.map(async p=>{
      let url='';
      if(p.storagePath){
        const {data}=await c.storage.from(p.storageBucket||'job-media').createSignedUrl(p.storagePath,900);
        url=data?.signedUrl||'';
      }
      return {...p,url};
    }));
  }

  async function openRecord(record,j){
    let modal=document.getElementById('docV09Modal');
    if(!modal){
      document.body.insertAdjacentHTML('beforeend','<div class="doc09-modal" id="docV09Modal"><div class="doc09-backdrop" data-doc09-close></div><div class="doc09-shell"><div class="doc09-toolbar"><strong id="doc09Title"></strong><div><button class="btn secondary" id="doc09Template">Master Template</button><button class="btn secondary" id="doc09Print">Print / Save PDF</button><button class="btn primary" data-doc09-close>Close</button></div></div><div id="doc09Body" class="doc09-body"></div></div></div>');
      modal=document.getElementById('docV09Modal');
      modal.querySelectorAll('[data-doc09-close]').forEach(x=>x.onclick=()=>modal.classList.remove('open'));
    }
    const t=templates.find(x=>x.code===record.document_code)||{};
    const snap=record.snapshot||{};
    document.getElementById('doc09Title').textContent=record.document_number+' · '+record.title;
    document.getElementById('doc09Template').onclick=()=>window.open(record.template_url||t.template_url,'_blank','noopener');
    document.getElementById('doc09Print').onclick=()=>{const w=window.open('','_blank');if(!w)return;w.document.write('<!doctype html><html><head><title>'+escHtml(record.document_number)+'</title><link rel="stylesheet" href="document-system-v09.css"></head><body class="doc09-print">'+document.getElementById('doc09Body').innerHTML+'</body></html>');w.document.close();setTimeout(()=>w.print(),250);};
    const photos=record.document_code==='AUTH'?await signedPhotoUrls(j):[];
    const photoHtml=photos.length?'<section><h3>Vehicle Condition Photos</h3><div class="doc09-photo-grid">'+photos.map(p=>'<figure>'+(p.url?'<img src="'+escHtml(p.url)+'">':'')+'<figcaption><strong>'+escHtml(p.area||p.group||'Check-in photo')+'</strong><span>'+escHtml(p.capturedAt||j.checkIn?.capturedAt||'')+'</span></figcaption></figure>').join('')+'</div></section>':'';
    const sig=record.metadata?.signature_image?'<img class="doc09-signature-image" src="'+record.metadata.signature_image+'" alt="Signature">':'';
    document.getElementById('doc09Body').innerHTML=
      '<article class="doc09-page"><header><div><strong>THOMPSON TRANSPORTATION TECHNOLOGIES</strong><small>Controlled TTT-OS document record</small></div><div><h2>'+escHtml(record.title)+'</h2><span>'+escHtml(record.document_number)+'</span></div></header>'+
      '<section class="doc09-summary"><div><span>Customer</span><strong>'+escHtml(snap.customer?.name||'—')+'</strong></div><div><span>Vehicle</span><strong>'+escHtml(snap.vehicle?.label||'—')+'</strong></div><div><span>Job</span><strong>'+escHtml(snap.job?.id||record.job_id||'—')+'</strong></div><div><span>Status</span><strong>'+escHtml(record.document_status||'generated')+'</strong></div></section>'+
      '<section><h3>Record Snapshot</h3><p>'+escHtml(snap.job?.requestNotes||'This controlled record is linked to the TTT-OS job and its structured operational data.')+'</p></section>'+
      photoHtml+
      (record.content_hash?'<section class="doc09-integrity"><h3>Document Integrity</h3><p>SHA-256: '+escHtml(record.content_hash)+'</p><p>Finalized: '+escHtml(record.finalized_at||'')+'</p></section>':'')+
      (record.signer_name?'<section><h3>Authorization / Sign-off</h3>'+sig+'<p><strong>'+escHtml(record.signer_name)+'</strong><br>'+escHtml(record.signature_method||'')+' · '+escHtml(record.signed_at||'')+'</p></section>':'')+
      '<footer>Template '+escHtml(record.template_version||'')+' · Generated by TTT-OS</footer></article>';
    modal.classList.add('open');
  }

  function signatureModal(record,j){
    const t=templates.find(x=>x.code===record.document_code);
    const blocked=gate(t,j); if(blocked){toast(blocked);return;}
    if(!t.requires_signature){finalizeRecord(record,j,null);return;}
    document.getElementById('doc09SigModal')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div class="doc09-modal open" id="doc09SigModal"><div class="doc09-backdrop"></div><div class="doc09-sign-shell"><div class="panel-head"><div><p class="eyebrow">CONTROLLED SIGN-OFF</p><h3>'+escHtml(record.title)+'</h3><p class="muted">'+escHtml(record.document_number)+'</p></div><button class="btn secondary" id="doc09SigCancel">Cancel</button></div><label>Signer name<input id="doc09Signer" value="'+escHtml((typeof window.customer==='function'?window.customer(j.customerId)?.name:'')||'')+'"></label><label>Signature method<select id="doc09SigMethod"><option>In-person digital signature</option><option>Printed signed copy</option><option>Email / written approval</option><option>Internal TTT sign-off</option></select></label><div class="doc09-canvas-wrap"><span>Sign below</span><canvas id="doc09SigCanvas" width="700" height="180"></canvas><button class="link-btn" id="doc09SigClear">Clear signature</button></div><button class="btn primary large" id="doc09SigFinalize">Finalize & Freeze Record</button></div></div>');
    const m=document.getElementById('doc09SigModal'),canvas=document.getElementById('doc09SigCanvas'),ctx=canvas.getContext('2d');
    ctx.lineWidth=2;ctx.lineCap='round';let drawing=false,hasInk=false;
    function pos(e){const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return {x:(p.clientX-r.left)*(canvas.width/r.width),y:(p.clientY-r.top)*(canvas.height/r.height)};}
    function start(e){drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();}
    function move(e){if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;e.preventDefault();}
    function stop(){drawing=false;}
    ['pointerdown','touchstart'].forEach(ev=>canvas.addEventListener(ev,start,{passive:false}));
    ['pointermove','touchmove'].forEach(ev=>canvas.addEventListener(ev,move,{passive:false}));
    ['pointerup','pointerleave','touchend'].forEach(ev=>canvas.addEventListener(ev,stop));
    document.getElementById('doc09SigClear').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;};
    document.getElementById('doc09SigCancel').onclick=()=>m.remove();
    document.getElementById('doc09SigFinalize').onclick=async()=>{
      const name=document.getElementById('doc09Signer').value.trim();
      const method=document.getElementById('doc09SigMethod').value;
      if(!name){toast('Signer name is required');return;}
      if(method==='In-person digital signature'&&!hasInk){toast('Capture the customer / representative signature');return;}
      const dataUrl=hasInk?canvas.toDataURL('image/png'):null;
      await finalizeRecord(record,j,{name,method,dataUrl});m.remove();
    };
  }

  function recordStatusLabel(r,state){
    if(r?.finalized_at) return '<span class="doc09-status final">Finalized</span>';
    if(r?.signed_at) return '<span class="doc09-status final">Signed</span>';
    if(r) return '<span class="doc09-status generated">'+escHtml(r.document_status==='pending_signature'?'Pending signature':'Draft')+'</span>';
    if(state.required) return '<span class="doc09-status required">Required</span>';
    return '<span class="doc09-status optional">Available</span>';
  }

  async function refreshJobCenter(j,force=false){
    if(!ready||!j) return;
    const root=document.getElementById('jobDetailBody'); if(!root) return;
    const records=await loadRecords(j,force);
    root.querySelector('#doc09JobCenter')?.remove();
    const jobTemplates=templates.filter(t=>templateState(t,j).applicable)
      .sort((a,b)=>(a.wave-b.wave)||((FLOW_ORDER[a.code]||999)-(FLOW_ORDER[b.code]||999))||a.code.localeCompare(b.code));
    const groups=[...new Set(jobTemplates.map(t=>t.wave))].map(w=>{
      const cards=jobTemplates.filter(t=>t.wave===w).map(t=>{
        const state=templateState(t,j),r=latestRecord(records,t.code),blocked=gate(t,j);
        return '<div class="doc09-card '+(state.required?'required':'')+'"><div class="doc09-card-head"><div><span>'+escHtml(t.code)+'</span><strong>'+escHtml(t.title)+'</strong></div>'+recordStatusLabel(r,state)+'</div><small>'+escHtml(state.reason)+(blocked?' · '+escHtml(blocked):'')+'</small><div class="doc09-actions">'+
          '<button class="btn secondary compact" data-doc09-template="'+escHtml(t.code)+'">Template</button>'+
          (r?'<button class="btn secondary compact" data-doc09-view="'+escHtml(r.id)+'">View</button><button class="btn primary compact" data-doc09-finalize="'+escHtml(r.id)+'" '+(r.finalized_at?'disabled':'')+'>'+(r.finalized_at?'Frozen':'Finalize')+'</button>':
          '<button class="btn primary compact" data-doc09-generate="'+escHtml(t.code)+'" '+(blocked?'disabled':'')+'>Generate</button>')+
          '</div></div>';
      }).join('');
      return '<section class="doc09-wave"><div class="doc09-wave-head"><h4>Wave '+w+'</h4><span>'+jobTemplates.filter(t=>t.wave===w).length+' controls</span></div><div class="doc09-grid">'+cards+'</div></section>';
    }).join('');
    const summaryRequired=jobTemplates.filter(t=>templateState(t,j).required).length;
    const completed=jobTemplates.filter(t=>templateState(t,j).required&&latestRecord(records,t.code)?.finalized_at).length;
    const html='<article class="panel detail-section document-center doc09-center" id="doc09JobCenter"><div class="panel-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h3>Job Document Register</h3><p class="muted">'+completed+' of '+summaryRequired+' currently required controls finalized. Templates and records are driven by the TTT-OS registry.</p></div><button class="btn secondary compact" id="doc09OpenLibrary">Open Document Library</button></div>'+groups+'</article>';
    const old=root.querySelector('#documentCenter');
    if(old) old.insertAdjacentHTML('afterend',html); else root.insertAdjacentHTML('beforeend',html);
    const center=document.getElementById('doc09JobCenter');
    center.querySelectorAll('[data-doc09-template]').forEach(b=>b.onclick=()=>{const t=templates.find(x=>x.code===b.dataset.doc09Template);window.open(t?.template_url,'_blank','noopener');});
    center.querySelectorAll('[data-doc09-generate]').forEach(b=>b.onclick=()=>createRecord(j,b.dataset.doc09Generate));
    center.querySelectorAll('[data-doc09-view]').forEach(b=>b.onclick=()=>{const r=records.find(x=>x.id===b.dataset.doc09View);if(r)openRecord(r,j);});
    center.querySelectorAll('[data-doc09-finalize]').forEach(b=>b.onclick=()=>{const r=records.find(x=>x.id===b.dataset.doc09Finalize);if(r)signatureModal(r,j);});
    document.getElementById('doc09OpenLibrary').onclick=()=>showLibrary();
  }

  function installLibraryView(){
    if(document.getElementById('documentsControl')) return;
    const main=document.querySelector('main.main');
    main.insertAdjacentHTML('beforeend','<section id="documentsControl" class="view"><div class="section-head"><div><p class="eyebrow">DOCUMENT GOVERNANCE</p><h2>Document Control Center</h2><p class="muted">Waves 1-9 · Controlled templates, workflow triggers and production status.</p></div><a class="btn secondary" href="'+ROOT_FOLDER+'" target="_blank" rel="noopener">Open Master Drive Library</a></div><div id="doc09Library"></div></section>');
    const settings=document.querySelector('.nav-settings');
    if(settings&&!document.querySelector('[data-view="documentsControl"]')){
      const b=document.createElement('button');b.className='nav-item';b.dataset.view='documentsControl';b.innerHTML='<span>Documents & Compliance</span>';settings.parentElement.insertBefore(b,settings);
      b.onclick=e=>{e.preventDefault();showLibrary();};
    }
    renderLibrary();
  }

  async function createGlobalRecord(t){
    document.getElementById('doc09GlobalModal')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div class="doc09-modal open" id="doc09GlobalModal"><div class="doc09-backdrop"></div><div class="doc09-sign-shell"><div class="panel-head"><div><p class="eyebrow">CONTROLLED DOCUMENT</p><h3>'+escHtml(t.code+' · '+t.title)+'</h3><p class="muted">Wave '+t.wave+' · '+escHtml(t.scope_type)+' · trigger: '+escHtml(t.trigger_stage)+'</p></div><button class="btn secondary" id="doc09GlobalCancel">Cancel</button></div><label>Related record / entity ID<input id="doc09GlobalEntity" placeholder="Optional job, vendor, account, PO, employee or other record ID"></label><label>Record notes<textarea id="doc09GlobalNotes" placeholder="Purpose, context or source reference for this controlled record"></textarea></label><button class="btn primary large" id="doc09GlobalCreate">Create Controlled Record</button></div></div>');
    const m=document.getElementById('doc09GlobalModal');
    document.getElementById('doc09GlobalCancel').onclick=()=>m.remove();
    document.getElementById('doc09GlobalCreate').onclick=async()=>{
      const entityId=document.getElementById('doc09GlobalEntity').value.trim();
      const notes=document.getElementById('doc09GlobalNotes').value.trim();
      let number;
      try{ number=await nextNumber(t.code); }catch(e){ toast('Could not allocate document number'); return; }
      const payload={
        organization_id:org(),document_type:String(t.title).toLowerCase().replace(/[^a-z0-9]+/g,'_'),
        title:t.title,document_code:t.code,document_number:number,document_status:t.requires_signature?'pending_signature':'draft',
        template_version:t.current_version,template_url:t.template_url,generated_at:now(),
        notes:notes||null,
        snapshot:{capturedAt:now(),template:{code:t.code,title:t.title,version:t.current_version,url:t.template_url,wave:t.wave},entity:{type:t.scope_type,id:entityId||null},source:'TTT-OS'},
        metadata:{wave:t.wave,scope_type:t.scope_type,trigger_stage:t.trigger_stage,entity_id:entityId||null}
      };
      const {data,error}=await cloud().from('documents').insert(payload).select('*').single();
      if(error){console.error(error);toast('Could not create controlled record');return;}
      toast(number+' created');
      m.remove();
      renderLibrary();
      const shell={id:null,customerId:null,vehicleId:null,checkIn:null};
      openRecord(data,shell);
    };
  }

  function showLibrary(){
    document.querySelectorAll('.view.active').forEach(x=>x.classList.remove('active'));
    document.getElementById('documentsControl')?.classList.add('active');
    document.querySelectorAll('.nav-item.active').forEach(x=>x.classList.remove('active'));
    document.querySelector('[data-view="documentsControl"]')?.classList.add('active');
    const title=document.getElementById('pageTitle');if(title)title.textContent='Document Control Center';
    renderLibrary();
  }

  function renderLibrary(){
    const host=document.getElementById('doc09Library');if(!host||!templates.length)return;
    host.innerHTML='<div class="doc09-library-summary"><div><strong>'+templates.length+'</strong><span>controlled templates</span></div><div><strong>9</strong><span>document waves</span></div><div><strong>'+templates.filter(t=>t.legal_review_required).length+'</strong><span>legal-review flagged</span></div><div><strong>'+templates.filter(t=>t.requires_signature).length+'</strong><span>signature-controlled</span></div></div>'+
      [1,2,3,4,5,6,7,8,9].map(w=>'<article class="panel doc09-library-wave"><div class="panel-head"><div><p class="eyebrow">WAVE '+w+'</p><h3>'+escHtml(waveName(w))+'</h3></div><span class="badge">'+templates.filter(t=>t.wave===w).length+' templates</span></div><div class="doc09-library-table">'+templates.filter(t=>t.wave===w).map(t=>'<div class="doc09-library-row"><div><strong>'+escHtml(t.code)+' · '+escHtml(t.title)+'</strong><small>'+escHtml(t.scope_type)+' · trigger: '+escHtml(t.trigger_stage)+' · version '+escHtml(t.current_version)+'</small></div><div>'+(t.legal_review_required?'<span class="doc09-flag legal">Legal review</span>':'')+(t.requires_signature?'<span class="doc09-flag">Signature</span>':'')+(t.customer_facing?'<span class="doc09-flag customer">Customer-facing</span>':'')+'<button class="btn primary compact" data-doc09-create-global="'+escHtml(t.code)+'">Create Record</button><a class="btn secondary compact" href="'+escHtml(t.template_url)+'" target="_blank" rel="noopener">Open</a></div></div>').join('')+'</div></article>').join('');
    host.querySelectorAll('[data-doc09-create-global]').forEach(b=>b.onclick=()=>{
      const t=templates.find(x=>x.code===b.dataset.doc09CreateGlobal);
      if(t) createGlobalRecord(t);
    });
  }

  function waveName(w){return {1:'Core Customer Job Pack',2:'Diagnostics & Pre-Repair Authorization',3:'Customer Protection & Legal',4:'Exceptions, Claims & Risk',5:'Purchasing & Inventory',6:'Finance & Accounting',7:'Connected Electronics & Security',8:'B2B, Dealer & Fleet',9:'Governance & Audit'}[w]||'';}

  function observe(){
    const obs=new MutationObserver(()=>{
      const j=currentJob(); if(j&&document.getElementById('jobdetail')?.classList.contains('active')){
        const center=document.getElementById('doc09JobCenter');
        if(!center) refreshJobCenter(j);
      }
    });
    obs.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      if(e.target?.closest('#v05AuthorizeBtn')){
        const j=currentJob();
        if(j&&!(j.checkIn?.photos||[]).length){
          e.preventDefault();e.stopImmediatePropagation();toast('Final authorization is blocked until required check-in photographs are stored.');
        }
      }
    },true);
  }

  window.TTTDocumentSystem={
    get templates(){return templates.slice();},
    loadTemplates,
    refreshJobCenter,
    createRecord,
    openLibrary:showLibrary,
    rootFolder:ROOT_FOLDER
  };

  observe();
  loadTemplates();
})();