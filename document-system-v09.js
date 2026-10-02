// TTT Document System v0.9 — Waves 1-9 registry, workflow requirements and immutable records.
(function(){
  'use strict';

  const WAVE_LABELS={
    1:'Core Customer Job Pack',
    2:'Diagnostics',
    3:'Customer Protection & Legal',
    4:'Exceptions, Claims & Risk',
    5:'Purchasing & Inventory',
    6:'Finance & Accounting',
    7:'Connected Electronics & Security',
    8:'B2B, Dealer & Fleet',
    9:'Internal Governance'
  };
  const CORE_ORDER=['Q','CHK','AUTH','WO','CO','QC','INV','RCPT','COMP','WAR','PO'];
  const state={templates:[],records:[],loaded:false,loading:false,error:'',waveFilter:0};

  function h(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function cloud(){return window.TTTCloud||null;}
  function orgId(){return cloud()?.organizationId||null;}
  function userId(){return cloud()?.userId||cloud()?.user?.id||null;}
  function client(){return cloud()?.client||null;}
  function currentJob(){try{return typeof currentJobId!=='undefined'&&currentJobId&&typeof job==='function'?job(currentJobId):null;}catch{return null;}}
  function getCustomer(j){try{return j&&typeof customer==='function'?customer(j.customerId):null;}catch{return null;}}
  function getVehicle(j){try{return j&&typeof vehicle==='function'?vehicle(j.vehicleId):null;}catch{return null;}}
  function toastSafe(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}
  function lower(v){return String(v??'').toLowerCase();}
  function nowIso(){return new Date().toISOString();}
  function dateOnly(){return new Date().toISOString().slice(0,10);}
  function template(code){return state.templates.find(t=>t.code===code)||null;}
  function currentTermsVersion(){return template('TNC')?.current_version||'v0.1';}

  function serviceText(j){
    const s=[];
    (j?.services||[]).forEach(x=>s.push(typeof x==='string'?x:(x?.name||x?.category||'')));
    (j?.equipment||[]).forEach(x=>s.push([x?.category,x?.brand,x?.model].filter(Boolean).join(' ')));
    (j?.quote?.snapshot?.services||[]).forEach(x=>s.push(typeof x==='string'?x:(x?.name||x?.category||'')));
    (j?.quote?.snapshot?.equipment||[]).forEach(x=>s.push([x?.category,x?.brand,x?.model].filter(Boolean).join(' ')));
    s.push(j?.requestNotes||'',j?.quote?.snapshot?.requestNotes||'',j?.partsStatus||'');
    return lower(s.filter(Boolean).join(' '));
  }
  function hasService(j,rx){return rx.test(serviceText(j));}
  function hasPayment(j){return Number(j?.depositReceived||0)>0||Number(j?.invoice?.snapshot?.paid||0)>0||(j?.payments||[]).length>0;}
  function isCompleteLike(j){return /delivered|closed|completed|ready for delivery/i.test(String(j?.status||''));}
  function isDiagnostic(j){return hasService(j,/signaltrace|diagnostic|electrical diagnosis|troubleshoot/);}
  function isTint(j){return hasService(j,/tint/);}
  function isConnected(j){return hasService(j,/gps|tracking|tracker|security|alarm|immobilizer|kill switch|remote start|telematics|dash ?cam/);}
  function isSecurity(j){return hasService(j,/security|alarm|immobilizer|kill switch|remote start/);}
  function isSubscription(j){return hasService(j,/gps|tracking|tracker|cellular|subscription|telematics/);}
  function customerSupplied(j){return /customer supplied/i.test(String(j?.partsStatus||''))||hasService(j,/customer[- ]supplied/);}

  function sourceKey(code,j,extra){
    if(extra?.sourceKey)return extra.sourceKey;
    if(code==='CO'&&extra?.changeOrderId)return 'change-order:'+extra.changeOrderId;
    return [code,j?.id||extra?.entityId||'global'].join(':');
  }

  function recordsFor(code,j){
    const jid=j?.id;
    return state.records.filter(r=>r.document_code===code&&(!jid||r.job_id===jid)&&!r.archived_at);
  }
  function recordFor(code,j,source){
    const rows=recordsFor(code,j);
    if(!source)return rows.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]||null;
    return rows.find(r=>r.metadata?.source_key===source)||null;
  }

  function virtualStatus(code,j){
    if(!j)return null;
    const delivered=/delivered|closed/i.test(String(j.status||''));
    const qcDone=!!j.qc||!!j.qcStatus||/ready for delivery|delivered|closed|completed/i.test(String(j.status||''));
    const map={
      Q:!!(j.quote?.id||j.quoteId),
      CHK:!!j.checkIn,
      AUTH:!!j.finalAuthorization,
      WO:!!j.workOrderId,
      CO:(j.changeOrders||[]).length>0,
      QC:qcDone,
      INV:!!j.invoice,
      RCPT:hasPayment(j),
      COMP:!!(j.completion||j.handover)||delivered,
      WAR:!!j.warranty||delivered,
      DEP:Number(j.depositReceived||0)>0
    };
    return map[code]?{status:'system',label:'In TTT-OS'}:null;
  }

  function isRequired(t,j){
    const m=t?.metadata||{};
    if(m.required_by_default===true)return true;
    if(Array.isArray(m.required_for)){
      const text=serviceText(j);
      if(m.required_for.some(x=>text.includes(lower(x))))return true;
    }
    switch(t?.code){
      case 'CO': return (j?.changeOrders||[]).length>0;
      case 'PO': return /ordering|ordered|received/i.test(String(j?.partsStatus||''))||!!j?.purchaseOrderId;
      case 'RCPT': return hasPayment(j);
      case 'DEP': return Number(j?.depositReceived||0)>0;
      case 'WAR': return isCompleteLike(j);
      case 'DIA': case 'DFR': return isDiagnostic(j);
      case 'DRA': return !!(j?.diagnosticToRepair||j?.repairQuoteId||j?.diagnosticFindings?.repairApproved);
      case 'TINT': return isTint(j);
      case 'CSE': return customerSupplied(j);
      case 'REL': return !!(j?.thirdPartyPickup||j?.releaseAuthorizationRequired);
      case 'INC': return !!j?.incidentOpen;
      case 'WCL': return !!j?.warrantyClaim;
      case 'DEC': return !!j?.declinedRecommendation;
      case 'UNCL': return !!j?.extendedCustody;
      case 'DEV': return isConnected(j);
      case 'SEC': return isSecurity(j);
      case 'SUB': return isSubscription(j);
      case 'FWA': return !!(j?.fleetAccount||j?.fleetAuthorization);
      case 'DRO': return !!(j?.dealerRO||j?.dealerAccount);
      case 'TSA': return !!j?.workOrderId;
      case 'JDR': return isCompleteLike(j);
      default:return false;
    }
  }

  function relevantJobTemplates(j){
    const jobTemplates=state.templates.filter(t=>t.active&&t.scope_type==='job');
    const active=[],optional=[];
    for(const t of jobTemplates){
      const required=isRequired(t,j);
      const rec=recordFor(t.code,j);
      const virt=virtualStatus(t.code,j);
      if(required||rec||virt)active.push({t,required,rec,virt});
      else optional.push({t,required:false,rec:null,virt:null});
    }
    const order=(x)=>{
      const idx=CORE_ORDER.indexOf(x.t.code);
      return idx>=0?idx:100+x.t.wave*10;
    };
    active.sort((a,b)=>order(a)-order(b)||a.t.title.localeCompare(b.t.title));
    optional.sort((a,b)=>a.t.wave-b.t.wave||a.t.title.localeCompare(b.t.title));
    return {active,optional};
  }

  function statusInfo(item,j){
    const r=item.rec;
    if(r){
      const status=r.document_status||'draft';
      return {status,label:status==='finalized'?'Finalized':status==='pending_signature'?'Pending signature':status==='void'?'Void':'Draft'};
    }
    if(item.virt)return item.virt;
    return {status:'missing',label:item.required?'Required':'Available'};
  }

  function authGate(j){
    const reasons=[];
    if(!j?.checkIn)reasons.push('Vehicle Check-In is not complete.');
    const photos=Number(j?.checkIn?.photoCount??j?.checkIn?.photos?.length??0);
    if(photos<1)reasons.push('At least one stored check-in condition photo is required.');
    if(!j?.finalAuthorization)reasons.push('Customer Authorization is not complete.');
    if(j?.finalAuthorization&&!j.finalAuthorization.approvalMark)reasons.push('Customer signature is missing from the authorization.');
    if(j?.finalAuthorization&&!j.finalAuthorization.conditionPhotosAcknowledged)reasons.push('Condition-photo acknowledgement is missing.');
    return {ok:reasons.length===0,reasons,photoCount:photos};
  }

  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object'){
      const o={};Object.keys(value).sort().forEach(k=>{if(value[k]!==undefined)o[k]=stable(value[k]);});return o;
    }
    return value;
  }
  async function sha256(value){
    const raw=typeof value==='string'?value:JSON.stringify(stable(value));
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function waitCloud(){
    for(let i=0;i<120;i++){
      if(client()&&orgId())return true;
      await new Promise(r=>setTimeout(r,125));
    }
    return false;
  }

  async function load(force=false){
    if(state.loading)return;
    if(state.loaded&&!force)return;
    state.loading=true;state.error='';
    try{
      if(!await waitCloud())throw new Error('Cloud document registry is not ready.');
      const c=client(),org=orgId();
      const [templatesResult,recordsResult]=await Promise.all([
        c.from('document_templates').select('*').eq('organization_id',org).eq('active',true).order('wave').order('code'),
        c.from('documents').select('id,organization_id,job_id,customer_id,vehicle_id,work_order_id,document_code,document_number,document_status,title,template_version,template_url,signer_name,signature_method,signed_at,generated_at,finalized_at,content_hash,metadata,archived_at,created_at,updated_at').eq('organization_id',org).is('archived_at',null).order('created_at',{ascending:false})
      ]);
      if(templatesResult.error)throw templatesResult.error;
      if(recordsResult.error)throw recordsResult.error;
      state.templates=templatesResult.data||[];
      state.records=recordsResult.data||[];
      state.loaded=true;
      renderGlobal();
      injectJobPanel();
    }catch(error){
      state.error=error.message||String(error);
      console.error('TTT document system load failed',error);
      renderGlobal();
    }finally{state.loading=false;}
  }

  async function allocateNumber(code){
    const {data,error}=await client().rpc('next_ttt_document_number',{p_organization_id:orgId(),p_document_code:code});
    if(error)throw error;
    return data;
  }

  function snapshotBase(t,j,extra={}){
    const c=getCustomer(j),v=getVehicle(j);
    return {
      document_code:t.code,
      template_version:t.current_version,
      generated_at:nowIso(),
      job:j?{id:j.id,status:j.status,workOrderId:j.workOrderId||null}:null,
      customer:c?{id:c.id,name:c.name||c.displayName||null}:null,
      vehicle:v?{id:v.id,year:v.year,make:v.make,model:v.model,trim:v.trim,vin:v.vin,plate:v.plate,plateState:v.plateState}:null,
      ...extra
    };
  }

  async function createDraft(code,j,extra={}){
    await load();
    const t=template(code);if(!t)throw new Error('Document template '+code+' is not registered.');
    const source=sourceKey(code,j,extra);
    const existing=recordFor(code,j,source);
    if(existing)return existing;
    const number=await allocateNumber(code);
    const c=getCustomer(j),v=getVehicle(j);
    const row={
      organization_id:orgId(),
      company_id:j?.companyId||null,
      customer_id:j?.customerId||null,
      job_id:j?.id||null,
      quote_id:j?.quote?.id||j?.quoteId||null,
      invoice_id:j?.invoice?.id||null,
      purchase_order_id:j?.purchaseOrderId||null,
      document_type:code,
      title:t.title,
      document_date:dateOnly(),
      confidentiality:t.customer_facing?'customer':'internal',
      metadata:{wave:t.wave,category:t.category,scope_type:t.scope_type,source:'document-system-v09',source_key:source,...(extra.metadata||{})},
      document_code:code,
      document_number:number,
      document_status:t.requires_signature?'pending_signature':'draft',
      template_version:t.current_version,
      template_url:t.template_url,
      vehicle_id:j?.vehicleId||v?.id||null,
      work_order_id:j?.workOrderId||null,
      generated_at:nowIso(),
      snapshot:snapshotBase(t,j,extra.snapshot||{}),
      created_by:userId(),
      updated_by:userId()
    };
    const {data,error}=await client().from('documents').insert(row).select().single();
    if(error)throw error;
    state.records.unshift(data);
    cloud()?.audit?.('document',data.id,'document_record_created',{document_code:code,document_number:number,job_id:j?.id||null}).catch?.(()=>{});
    renderGlobal();injectJobPanel();
    return data;
  }

  async function finalizeRecord(record,snapshot,signing={}){
    if(!record)return null;
    if(record.finalized_at)return record;
    const t=template(record.document_code);
    if(t?.requires_signature&&!signing.signerName)throw new Error('A signer is required before this document can be finalized.');
    const finalSnapshot=stable(snapshot||record.snapshot||{});
    const digest='sha256:'+await sha256(finalSnapshot);
    const patch={
      document_status:'finalized',
      finalized_at:nowIso(),
      content_hash:digest,
      snapshot:finalSnapshot,
      signer_name:signing.signerName||record.signer_name||null,
      signature_method:signing.signatureMethod||record.signature_method||null,
      signed_at:signing.signedAt||record.signed_at||null,
      updated_by:userId()
    };
    const {data,error}=await client().from('documents').update(patch).eq('organization_id',orgId()).eq('id',record.id).select().single();
    if(error)throw error;
    state.records=state.records.map(r=>r.id===data.id?data:r);
    cloud()?.audit?.('document',data.id,'document_finalized',{document_code:data.document_code,document_number:data.document_number,content_hash:digest}).catch?.(()=>{});
    renderGlobal();injectJobPanel();
    return data;
  }

  async function recordCheckIn(j){
    const rec=await createDraft('CHK',j,{sourceKey:'checkin:'+j.id});
    if(rec.finalized_at)return rec;
    const photos=(j.checkIn?.photos||[]).map(p=>({id:p.id,group:p.group,area:p.area,fileName:p.fileName,mime:p.mime,capturedAt:p.capturedAt,storagePath:p.storagePath}));
    const videos=(j.checkIn?.videos||[]).map(p=>({id:p.id,category:p.category,fileName:p.fileName,mime:p.mime,capturedAt:p.capturedAt,storagePath:p.storagePath}));
    return finalizeRecord(rec,snapshotBase(template('CHK'),j,{checkIn:{...j.checkIn,photos,videos}}),{});
  }

  async function recordAuthorization(j){
    const source='authorization:'+(j.finalAuthorization?.id||j.id);
    const existing=recordFor('AUTH',j,source);
    if(existing?.finalized_at)return existing;
    const rec=existing||await createDraft('AUTH',j,{sourceKey:source});
    const photos=(j.checkIn?.photos||[]).map(p=>({id:p.id,group:p.group,area:p.area,fileName:p.fileName,capturedAt:p.capturedAt,storagePath:p.storagePath}));
    const signatureHash=j.finalAuthorization?.approvalMark?('sha256:'+await sha256(j.finalAuthorization.approvalMark)):null;
    const auth={...j.finalAuthorization,approvalMark:undefined,signatureHash,conditionPhotos:photos};
    return finalizeRecord(rec,snapshotBase(template('AUTH'),j,{authorization:auth,checkIn:{capturedAt:j.checkIn?.capturedAt,photoCount:photos.length,photos}}),{
      signerName:j.finalAuthorization?.name||null,
      signatureMethod:j.finalAuthorization?.method||'In-person digital authorization',
      signedAt:j.finalAuthorization?.at||nowIso()
    });
  }

  async function recordWorkOrder(j){
    return createDraft('WO',j,{sourceKey:'work-order:'+(j.workOrderId||j.id),snapshot:{authorizedTotal:window.TTTV05?.authorizedTotal?.(j),workExecution:j.workExecution||null}});
  }

  async function recordChangeOrder(j,changeOrderId){
    const co=(j.changeOrders||[]).find(x=>x.id===changeOrderId);if(!co)return null;
    const source='change-order:'+co.id;
    const existing=recordFor('CO',j,source);
    if(existing?.finalized_at)return existing;
    const rec=existing||await createDraft('CO',j,{sourceKey:source,changeOrderId:co.id});
    return finalizeRecord(rec,snapshotBase(template('CO'),j,{changeOrder:co}),{
      signerName:co.signerName||'Recorded approver',
      signatureMethod:co.approvalMethod||'Recorded in TTT OS',
      signedAt:co.approvedAt||nowIso()
    });
  }

  async function recordInvoice(j){
    if(!j?.invoice)return null;
    const source='invoice:'+j.invoice.id;
    const existing=recordFor('INV',j,source);
    if(existing?.finalized_at)return existing;
    const rec=existing||await createDraft('INV',j,{sourceKey:source});
    return finalizeRecord(rec,snapshotBase(template('INV'),j,{invoice:j.invoice}),{});
  }

  async function finalizeDraftById(id,j){
    const rec=state.records.find(r=>r.id===id);if(!rec)return;
    const t=template(rec.document_code);
    if(t?.requires_signature){toastSafe('This document requires its dedicated approval/signature workflow.');return;}
    try{await finalizeRecord(rec,snapshotBase(t,j,{manualFinalization:true}),{});toastSafe(rec.document_number+' finalized');}
    catch(e){toastSafe(e.message||'Could not finalize document');}
  }

  function badge(status,label){
    const cls=status==='finalized'||status==='system'?'ok':status==='missing'?'warn':status==='pending_signature'?'blue':'dark';
    return '<span class="docsys-badge '+cls+'">'+h(label)+'</span>';
  }

  function templateButton(t){
    return t?.template_url?'<a class="btn secondary compact" target="_blank" rel="noopener" href="'+h(t.template_url)+'">Template</a>':'';
  }

  function ensureView(){
    if(document.getElementById('documents'))return;
    const main=document.querySelector('main.main')||document.querySelector('main');if(!main)return;
    const settings=document.getElementById('settings');
    const section=document.createElement('section');
    section.id='documents';section.className='view';
    section.innerHTML='<div id="documentSystemRoot"><div class="panel"><p>Loading document system…</p></div></div>';
    if(settings)main.insertBefore(section,settings);else main.appendChild(section);
  }

  function renderGlobal(){
    ensureView();
    const root=document.getElementById('documentSystemRoot');if(!root)return;
    if(state.error){root.innerHTML='<div class="panel"><h3>Document system unavailable</h3><p class="muted">'+h(state.error)+'</p></div>';return;}
    if(!state.loaded){root.innerHTML='<div class="panel"><p>Loading document system…</p></div>';return;}
    const finalized=state.records.filter(r=>r.document_status==='finalized').length;
    const legal=state.templates.filter(t=>t.legal_review_required).length;
    const waves=[...new Set(state.templates.map(t=>t.wave))].sort((a,b)=>a-b);
    const filter=state.waveFilter;
    let html='<div class="docsys-header"><div><p class="eyebrow">DOCUMENTS & COMPLIANCE</p><h2>TTT Document System</h2><p class="muted">Canonical templates, workflow records, signatures, version control and immutable finalized evidence across Waves 1–9.</p></div><button class="btn secondary" id="docsysRefresh">Refresh</button></div>';
    html+='<div class="docsys-summary"><div class="docsys-metric"><span>Templates</span><strong>'+state.templates.length+'</strong></div><div class="docsys-metric"><span>Waves</span><strong>'+waves.length+'</strong></div><div class="docsys-metric"><span>Finalized Records</span><strong>'+finalized+'</strong></div><div class="docsys-metric"><span>Legal Review</span><strong>'+legal+'</strong></div></div>';
    html+='<div class="docsys-filter"><button class="btn secondary compact '+(!filter?'active':'')+'" data-docsys-wave="0">All Waves</button>'+waves.map(w=>'<button class="btn secondary compact '+(filter===w?'active':'')+'" data-docsys-wave="'+w+'">Wave '+w+'</button>').join('')+'</div>';
    for(const w of waves){
      if(filter&&filter!==w)continue;
      const rows=state.templates.filter(t=>t.wave===w);
      html+='<section class="docsys-wave"><div class="docsys-wave-head"><h3>Wave '+w+' — '+h(WAVE_LABELS[w]||'Documents')+'</h3><span>'+rows.length+' templates</span></div><div class="table-wrap"><table class="docsys-table"><thead><tr><th>Code</th><th>Document</th><th>Process / scope</th><th>Status</th><th></th></tr></thead><tbody>';
      for(const t of rows){
        const recordCount=state.records.filter(r=>r.document_code===t.code).length;
        html+='<tr><td><span class="docsys-code">'+h(t.code)+'</span></td><td><span class="docsys-title">'+h(t.title)+'</span><span class="docsys-sub">Template '+h(t.current_version)+(t.legal_review_required?' · LEGAL REVIEW REQUIRED':'')+'</span></td><td>'+h(t.trigger_stage||'—')+'<span class="docsys-sub">'+h(t.scope_type)+' · '+h(t.category)+'</span></td><td>'+badge(recordCount?'system':'draft',recordCount?recordCount+' record'+(recordCount===1?'':'s'):'Registered')+'</td><td><div class="docsys-actions">'+templateButton(t)+'</div></td></tr>';
      }
      html+='</tbody></table></div></section>';
    }
    html+='<p class="docsys-registry-note">Finalized document rows are immutable. Corrections are made with a new/superseding record rather than silently altering signed or finalized evidence.</p>';
    root.innerHTML=html;
    document.getElementById('docsysRefresh')?.addEventListener('click',()=>load(true));
    root.querySelectorAll('[data-docsys-wave]').forEach(b=>b.addEventListener('click',()=>{state.waveFilter=Number(b.dataset.docsysWave)||0;renderGlobal();}));
  }

  function jobRow(item,j){
    const t=item.t,info=statusInfo(item,j);
    const current=item.rec;
    const canCreate=!current&&!item.virt;
    const canFinalize=current&&current.document_status==='draft'&&!t.requires_signature;
    let actions=templateButton(t);
    if(canCreate)actions+='<button class="btn secondary compact" data-docsys-create="'+h(t.code)+'">Create record</button>';
    if(canFinalize)actions+='<button class="btn primary compact" data-docsys-finalize="'+h(current.id)+'">Finalize</button>';
    if(current?.document_number)actions+='<span class="docsys-sub">'+h(current.document_number)+'</span>';
    return '<div class="docsys-job-row '+(item.required?'required ':'')+(item.required&&info.status==='missing'?'blocked':'')+'"><span class="docsys-code">'+h(t.code)+'</span><div><strong>'+h(t.title)+'</strong><small>Wave '+t.wave+' · '+h(t.trigger_stage||'workflow')+(t.legal_review_required?' · legal review required':'')+'</small></div><div class="docsys-job-row-actions">'+badge(info.status,info.label)+actions+'</div></div>';
  }

  function injectJobPanel(){
    const root=document.getElementById('jobDetailBody'),j=currentJob();if(!root||!j||!state.loaded)return;
    root.querySelector('#docsysJobPanel')?.remove();
    const groups=relevantJobTemplates(j);
    const gate=authGate(j);
    const requiredMissing=groups.active.filter(x=>x.required&&statusInfo(x,j).status==='missing').length;
    const panel=document.createElement('article');panel.className='panel detail-section docsys-job-panel';panel.id='docsysJobPanel';
    panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h3>Job Document Register</h3><p class="muted">'+requiredMissing+' required document checkpoint'+(requiredMissing===1?'':'s')+' currently unresolved.</p></div><span class="badge">Waves 1–9</span></div>'+
      '<div class="docsys-gate '+(gate.ok?'ok':'')+'"><strong>Work authorization gate: '+(gate.ok?'PASS':'NOT READY')+'</strong><br>'+(gate.ok?'Check-In, condition-photo acknowledgement and signed Customer Authorization are recorded.':h(gate.reasons.join(' ')))+'</div>'+
      '<div class="docsys-job-list">'+groups.active.map(x=>jobRow(x,j)).join('')+'</div>'+
      '<details class="top-gap"><summary>Additional / conditional job documents ('+groups.optional.length+')</summary><div class="docsys-job-list">'+groups.optional.map(x=>jobRow(x,j)).join('')+'</div></details>';
    root.appendChild(panel);
    panel.querySelectorAll('[data-docsys-create]').forEach(b=>b.addEventListener('click',async()=>{
      b.disabled=true;
      try{const r=await createDraft(b.dataset.docsysCreate,j);toastSafe(r.document_number+' created');}
      catch(e){toastSafe(e.message||'Could not create document record');}
      finally{b.disabled=false;injectJobPanel();}
    }));
    panel.querySelectorAll('[data-docsys-finalize]').forEach(b=>b.addEventListener('click',()=>finalizeDraftById(b.dataset.docsysFinalize,j)));
  }

  function patchRenderHooks(){
    if(window.__TTTDocumentSystemRenderPatched)return;
    window.__TTTDocumentSystemRenderPatched=true;
    if(typeof render==='function'){
      const base=render;render=function(){base();setTimeout(injectJobPanel,0);};
    }
    if(typeof renderJobDetail==='function'){
      const baseDetail=renderJobDetail;renderJobDetail=function(){baseDetail();setTimeout(injectJobPanel,0);};
    }
  }

  async function onOperationalChange(event){
    const detail=event?.detail||{},j=detail.jobId&&typeof job==='function'?job(detail.jobId):currentJob();
    if(!j)return;
    try{
      if(detail.action==='final_authorization_and_work_order_created'){
        await recordAuthorization(j);await recordWorkOrder(j);
      }else if(detail.action==='change_order_approved'){
        await recordChangeOrder(j,detail.changeOrderId);
      }else if(detail.action==='work_completed_sent_to_qc'){
        await createDraft('TSA',j,{sourceKey:'technician-signoff:'+j.id,snapshot:{workExecution:j.workExecution||null}});
      }
    }catch(e){console.error('Document workflow sync failed',e);}
    injectJobPanel();
  }

  function init(){
    ensureView();patchRenderHooks();renderGlobal();
    window.addEventListener('ttt:cloud-state-applied',()=>load(true));
    window.addEventListener('ttt:job-operational-change',onOperationalChange);
    setTimeout(()=>load(),50);
  }

  window.TTTDocumentSystem={
    state,load,template,currentTermsVersion,relevantJobTemplates,authGate,
    createDraft,finalizeRecord,recordCheckIn,recordAuthorization,recordWorkOrder,recordChangeOrder,recordInvoice,
    injectJobPanel,renderGlobal,sha256
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
