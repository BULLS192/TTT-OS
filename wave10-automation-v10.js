// TTT OS Wave 10 — End-to-End Job & Document Automation
(function(){
  'use strict';

  const state={artifacts:[],templateVersions:[],loading:false};
  const cloud=()=>window.TTTCloud?.client;
  const org=()=>window.TTTCloud?.organizationId;
  const uid=()=>window.TTTCloud?.userId;
  const wf=()=>window.TTTWorkflowAutomation;
  const rules=()=>window.TTTWave10Rules;
  const localJob=id=>typeof window.job==='function'?window.job(id):window.db?.jobs?.find(x=>x.id===id);
  const localCustomer=id=>typeof window.customer==='function'?window.customer(id):window.db?.customers?.find(x=>x.id===id);
  const money=v=>'$'+Number(v||0).toFixed(2);
  const lower=v=>String(v??'').toLowerCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toast=m=>typeof window.toast==='function'?window.toast(m):console.log(m);
  const now=()=>new Date().toISOString();
  const activeJobRows=()=>wf()?.state?.jobs?.filter(x=>!x.archived_at&&!['closed','cancelled','canceled'].includes(lower(x.status)))||[];
  const docs=()=>wf()?.state?.documents||[];
  const templates=()=>wf()?.state?.templates||[];
  const invoices=()=>wf()?.state?.invoices||[];
  const payments=()=>wf()?.state?.payments||[];
  const exceptions=()=>wf()?.state?.exceptions||[];

  async function waitReady(){
    for(let i=0;i<200;i++){
      if(cloud()&&org()&&wf()?.state&&rules())return true;
      await new Promise(r=>setTimeout(r,100));
    }
    return false;
  }

  async function load(){
    if(state.loading||!await waitReady())return;
    state.loading=true;
    try{
      const [a,v]=await Promise.all([
        cloud().from('document_artifacts').select('*').eq('organization_id',org()).order('generated_at',{ascending:false}).limit(2500),
        cloud().from('document_template_versions').select('*').eq('organization_id',org()).order('created_at',{ascending:false}).limit(1000)
      ]);
      if(!a.error)state.artifacts=a.data||[];
      if(!v.error)state.templateVersions=v.data||[];
      await reconcileServiceDocuments();
      await backfillActiveArtifacts();
      installJobPanel();
      enhanceCompliance();
    }finally{state.loading=false;}
  }

  function artifactFor(documentId){return state.artifacts.find(x=>x.document_id===documentId&&x.artifact_type==='canonical_pdf');}
  function currentDoc(jobId,code){return docs().filter(x=>x.job_id===jobId&&x.document_code===code&&!x.archived_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null;}
  function invoiceFor(jobId){return invoices().find(x=>x.job_id===jobId&&!x.archived_at)||null;}
  function paymentRows(jobId){return payments().filter(x=>x.job_id===jobId&&!x.archived_at);}
  function approvedOverride(jobId,control){
    return exceptions().some(x=>x.job_id===jobId&&x.control_code===control&&x.status==='approved'&&!x.archived_at);
  }
  function template(code){return templates().find(x=>x.code===code);}

  async function ensureCanonicalPdf(documentId,open=false){
    let artifact=artifactFor(documentId);
    if(artifact){
      if(open)await openCanonicalPdf(documentId);
      return artifact;
    }
    const {data,error}=await cloud().functions.invoke('ttt-document-pdf',{body:{action:'generate',document_id:documentId}});
    if(error||data?.error){
      console.error('Canonical PDF generation failed',error||data);
      toast(data?.error||error?.message||'Canonical PDF generation failed');
      return null;
    }
    if(data?.artifact){
      state.artifacts=[data.artifact,...state.artifacts.filter(x=>x.id!==data.artifact.id)];
      if(open&&data.signed_url)window.open(data.signed_url,'_blank','noopener');
      return data.artifact;
    }
    return null;
  }

  async function openCanonicalPdf(documentId){
    const {data,error}=await cloud().functions.invoke('ttt-document-pdf',{body:{action:'url',document_id:documentId}});
    if(error||data?.error){toast(data?.error||error?.message||'Canonical PDF unavailable');return;}
    if(data?.signed_url)window.open(data.signed_url,'_blank','noopener');
  }

  async function backfillActiveArtifacts(){
    const activeIds=new Set(activeJobRows().map(x=>x.id));
    const missing=docs().filter(d=>d.finalized_at&&d.job_id&&activeIds.has(d.job_id)&&!artifactFor(d.id));
    for(const d of missing.slice(0,30))await ensureCanonicalPdf(d.id,false);
  }

  async function reconcileServiceDocuments(){
    const engine=wf(); if(!engine?.ensureDocument)return;
    for(const j of activeJobRows()){
      const f=rules().flags(j);
      const checked=!!j.check_in||rules().atLeast(j.status,'Checked In');
      const pickup=rules().atLeast(j.status,'Ready for Pickup');
      const scheduled=rules().atLeast(j.status,'Scheduled');

      if(f.customerSupplied){
        await engine.ensureDocument({code:'CSE',job:j,sourceType:'service_control',sourceId:j.id+':CSE',snapshot:{job:j,control:'customer_supplied_equipment'}});
      }
      if(f.tint&&checked){
        await engine.ensureDocument({code:'TINT',job:j,sourceType:'service_control',sourceId:j.id+':TINT',snapshot:{job:j,control:'tint_compliance'}});
      }
      if(f.connected&&pickup){
        await engine.ensureDocument({code:'DEV',job:j,sourceType:'service_handoff',sourceId:j.id+':DEV',snapshot:{job:j,control:'device_credential_handoff'}});
        await engine.ensureDocument({code:'SUB',job:j,sourceType:'service_handoff',sourceId:j.id+':SUB',snapshot:{job:j,control:'subscription_cellular_acknowledgement'}});
      }
      if(f.security&&pickup){
        await engine.ensureDocument({code:'SEC',job:j,sourceType:'service_handoff',sourceId:j.id+':SEC',snapshot:{job:j,control:'security_immobilizer_handoff'}});
      }
      if(f.commercial&&scheduled){
        await engine.ensureDocument({code:'FWA',job:j,sourceType:'commercial_job',sourceId:j.id+':FWA',snapshot:{job:j,control:'fleet_work_authorization'}});
        await engine.ensureDocument({code:'DRO',job:j,sourceType:'commercial_job',sourceId:j.id+':DRO',snapshot:{job:j,control:'dealer_repair_order_reference'}});
      }
    }
  }

  async function generateInvoice(jobId){
    const existing=invoiceFor(jobId);
    if(existing){toast('Invoice already exists for this Job');return existing;}
    const {data,error}=await cloud().rpc('create_invoice_from_job',{p_organization_id:org(),p_job_id:jobId});
    if(error){console.error(error);toast(error.message||'Invoice generation failed');return null;}
    toast('Invoice '+data+' generated from approved scope');
    await wf().load({reconcile:true});
    installJobPanel();
    enhanceCompliance();
    return invoiceFor(jobId)||{id:data};
  }

  function paymentModal(jobId){
    const inv=invoiceFor(jobId);
    if(!inv){toast('Generate the Invoice first');return;}
    const fin=rules().financialSummary(inv,paymentRows(jobId));
    document.getElementById('w10PaymentModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="w10-modal" id="w10PaymentModal"><div class="w10-backdrop" data-w10-close></div><div class="w10-dialog">'+
      '<div class="panel-head"><div><p class="eyebrow">PAYMENT</p><h3>'+esc(inv.id)+'</h3><p class="muted">Balance due '+money(fin.balance)+'</p></div><button class="btn secondary" data-w10-close>Close</button></div>'+
      '<div class="form-grid"><label>Amount<input id="w10PayAmount" type="number" min="0.01" step="0.01" value="'+Number(fin.balance||0).toFixed(2)+'"></label>'+
      '<label>Payment type<select id="w10PayType"><option value="deposit">Deposit</option><option value="partial">Partial payment</option><option value="final" selected>Final payment</option><option value="refund">Refund / adjustment</option></select></label>'+
      '<label>Method<select id="w10PayMethod"><option>Card</option><option>Cash</option><option>ACH / Bank Transfer</option><option>Check</option><option>Other</option></select></label>'+
      '<label>Reference<input id="w10PayRef" placeholder="Transaction / check reference"></label></div>'+
      '<label>Notes<textarea id="w10PayNotes"></textarea></label>'+
      '<button class="btn primary large" id="w10RecordPayment">Record Payment & Generate Receipt</button></div></div>');
    const m=document.getElementById('w10PaymentModal');
    m.querySelectorAll('[data-w10-close]').forEach(x=>x.onclick=()=>m.remove());
    document.getElementById('w10RecordPayment').onclick=async()=>{
      const amount=Number(document.getElementById('w10PayAmount').value||0);
      if(!(amount>0)){toast('Payment amount must be greater than zero');return;}
      const type=document.getElementById('w10PayType').value;
      const method=document.getElementById('w10PayMethod').value;
      const reference=document.getElementById('w10PayRef').value.trim();
      const notes=document.getElementById('w10PayNotes').value.trim();
      const j=activeJobRows().find(x=>x.id===jobId)||wf().state.jobs.find(x=>x.id===jobId);
      const payload={
        organization_id:org(),invoice_id:inv.id,customer_id:inv.customer_id||j?.customer_id||null,job_id:jobId,
        amount:type==='refund'?-Math.abs(amount):amount,method,reference:reference||null,status:'received',
        notes:notes||null,metadata:{payment_type:type},created_by:uid(),updated_by:uid()
      };
      const out=await cloud().from('payments').insert(payload).select('*').single();
      if(out.error){toast(out.error.message||'Payment could not be recorded');return;}
      m.remove();toast('Payment recorded. Receipt control is being generated.');
      await wf().load({reconcile:true});
      installJobPanel();enhanceCompliance();
    };
  }

  function packageModal(jobId){
    const required=['INV','RCPT','COMP','WAR'];
    const f=rules().flags(activeJobRows().find(x=>x.id===jobId)||{});
    if(f.connected)required.push('DEV','SUB');
    if(f.security)required.push('SEC');
    if(f.tint)required.push('TINT');
    const rows=required.map(code=>({code,doc:currentDoc(jobId,code)}));
    document.getElementById('w10PackageModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="w10-modal" id="w10PackageModal"><div class="w10-backdrop" data-w10-close></div><div class="w10-dialog wide">'+
      '<div class="panel-head"><div><p class="eyebrow">CUSTOMER HANDOVER PACKAGE</p><h3>'+esc(jobId)+'</h3><p class="muted">Final customer-facing records required for release.</p></div><button class="btn secondary" data-w10-close>Close</button></div>'+
      '<div class="w10-package-list">'+rows.map(r=>'<div><strong>'+esc(r.code)+' · '+esc(template(r.code)?.title||r.code)+'</strong><span>'+(r.doc?.finalized_at?'Finalized':'Missing / not finalized')+'</span>'+(r.doc?.finalized_at?'<button class="btn secondary compact" data-w10-pdf="'+esc(r.doc.id)+'">'+(artifactFor(r.doc.id)?'Open PDF':'Generate PDF')+'</button>':'')+'</div>').join('')+'</div>'+
      '<button class="btn primary large" id="w10GeneratePackage">Generate All Available Canonical PDFs</button></div></div>');
    const m=document.getElementById('w10PackageModal');
    m.querySelectorAll('[data-w10-close]').forEach(x=>x.onclick=()=>m.remove());
    m.querySelectorAll('[data-w10-pdf]').forEach(b=>b.onclick=()=>artifactFor(b.dataset.w10Pdf)?openCanonicalPdf(b.dataset.w10Pdf):ensureCanonicalPdf(b.dataset.w10Pdf,true));
    document.getElementById('w10GeneratePackage').onclick=async()=>{
      for(const r of rows.filter(x=>x.doc?.finalized_at))await ensureCanonicalPdf(r.doc.id,false);
      toast('Available handover PDFs generated');
      m.remove();packageModal(jobId);
    };
  }

  function exceptionModal(jobId){
    document.getElementById('w10ExceptionModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="w10-modal" id="w10ExceptionModal"><div class="w10-backdrop" data-w10-close></div><div class="w10-dialog">'+
      '<div class="panel-head"><div><p class="eyebrow">CONTROLLED EXCEPTION</p><h3>Request Workflow Override</h3><p class="muted">Overrides remain visible in the compliance audit trail.</p></div><button class="btn secondary" data-w10-close>Close</button></div>'+
      '<label>Control<select id="w10ExControl"><option value="AUTH_OVERRIDE">Authorization gate</option><option value="QC_OVERRIDE">QC release gate</option><option value="DELIVERY_OVERRIDE">Vehicle delivery gate</option><option value="CLOSE_OVERRIDE">Job closure gate</option><option value="OTHER">Other</option></select></label>'+
      '<label>Severity<select id="w10ExSeverity"><option value="blocking">Blocking</option><option value="critical">Critical</option><option value="warning">Warning</option></select></label>'+
      '<label>Reason<textarea id="w10ExReason" placeholder="Explain why the normal control cannot be completed"></textarea></label>'+
      '<button class="btn primary large" id="w10SubmitException">Submit Exception</button></div></div>');
    const m=document.getElementById('w10ExceptionModal');
    m.querySelectorAll('[data-w10-close]').forEach(x=>x.onclick=()=>m.remove());
    document.getElementById('w10SubmitException').onclick=async()=>{
      const reason=document.getElementById('w10ExReason').value.trim();
      if(reason.length<10){toast('Provide a meaningful exception reason');return;}
      const row={
        organization_id:org(),job_id:jobId,control_code:document.getElementById('w10ExControl').value,
        severity:document.getElementById('w10ExSeverity').value,status:'open',reason,
        metadata:{requested_from:'wave10_job_control'},created_by:uid(),updated_by:uid()
      };
      const out=await cloud().from('workflow_exceptions').insert(row).select('*').single();
      if(out.error){toast(out.error.message||'Exception could not be created');return;}
      wf().state.exceptions.unshift(out.data);m.remove();toast('Controlled exception submitted for approval');installJobPanel();enhanceCompliance();
    };
  }

  async function approveException(id){
    const role=lower(window.TTTCloud?.profile?.role);
    if(!['admin','administrator','owner'].includes(role)){toast('Admin approval is required for workflow overrides');return;}
    const out=await cloud().from('workflow_exceptions').update({status:'approved',approved_by:uid(),approved_at:now(),updated_at:now(),updated_by:uid()})
      .eq('organization_id',org()).eq('id',id).eq('status','open').select('*').single();
    if(out.error){toast(out.error.message||'Exception approval failed');return;}
    const i=wf().state.exceptions.findIndex(x=>x.id===id);if(i>=0)wf().state.exceptions[i]=out.data;
    toast('Exception approved');installJobPanel();enhanceCompliance();
  }

  function financialBlock(jobId){
    const inv=invoiceFor(jobId);
    if(!inv)return '<div class="w10-fin"><span>Invoice</span><strong>Not generated</strong><span>Payment</span><strong>—</strong><span>Balance</span><strong>—</strong></div>';
    const f=rules().financialSummary(inv,paymentRows(jobId));
    return '<div class="w10-fin"><span>Invoice</span><strong>'+money(f.total)+'</strong><span>Paid</span><strong>'+money(f.paid)+'</strong><span>Balance</span><strong class="'+(f.balance>0?'due':'paid')+'">'+money(f.balance)+'</strong></div>';
  }

  function installJobPanel(){
    const root=document.getElementById('jobDetailBody'),jobId=window.currentJobId;
    if(!root||!jobId||!document.getElementById('jobdetail')?.classList.contains('active'))return;
    const j=wf()?.state?.jobs?.find(x=>x.id===jobId);if(!j)return;
    root.querySelector('#w10JobPanel')?.remove();
    const inv=invoiceFor(jobId);
    const openEx=exceptions().filter(x=>x.job_id===jobId&&x.status==='open'&&!x.archived_at);
    const required=rules().requiredForStage(j);
    const finalized=required.filter(code=>currentDoc(jobId,code)?.finalized_at).length;
    const html='<article class="panel w10-panel" id="w10JobPanel"><div class="panel-head"><div><p class="eyebrow">WAVE 10 AUTOMATION</p><h3>Customer-to-Handover Control</h3><p class="muted">'+finalized+' of '+required.length+' currently applicable controls finalized.</p></div><span class="badge">'+esc(j.status||'Job')+'</span></div>'+
      financialBlock(jobId)+
      '<div class="w10-actions">'+
      (!inv?'<button class="btn primary" id="w10CreateInvoice">Generate Invoice from Approved Scope</button>':'<button class="btn primary" id="w10Payment">Record Payment</button>')+
      '<button class="btn secondary" id="w10Package">Customer Handover Package</button>'+
      '<button class="btn secondary" id="w10Exception">Request Controlled Override</button></div>'+
      (openEx.length?'<div class="w10-ex-list">'+openEx.map(x=>'<div><strong>'+esc(x.control_code)+'</strong><span>'+esc(x.reason)+'</span><em>Awaiting approval</em></div>').join('')+'</div>':'')+
      '</article>';
    const target=root.querySelector('#waWorkflowPanel')||root.firstElementChild;
    if(target)target.insertAdjacentHTML('afterend',html);else root.insertAdjacentHTML('afterbegin',html);
    document.getElementById('w10CreateInvoice')?.addEventListener('click',()=>generateInvoice(jobId));
    document.getElementById('w10Payment')?.addEventListener('click',()=>paymentModal(jobId));
    document.getElementById('w10Package')?.addEventListener('click',()=>packageModal(jobId));
    document.getElementById('w10Exception')?.addEventListener('click',()=>exceptionModal(jobId));
  }

  function enhanceCompliance(){
    const host=document.getElementById('waComplianceBody');if(!host)return;
    host.querySelector('#w10ComplianceV2')?.remove();
    const templateByCode=new Map(templates().map(x=>[x.code,x]));
    const outdated=docs().filter(d=>!d.archived_at&&d.template_version&&templateByCode.get(d.document_code)?.current_version&&d.template_version!==templateByCode.get(d.document_code).current_version);
    const pdfMissing=docs().filter(d=>d.finalized_at&&!d.archived_at&&!artifactFor(d.id));
    const today=new Date().toISOString().slice(0,10);
    const overdue=invoices().filter(i=>!i.archived_at&&i.due_date&&i.due_date<today&&Number(i.balance_due||0)>0);
    const warrantyGaps=(wf()?.state?.jobs||[]).filter(j=>['Delivered','Closed'].includes(j.status)&&!currentDoc(j.id,'WAR')?.finalized_at);
    const openExceptions=exceptions().filter(x=>x.status==='open'&&!x.archived_at);
    const openClaims=docs().filter(x=>x.document_code==='WCL'&&!x.finalized_at&&!x.archived_at);
    const openRma=docs().filter(x=>x.document_code==='RMA'&&!x.finalized_at&&!x.archived_at);
    const legalPending=templates().filter(x=>['legal_review','draft'].includes(x.release_status));
    host.insertAdjacentHTML('beforeend',
      '<section id="w10ComplianceV2"><div class="section-head"><div><p class="eyebrow">WAVE 10 CONTROL LAYER</p><h2>Action Queue</h2><p class="muted">Exceptions and document gaps that require an operator decision.</p></div></div>'+
      '<div class="w10-kpis"><div><span>Canonical PDFs missing</span><strong>'+pdfMissing.length+'</strong></div><div><span>Outdated document versions</span><strong>'+outdated.length+'</strong></div><div><span>Overdue invoices</span><strong>'+overdue.length+'</strong></div><div><span>Warranty gaps</span><strong>'+warrantyGaps.length+'</strong></div><div><span>Warranty claims</span><strong>'+openClaims.length+'</strong></div><div><span>RMAs</span><strong>'+openRma.length+'</strong></div><div><span>Legal releases pending</span><strong>'+legalPending.length+'</strong></div></div>'+
      '<article class="panel"><div class="panel-head"><div><h3>Controlled Overrides</h3><p class="muted">Admin approval is required before a blocked workflow can rely on an exception.</p></div></div>'+
      (openExceptions.length?'<div class="w10-queue">'+openExceptions.map(x=>'<div><div><strong>'+esc(x.control_code)+' · '+esc(x.job_id||'General')+'</strong><small>'+esc(x.reason)+'</small></div><button class="btn secondary compact" data-w10-approve="'+esc(x.id)+'">Approve</button></div>').join('')+'</div>':'<p class="muted">No open workflow override requests.</p>')+
      '</article></section>');
    host.querySelectorAll('[data-w10-approve]').forEach(b=>b.onclick=()=>approveException(b.dataset.w10Approve));
  }

  function deliveryV10(record,j){
    const c=record.customer_id?localCustomer(record.customer_id):j?.customerId?localCustomer(j.customerId):null;
    const to=c?.email||'';
    const subject='TTT '+record.title+' '+record.document_number;
    document.getElementById('w10DeliveryModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="w10-modal" id="w10DeliveryModal"><div class="w10-backdrop" data-w10-close></div><div class="w10-dialog">'+
      '<div class="panel-head"><div><p class="eyebrow">DOCUMENT DELIVERY</p><h3>'+esc(record.document_number)+'</h3><p class="muted">Canonical PDF delivery record</p></div><button class="btn secondary" data-w10-close>Close</button></div>'+
      '<label>Recipient email<input id="w10DeliverTo" type="email" value="'+esc(to)+'"></label><label>Subject<input id="w10DeliverSubject" value="'+esc(subject)+'"></label>'+
      '<div class="w10-actions"><button class="btn primary" id="w10OpenMail">Open Email Draft</button><button class="btn secondary" id="w10MarkSent">Mark Sent</button><button class="btn secondary" id="w10OpenPdf">Open Canonical PDF</button></div>'+
      '<div class="w10-provider-note">Transactional provider adapter is ready for configuration. Until credentials are configured, opening a draft does <strong>not</strong> count as sent; delivery must be explicitly marked.</div></div></div>');
    const m=document.getElementById('w10DeliveryModal');
    m.querySelectorAll('[data-w10-close]').forEach(x=>x.onclick=()=>m.remove());
    document.getElementById('w10OpenPdf').onclick=async()=>{if(!artifactFor(record.id))await ensureCanonicalPdf(record.id,false);await openCanonicalPdf(record.id);};
    document.getElementById('w10OpenMail').onclick=async()=>{
      if(!artifactFor(record.id))await ensureCanonicalPdf(record.id,false);
      const recipient=document.getElementById('w10DeliverTo').value.trim(),sub=document.getElementById('w10DeliverSubject').value.trim();
      await wf().state.deliveries;
      await cloud().from('document_deliveries').insert({
        organization_id:org(),document_id:record.id,job_id:record.job_id||null,customer_id:record.customer_id||null,
        channel:'email',recipient,status:'draft_opened',subject:sub,metadata:{wave10:true,canonical_pdf:!!artifactFor(record.id)},created_by:uid()
      });
      window.location.href='mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(sub);
    };
    document.getElementById('w10MarkSent').onclick=async()=>{
      const recipient=document.getElementById('w10DeliverTo').value.trim(),sub=document.getElementById('w10DeliverSubject').value.trim();
      const out=await cloud().from('document_deliveries').insert({
        organization_id:org(),document_id:record.id,job_id:record.job_id||null,customer_id:record.customer_id||null,
        channel:'email',recipient,status:'sent',subject:sub,delivered_at:now(),metadata:{wave10:true,manual_confirmation:true,artifact_id:artifactFor(record.id)?.id||null},created_by:uid()
      });
      if(out.error){toast(out.error.message||'Delivery log failed');return;}
      toast('Delivery marked sent');m.remove();
    };
  }

  function observe(){
    const obs=new MutationObserver(()=>{
      if(document.getElementById('jobdetail')?.classList.contains('active'))installJobPanel();
      if(document.getElementById('workflow-compliance')?.classList.contains('active'))enhanceCompliance();
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  window.TTTWave10={
    state,load,ensureCanonicalPdf,openCanonicalPdf,generateInvoice,paymentModal,packageModal,
    exceptionModal,approvedOverride,enhanceCompliance,deliveryV10,reconcileServiceDocuments
  };

  observe();
  window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(load,250));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(load,250),{once:true});
  else setTimeout(load,250);

  const handoff=setInterval(()=>{
    if(window.TTTWorkflowAutomation){
      window.TTTWorkflowAutomation.deliverDocument=deliveryV10;
      clearInterval(handoff);
    }
  },250);
})();