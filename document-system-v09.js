// TTT OS v0.9 — Waves 1-9 Document System, registry, workflow gates and audit trail.
(function(){
  'use strict';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now=()=>new Date().toISOString();
  const vehicleName=v=>[v?.year,v?.make,v?.model,v?.trim].filter(Boolean).join(' ');
  const serviceText=j=>[...(j?.services||[]),...(j?.equipment||[]).map(x=>x?.category),...(j?.quote?.snapshot?.services||[])].filter(Boolean).join(' ').toLowerCase();
  const isDiagnostic=j=>/signaltrace|diagnos|electrical fault|no.start|parasitic|can.?bus/.test(serviceText(j));
  const isTint=j=>/tint/.test(serviceText(j));
  const isConnected=j=>/gps|tracking|tracker|immobil|kill switch|alarm|remote start|security/.test(serviceText(j));
  const hasCustomerSupplied=j=>String(j?.partsStatus||'').toLowerCase().includes('customer supplied');
  const id=()=>('DOC-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)).toUpperCase();

  const REGISTRY=[
    {key:'quotation',code:'Q',wave:1,title:'Quotation / Estimate',category:'Customer Job',customer:true,stage:'Quote',existing:'quote',required:'standard'},
    {key:'vehicle_checkin',code:'CHK',wave:1,title:'Vehicle Check-In & Condition Report',category:'Customer Job',customer:true,stage:'Check-In',existing:'checkin',required:'standard'},
    {key:'customer_authorization',code:'AUTH',wave:1,title:'Customer Authorization',category:'Customer Job',customer:true,signature:true,lock:true,stage:'Authorization',existing:'authorization',required:'standard'},
    {key:'work_order',code:'WO',wave:1,title:'Work Order',category:'Operations',stage:'Work',existing:'workorder',required:'standard'},
    {key:'change_order',code:'CO',wave:1,title:'Change Order',category:'Customer Job',customer:true,signature:true,lock:true,stage:'Work',existing:'changeorder',conditional:'scope_change'},
    {key:'qc_final',code:'QC',wave:1,title:'QC & Final Inspection Report',category:'Operations',stage:'QC',required:'standard'},
    {key:'invoice',code:'INV',wave:1,title:'Invoice',category:'Finance',customer:true,stage:'Billing',existing:'invoice',required:'standard'},
    {key:'payment_receipt',code:'RCPT',wave:1,title:'Payment Receipt',category:'Finance',customer:true,stage:'Payment',required:'standard'},
    {key:'handover',code:'COMP',wave:1,title:'Job Completion & Handover Report',category:'Customer Job',customer:true,signature:true,lock:true,stage:'Delivery',required:'standard'},
    {key:'warranty_certificate',code:'WAR',wave:1,title:'Warranty Certificate',category:'Warranty',customer:true,stage:'Delivery',required:'standard'},

    {key:'diagnostic_authorization',code:'DIA',wave:2,title:'Inspection / Diagnostic Authorization',category:'Diagnostics',customer:true,signature:true,lock:true,stage:'Diagnostics',required:'diagnostic'},
    {key:'diagnostic_findings',code:'DFR',wave:2,title:'Diagnostic Findings Report',category:'Diagnostics',customer:true,stage:'Diagnostics',required:'diagnostic'},

    {key:'terms_conditions',code:'TNC',wave:3,title:'TTT Terms & Conditions',category:'Legal',customer:true,lock:true,stage:'Reference',system:true},
    {key:'privacy_notice',code:'PRIV',wave:3,title:'Privacy Notice / Customer Data Policy',category:'Legal',customer:true,stage:'Reference',system:true},
    {key:'media_release',code:'MEDIA',wave:3,title:'Optional Media / Marketing Release',category:'Legal',customer:true,signature:true,lock:true,stage:'Check-In',conditional:'marketing'},
    {key:'customer_supplied_equipment',code:'CSE',wave:3,title:'Customer-Supplied Equipment Acknowledgement',category:'Legal',customer:true,signature:true,lock:true,stage:'Authorization',conditional:'customer_supplied'},
    {key:'tint_compliance',code:'TINT',wave:3,title:'Tint Compliance / Exemption Record',category:'Compliance',customer:true,signature:true,lock:true,stage:'Authorization',conditional:'tint'},
    {key:'vehicle_release_authorization',code:'REL',wave:3,title:'Vehicle Release Authorization',category:'Customer Job',customer:true,signature:true,lock:true,stage:'Delivery',conditional:'third_party_pickup'},

    {key:'incident_damage',code:'INC',wave:4,title:'Incident / Vehicle Damage Report',category:'Risk',stage:'Exception',conditional:'incident'},
    {key:'warranty_claim',code:'WCL',wave:4,title:'Warranty Claim / Comeback Report',category:'Warranty',customer:true,stage:'Warranty',conditional:'warranty_claim'},
    {key:'complaint_resolution',code:'CRR',wave:4,title:'Customer Complaint / Resolution Record',category:'Risk',customer:true,stage:'Exception',conditional:'complaint'},
    {key:'declined_recommendation',code:'DECL',wave:4,title:'Declined Recommendation / Work Acknowledgement',category:'Risk',customer:true,signature:true,lock:true,stage:'Authorization',conditional:'declined_work'},
    {key:'uncollected_vehicle',code:'UVR',wave:4,title:'Abandoned / Uncollected Vehicle Record',category:'Risk',stage:'Exception',conditional:'uncollected'},

    {key:'purchase_order',code:'PO',wave:5,title:'Purchase Order',category:'Purchasing',stage:'Procurement',conditional:'parts_order'},
    {key:'goods_receiving',code:'GRN',wave:5,title:'Goods Receiving Report',category:'Inventory',stage:'Receiving',conditional:'receiving'},
    {key:'vendor_rma',code:'RMA',wave:5,title:'Return-to-Vendor / RMA',category:'Inventory',stage:'Returns',conditional:'vendor_return'},
    {key:'inventory_adjustment',code:'IAR',wave:5,title:'Inventory Adjustment Record',category:'Inventory',stage:'Inventory',system:true},
    {key:'stock_transfer',code:'STR',wave:5,title:'Stock Transfer Record',category:'Inventory',stage:'Inventory',system:true},

    {key:'credit_memo',code:'CM',wave:6,title:'Credit Memo / Refund / Adjustment',category:'Finance',customer:true,stage:'Billing',conditional:'credit'},
    {key:'deposit_receipt',code:'DEP',wave:6,title:'Deposit Receipt',category:'Finance',customer:true,stage:'Payment',conditional:'deposit'},
    {key:'account_statement',code:'STMT',wave:6,title:'Customer Account Statement',category:'Finance',customer:true,stage:'Billing',system:true},
    {key:'vendor_bill_ap',code:'VB',wave:6,title:'Vendor Bill / Accounts Payable Record',category:'Finance',stage:'AP',system:true},
    {key:'expense_report',code:'EXP',wave:6,title:'Expense Report',category:'Finance',stage:'Expense',system:true},

    {key:'device_credential_handoff',code:'DCH',wave:7,title:'Device / Credential Handoff',category:'Connected Electronics',customer:true,signature:true,lock:true,stage:'Delivery',conditional:'connected'},
    {key:'security_handoff',code:'SEC',wave:7,title:'Security / Immobilizer Handoff',category:'Connected Electronics',customer:true,signature:true,lock:true,stage:'Delivery',conditional:'security'},
    {key:'subscription_ack',code:'SUB',wave:7,title:'Subscription / Cellular Service Acknowledgement',category:'Connected Electronics',customer:true,signature:true,lock:true,stage:'Authorization',conditional:'subscription'},

    {key:'master_service_agreement',code:'MSA',wave:8,title:'Master Service Agreement',category:'B2B / Fleet',customer:true,signature:true,lock:true,stage:'Account',conditional:'commercial'},
    {key:'commercial_credit_application',code:'CCA',wave:8,title:'Commercial Account / Credit Application',category:'B2B / Fleet',customer:true,signature:true,lock:true,stage:'Account',conditional:'commercial_credit'},
    {key:'fleet_work_authorization',code:'FWA',wave:8,title:'Fleet Vehicle Work Authorization',category:'B2B / Fleet',customer:true,signature:true,lock:true,stage:'Authorization',conditional:'fleet'},
    {key:'dealer_ro_reference',code:'DRO',wave:8,title:'Dealer Repair Order / RO Reference',category:'B2B / Fleet',stage:'Job',conditional:'dealer'},
    {key:'consolidated_invoice',code:'CINV',wave:8,title:'Monthly Statement / Consolidated Invoice',category:'B2B / Fleet',customer:true,stage:'Billing',system:true},
    {key:'service_level_agreement',code:'SLA',wave:8,title:'Service Level Agreement',category:'B2B / Fleet',customer:true,signature:true,lock:true,stage:'Account',conditional:'sla'},

    {key:'job_document_register',code:'JDR',wave:9,title:'Job Audit / Document Register',category:'Governance',stage:'Audit',system:true},
    {key:'template_version_register',code:'DVR',wave:9,title:'Document Template / Version Register',category:'Governance',stage:'Audit',system:true},
    {key:'technician_signoff',code:'TSO',wave:9,title:'Technician Sign-Off / Accountability Record',category:'Governance',stage:'Work',system:true},
    {key:'safety_exception',code:'SER',wave:9,title:'Safety / Exception Report',category:'Governance',stage:'Exception',system:true},
    {key:'training_competency',code:'TCR',wave:9,title:'Training / Competency Record',category:'Governance',stage:'People',system:true}
  ];

  const DRIVE_URLS={
    quotation:'https://docs.google.com/document/d/1sr3qMPc9lkSPuUqzH475TmOpLQwI3DYFAScFbIbBQKY/edit',
    vehicle_checkin:'https://docs.google.com/document/d/1FdcsEA5m3KD_VjgOYGLNiefH8ozSXIvldHpYAZCf3Yk/edit',
    customer_authorization:'https://docs.google.com/document/d/1zXChkG_5TAUHpt-ieTLcmPrOl1onBsaW1ciQxb8jSPk/edit',
    work_order:'https://docs.google.com/document/d/1nJLvpqB3slcmyDoQmFJ1Fg7Fk5uKxzxVxpTm3OsP_9U/edit',
    change_order:'https://docs.google.com/document/d/1n0A8bJyw6clvuDt4KwnhnOSj23DSUYh0SNDqt3Yz_7w/edit',
    qc_final:'https://docs.google.com/document/d/10GrvbMQfDQoDnvSXAPHpDlcxbo9pWYEzRqfpGJvUPHA/edit',
    invoice:'https://docs.google.com/document/d/1hKX5OzWPwdZXJLXVKVhmxm9S85EUmXf5tyadnRDeqH8/edit',
    payment_receipt:'https://docs.google.com/document/d/1urW5H-My00iIXliVUNnZQwWOBbltfK7d6plv5I8o6nM/edit',
    handover:'https://docs.google.com/document/d/1VUA-G5G8vpx3x8dVTl8dprdTrbuiwYnlOb9zGfEidB4/edit',
    warranty_certificate:'https://docs.google.com/document/d/1VFSnfIv2GkFKDP0yhxWkVntRiBWV6Zf-gYcSQgD9OYw/edit',
    diagnostic_authorization:'https://docs.google.com/document/d/1n7Fr-Hm7oyGNzliJsFvbDX_kmZVRq90gDKMt6p6gTK0/edit',
    diagnostic_findings:'https://docs.google.com/document/d/1xBHDMS83__NoO6V8nt6yvroQisVe8ffc-5yAve59Nb8/edit',
    terms_conditions:'https://docs.google.com/document/d/134T5i238cnPFRAF6Dl6hmh1fDq7h2zZn6DGrufiE8n0/edit',
    privacy_notice:'https://docs.google.com/document/d/1QM_5kyRSosDfxTT0xg_W-rhC84xFg0KdznHJCD_PQjo/edit',
    media_release:'https://docs.google.com/document/d/1zbiwSNJL61s8lwB7R8qm-wKTEs9Q5Oc-sTXCT_J8Bao/edit',
    customer_supplied_equipment:'https://docs.google.com/document/d/1x5LQ3vV_j0rIyeQ93c8ktidneQGr7CB8cWSdyWCs5cE/edit',
    tint_compliance:'https://docs.google.com/document/d/1-iL0fSahd09ZpnvLrT_Nekr-CXkkMiR0BkoClI6CYWc/edit',
    vehicle_release_authorization:'https://docs.google.com/document/d/1RR0KSXnNGaf5r6G8AllzM0PAAfXorjmj5jb6FdON0rE/edit',
    incident_damage:'https://docs.google.com/document/d/14TAksZ6wHhRSr8vEZsaHK4Nd5WnV86wPUTrYTAxaJXI/edit',
    warranty_claim:'https://docs.google.com/document/d/1KpWisTJ_-NeefPtDFztKdo0c24rJwsonanvHS7eZkKQ/edit',
    complaint_resolution:'https://docs.google.com/document/d/1UfXkf4UCWORHtNodJZOkct1M1oz5qpz-AWMSMsUDIwU/edit',
    declined_recommendation:'https://docs.google.com/document/d/18mN4orymcv5is3W_LQL4rEZYBkp2yF_PetiBTtFfTSg/edit',
    uncollected_vehicle:'https://docs.google.com/document/d/1A0flVoecD26loOBTM_OgNf0g4LtGGlHT-HslxJxcX0Q/edit',
    purchase_order:'https://docs.google.com/document/d/1_pnttZEMkOxDmgmiVU_e9wO2WcEqviALSjXGCwscXSE/edit',
    goods_receiving:'https://docs.google.com/document/d/1VInT3ZQu4hPNg1XK6EbMxXxG3MyQIk2oM5hNIFxIfHo/edit',
    vendor_rma:'https://docs.google.com/document/d/1luhV5Gwm__NbO66qQfegNPvxsX6TGH4Srl8wTYMJ6Ww/edit',
    inventory_adjustment:'https://docs.google.com/document/d/14QJQt7lR-Nzwz7h_azUMYiDj65mvIXWnmiXZTWcwtHk/edit',
    stock_transfer:'https://docs.google.com/document/d/1Xv1hs4_YJt18J8dUVrVn6uSncvLLW50-A9QnV7wCnBI/edit',
    credit_memo:'https://docs.google.com/document/d/1yOue5HlU2hhkAO7nc3pidLPeQHedbebTgcYP1TGxMYE/edit',
    deposit_receipt:'https://docs.google.com/document/d/1LPGeW0uKFNA3WUA839kwkI3V6YavgQj7slzqSHW8OM0/edit',
    account_statement:'https://docs.google.com/document/d/1G_Vxz_UTGzVooXX-oHNMVqwNJJ5t3ndh-W1j4P-tkJc/edit',
    vendor_bill_ap:'https://docs.google.com/document/d/1KhB6cNapz7uGs_rHpvlfXfuwDt8f7hxK-XPUOf7joI0/edit',
    expense_report:'https://docs.google.com/document/d/1e01w_J7fCHaif1wuhuuznIrn1F6cVNRhy4zhqADw_rw/edit',
    device_credential_handoff:'https://docs.google.com/document/d/1Wh-GFaWdfONsLqTLCLYBp7pQ0hJ5d3Fd27-UvroThE4/edit',
    security_handoff:'https://docs.google.com/document/d/1NMjqxrwCJl6Pqvt9WZzM3VD_riw2cmExcU3KjEjXMcw/edit',
    subscription_ack:'https://docs.google.com/document/d/1LMuZG64gGLzcxT4bYFgMYd7i9-NBmfgxDSij_wJdvws/edit',
    master_service_agreement:'https://docs.google.com/document/d/1g4AO9Kthwei6QwMCY7OTVWhkYj8_XrruA-kE-PA48BU/edit',
    commercial_credit_application:'https://docs.google.com/document/d/1B2VnfMp27j2UrYKpbD2s_N2BrpA0GvxEaQj6yIRF3pU/edit',
    fleet_work_authorization:'https://docs.google.com/document/d/1ZIo11pSXopXKgFJKV1pWcZu5haYstrSvWeOh1iAqymg/edit',
    dealer_ro_reference:'https://docs.google.com/document/d/1cKqcC8Wkre4e761XAwtT2rXdCDWrNUv9I0Xzlx33sSc/edit',
    consolidated_invoice:'https://docs.google.com/document/d/1Mp5MiKlvxQ8zvIlaiTiuCA2KJ-CJz38qxjqkdejE3rs/edit',
    service_level_agreement:'https://docs.google.com/document/d/1D0AjWA6eKDZ-fHxGY4eKLTEftKn3HIT618b9NzoHa6w/edit',
    job_document_register:'https://docs.google.com/document/d/1Sdyejsh3qk4BTErgz7Vf_HmCEt-Zl3Tn-uqKpd7WuSs/edit',
    template_version_register:'https://docs.google.com/document/d/1DiR3mWwgn94hZqKr4_BGWtbaBw-PkEBZ7lr5SZE79t4/edit',
    technician_signoff:'https://docs.google.com/document/d/1XYf-EXxMU4gXxT1NOAcIa5WIRSsQJxygF6YbqnVXONg/edit',
    safety_exception:'https://docs.google.com/document/d/1xISJ19FVsmAyA8GOzFeJKbaVw96lvWYbo9P-d7Spisk/edit',
    training_competency:'https://docs.google.com/document/d/1eOBYPu4oLJxM6-uORf0jaO03w2Ocw1hymvQ0QWWVmBg/edit'
  };

  const FIELD_SETS={
    diagnostic_authorization:['Customer/vehicle and complaint','Authorized diagnostic activities','Road-test / scan / disassembly permissions','Diagnostic fee / time authorization','Check-in photo acknowledgement','T&C acknowledgement'],
    diagnostic_findings:['Reported symptom','Tests performed','Evidence / measurements','Root-cause classification','Findings','Recommended corrective action','Estimate / next authorization'],
    privacy_notice:['Information collected','Operational purpose','Vehicle/photo records','Connected-device information','Data sharing / processors','Retention / access','Customer questions'],
    media_release:['Vehicle/customer identifier','Permitted media','Permitted channels','Optional consent','Restrictions / exclusions','Revocation for future use'],
    customer_supplied_equipment:['Customer-supplied item','Condition / compatibility','Serial / model','No product warranty acknowledgement','Workmanship scope','Customer approval'],
    tint_compliance:['Vehicle/glass identification','Film / VLT selection','Existing glass reading','Final configuration','Exemption reference if applicable','Customer acknowledgement'],
    vehicle_release_authorization:['Vehicle','Authorized pickup person','ID verification','Release date/time','Keys/items released','Customer authorization'],
    incident_damage:['Incident date/time','Vehicle/job','People involved','Condition / damage','Photos/evidence','Immediate actions','Notification / resolution'],
    warranty_claim:['Original job / warranty','Claimed concern','Inspection / diagnosis','Coverage determination','Corrective action','Parts/labor disposition','Closeout'],
    complaint_resolution:['Complaint','Customer desired outcome','TTT review','Evidence','Resolution offered','Acceptance / follow-up'],
    declined_recommendation:['Recommended work','Reason / risk','Estimated impact','Customer decision','Advisor acknowledgement'],
    uncollected_vehicle:['Vehicle/job','Completion / notice dates','Contact attempts','Storage status','Escalation notes'],
    purchase_order:['Vendor','Ship-to','Related job/work order','Items / quantities / cost','Expected delivery','Approval'],
    goods_receiving:['PO/vendor','Date received','Items / quantities','Condition','Serial numbers','Discrepancies','Received by'],
    vendor_rma:['Vendor / original PO','Item / serial','Return reason','RMA number','Shipping / tracking','Credit / replacement status'],
    inventory_adjustment:['Item / SKU','Previous quantity','Adjustment','New quantity','Reason','Approved by'],
    stock_transfer:['Origin','Destination','Items / quantities','Released by','Received by'],
    credit_memo:['Customer / invoice','Reason','Original amount','Adjustment / refund','Revised balance','Approval'],
    deposit_receipt:['Customer/job','Payment date','Amount','Method','Transaction reference','Applied to quote/job'],
    account_statement:['Account/customer','Statement period','Opening balance','Invoices','Payments / credits','Closing balance'],
    vendor_bill_ap:['Vendor','PO / receiving reference','Invoice number/date','Items / charges','Tax / total','Due date','Payment status'],
    expense_report:['Employee/vendor','Expense date','Category','Line items','Job allocations','Receipt evidence','Approval'],
    device_credential_handoff:['Installed device / serial / IMEI','App/account status','Credential ownership handoff','Subscription status','Features demonstrated','Customer acknowledgement'],
    security_handoff:['Installed security equipment','Remote / key count','Immobilizer / kill-switch verification','PIN / credential handling','Emergency procedure','Customer acknowledgement'],
    subscription_ack:['Provider','Device / line','Plan / term','Recurring charges','Renewal / cancellation responsibility','Customer acknowledgement'],
    master_service_agreement:['Parties / term','Authorized services','Pricing / rate schedule','Authorization contacts','Billing / credit terms','Liability / warranty','T&C / exhibits'],
    commercial_credit_application:['Legal business name','Billing/contact details','Tax / registration data','Credit requested','References','Authorized signer'],
    fleet_work_authorization:['Account / vehicle','Authorized scope','Pricing basis','Fleet approver','PO/RO reference','Release instructions'],
    dealer_ro_reference:['Dealer/account','Dealer RO number','Vehicle','TTT job/work order','Authorized contact','Billing reference'],
    consolidated_invoice:['Account','Billing period','Job/vehicle lines','Credits/payments','Taxes','Balance due'],
    service_level_agreement:['Service coverage','Response targets','Availability','Escalation contacts','Exclusions','Reporting / review'],
    job_document_register:['Job identity','Required documents','Generated versions','Signatures / approvals','Hashes / immutable dates','Exceptions'],
    template_version_register:['Template key','Version','Effective date','Drive source','Status','Change notes'],
    technician_signoff:['Work order / operation','Technician','Tasks completed','Serialized equipment','Start/finish','Verification'],
    safety_exception:['Date/time','Job/area','Hazard / exception','Immediate control','Corrective action','Owner / closeout'],
    training_competency:['Person','Skill / process','Training completed','Assessment','Authorized scope','Reviewer / expiry']
  };

  const state={records:[],templatesLoaded:false,recordsLoaded:false};

  function tpl(key){return REGISTRY.find(x=>x.key===key);}
  function client(){return window.TTTCloud?.client||null;}
  function org(){return window.TTTCloud?.organizationId||null;}
  function user(){return window.TTTCloud?.userId||null;}

  async function seedTemplates(){
    if(!window.TTTCloud?.ready||!client()||!org()||state.templatesLoaded)return;
    const rows=REGISTRY.map(t=>({
      organization_id:org(),template_key:t.key,document_code:t.code,title:t.title,wave:t.wave,category:t.category,
      version:'1.0',status:'active',customer_facing:!!t.customer,signature_required:!!t.signature,
      immutable_on_sign:!!t.lock,required_stage:t.stage||null,applies_when:{required:t.required||null,conditional:t.conditional||null,system:!!t.system},
      drive_template_url:DRIVE_URLS[t.key]||null,source_json:{...t,drive_template_url:DRIVE_URLS[t.key]||null},updated_by:user()
    }));
    const {error}=await client().from('document_templates').upsert(rows,{onConflict:'organization_id,template_key'});
    if(error){console.warn('TTT documents: template seed unavailable until migration is applied',error);return;}
    state.templatesLoaded=true;
  }

  async function loadRecords(){
    if(!window.TTTCloud?.ready||!client()||!org())return;
    const {data,error}=await client().from('document_records').select('*').eq('organization_id',org()).is('archived_at',null).order('created_at',{ascending:false});
    if(error){console.warn('TTT documents: record load unavailable until migration is applied',error);return;}
    state.records=data||[];
    state.recordsLoaded=true;
    renderCenter();
    if(window.currentJobId)injectJobDocuments();
  }

  function recordFor(jobId,key){
    return state.records.find(r=>r.job_id===jobId&&r.template_key===key&&!r.archived_at);
  }
  function recordsFor(jobId,key){return state.records.filter(r=>r.job_id===jobId&&(!key||r.template_key===key));}

  async function allocate(code){
    const {data,error}=await client().rpc('allocate_document_number',{p_code:code});
    if(error)throw error;
    return data;
  }

  async function event(documentId,eventType,metadata={}){
    if(!client()||!org())return;
    await client().from('document_events').insert({organization_id:org(),document_id:documentId,event_type:eventType,actor_user_id:user(),metadata});
  }

  async function createRecord(key,j,extra={}){
    const t=tpl(key); if(!t||!client()||!org())return null;
    const number=await allocate(t.code);
    const row={
      organization_id:org(),id:id(),template_key:key,document_code:t.code,document_number:number,version:1,status:'draft',
      job_id:j?.id||extra.job_id||null,customer_id:j?.customerId||extra.customer_id||null,vehicle_id:j?.vehicleId||extra.vehicle_id||null,
      work_order_id:j?.workOrderId||extra.work_order_id||null,quote_id:j?.quote?.id||j?.quoteId||extra.quote_id||null,
      invoice_id:j?.invoice?.id||extra.invoice_id||null,terms_version:j?.finalAuthorization?.termsVersion||j?.quote?.approval?.termsVersion||null,
      payload:{...snapshotFor(t,j),...extra.payload},generated_at:now(),generated_by:user(),created_by:user(),updated_by:user()
    };
    const {data,error}=await client().from('document_records').insert(row).select('*').single();
    if(error)throw error;
    state.records.unshift(data);
    await event(data.id,'created',{template_key:key,document_number:number});
    return data;
  }

  function snapshotFor(t,j){
    const c=j?customer(j.customerId)||{}:{};
    const v=j?vehicle(j.vehicleId)||{}:{};
    return {
      template_key:t.key,title:t.title,wave:t.wave,customer:{id:c.id,name:c.name,email:c.email,phone:c.phone},
      vehicle:{id:v.id,name:vehicleName(v),vin:v.vin,plate:v.plate,plateState:v.plateState},
      job:j?{id:j.id,status:j.status,requestNotes:j.requestNotes,services:j.services||[],equipment:j.equipment||[],estimateTotal:j.estimateTotal,workOrderId:j.workOrderId}:null,
      captured_at:now()
    };
  }

  async function updateRecord(r,patch,eventType='updated'){
    if(!client()||!org()||r.immutable_at) return r;
    const body={...patch,updated_at:now(),updated_by:user()};
    const {data,error}=await client().from('document_records').update(body).eq('organization_id',org()).eq('id',r.id).select('*').single();
    if(error)throw error;
    Object.assign(r,data);
    await event(r.id,eventType,patch);
    return r;
  }

  async function lockRecord(r,status='completed',signature={}){
    if(r.immutable_at)return r;
    const canonical=JSON.stringify({id:r.id,number:r.document_number,template:r.template_key,version:r.version,payload:r.payload,signature});
    const bytes=new TextEncoder().encode(canonical);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const patch={
      status,content_sha256:hash,immutable_at:now(),
      signed_at:signature.signed_at||null,signed_by_name:signature.name||null,signed_by_email:signature.email||null,
      payload:{...r.payload,signature_snapshot:signature}
    };
    const {data,error}=await client().from('document_records').update({...patch,updated_at:now(),updated_by:user()}).eq('organization_id',org()).eq('id',r.id).is('immutable_at',null).select('*').single();
    if(error)throw error;
    Object.assign(r,data);
    await event(r.id,status==='signed'?'signed_and_locked':'completed_and_locked',{sha256:hash});
    return r;
  }

  function existingSatisfied(j,key){
    if(!j)return false;
    if(key==='quotation')return !!j.quote;
    if(key==='vehicle_checkin')return !!j.checkIn;
    if(key==='customer_authorization')return !!j.finalAuthorization;
    if(key==='work_order')return !!j.workOrderId;
    if(key==='change_order')return !!(j.changeOrders||[]).length;
    if(key==='invoice')return !!j.invoice;
    if(key==='deposit_receipt')return (+j.depositReceived||0)>0;
    return false;
  }

  function applicable(t,j){
    if(!j)return !!t.system;
    if(t.required==='standard')return true;
    if(t.required==='diagnostic')return isDiagnostic(j);
    switch(t.conditional){
      case 'customer_supplied':return hasCustomerSupplied(j);
      case 'tint':return isTint(j);
      case 'connected':return isConnected(j);
      case 'security':return /immobil|kill switch|alarm|security/.test(serviceText(j));
      case 'subscription':return /gps|tracking|cellular|subscription/.test(serviceText(j));
      case 'deposit':return (+j.estimate?.deposit||0)>0;
      case 'parts_order':return /parts ordered|parts need ordering/i.test(j.partsStatus||'');
      default:return false;
    }
  }

  function statusFor(t,j){
    if(existingSatisfied(j,t.key))return 'complete';
    const r=recordFor(j?.id,t.key);
    if(r)return r.status;
    return applicable(t,j)?'required':'not-applicable';
  }

  async function reconcileExisting(j){
    if(!j||!state.recordsLoaded)return;
    const mappings=[
      ['quotation',j.quote?.id,j.quote?.status||'generated'],
      ['vehicle_checkin',j.checkIn?.capturedAt,j.checkIn?'completed':null],
      ['customer_authorization',j.finalAuthorization?.id,j.finalAuthorization?'signed':null],
      ['work_order',j.workOrderId,j.workOrderId?'active':null],
      ['invoice',j.invoice?.id,j.invoice?.status||null]
    ];
    for(const [key,source,status] of mappings){
      if(!source||recordFor(j.id,key))continue;
      try{
        const r=await createRecord(key,j,{payload:{source_record:source,reconciled_from_ttt_os:true}});
        if(r){
          const patch={status:status||'completed'};
          if(key==='customer_authorization'){patch.signed_at=j.finalAuthorization.at||now();patch.signed_by_name=j.finalAuthorization.name||null;patch.immutable_at=j.finalAuthorization.at||now();}
          await client().from('document_records').update({...patch,updated_at:now(),updated_by:user()}).eq('organization_id',org()).eq('id',r.id);
          Object.assign(r,patch);
          await event(r.id,'reconciled_existing_record',{source});
        }
      }catch(e){console.warn('TTT document reconcile failed',key,e);}
    }
  }

  function requiredDocs(j){
    return REGISTRY.filter(t=>applicable(t,j) && !t.system);
  }

  function gateSummary(j){
    const req=requiredDocs(j);
    const complete=req.filter(t=>['complete','completed','signed','paid','active','generated'].includes(statusFor(t,j))).length;
    return {req,complete,total:req.length};
  }

  function docCard(t,j){
    const s=j?statusFor(t,j):(t.system?'system':'template');
    const r=j?recordFor(j.id,t.key):null;
    const action=j&&applicable(t,j)&&!r&&!existingSatisfied(j,t.key)?'<button class="btn secondary compact" data-docsys-create="'+esc(t.key)+'">Create record</button>':'';\n    const drive=DRIVE_URLS[t.key]?'<a class="docsys-template-link" href="'+esc(DRIVE_URLS[t.key])+'" target="_blank" rel="noopener">Drive template</a>':'';
    return '<article class="docsys-card" data-wave="'+t.wave+'"><div class="docsys-card-head"><span class="docsys-code">'+esc(t.code)+'</span><span class="docsys-status '+esc(s)+'">'+esc(s.replaceAll('-',' '))+'</span></div><strong>'+esc(t.title)+'</strong><small>'+esc(t.category)+' · '+(t.customer?'Customer-facing':'Internal')+(t.signature?' · Signature':'')+'</small>'+(r?'<div class="docsys-number">'+esc(r.document_number||r.id)+'</div>':'')+drive+action+'</article>';
  }

  function ensureCenter(){
    if(document.getElementById('documents'))return;
    const main=document.querySelector('main.main'); if(!main)return;
    const section=document.createElement('section');section.id='documents';section.className='view';
    section.innerHTML='<div class="section-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h2>Documents & Compliance</h2><p class="muted">Waves 1-9 · operational records, customer forms, finance, risk, B2B and governance.</p></div></div><div id="documentSystemBody"></div>';
    main.appendChild(section);
    const settings=document.querySelector('[data-view="settings"]');
    if(settings&&!document.querySelector('[data-view="documents"]')){
      const b=document.createElement('button');b.className='nav-item';b.dataset.view='documents';b.innerHTML='<span>Documents & Compliance</span>';
      settings.parentElement?.insertBefore(b,settings);
      b.addEventListener('click',()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));section.classList.add('active');const title=document.getElementById('pageTitle');if(title)title.textContent='Documents & Compliance';renderCenter();});
    }
  }

  function renderCenter(){
    ensureCenter();
    const root=document.getElementById('documentSystemBody');if(!root)return;
    const all=REGISTRY.length, customerFacing=REGISTRY.filter(x=>x.customer).length, signature=REGISTRY.filter(x=>x.signature).length, system=REGISTRY.filter(x=>x.system).length;
    let h='<div class="docsys-stats"><div><span>Templates</span><strong>'+all+'</strong></div><div><span>Customer-facing</span><strong>'+customerFacing+'</strong></div><div><span>Signature-controlled</span><strong>'+signature+'</strong></div><div><span>System records</span><strong>'+system+'</strong></div></div>';
    for(let wave=1;wave<=9;wave++){
      const list=REGISTRY.filter(x=>x.wave===wave);
      h+='<article class="panel docsys-wave"><div class="panel-head"><div><p class="eyebrow">WAVE '+wave+'</p><h3>'+esc(waveTitle(wave))+'</h3></div><span class="badge">'+list.length+' controls</span></div><div class="docsys-grid">'+list.map(t=>docCard(t,null)).join('')+'</div></article>';
    }
    root.innerHTML=h;
  }

  function waveTitle(w){return ({
    1:'Core Customer Job Pack',2:'Diagnostics & Pre-Repair Authorization',3:'Customer Protection & Legal',4:'Exceptions, Claims & Risk',
    5:'Purchasing & Inventory',6:'Finance & Accounting',7:'Connected Electronics & Security',8:'B2B, Dealer & Fleet',9:'Governance & Audit'
  })[w]||'';}

  function jobPanel(j){
    const g=gateSummary(j);
    const cards=g.req.map(t=>docCard(t,j)).join('');
    return '<article class="panel detail-section docsys-job" id="docsysJobPanel"><div class="panel-head"><div><p class="eyebrow">DOCUMENT CONTROL</p><h3>Job Document Register</h3><p class="muted">Required and conditional records for this job. Existing TTT-OS documents are reconciled automatically.</p></div><span class="badge">'+g.complete+' / '+g.total+' satisfied</span></div><div class="docsys-progress"><span style="width:'+(g.total?Math.round(g.complete/g.total*100):100)+'%"></span></div><div class="docsys-grid">'+cards+'</div></article>';
  }

  function injectJobDocuments(){
    const root=document.getElementById('jobDetailBody'),j=window.currentJobId?job(window.currentJobId):null;if(!root||!j)return;
    document.getElementById('docsysJobPanel')?.remove();
    const dc=root.querySelector('#documentCenter');
    if(dc)dc.insertAdjacentHTML('beforebegin',jobPanel(j)); else root.insertAdjacentHTML('beforeend',jobPanel(j));
    root.querySelectorAll('[data-docsys-create]').forEach(b=>b.addEventListener('click',async()=>{
      b.disabled=true;
      try{const r=await createRecord(b.dataset.docsysCreate,j);openDocument(r,j);}
      catch(e){console.error(e);toast('Document record could not be created: '+(e.message||e));}
      finally{b.disabled=false;injectJobDocuments();renderCenter();}
    }));
    reconcileExisting(j).then(()=>{if(document.getElementById('docsysJobPanel')){document.getElementById('docsysJobPanel').outerHTML=jobPanel(j);bindJobActions();}});
  }

  function bindJobActions(){
    const root=document.getElementById('jobDetailBody'),j=window.currentJobId?job(window.currentJobId):null;if(!root||!j)return;
    root.querySelectorAll('[data-docsys-create]').forEach(b=>b.addEventListener('click',async()=>{
      b.disabled=true;try{const r=await createRecord(b.dataset.docsysCreate,j);openDocument(r,j);}catch(e){toast(e.message||'Could not create document');}finally{b.disabled=false;injectJobDocuments();}
    }));
  }

  function fieldsFor(t){return FIELD_SETS[t.key]||['Record details','Related references','Notes / evidence','Approval / completion'];}
  function actualPhotos(j){
    return (j?.checkIn?.photos||[]).map((p,i)=>({i:i+1,area:p.area||p.category||'Check-in photo',path:p.storagePath,capturedAt:p.capturedAt,id:p.id}));
  }
  async function signedUrls(photos){
    if(!client())return [];
    const out=[];
    for(const p of photos){
      if(!p.path){out.push({...p,url:''});continue;}
      const {data}=await client().storage.from('job-media').createSignedUrl(p.path,3600);
      out.push({...p,url:data?.signedUrl||''});
    }
    return out;
  }

  async function openDocument(r,j){
    const t=tpl(r.template_key);if(!t)return;
    let photos=[];
    if(t.key==='customer_authorization'&&j)photos=await signedUrls(actualPhotos(j));
    let m=document.getElementById('docsysModal');
    if(!m){m=document.createElement('div');m.id='docsysModal';m.className='doc-modal';document.body.appendChild(m);}
    const c=j?customer(j.customerId)||{}:{},v=j?vehicle(j.vehicleId)||{}:{};
    const photoBlock=photos.length?'<section class="docsys-photo-section"><h4>VEHICLE CONDITION PHOTOS</h4><p>'+photos.length+' check-in photographs are included in this authorization record.</p><div class="docsys-photo-grid">'+photos.map(p=>'<figure>'+(p.url?'<img src="'+esc(p.url)+'" alt="'+esc(p.area)+'">':'<div class="doc-placeholder">Photo unavailable</div>')+'<figcaption><strong>'+esc(p.area)+'</strong><small>'+esc(p.capturedAt||'')+'</small></figcaption></figure>').join('')+'</div></section>':'';
    const fields=fieldsFor(t).map(x=>'<div class="docsys-field"><span>'+esc(x)+'</span><p contenteditable="'+(!r.immutable_at)+'">'+esc(valueForField(x,j,r))+'</p></div>').join('');
    m.innerHTML='<div class="doc-modal-backdrop" data-docsys-close></div><div class="doc-modal-shell"><div class="doc-toolbar"><div><strong>'+esc(t.title)+'</strong><span>'+esc(r.document_number||r.id)+'</span></div><div class="doc-toolbar-actions">'+(!r.immutable_at?'<button class="btn secondary" id="docsysSave">Save</button>':'')+(!r.immutable_at?'<button class="btn primary" id="docsysComplete">'+(t.signature?'Sign & Lock':'Complete & Lock')+'</button>':'<span class="badge">Immutable</span>')+'<button class="btn secondary" id="docsysPrint">Print / Save PDF</button><button class="btn primary" data-docsys-close>Close</button></div></div><div class="doc-canvas"><div class="doc-page docsys-page"><header><p class="eyebrow">THOMPSON TRANSPORTATION TECHNOLOGIES</p><h2>'+esc(t.title)+'</h2><div>'+esc(r.document_number||'Draft')+' · Version '+esc(r.version)+'</div></header><div class="doc-party-grid"><section><h4>CUSTOMER</h4><strong>'+esc(c.name||r.payload?.customer?.name||'')+'</strong><p>'+esc(c.email||r.payload?.customer?.email||'')+'</p></section><section><h4>VEHICLE / RECORD</h4><strong>'+esc(vehicleName(v)||r.payload?.vehicle?.name||'')+'</strong><p>VIN: '+esc(v.vin||r.payload?.vehicle?.vin||'—')+'</p></section></div><section class="docsys-fields">'+fields+'</section>'+photoBlock+(t.signature&&!r.immutable_at?'<section class="docsys-sign"><h4>CUSTOMER / AUTHORIZED SIGNATURE</h4><label>Signer name<input id="docsysSignerName" value="'+esc(c.name||'')+'"></label><label>Signer email<input id="docsysSignerEmail" value="'+esc(c.email||'')+'"></label><canvas id="docsysSignature" width="900" height="220"></canvas><small>Sign with finger, stylus or mouse.</small></section>':'')+(r.content_sha256?'<footer class="docsys-hash">Integrity SHA-256: '+esc(r.content_sha256)+'</footer>':'')+'</div></div></div>';
    m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('doc-modal-open');
    m.querySelectorAll('[data-docsys-close]').forEach(x=>x.onclick=closeDocument);
    document.getElementById('docsysPrint').onclick=()=>window.print();
    if(t.signature&&!r.immutable_at)bindSignature();
    document.getElementById('docsysSave')?.addEventListener('click',async()=>{await saveOpenFields(r);toast('Document draft saved');});
    document.getElementById('docsysComplete')?.addEventListener('click',async()=>{
      const payload=collectOpenFields();
      await updateRecord(r,{payload:{...r.payload,form_fields:payload}},'form_saved');
      let sig={};
      if(t.signature){
        const canvas=document.getElementById('docsysSignature'),name=document.getElementById('docsysSignerName')?.value.trim(),email=document.getElementById('docsysSignerEmail')?.value.trim();
        if(!name||canvas?.dataset.hasInk!=='true'){toast('Signer name and signature are required');return;}
        sig={name,email,signed_at:now(),method:'TTT OS digital signature',signature_data_url:canvas.toDataURL('image/png'),photo_ids:photos.map(p=>p.id),photo_storage_paths:photos.map(p=>p.path)};
      }
      await lockRecord(r,t.signature?'signed':'completed',sig);
      toast((r.document_number||t.title)+' locked');
      closeDocument();await loadRecords();
    });
  }

  function valueForField(label,j,r){
    const l=label.toLowerCase();
    if(l.includes('customer')&&j)return customer(j.customerId)?.name||'';
    if(l.includes('vehicle')&&j)return vehicleName(vehicle(j.vehicleId));
    if(l.includes('job')&&j)return j.id;
    if(l.includes('work order')&&j)return j.workOrderId||'';
    if(l.includes('amount')&&j)return String(j.estimateTotal??'');
    if(l.includes('scope')&&j)return j.requestNotes||'';
    return r.payload?.form_fields?.[label]||'';
  }
  function collectOpenFields(){
    const out={};document.querySelectorAll('#docsysModal .docsys-field').forEach(el=>{const k=el.querySelector('span')?.textContent||'';out[k]=el.querySelector('p')?.textContent?.trim()||'';});return out;
  }
  async function saveOpenFields(r){return updateRecord(r,{payload:{...r.payload,form_fields:collectOpenFields()}},'draft_saved');}
  function bindSignature(){
    const c=document.getElementById('docsysSignature');if(!c)return;const x=c.getContext('2d');x.lineWidth=2.2;x.lineCap='round';x.strokeStyle='#172033';c.dataset.hasInk='false';let down=false;
    const p=e=>{const b=c.getBoundingClientRect();return{x:(e.clientX-b.left)*c.width/b.width,y:(e.clientY-b.top)*c.height/b.height}};
    c.onpointerdown=e=>{down=true;c.setPointerCapture(e.pointerId);const q=p(e);x.beginPath();x.moveTo(q.x,q.y)};
    c.onpointermove=e=>{if(!down)return;const q=p(e);x.lineTo(q.x,q.y);x.stroke();c.dataset.hasInk='true'};
    c.onpointerup=c.onpointercancel=()=>down=false;
  }
  function closeDocument(){const m=document.getElementById('docsysModal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}document.body.classList.remove('doc-modal-open');}

  function patchRender(){
    if(window.__tttDocsysPatched)return;window.__tttDocsysPatched=true;
    const base=window.render;
    if(typeof base==='function')window.render=function(){base();setTimeout(()=>{ensureCenter();if(window.currentJobId)injectJobDocuments();},0)};
    window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(async()=>{await seedTemplates();await loadRecords();},150));
    window.addEventListener('ttt:job-operational-change',()=>setTimeout(()=>{const j=window.currentJobId?job(window.currentJobId):null;if(j)reconcileExisting(j).then(injectJobDocuments);},100));
  }

  async function init(){
    ensureCenter();patchRender();
    let tries=0;while(tries++<120&&!window.TTTCloud?.ready)await new Promise(r=>setTimeout(r,150));
    if(window.TTTCloud?.ready){await seedTemplates();await loadRecords();}
    if(window.currentJobId)injectJobDocuments();
  }

  window.TTTDocumentSystem={
    registry:REGISTRY,fields:FIELD_SETS,createRecord,updateRecord,lockRecord,loadRecords,requiredDocs,statusFor,openDocument,
    get records(){return state.records;}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();