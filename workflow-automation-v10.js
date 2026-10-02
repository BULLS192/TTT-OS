// TTT OS Workflow Automation v1.0
// Turns the Waves 1-9 document registry into operational workflow controls.
(function(){
  'use strict';

  const state={
    templates:[],documents:[],jobs:[],quotes:[],workOrders:[],changeOrders:[],
    invoices:[],payments:[],purchaseOrders:[],purchaseOrderLines:[],
    inventoryTransactions:[],expenses:[],warranties:[],jobMedia:[],
    diagnostics:[],exceptions:[],deliveries:[],loading:false,loadedAt:null
  };
  let channel=null;
  let reconcileTimer=null;

  const cloud=()=>window.TTTCloud?.client;
  const org=()=>window.TTTCloud?.organizationId;
  const uid=()=>window.TTTCloud?.userId;
  const now=()=>new Date().toISOString();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toastMsg=m=>typeof window.toast==='function'?window.toast(m):console.log(m);
  const localJob=id=>typeof window.job==='function'?window.job(id):window.db?.jobs?.find(x=>x.id===id);
  const localCustomer=id=>typeof window.customer==='function'?window.customer(id):window.db?.customers?.find(x=>x.id===id);
  const localVehicle=id=>typeof window.vehicle==='function'?window.vehicle(id):window.db?.vehicles?.find(x=>x.id===id);
  const lower=v=>String(v??'').toLowerCase();
  const isClosedStatus=s=>['closed','cancelled','canceled'].includes(lower(s));
  const stagePast=(status,targets)=>targets.map(lower).includes(lower(status));

  function serviceText(j){
    const local=localJob(j.id)||{};
    return [
      j.request_notes,local.requestNotes,
      ...(Array.isArray(j.services)?j.services:[]),
      ...(Array.isArray(local.services)?local.services:[]),
      ...((Array.isArray(j.equipment)?j.equipment:[]).flatMap(x=>[x?.category,x?.brand,x?.model,x?.note])),
      ...((Array.isArray(local.equipment)?local.equipment:[]).flatMap(x=>[x?.category,x?.brand,x?.model,x?.note]))
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function isDiagnosticJob(j){
    return /signaltrace|diagnostic|diagnostics|electrical|troubleshoot|no[- ]?start|parasitic|can bus|module communication|fault/.test(serviceText(j));
  }

  function template(code){return state.templates.find(x=>x.code===code);}
  function docsForJob(jobId){return state.documents.filter(x=>x.job_id===jobId&&!x.archived_at);}
  function finalized(jobId,code,sourceId){
    return state.documents.some(x=>x.job_id===jobId&&x.document_code===code&&!x.archived_at&&x.finalized_at&&(!sourceId||x.source_entity_id===sourceId));
  }
  function existingSource(code,type,id){
    return state.documents.find(x=>x.document_code===code&&x.source_entity_type===type&&x.source_entity_id===String(id)&&!x.archived_at);
  }
  function diagnosticForJob(jobId){return state.diagnostics.find(x=>x.job_id===jobId&&!x.archived_at);}
  function mediaForJob(jobId){return state.jobMedia.filter(x=>x.job_id===jobId&&!x.archived_at);}
  function quoteForJob(jobId){return state.quotes.find(x=>x.job_id===jobId&&!x.archived_at);}
  function workOrderForJob(jobId){return state.workOrders.find(x=>x.job_id===jobId&&!x.archived_at);}
  function invoicesForJob(jobId){return state.invoices.filter(x=>x.job_id===jobId&&!x.archived_at);}
  function paymentsForJob(jobId){return state.payments.filter(x=>x.job_id===jobId&&!x.archived_at);}
  function warrantiesForJob(jobId){return state.warranties.filter(x=>x.job_id===jobId&&!x.archived_at);}
  function changesForJob(jobId){return state.changeOrders.filter(x=>x.job_id===jobId&&!x.archived_at);}

  async function sha256(value){
    if(!window.crypto?.subtle)return null;
    const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  async function waitCloud(){
    for(let i=0;i<160;i++){
      if(cloud()&&org())return true;
      await new Promise(r=>setTimeout(r,125));
    }
    return false;
  }

  async function fetchTable(name,select='*',configure){
    let q=cloud().from(name).select(select).eq('organization_id',org());
    if(configure)q=configure(q);
    const out=await q;
    if(out.error){
      console.error('Workflow automation load failed for '+name,out.error);
      return [];
    }
    return out.data||[];
  }

  async function loadAll(options={}){
    if(state.loading||!await waitCloud())return;
    state.loading=true;
    try{
      const [
        templates,documents,jobs,quotes,workOrders,changeOrders,invoices,payments,
        purchaseOrders,purchaseOrderLines,inventoryTransactions,expenses,warranties,
        jobMedia,diagnostics,exceptions,deliveries
      ]=await Promise.all([
        fetchTable('document_templates','*',q=>q.eq('active',true).order('wave').order('code')),
        fetchTable('documents','*',q=>q.is('archived_at',null).order('created_at',{ascending:false}).limit(2000)),
        fetchTable('jobs','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('quotes','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('work_orders','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('change_orders','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('invoices','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('payments','*',q=>q.is('archived_at',null).order('created_at',{ascending:false}).limit(1500)),
        fetchTable('purchase_orders','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('purchase_order_lines','*',q=>q.is('archived_at',null).limit(2500)),
        fetchTable('inventory_transactions','*',q=>q.order('occurred_at',{ascending:false}).limit(1500)),
        fetchTable('expenses','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('warranties','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('job_media','*',q=>q.is('archived_at',null).order('created_at',{ascending:false}).limit(2500)),
        fetchTable('diagnostic_cases','*',q=>q.is('archived_at',null).order('updated_at',{ascending:false}).limit(1000)),
        fetchTable('workflow_exceptions','*',q=>q.is('archived_at',null).order('created_at',{ascending:false}).limit(1000)),
        fetchTable('document_deliveries','*',q=>q.order('created_at',{ascending:false}).limit(1500))
      ]);
      Object.assign(state,{templates,documents,jobs,quotes,workOrders,changeOrders,invoices,payments,
        purchaseOrders,purchaseOrderLines,inventoryTransactions,expenses,warranties,jobMedia,
        diagnostics,exceptions,deliveries,loadedAt:now()});
      if(options.reconcile!==false)await reconcileAll();
      ensureViews();
      renderCompliance();
      injectJobPanel();
      subscribe();
    } finally {
      state.loading=false;
    }
  }

  async function nextNumber(code){
    const out=await cloud().rpc('next_ttt_document_number',{p_organization_id:org(),p_document_code:code});
    if(out.error)throw out.error;
    return out.data;
  }

  function entitySnapshot(jobRow,extra={}){
    const local=jobRow?localJob(jobRow.id):null;
    const c=jobRow?localCustomer(jobRow.customer_id||local?.customerId):null;
    const v=jobRow?localVehicle(jobRow.vehicle_id||local?.vehicleId):null;
    return {
      captured_at:now(),
      job:jobRow?{
        id:jobRow.id,status:jobRow.status,request_notes:jobRow.request_notes||local?.requestNotes||'',
        services:jobRow.services||local?.services||[],equipment:jobRow.equipment||local?.equipment||[],
        estimate_total:jobRow.estimate_total??local?.estimateTotal??0,work_order_id:jobRow.work_order_id||local?.workOrderId||null
      }:null,
      customer:c?{id:c.id,name:c.display_name||c.name,email:c.email,phone:c.phone}:null,
      vehicle:v?{id:v.id,year:v.year,make:v.make,model:v.model,trim:v.trim,vin:v.vin,plate:v.plate,plate_state:v.plateState||v.plate_state}:null,
      ...extra,
      source:'TTT-OS workflow automation'
    };
  }

  async function ensureDocument({code,job=null,sourceType,sourceId,snapshot={},links={},autoFinalize=false}){
    if(!code||!sourceType||sourceId==null)return null;
    const id=String(sourceId);
    const current=existingSource(code,sourceType,id);
    if(current)return current;
    const t=template(code);
    if(!t)return null;
    let number;
    try{number=await nextNumber(code);}catch(err){console.error('Document number allocation failed',code,err);return null;}
    const row={
      organization_id:org(),
      job_id:job?.id||links.job_id||null,
      customer_id:job?.customer_id||links.customer_id||null,
      vehicle_id:job?.vehicle_id||links.vehicle_id||null,
      work_order_id:links.work_order_id||job?.work_order_id||null,
      quote_id:links.quote_id||null,
      invoice_id:links.invoice_id||null,
      purchase_order_id:links.purchase_order_id||null,
      company_id:links.company_id||null,
      vendor_company_id:links.vendor_company_id||null,
      document_type:lower(t.title).replace(/[^a-z0-9]+/g,'_'),
      title:t.title,
      document_code:code,
      document_number:number,
      document_status:t.requires_signature?'pending_signature':'draft',
      template_version:t.current_version,
      template_url:t.template_url,
      generated_at:now(),
      source_entity_type:sourceType,
      source_entity_id:id,
      snapshot,
      metadata:{wave:t.wave,trigger_stage:t.trigger_stage,automated:true,source_type:sourceType,source_id:id},
      created_by:uid(),
      updated_by:uid()
    };
    const out=await cloud().from('documents').insert(row).select('*').single();
    if(out.error){
      if(out.error.code==='23505'){
        await refreshDocuments();
        return existingSource(code,sourceType,id)||null;
      }
      console.error('Controlled document creation failed',code,out.error);
      return null;
    }
    state.documents.unshift(out.data);
    if(autoFinalize&&!t.requires_signature){
      const frozen={...snapshot,record:{document_number:number,finalized_at:now()}};
      const hash=await sha256(JSON.stringify(frozen));
      const patch={document_status:'finalized',snapshot:frozen,content_hash:hash,finalized_at:now(),updated_at:now(),updated_by:uid()};
      const f=await cloud().from('documents').update(patch).eq('organization_id',org()).eq('id',out.data.id).select('*').single();
      if(!f.error){
        const i=state.documents.findIndex(x=>x.id===out.data.id);
        if(i>=0)state.documents[i]=f.data;
        return f.data;
      }
    }
    return out.data;
  }

  async function refreshDocuments(){
    state.documents=await fetchTable('documents','*',q=>q.is('archived_at',null).order('created_at',{ascending:false}).limit(2000));
  }

  async function ensureDiagnosticCase(jobRow){
    if(!jobRow||!isDiagnosticJob(jobRow))return null;
    let d=diagnosticForJob(jobRow.id);
    if(d)return d;
    const local=localJob(jobRow.id);
    const row={
      organization_id:org(),job_id:jobRow.id,status:'open',
      reported_symptom:jobRow.request_notes||local?.requestNotes||'',
      started_at:null,source_json:{created_by_workflow:true},
      created_by:uid(),updated_by:uid()
    };
    const out=await cloud().from('diagnostic_cases').insert(row).select('*').single();
    if(out.error){
      if(out.error.code==='23505'){
        state.diagnostics=await fetchTable('diagnostic_cases','*',q=>q.is('archived_at',null));
        return diagnosticForJob(jobRow.id);
      }
      console.error('Diagnostic case creation failed',out.error);return null;
    }
    state.diagnostics.unshift(out.data);
    return out.data;
  }

  async function refreshJobRegister(j){
    const r=existingSource('JDR','job_register',j.id);
    if(!r||r.finalized_at)return;
    const snapshot=entitySnapshot(j,{document_register:docsForJob(j.id).filter(x=>x.document_code!=='JDR').map(x=>({
      code:x.document_code,number:x.document_number,status:x.document_status,version:x.template_version,
      signed_at:x.signed_at,finalized_at:x.finalized_at,hash:x.content_hash,source_type:x.source_entity_type,source_id:x.source_entity_id
    }))});
    const out=await cloud().from('documents').update({snapshot,updated_at:now(),updated_by:uid()})
      .eq('organization_id',org()).eq('id',r.id).is('finalized_at',null).select('*').single();
    if(!out.error){
      const i=state.documents.findIndex(x=>x.id===r.id);
      if(i>=0)state.documents[i]=out.data;
    }
  }

  async function reconcileJob(j){
    if(!j||isClosedStatus(j.status)&&!j.work_order_id&&!j.primary_quote_id)return;
    const q=quoteForJob(j.id);
    const wo=workOrderForJob(j.id);
    const invs=invoicesForJob(j.id);
    const pays=paymentsForJob(j.id);
    const warranties=warrantiesForJob(j.id);
    const changes=changesForJob(j.id);
    const media=mediaForJob(j.id);
    const local=localJob(j.id);
    const checkIn=j.check_in||local?.checkIn||null;

    if(q)await ensureDocument({
      code:'Q',job:j,sourceType:'quote',sourceId:q.id,links:{quote_id:q.id},
      snapshot:entitySnapshot(j,{quote:q})
    });

    if(checkIn||media.length)await ensureDocument({
      code:'CHK',job:j,sourceType:'job_checkin',sourceId:j.id,
      snapshot:entitySnapshot(j,{check_in:checkIn,media:media.map(x=>({id:x.id,category:x.category,area:x.area,captured_at:x.captured_at,storage_bucket:x.storage_bucket,storage_path:x.storage_path}))}),
      autoFinalize:!!checkIn
    });

    if(checkIn||media.length)await ensureDocument({
      code:'AUTH',job:j,sourceType:'customer_authorization',sourceId:j.id,
      snapshot:entitySnapshot(j,{check_in:checkIn,condition_media_ids:media.map(x=>x.id)})
    });

    if(wo)await ensureDocument({
      code:'WO',job:j,sourceType:'work_order',sourceId:wo.id,links:{work_order_id:wo.id},
      snapshot:entitySnapshot(j,{work_order:wo})
    });

    for(const co of changes){
      await ensureDocument({
        code:'CO',job:j,sourceType:'change_order',sourceId:co.id,links:{work_order_id:co.work_order_id},
        snapshot:entitySnapshot(j,{change_order:co})
      });
    }

    if(stagePast(j.status,['QC','Ready for Pickup','Delivered','Closed'])){
      await ensureDocument({
        code:'QC',job:j,sourceType:'quality_control',sourceId:j.id,links:{work_order_id:wo?.id},
        snapshot:entitySnapshot(j,{work_order:wo,stage:j.status})
      });
    }

    for(const inv of invs){
      await ensureDocument({
        code:'INV',job:j,sourceType:'invoice',sourceId:inv.id,
        links:{invoice_id:inv.id,quote_id:inv.quote_id,work_order_id:wo?.id},
        snapshot:entitySnapshot(j,{invoice:inv})
      });
    }

    for(const pay of pays){
      await ensureDocument({
        code:'RCPT',job:j,sourceType:'payment',sourceId:pay.id,
        links:{invoice_id:pay.invoice_id,work_order_id:wo?.id},
        snapshot:entitySnapshot(j,{payment:pay}),
        autoFinalize:true
      });
      const ptype=lower(pay.metadata?.payment_type||pay.metadata?.type||'');
      if(ptype==='deposit'){
        await ensureDocument({
          code:'DEP',job:j,sourceType:'deposit_payment',sourceId:pay.id,
          links:{invoice_id:pay.invoice_id,work_order_id:wo?.id},
          snapshot:entitySnapshot(j,{payment:pay,receipt_type:'deposit'}),
          autoFinalize:true
        });
      }
    }

    if(stagePast(j.status,['Ready for Pickup','Delivered','Closed'])){
      await ensureDocument({
        code:'COMP',job:j,sourceType:'job_handover',sourceId:j.id,links:{work_order_id:wo?.id},
        snapshot:entitySnapshot(j,{work_order:wo,invoices:invs})
      });
    }

    for(const w of warranties){
      await ensureDocument({
        code:'WAR',job:j,sourceType:'warranty',sourceId:w.id,links:{work_order_id:wo?.id},
        snapshot:entitySnapshot(j,{warranty:w}),autoFinalize:stagePast(j.status,['Delivered','Closed'])
      });
    }

    const d=await ensureDiagnosticCase(j);
    if(d){
      await ensureDocument({
        code:'DIA',job:j,sourceType:'diagnostic_case',sourceId:d.id,
        snapshot:entitySnapshot(j,{diagnostic_case:d})
      });
      if(['findings_ready','repair_authorized','resolved','closed'].includes(d.status)){
        await ensureDocument({
          code:'DFR',job:j,sourceType:'diagnostic_findings',sourceId:d.id,
          snapshot:entitySnapshot(j,{diagnostic_case:d}),autoFinalize:true
        });
      }
      if(d.source_json?.convert_to_repair||d.status==='repair_authorized'){
        const dra=await ensureDocument({
          code:'DRA',job:j,sourceType:'diagnostic_repair_authorization',sourceId:d.id,
          snapshot:entitySnapshot(j,{diagnostic_case:d})
        });
        if(dra?.finalized_at&&d.status!=='repair_authorized'){
          const patch={status:'repair_authorized',updated_at:now(),updated_by:uid()};
          const out=await cloud().from('diagnostic_cases').update(patch)
            .eq('organization_id',org()).eq('id',d.id).select('*').single();
          if(!out.error)Object.assign(d,out.data);
        }
      }
    }

    if(docsForJob(j.id).length){
      await ensureDocument({
        code:'JDR',job:j,sourceType:'job_register',sourceId:j.id,
        snapshot:entitySnapshot(j,{document_register:docsForJob(j.id).map(x=>({code:x.document_code,number:x.document_number,status:x.document_status,finalized_at:x.finalized_at,hash:x.content_hash}))})
      });
      await refreshJobRegister(j);
    }
  }

  async function reconcilePurchasing(){
    for(const po of state.purchaseOrders){
      const lines=state.purchaseOrderLines.filter(x=>x.purchase_order_id===po.id&&!x.archived_at);
      await ensureDocument({
        code:'PO',sourceType:'purchase_order',sourceId:po.id,
        links:{job_id:po.job_id,purchase_order_id:po.id,vendor_company_id:po.vendor_company_id},
        snapshot:{captured_at:now(),purchase_order:po,lines,source:'TTT-OS purchasing'}
      });
      const received=!!po.received_date||['received','partial','partially received','closed'].includes(lower(po.status))||lines.some(x=>Number(x.received_quantity||0)>0);
      if(received){
        await ensureDocument({
          code:'GRN',sourceType:'goods_receipt',sourceId:po.id,
          links:{job_id:po.job_id,purchase_order_id:po.id,vendor_company_id:po.vendor_company_id},
          snapshot:{captured_at:now(),purchase_order:po,lines,source:'TTT-OS receiving'}
        });
      }
    }

    for(const tx of state.inventoryTransactions){
      const type=lower(tx.transaction_type);
      if(/adjust|write.?off|shrink|correction|damage/.test(type)){
        await ensureDocument({
          code:'IAJ',sourceType:'inventory_transaction',sourceId:tx.id,
          links:{job_id:tx.job_id,purchase_order_id:tx.purchase_order_id},
          snapshot:{captured_at:now(),inventory_transaction:tx,source:'TTT-OS inventory'}
        });
      }else if(/transfer|move/.test(type)){
        await ensureDocument({
          code:'STR',sourceType:'inventory_transfer',sourceId:tx.id,
          links:{job_id:tx.job_id,purchase_order_id:tx.purchase_order_id},
          snapshot:{captured_at:now(),inventory_transaction:tx,source:'TTT-OS inventory'}
        });
      }
    }
  }

  async function reconcileFinance(){
    for(const exp of state.expenses){
      const expenseJob=state.jobs.find(x=>x.id===exp.job_ref);
      await ensureDocument({
        code:'EXP',sourceType:'expense',sourceId:exp.id,
        links:{job_id:expenseJob?.id||null,customer_id:exp.customer_id||null,vehicle_id:exp.vehicle_id||null,work_order_id:exp.work_order_id||null},
        snapshot:{captured_at:now(),expense:exp,source:'TTT-OS expense ledger'}
      });
    }
  }

  async function reconcileAll(){
    for(const j of state.jobs.filter(x=>!isClosedStatus(x.status)))await reconcileJob(j);
    await reconcilePurchasing();
    await reconcileFinance();
    await refreshDocuments();
  }

  function blockersForJob(j){
    const b=[];
    const d=diagnosticForJob(j.id);
    const q=quoteForJob(j.id);
    const inv=invoicesForJob(j.id)[0];
    const checkIn=j.check_in||localJob(j.id)?.checkIn||null;
    const hasCondition=!!checkIn||mediaForJob(j.id).length>0;
    const wo=workOrderForJob(j.id);

    if(q&&!finalized(j.id,'Q',q.id))b.push({code:'Q',level:'warning',text:'Quotation not finalized'});
    if(hasCondition&&!finalized(j.id,'CHK'))b.push({code:'CHK',level:'warning',text:'Check-In evidence not frozen'});
    if(hasCondition&&!finalized(j.id,'AUTH'))b.push({code:'AUTH',level:'blocking',text:'Customer Authorization signature outstanding'});
    if(wo&&!state.documents.some(x=>x.job_id===j.id&&x.document_code==='WO'&&!x.archived_at))b.push({code:'WO',level:'warning',text:'Work Order document missing'});
    if(lower(j.status)==='qc'&&!finalized(j.id,'QC'))b.push({code:'QC',level:'blocking',text:'QC sign-off required'});
    if(stagePast(j.status,['Ready for Pickup','Delivered','Closed'])&&!inv)b.push({code:'INV',level:'blocking',text:'Invoice has not been created'});
    if(inv&&!finalized(j.id,'INV',inv.id))b.push({code:'INV',level:stagePast(j.status,['Ready for Pickup','Delivered','Closed'])?'blocking':'warning',text:'Invoice document not finalized'});
    if(stagePast(j.status,['Ready for Pickup','Delivered','Closed'])&&!finalized(j.id,'COMP'))b.push({code:'COMP',level:'blocking',text:'Customer handover acceptance outstanding'});
    if(d&&!finalized(j.id,'DIA',d.id)&&['in_progress','findings_ready','repair_authorized','resolved','closed'].includes(d.status))b.push({code:'DIA',level:'blocking',text:'Diagnostic Authorization required'});
    if(d&&['findings_ready','repair_authorized','resolved','closed'].includes(d.status)&&!finalized(j.id,'DFR',d.id))b.push({code:'DFR',level:'warning',text:'Diagnostic Findings Report not frozen'});
    if(d?.source_json?.convert_to_repair&&!finalized(j.id,'DRA',d.id))b.push({code:'DRA',level:'blocking',text:'Repair authorization outstanding'});
    return b;
  }

  async function gateJobAction(j,action){
    await refreshDocuments();
    if(action==='authorize'){
      if(!finalized(j.id,'AUTH')){
        await reconcileJob(j);
        await refreshDocuments();
        window.TTTDocumentSystem?.refreshJobCenter?.(localJob(j.id),true);
        toastMsg('Customer Authorization must be signed and finalized before the Work Order can start.');
        document.getElementById('doc09JobCenter')?.scrollIntoView({behavior:'smooth',block:'start'});
        return false;
      }
    }
    if(action==='leave_qc'&&!finalized(j.id,'QC')){
      await reconcileJob(j);await refreshDocuments();
      window.TTTDocumentSystem?.refreshJobCenter?.(localJob(j.id),true);
      toastMsg('QC & Final Inspection must be finalized before the vehicle can move to pickup.');
      return false;
    }
    if(action==='deliver'){
      const inv=invoicesForJob(j.id)[0];
      if(!inv){toastMsg('Create the final Invoice before vehicle handover.');return false;}
      if(!finalized(j.id,'INV',inv.id)){toastMsg('Finalize the Invoice before vehicle handover.');return false;}
      if(!finalized(j.id,'COMP')){await reconcileJob(j);await refreshDocuments();window.TTTDocumentSystem?.refreshJobCenter?.(localJob(j.id),true);toastMsg('Customer Handover acceptance must be signed before marking the vehicle delivered.');return false;}
    }
    if(action==='close'&&!finalized(j.id,'COMP')){
      toastMsg('Finalized Job Completion & Handover is required before closing the Job.');
      return false;
    }
    return true;
  }

  function installGates(){
    document.addEventListener('click',async e=>{
      const btn=e.target?.closest('button');if(!btn)return;
      const local=window.currentJobId?localJob(window.currentJobId):null;
      const row=local?state.jobs.find(x=>x.id===local.id):null;
      if(!row)return;
      let action=null;
      if(btn.id==='v05AuthorizeBtn')action='authorize';
      if(btn.id==='nextActionBtn'){
        if(lower(local.status)==='qc')action='leave_qc';
        else if(lower(local.status)==='ready for pickup')action='deliver';
        else if(lower(local.status)==='delivered')action='close';
      }
      if(!action)return;
      if(btn.dataset.waGateBypass==='1'){
        delete btn.dataset.waGateBypass;
        return;
      }
      e.preventDefault();e.stopImmediatePropagation();
      if(await gateJobAction(row,action)){
        btn.dataset.waGateBypass='1';
        btn.click();
      }
    },true);
  }

  async function saveDiagnostic(jobId,mode){
    const d=diagnosticForJob(jobId);if(!d)return;
    const val=id=>document.getElementById(id)?.value?.trim()||null;
    const patch={
      reported_symptom:val('waDiagSymptom'),scan_notes:val('waDiagScan'),isolate_notes:val('waDiagIsolate'),
      trace_notes:val('waDiagTrace'),verify_notes:val('waDiagVerify'),resolve_notes:val('waDiagResolve'),
      root_cause_classification:val('waDiagRoot'),findings:val('waDiagFindings'),recommended_action:val('waDiagAction'),
      estimate_next_authorization:val('waDiagEstimate'),updated_at:now(),updated_by:uid()
    };
    if(['start','findings','resolve'].includes(mode)&&!finalized(jobId,'DIA',d.id)){
      toastMsg('Finalize the Diagnostic Authorization before diagnostic work or findings can be completed.');
      return;
    }
    if(mode==='start'){
      patch.status='in_progress';patch.started_at=d.started_at||now();
    }else if(mode==='findings'){
      patch.status='findings_ready';patch.started_at=d.started_at||now();
    }else if(mode==='repair'){
      if(!finalized(jobId,'DFR',d.id)){toastMsg('Freeze the Diagnostic Findings Report before preparing repair authorization.');return;}
      patch.status='findings_ready';patch.source_json={...(d.source_json||{}),convert_to_repair:true};
    }else if(mode==='resolve'){
      patch.status='resolved';patch.completed_at=now();
    }
    const out=await cloud().from('diagnostic_cases').update(patch)
      .eq('organization_id',org()).eq('id',d.id).select('*').single();
    if(out.error){toastMsg('Diagnostic case save failed: '+out.error.message);return;}
    Object.assign(d,out.data);
    await reconcileJob(state.jobs.find(x=>x.id===jobId));
    await refreshDocuments();
    injectJobPanel();
    renderCompliance();
    toastMsg(mode==='save'?'Diagnostic progress saved':'Diagnostic workflow updated');
  }

  function diagnosticPanel(row){
    if(!isDiagnosticJob(row))return '';
    const d=diagnosticForJob(row.id);
    if(!d)return '<article class="panel wa-panel"><div class="panel-head"><div><p class="eyebrow">SIGNALTRACE™</p><h3>Diagnostic Case</h3><p class="muted">Preparing structured diagnostic workflow…</p></div></div></article>';
    const f=(id,label,value,wide=false)=>'<label class="'+(wide?'wa-wide':'')+'">'+label+'<textarea id="'+id+'">'+esc(value||'')+'</textarea></label>';
    return '<article class="panel wa-panel" id="waDiagnosticPanel">'+
      '<div class="panel-head"><div><p class="eyebrow">SIGNALTRACE™</p><h3>'+esc(d.id)+' · '+esc(d.status)+'</h3><p class="muted">SCAN → ISOLATE → TRACE → VERIFY → RESOLVE</p></div><span class="badge">'+(finalized(row.id,'DIA',d.id)?'Authorized':'Authorization pending')+'</span></div>'+
      '<div class="wa-form">'+
      f('waDiagSymptom','Reported symptom',d.reported_symptom,true)+
      f('waDiagScan','SCAN',d.scan_notes)+f('waDiagIsolate','ISOLATE',d.isolate_notes)+
      f('waDiagTrace','TRACE',d.trace_notes)+f('waDiagVerify','VERIFY',d.verify_notes)+
      f('waDiagResolve','RESOLVE',d.resolve_notes)+f('waDiagRoot','Root-cause classification',d.root_cause_classification)+
      f('waDiagFindings','Findings',d.findings,true)+f('waDiagAction','Recommended corrective action',d.recommended_action,true)+
      f('waDiagEstimate','Estimate / next authorization',d.estimate_next_authorization,true)+'</div>'+
      '<div class="wa-actions"><button class="btn secondary" data-wa-diag="save">Save Progress</button>'+
      '<button class="btn secondary" data-wa-diag="start">Start Diagnostics</button>'+
      '<button class="btn primary" data-wa-diag="findings">Mark Findings Ready</button>'+
      '<button class="btn secondary" data-wa-diag="repair">Prepare Repair Authorization</button>'+
      '<button class="btn secondary" data-wa-diag="resolve">Resolve Case</button></div></article>';
  }

  function injectJobPanel(){
    const root=document.getElementById('jobDetailBody');
    const id=window.currentJobId;
    if(!root||!id)return;
    const row=state.jobs.find(x=>x.id===id);if(!row)return;
    root.querySelector('#waWorkflowPanel')?.remove();
    root.querySelector('#waDiagnosticPanel')?.remove();
    const blockers=blockersForJob(row);
    const docCount=docsForJob(id).length;
    const finalCount=docsForJob(id).filter(x=>x.finalized_at).length;
    const html='<article class="panel wa-panel" id="waWorkflowPanel"><div class="panel-head"><div><p class="eyebrow">WORKFLOW AUTOMATION</p><h3>Operational Control</h3><p class="muted">'+finalCount+' of '+docCount+' generated controlled records finalized.</p></div><button class="btn secondary compact" id="waSyncJob">Sync Documents</button></div>'+
      '<div class="wa-blockers">'+(blockers.length?blockers.map(x=>'<div class="wa-block '+esc(x.level)+'"><strong>'+esc(x.code)+'</strong><span>'+esc(x.text)+'</span></div>').join(''):'<div class="wa-clear">✓ No current document blockers detected.</div>')+'</div></article>'+
      diagnosticPanel(row);
    const docCenter=root.querySelector('#doc09JobCenter')||root.querySelector('#documentCenter');
    if(docCenter)docCenter.insertAdjacentHTML('beforebegin',html);else root.insertAdjacentHTML('beforeend',html);
    document.getElementById('waSyncJob')?.addEventListener('click',async()=>{await reconcileJob(row);await refreshDocuments();window.TTTDocumentSystem?.refreshJobCenter?.(localJob(id),true);injectJobPanel();renderCompliance();toastMsg('Job document controls synchronized');});
    root.querySelectorAll('[data-wa-diag]').forEach(b=>b.onclick=()=>saveDiagnostic(id,b.dataset.waDiag));
  }

  function complianceRows(){
    return state.jobs.filter(j=>!isClosedStatus(j.status)).map(j=>({job:j,blockers:blockersForJob(j)}))
      .filter(x=>x.blockers.length)
      .sort((a,b)=>b.blockers.filter(x=>x.level==='blocking').length-a.blockers.filter(x=>x.level==='blocking').length);
  }

  function ensureViews(){
    const main=document.querySelector('main.main'),settings=document.getElementById('settings');if(!main)return;
    if(!document.getElementById('workflow-compliance')){
      const s=document.createElement('section');s.id='workflow-compliance';s.className='view';s.innerHTML='<div id="waComplianceBody"></div>';
      main.insertBefore(s,settings||null);
    }
    const insights=[...document.querySelectorAll('.nav-group')].find(g=>g.querySelector('.nav-group-toggle')?.textContent.includes('INSIGHTS'));
    const items=insights?.querySelector('.nav-group-items');
    if(items&&!items.querySelector('[data-wa-compliance]')){
      items.innerHTML='';
      const b=document.createElement('button');b.className='nav-item';b.type='button';b.dataset.waCompliance='1';b.textContent='Compliance & Workflow';
      items.appendChild(b);
      b.onclick=()=>openCompliance();
    }
  }

  function openCompliance(){
    document.querySelectorAll('.view.active').forEach(x=>x.classList.remove('active'));
    document.getElementById('workflow-compliance')?.classList.add('active');
    document.querySelectorAll('.nav-item.active').forEach(x=>x.classList.remove('active'));
    document.querySelector('[data-wa-compliance]')?.classList.add('active');
    const h=document.getElementById('pageTitle');if(h)h.textContent='Compliance & Workflow';
    renderCompliance();
  }

  function renderCompliance(){
    const body=document.getElementById('waComplianceBody');if(!body)return;
    const rows=complianceRows();
    const blocking=rows.reduce((n,x)=>n+x.blockers.filter(b=>b.level==='blocking').length,0);
    const pendingSig=state.documents.filter(x=>x.document_status==='pending_signature'&&!x.archived_at).length;
    const legalDrafts=state.templates.filter(x=>x.legal_review_required&&/^v0|draft/i.test(String(x.current_version))).length;
    const openEx=state.exceptions.filter(x=>x.status==='open'&&!x.archived_at).length;
    const diagOpen=state.diagnostics.filter(x=>!['resolved','closed'].includes(x.status)&&!x.archived_at).length;
    const poPending=state.purchaseOrders.filter(x=>!['received','closed','cancelled','canceled'].includes(lower(x.status))).length;
    body.innerHTML=
      '<div class="section-head"><div><p class="eyebrow">OPERATIONS CONTROL</p><h2>Compliance & Workflow</h2><p class="muted">Live controls generated from Jobs, Documents, Diagnostics, Purchasing and Finance.</p></div><button class="btn secondary" id="waRefresh">Refresh & Reconcile</button></div>'+
      '<div class="wa-kpis"><div><span>Blocking controls</span><strong>'+blocking+'</strong></div><div><span>Pending signatures</span><strong>'+pendingSig+'</strong></div><div><span>Open exceptions</span><strong>'+openEx+'</strong></div><div><span>Open diagnostics</span><strong>'+diagOpen+'</strong></div><div><span>POs pending receipt</span><strong>'+poPending+'</strong></div><div><span>Legal-review drafts</span><strong>'+legalDrafts+'</strong></div></div>'+
      '<article class="panel"><div class="panel-head"><div><h3>Jobs needing attention</h3><p class="muted">Only active Jobs with outstanding document/workflow controls appear here.</p></div></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Controls</th><th>Blocking</th><th></th></tr></thead><tbody>'+
      (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.job.id)+'</strong></td><td>'+esc(x.job.status||'—')+'</td><td>'+x.blockers.map(b=>'<span class="wa-chip '+esc(b.level)+'">'+esc(b.code)+'</span>').join(' ')+'</td><td>'+x.blockers.filter(b=>b.level==='blocking').length+'</td><td><button class="btn secondary compact" data-wa-open-job="'+esc(x.job.id)+'">Open</button></td></tr>').join(''):'<tr><td colspan="5" class="muted">No active workflow exceptions detected.</td></tr>')+
      '</tbody></table></div></article>'+
      '<div class="grid two wa-lower">'+
      '<article class="panel"><div class="panel-head"><h3>Document lifecycle</h3></div><div class="checklist"><div>Draft: '+state.documents.filter(x=>x.document_status==='draft').length+'</div><div>Pending signature: '+pendingSig+'</div><div>Finalized: '+state.documents.filter(x=>x.finalized_at).length+'</div><div>Delivery events logged: '+state.deliveries.length+'</div></div></article>'+
      '<article class="panel"><div class="panel-head"><h3>System controls</h3></div><div class="checklist"><div>✓ Customer Authorization requires check-in evidence</div><div>✓ QC blocks vehicle release until finalized</div><div>✓ Handover blocks delivery until signed</div><div>✓ Atomic document numbering</div><div>✓ Finalized records immutable</div><div>✓ SignalTrace structured case workflow</div></div></article></div>';
    document.getElementById('waRefresh')?.addEventListener('click',()=>loadAll({reconcile:true}));
    body.querySelectorAll('[data-wa-open-job]').forEach(b=>b.onclick=()=>{if(typeof window.openJob==='function')window.openJob(b.dataset.waOpenJob);});
  }

  async function logDelivery(record,channelName,recipient,status,subject,meta={}){
    const row={
      organization_id:org(),document_id:record.id,job_id:record.job_id||null,customer_id:record.customer_id||null,
      channel:channelName,recipient:recipient||null,status:status||'draft_opened',subject:subject||null,
      delivered_at:['sent','delivered','downloaded','printed'].includes(status)?now():null,
      metadata:meta,created_by:uid()
    };
    const out=await cloud().from('document_deliveries').insert(row).select('*').single();
    if(!out.error)state.deliveries.unshift(out.data);
    return out;
  }

  async function deliverDocument(record,j){
    if(!record)return;
    const c=record.customer_id?localCustomer(record.customer_id):j?.customerId?localCustomer(j.customerId):null;
    const recipient=c?.email||'';
    const subject='TTT '+record.title+' '+record.document_number;
    const body='Hi '+(c?.firstName||c?.first_name||c?.name||'')+',\n\nPlease find your Thompson Transportation Technologies '+lower(record.title)+' '+record.document_number+'.\n\nThank you,\nThompson Transportation Technologies';
    document.getElementById('waDeliveryModal')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div class="wa-modal" id="waDeliveryModal"><div class="wa-backdrop" data-wa-delivery-close></div><div class="wa-dialog"><div class="panel-head"><div><p class="eyebrow">DOCUMENT DELIVERY</p><h3>'+esc(record.document_number)+'</h3><p class="muted">'+esc(record.title)+'</p></div><button class="btn secondary" data-wa-delivery-close>Close</button></div><label>Recipient email<input id="waDeliveryEmail" type="email" value="'+esc(recipient)+'"></label><label>Subject<input id="waDeliverySubject" value="'+esc(subject)+'"></label><div class="wa-actions"><button class="btn primary" id="waOpenEmail">Open Email Draft</button><button class="btn secondary" id="waMarkSent">Mark Sent</button><button class="btn secondary" id="waLogDownload">Log Download / PDF</button></div><p class="muted">Opening an email draft is logged as a draft action only. Use “Mark Sent” after the message is actually sent unless a future mail provider reports delivery automatically.</p></div></div>');
    const m=document.getElementById('waDeliveryModal');
    m.querySelectorAll('[data-wa-delivery-close]').forEach(x=>x.onclick=()=>m.remove());
    document.getElementById('waOpenEmail').onclick=async()=>{
      const to=document.getElementById('waDeliveryEmail').value.trim();
      const sub=document.getElementById('waDeliverySubject').value.trim();
      await logDelivery(record,'email',to,'draft_opened',sub,{method:'mailto'});
      window.location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(sub)+'&body='+encodeURIComponent(body);
    };
    document.getElementById('waMarkSent').onclick=async()=>{
      const to=document.getElementById('waDeliveryEmail').value.trim();
      const sub=document.getElementById('waDeliverySubject').value.trim();
      const out=await logDelivery(record,'email',to,'sent',sub,{confirmed_by_user:true});
      if(out.error)toastMsg('Could not log delivery: '+out.error.message);else{toastMsg('Document delivery marked sent');m.remove();renderCompliance();}
    };
    document.getElementById('waLogDownload').onclick=async()=>{
      const out=await logDelivery(record,'download',null,'downloaded',subject,{confirmed_by_user:true});
      if(out.error)toastMsg('Could not log download');else{toastMsg('Download / PDF action logged');m.remove();renderCompliance();}
    };
  }

  function subscribe(){
    if(channel||!cloud()||!org())return;
    channel=cloud().channel('ttt-workflow-automation-'+org());
    ['documents','diagnostic_cases','workflow_exceptions','document_deliveries','payments','purchase_orders','invoices'].forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+org()},()=>scheduleReload());
    });
    channel.subscribe();
  }

  function scheduleReload(){
    clearTimeout(reconcileTimer);
    reconcileTimer=setTimeout(()=>loadAll({reconcile:true}),700);
  }

  function observe(){
    const obs=new MutationObserver(()=>{
      if(document.getElementById('jobdetail')?.classList.contains('active'))injectJobPanel();
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  window.TTTWorkflowAutomation={
    state,load:loadAll,reconcile:reconcileAll,reconcileJob,
    openCompliance,deliverDocument,blockersForJob,ensureDocument
  };

  installGates();
  observe();
  window.addEventListener('ttt:cloud-state-applied',()=>loadAll({reconcile:true}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>loadAll({reconcile:true}),{once:true});
  else loadAll({reconcile:true});
})();