// TTT OS CRM v1.8 — operational sales workflow: Lead → Opportunity → Quote → Customer → Job.
(function(){
  'use strict';

  var WORKBOOK_URL='https://docs.google.com/spreadsheets/d/1N67KaF8q-0FnVaYN41zI5lTVlUoj06pHNAuF1TQrJ8I/edit';
  var STAGES={
    prospecting:{label:'Prospecting',pct:10},
    discovery:{label:'Discovery',pct:20},
    evaluation:{label:'Evaluation',pct:35},
    proposal:{label:'Proposal',pct:50},
    closed_won:{label:'Closed Won',pct:100},
    closed_loss:{label:'Closed Loss',pct:0},
    nurture:{label:'Nurture',pct:5}
  };
  var STAGE_ORDER=['prospecting','discovery','evaluation','proposal','closed_won','closed_loss','nurture'];
  var SERVICES=['Window Tint','Car Audio','GPS Tracking','Kill Switch / Immobilizer','SignalTrace','Custom Fabrication & Additive Manufacturing','Dealer / Fleet Consulting','Other'];
  var CONTACT_TYPES={prospect:'Prospect / Potential Client',customer:'Customer / Client',vendor:'Vendor',supplier:'Supplier',distributor:'Distributor',partner:'Partner',referral:'Referral Source',other:'Other'};
  var filters={leadSearch:'',leadStatus:'all',leadService:'all',leadSource:'all',leadOwner:'all',oppSearch:'',oppStage:'all',oppService:'all',oppOwner:'all',contactSearch:'',contactType:'all',companySearch:'',companyType:'all'};
  var data={loaded:false,loading:false,companies:[],contacts:[],leads:[],opportunities:[],activities:[],quotes:[],quote_lines:[],invoices:[],jobs:[],documents:[],customers:[],vehicles:[],personnel:[]};
  var realtimeChannel=null;
  var selected={type:null,id:null};

  function html(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function attr(v){return html(v).replace(/`/g,'&#96;');}
  function cash(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));}
  function pct(v){return (Number(v||0)).toFixed(Number(v||0)%1?1:0)+'%';}
  function when(v){if(!v)return '—';var d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}
  function dateOnly(v){if(!v)return '—';var d=new Date(String(v).length===10?v+'T12:00:00':v);return isNaN(d.getTime())?'—':d.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});}
  function contact(id){return data.contacts.find(function(x){return x.id===id;})||null;}
  function contactName(id){var c=contact(id);return c?(c.display_name||[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ')):'—';}
  function activeContacts(){return data.contacts.filter(function(x){return !x.archived_at;});}
  function company(id){return data.companies.find(function(x){return x.id===id;})||null;}
  function activeCompanies(){return data.companies.filter(function(x){return !x.archived_at;});}
  function companyName(id){var c=company(id);return c?c.name:'—';}
  function personName(id){var p=data.personnel.find(function(x){return x.id===id;});return p?p.display_name:'Unassigned';}
  function ownerOptions(selected,allowBlank){var first=allowBlank?'<option value="">Unassigned</option>':'';return first+data.personnel.filter(function(p){return String(p.status||'').toLowerCase()==='active';}).map(function(p){return '<option value="'+attr(p.id)+'" '+(p.id===selected?'selected':'')+'>'+html(p.display_name)+'</option>';}).join('');}
  function latestQuote(opportunityId){return data.quotes.filter(function(q){return q.opportunity_id===opportunityId&&!q.archived_at;}).sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);})[0]||null;}
  function idToken(prefix){return prefix+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();}
  function todayISO(){return new Date().toISOString().slice(0,10);}
  function jobId(){return 'J-'+new Date().toISOString().slice(2,10).replaceAll('-','')+'-'+Math.random().toString(36).slice(2,6).toUpperCase();}
  function stageInfo(stage){return STAGES[String(stage||'').toLowerCase()]||{label:String(stage||'Unspecified'),pct:0};}
  function openOpp(o){return !['closed_won','closed_loss'].includes(String(o.stage||'').toLowerCase());}
  function isOpenLead(l){return !['converted','lost'].includes(String(l.status||'').toLowerCase());}
  function sum(rows,key){return rows.reduce(function(s,x){return s+Number(x[key]||0);},0);}
  function toastSafe(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}

  function injectStyles(){
    if(document.getElementById('tttCrmStyles'))return;
    var s=document.createElement('style');s.id='tttCrmStyles';
    s.textContent=`
      .crm-toolbar,.crm-tabs,.crm-inline-actions,.crm-filters{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.crm-filters{margin:0 0 12px}.crm-filters input,.crm-filters select{border:1px solid #d6deea;border-radius:9px;padding:9px 10px;font:inherit;background:#fff;min-width:150px}.crm-filters input{min-width:230px}.btn.danger{background:#fff;color:#b42318;border-color:#f1b5b0}.btn.danger:hover{background:#fff5f4}.crm-tabs{margin:16px 0}.crm-tab{border:1px solid #d7e0eb;background:#fff;color:#4b5d73;border-radius:999px;padding:8px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.crm-tab.active{background:#0b1220;color:#fff;border-color:#0b1220}.crm-pane{display:none}.crm-pane.active{display:block}
      .crm-form-wrap{display:none;margin-bottom:16px}.crm-form-wrap.open{display:block}.crm-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.crm-form-grid label,.crm-detail-grid label{font-size:12px;font-weight:700;color:#334155}.crm-form-grid input,.crm-form-grid select,.crm-form-grid textarea,.crm-detail-grid input,.crm-detail-grid select,.crm-detail-grid textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #d6deea;border-radius:9px;padding:10px;font:inherit;background:#fff}.crm-form-grid textarea,.crm-detail-grid textarea{min-height:80px;resize:vertical}.crm-span-2{grid-column:span 2}.crm-span-4{grid-column:span 4}.crm-empty{padding:24px;text-align:center;color:#64748b}.crm-row{cursor:pointer}.crm-row:hover{background:#f8fafc}.crm-row button,.crm-row select{cursor:pointer}
      .crm-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0}.crm-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px}.crm-kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.crm-kpi strong{display:block;font-size:21px;margin-top:4px}.crm-kpi small{color:#64748b}.crm-dashboard-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:14px}.crm-chart{display:grid;gap:10px}.crm-chart-row{display:grid;grid-template-columns:110px 1fr 88px;gap:10px;align-items:center;font-size:12px}.crm-chart-track{height:12px;background:#edf2f7;border-radius:999px;overflow:hidden}.crm-chart-bar{height:100%;background:#1d4ed8;border-radius:999px;min-width:2px}.crm-chart-label{font-weight:700;color:#334155}.crm-chart-value{text-align:right;color:#64748b}.crm-stage-pills{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.crm-stage-pill{border:1px solid #dfe6ef;background:#fff;border-radius:10px;padding:9px 11px;min-width:112px}.crm-stage-pill span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.crm-stage-pill strong{display:block;margin-top:2px}.crm-stage-pill small{color:#64748b}
      .crm-detail-backdrop{position:fixed;inset:0;background:rgba(5,12,24,.38);z-index:900;display:none}.crm-detail-backdrop.open{display:block}.crm-detail{position:fixed;top:0;right:0;bottom:0;width:min(760px,96vw);background:#f7f9fc;box-shadow:-18px 0 50px rgba(15,23,42,.2);z-index:901;transform:translateX(105%);transition:transform .18s ease;overflow:auto}.crm-detail.open{transform:translateX(0)}.crm-detail-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:18px 20px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.crm-detail-body{padding:16px 20px 28px;display:grid;gap:14px}.crm-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.crm-detail-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}.crm-detail-card h4{margin:0 0 10px}.crm-detail-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.crm-detail-meta div{padding:9px;background:#f8fafc;border-radius:9px}.crm-detail-meta small{display:block;color:#64748b}.crm-detail-meta strong{display:block;margin-top:2px}.crm-link-list{display:grid;gap:7px}.crm-link-item{border:1px solid #e5ebf3;border-radius:9px;padding:9px 10px;display:flex;justify-content:space-between;gap:10px;align-items:center}.crm-link-item small{display:block;color:#64748b;margin-top:2px}.crm-activity-form{display:grid;grid-template-columns:140px 1fr;gap:9px}.crm-activity-form textarea{grid-column:1/-1}.crm-activity-form button{justify-self:end;grid-column:1/-1}.crm-source-line{font-size:12px;color:#64748b}.crm-source-line b{color:#334155}.crm-mini-empty{color:#64748b;font-size:12px;padding:8px 0}.crm-primary-link{color:#1457a8;text-decoration:none;font-weight:700}.crm-primary-link:hover{text-decoration:underline}
      .crm-modal-backdrop{position:fixed;inset:0;z-index:940;background:rgba(5,12,24,.48);display:none;align-items:flex-start;justify-content:center;padding:8vh 16px 24px}.crm-modal-backdrop.open{display:flex}.crm-modal{width:min(760px,100%);max-height:84vh;overflow:auto;background:#f7f9fc;border-radius:15px;box-shadow:0 24px 70px rgba(0,0,0,.28)}.crm-modal-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.crm-modal-body{padding:16px}.crm-owner{font-size:11px;color:#64748b}.crm-quote-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.crm-quote-actions button{padding:6px 8px;font-size:10px}.crm-flow-state{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.crm-flow-state span{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:750;color:#526277}.crm-row td{vertical-align:top}
      @media(max-width:1180px){.crm-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.crm-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.crm-span-4{grid-column:span 2}.crm-dashboard-grid{grid-template-columns:1fr}.crm-chart-row{grid-template-columns:95px 1fr 78px}}@media(max-width:620px){.crm-kpis,.crm-form-grid,.crm-detail-grid{grid-template-columns:1fr}.crm-span-2,.crm-span-4{grid-column:span 1}.crm-chart-row{grid-template-columns:82px 1fr 68px}.crm-detail{width:100vw}.crm-detail-meta{grid-template-columns:1fr}.crm-activity-form{grid-template-columns:1fr}.crm-activity-form textarea,.crm-activity-form button{grid-column:1}.crm-modal-backdrop{padding:4vh 8px 12px}}
    `;
    document.head.appendChild(s);
  }

  function inject(){
    injectStyles();
    var main=document.querySelector('main.main');    var main=document.querySelector('main.main');
    if(main&&!document.getElementById('crm')){
      var section=document.createElement('section');section.id='crm';section.className='view';
      section.innerHTML=
        '<div class="section-head"><div><p class="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</p><h2>CRM</h2><p class="muted">Leads, relationships, opportunities and customer correspondence. Supabase is the system of record; Google Workspace is the communication and document layer.</p></div>'+
        '<div class="crm-toolbar"><button class="btn secondary" id="crmRefreshBtn">Refresh</button><a class="btn secondary" href="'+WORKBOOK_URL+'" target="_blank" rel="noopener">Open Workspace mirror</a><button class="btn secondary" id="crmNewCompanyBtn">+ Company</button><button class="btn secondary" id="crmNewContactBtn">+ Contact</button><button class="btn primary" id="crmNewLeadBtn">+ New lead</button></div></div>'+
        '<div class="workflow-note"><strong>Sales workflow:</strong> Lead → Qualified → Opportunity → Proposal / Quote → Closed Won → Job / Work Order. ERP remains separate and receives the downstream operational records.</div>'+
        '<div class="crm-form-wrap panel" id="crmLeadFormWrap"><div class="panel-head"><div><h3>Create lead</h3><p class="muted">Capture the person, organization, source attribution and sales context at the moment the lead enters TTT.</p></div><button class="link-btn" type="button" id="crmCancelLead">Cancel</button></div>'+leadFormHTML()+'</div>'+
        '<div class="crm-tabs"><button class="crm-tab active" data-crm-tab="dashboard">Dashboard</button><button class="crm-tab" data-crm-tab="leads">Leads</button><button class="crm-tab" data-crm-tab="opportunities">Opportunities</button><button class="crm-tab" data-crm-tab="contacts">Contacts</button><button class="crm-tab" data-crm-tab="companies">Companies</button><button class="crm-tab" data-crm-tab="activity">Activity</button></div>'+
        '<div id="crmLoading" class="panel crm-empty">Loading CRM data…</div>'+
        '<div id="crmBody" style="display:none">'+
          '<div class="crm-pane active" data-crm-pane="dashboard"><div id="crmDashboard"></div></div>'+
          '<div class="crm-pane" data-crm-pane="leads"><div id="crmLeads"></div></div>'+
          '<div class="crm-pane" data-crm-pane="opportunities"><div id="crmOpportunities"></div></div>'+
          '<div class="crm-pane" data-crm-pane="contacts"><div id="crmContacts"></div></div>'+
          '<div class="crm-pane" data-crm-pane="companies"><div id="crmCompanies"></div></div>'+
          '<div class="crm-pane" data-crm-pane="activity"><div id="crmActivity"></div></div>'+
        '</div>';
      var settings=document.getElementById('settings');main.insertBefore(section,settings||null);
    }
    if(!document.getElementById('crmDetailDrawer')){
      document.body.insertAdjacentHTML('beforeend','<div class="crm-detail-backdrop" id="crmDetailBackdrop"></div><aside class="crm-detail" id="crmDetailDrawer" aria-label="CRM record details"><div id="crmDetailContent"></div></aside>');
    }
    if(!document.getElementById('crmCreateModal')){
      document.body.insertAdjacentHTML('beforeend','<div class="crm-modal-backdrop" id="crmCreateModal"><div class="crm-modal" role="dialog" aria-modal="true"><div id="crmCreateModalContent"></div></div></div>');
    }
    bind();
  }

  function leadFormHTML(){
    return '<form id="crmLeadForm"><div class="crm-form-grid">'+
      '<label>Organization<input name="company" placeholder="Optional company / dealership / fleet"></label>'+
      '<label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label><label>Email<input name="email" type="email"></label>'+
      '<label>Phone<input name="mobile"></label><label>Owner<select name="owner_person_id" id="crmLeadOwnerCreate"><option value="">Current user</option></select></label><label>Lead source<select name="source"><option>Website</option><option>Referral</option><option>Phone</option><option>Walk-in</option><option>Google</option><option>Social</option><option>Marketing Campaign</option><option>Vendor / Partner</option><option>Event</option><option>Other</option></select></label>'+
      '<label>Source detail<input name="source_detail" placeholder="e.g. Google Maps, Facebook, Cars & Coffee"></label><label>Campaign<input name="campaign" placeholder="Campaign / promotion name"></label>'+
      '<label>Referred by<select name="referral_contact_id" id="crmReferralContact"><option value="">No linked referrer</option></select></label><label>Referrer / partner name<input name="referral_name" placeholder="Use if not already a contact"></label>'+
      '<label>Service<input name="service_interest" list="crmServiceOptions" placeholder="Choose or enter a service"><datalist id="crmServiceOptions">'+SERVICES.map(function(x){return '<option value="'+attr(x)+'"></option>';}).join('')+'</datalist></label><label>Estimated value<input name="estimated_value" type="number" min="0" step="0.01"></label>'+
      '<label>Priority<select name="priority"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></label><label>Next action<input name="next_action" placeholder="Call, site visit, send options…"></label>'+
      '<label>Next action date<input name="next_action_at" type="datetime-local"></label><label>UTM source<input name="utm_source" placeholder="google, facebook, newsletter…"></label><label>UTM medium<input name="utm_medium" placeholder="cpc, organic, email…"></label><label>UTM campaign<input name="utm_campaign"></label>'+
      '<label>UTM content<input name="utm_content"></label><label>UTM term<input name="utm_term"></label><label class="crm-span-2">Notes<textarea name="description"></textarea></label>'+
    '</div><div class="top-gap"><button class="btn primary" type="submit">Create lead</button></div></form>';
  }

  function bind(){
    document.getElementById('crmRefreshBtn')?.addEventListener('click',function(){load(true);});
    document.getElementById('crmNewLeadBtn')?.addEventListener('click',newLead);
    document.getElementById('crmNewContactBtn')?.addEventListener('click',newContact);
    document.getElementById('crmNewCompanyBtn')?.addEventListener('click',newCompany);
    document.getElementById('crmCancelLead')?.addEventListener('click',function(){document.getElementById('crmLeadFormWrap')?.classList.remove('open');});
    document.querySelectorAll('[data-crm-tab]').forEach(function(btn){btn.addEventListener('click',function(){activateTab(btn.dataset.crmTab);});});
    document.getElementById('crmLeadForm')?.addEventListener('submit',createLead);
    document.getElementById('crmDetailBackdrop')?.addEventListener('click',closeDetail);
    document.getElementById('crmCreateModal')?.addEventListener('click',function(e){if(e.target.id==='crmCreateModal')closeCreateModal();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDetail();});
  }

  function activateTab(name){
    if(name==='organizations')name='companies';
    document.querySelectorAll('[data-crm-tab]').forEach(function(x){x.classList.toggle('active',x.dataset.crmTab===name);});
    document.querySelectorAll('[data-crm-pane]').forEach(function(x){x.classList.toggle('active',x.dataset.crmPane===name);});
    window.dispatchEvent(new CustomEvent('ttt:crm-tab-changed',{detail:{tab:name}}));
  }

  async function load(force){
    var cloud=window.TTTCloud;
    if(!cloud||!cloud.ready||!cloud.client||!cloud.organizationId){var wait=document.getElementById('crmLoading');if(wait)wait.textContent='Sign in to TTT OS and wait for the shared cloud database to finish loading.';return;}
    if(data.loading)return;if(data.loaded&&!force){render();return;}data.loading=true;
    var loading=document.getElementById('crmLoading');if(loading){loading.style.display='block';loading.textContent='Loading CRM data…';}var body=document.getElementById('crmBody');if(body)body.style.display='none';
    var org=cloud.organizationId;
    var specs=[
      ['companies','id,name,primary_type,status,website,main_phone,general_email,address1,address2,city,state,postal_code,country,territory,owner_person_id,source,notes,updated_at,archived_at'],
      ['contacts','id,company_id,display_name,first_name,middle_name,last_name,title,role_type,contact_type,territory,mobile,office_phone,email,linkedin,preferred_contact_method,relationship_strength,source,last_interaction_at,next_action,next_action_at,notes,updated_at,archived_at'],
      ['leads','id,company_id,contact_id,customer_id,source,source_detail,campaign,status,service_interest,description,estimated_value,priority,owner_person_id,first_contact_at,last_contact_at,next_action,next_action_at,converted_at,lost_reason,referral_contact_id,referral_company_id,referral_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at,updated_at'],
      ['opportunities','id,lead_id,company_id,contact_id,customer_id,title,opportunity_type,category,stage,priority,estimated_value,probability_pct,expected_close_date,next_step,next_step_date,owner_person_id,source,source_evidence_url,related_service,won_job_id,lost_reason,notes,metadata,created_at,updated_at'],
      ['activities','id,activity_type,direction,status,subject,summary,company_id,contact_id,lead_id,opportunity_id,customer_id,job_id,owner_person_id,occurred_at,due_at,gmail_message_id,gmail_thread_id,calendar_event_id,source_url,metadata,updated_at'],
      ['quotes','id,opportunity_id,customer_id,company_id,contact_id,job_id,status,quote_date,expires_at,total,deposit_required,google_doc_url,pdf_drive_file_id,sent_at,approved_at,declined_at,updated_at'],
      ['invoices','id,quote_id,customer_id,company_id,contact_id,job_id,status,invoice_date,due_date,total,amount_paid,balance_due,paid_at,updated_at'],
      ['jobs','id,work_order_id,customer_id,vehicle_id,status,appointment_local,estimate_total,opportunity_id,primary_quote_id,primary_invoice_id,updated_at'],
      ['documents','id,company_id,contact_id,customer_id,job_id,quote_id,invoice_id,lead_id,opportunity_id,document_type,title,document_date,drive_url,storage_path,mime_type,confidentiality,notes,updated_at'],
      ['quote_lines','id,quote_id,line_type,description,quantity,unit_price,labor_hours,taxable,line_total,sort_order,updated_at'],
      ['customers','id,display_name,first_name,middle_name,last_name,phone,email,company_id,primary_contact_id,updated_at'],
      ['vehicles','id,customer_id,vin,year,make,model,trim,color,vehicle_type,plate,updated_at'],
      ['personnel','id,display_name,status,updated_at']
    ];
    try{
      var results=await Promise.all(specs.map(function(spec){
        var q=cloud.client.from(spec[0]).select(spec[1]).eq('organization_id',org);
        return (spec[0]==='contacts'||spec[0]==='companies')?q:q.is('archived_at',null);
      }));
      for(var i=0;i<results.length;i++){if(results[i].error)throw new Error(specs[i][0]+': '+results[i].error.message);data[specs[i][0]]=results[i].data||[];}
      data.loaded=true;render();if(loading)loading.style.display='none';if(body)body.style.display='block';
    }catch(err){console.error('TTT CRM load failed',err);if(loading){loading.style.display='block';loading.textContent='CRM could not load: '+String(err.message||err);}if(body)body.style.display='none';}
    finally{data.loading=false;}
  }

  function render(){
    renderDashboard();renderLeads();renderOpportunities();renderContacts();renderOrganizations();renderActivity();refreshLeadFormOptions();bindRows();bindFilters();subscribeRealtime();
    if(selected.type&&selected.id)openDetail(selected.type,selected.id,true);
  }

  function renderDashboard(){
    var openLeads=data.leads.filter(isOpenLead),opps=data.opportunities.filter(openOpp),pipeline=sum(opps,'estimated_value');
    var weighted=opps.reduce(function(s,o){return s+Number(o.estimated_value||0)*(Number(o.probability_pct==null?stageInfo(o.stage).pct:o.probability_pct)/100);},0);
    var converted=data.leads.filter(function(l){return String(l.status||'').toLowerCase()==='converted';}).length;
    var qualifiedBase=data.leads.filter(function(l){return ['qualified','converted'].includes(String(l.status||'').toLowerCase());}).length;
    var conversion=data.leads.length?(converted/data.leads.length*100):0;
    var won=data.opportunities.filter(function(o){return String(o.stage||'').toLowerCase()==='closed_won';}).length;
    var closed=data.opportunities.filter(function(o){return ['closed_won','closed_loss'].includes(String(o.stage||'').toLowerCase());}).length;
    var winRate=closed?(won/closed*100):0;
    var kpis=[['Open leads',openLeads.length,'Needs qualification'],['Open opportunities',opps.length,'Active pipeline'],['Pipeline value',cash(pipeline),'Unweighted'],['Weighted pipeline',cash(weighted),'Stage-adjusted'],['Lead conversion',pct(conversion),converted+' converted'],['Win rate',pct(winRate),won+' of '+closed+' closed']];
    var stageValues=STAGE_ORDER.map(function(s){var rows=data.opportunities.filter(function(o){return String(o.stage||'').toLowerCase()===s;});return {label:STAGES[s].label,count:rows.length,value:sum(rows,'estimated_value')};});
    var maxStage=Math.max.apply(null,stageValues.map(function(x){return x.value;}));if(!isFinite(maxStage)||maxStage<=0)maxStage=1;
    var stageChart=stageValues.map(function(x){return '<div class="crm-chart-row"><span class="crm-chart-label">'+html(x.label)+'</span><div class="crm-chart-track"><div class="crm-chart-bar" style="width:'+Math.max(2,Math.round(x.value/maxStage*100))+'%"></div></div><span class="crm-chart-value">'+x.count+' · '+cash(x.value)+'</span></div>';}).join('');
    var sources={};data.leads.forEach(function(l){var s=(l.source||'Unspecified').trim()||'Unspecified';sources[s]=(sources[s]||0)+1;});
    var sourceRows=Object.keys(sources).map(function(k){return {label:k,count:sources[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,8);var maxSource=Math.max.apply(null,sourceRows.map(function(x){return x.count;}));if(!isFinite(maxSource)||maxSource<=0)maxSource=1;
    var sourceChart=sourceRows.map(function(x){return '<div class="crm-chart-row"><span class="crm-chart-label">'+html(x.label)+'</span><div class="crm-chart-track"><div class="crm-chart-bar" style="width:'+Math.max(2,Math.round(x.count/maxSource*100))+'%"></div></div><span class="crm-chart-value">'+x.count+'</span></div>';}).join('')||'<div class="crm-mini-empty">No lead-source data yet.</div>';
    var recent=data.activities.slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,7).map(activityMini).join('')||'<div class="crm-mini-empty">No activity logged yet.</div>';
    document.getElementById('crmDashboard').innerHTML='<div class="crm-kpis">'+kpis.map(function(x){return '<div class="crm-kpi"><span>'+html(x[0])+'</span><strong>'+html(x[1])+'</strong><small>'+html(x[2])+'</small></div>';}).join('')+'</div><div class="crm-dashboard-grid"><article class="panel"><div class="panel-head"><div><h3>Opportunity pipeline</h3><p class="muted">Value and volume by your fixed sales stages.</p></div></div><div class="crm-chart">'+stageChart+'</div></article><article class="panel"><div class="panel-head"><div><h3>Lead acquisition</h3><p class="muted">Where leads are entering TTT.</p></div></div><div class="crm-chart">'+sourceChart+'</div></article></div><div class="grid two top-gap"><article class="panel"><div class="panel-head"><h3>Qualification health</h3><span class="badge">'+qualifiedBase+' qualified / converted</span></div><p class="muted">A lead must be qualified before it can be converted into an opportunity. Attribution stays attached to the lead for later campaign and referral analysis.</p></article><article class="panel"><div class="panel-head"><h3>Recent activity</h3><span class="badge">'+data.activities.length+'</span></div><div class="crm-link-list">'+recent+'</div></article></div>';
  }

  function renderLeads(){
    var services=Array.from(new Set(SERVICES.concat(data.leads.map(function(x){return x.service_interest;}).filter(Boolean)))).sort();
    var sources=Array.from(new Set(data.leads.map(function(x){return x.source;}).filter(Boolean))).sort();
    var list=data.leads.filter(function(l){
      var q=filters.leadSearch.toLowerCase(),hay=[contactName(l.contact_id),companyName(l.company_id),l.id,l.source,l.campaign,l.service_interest,l.next_action].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(filters.leadStatus==='all'||String(l.status||'new').toLowerCase()===filters.leadStatus)&&(filters.leadService==='all'||String(l.service_interest||'')===filters.leadService)&&(filters.leadSource==='all'||String(l.source||'')===filters.leadSource)&&(filters.leadOwner==='all'||String(l.owner_person_id||'')===filters.leadOwner);
    });
    var rows=list.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(l){var ref=l.referral_contact_id?contactName(l.referral_contact_id):(l.referral_name||'—');return '<tr class="crm-row" data-crm-record="lead" data-crm-id="'+attr(l.id)+'"><td><strong>'+html(contactName(l.contact_id))+'</strong><br><small>'+html(l.id)+'</small></td><td>'+html(companyName(l.company_id))+'</td><td><span class="badge">'+html(l.status||'new')+'</span></td><td>'+html(l.service_interest||'—')+'</td><td>'+html(l.source||'—')+(l.campaign?'<br><small>'+html(l.campaign)+'</small>':'')+'</td><td>'+html(ref)+'</td><td>'+cash(l.estimated_value)+'</td><td><span class="crm-owner">'+html(personName(l.owner_person_id))+'</span></td><td>'+html(l.next_action||'—')+'</td></tr>';}).join('');
    document.getElementById('crmLeads').innerHTML='<div class="crm-filters"><input id="crmLeadSearch" placeholder="Search leads…" value="'+attr(filters.leadSearch)+'"><select id="crmLeadStatusFilter"><option value="all">All statuses</option>'+['new','contacted','qualified','nurture','converted','lost'].map(function(x){return '<option value="'+x+'" '+(filters.leadStatus===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select><select id="crmLeadServiceFilter"><option value="all">All services</option>'+services.map(function(x){return '<option '+(filters.leadService===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select><select id="crmLeadSourceFilter"><option value="all">All sources</option>'+sources.map(function(x){return '<option '+(filters.leadSource===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select><select id="crmLeadOwnerFilter"><option value="all">All owners</option>'+ownerOptions(filters.leadOwner,false)+'</select></div><div class="panel"><div class="panel-head"><div><h3>Lead register</h3><p class="muted">Click a lead to review or edit details, attribution, qualification and correspondence.</p></div><span class="badge">'+list.length+' of '+data.leads.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Organization</th><th>Status</th><th>Service</th><th>Source / Campaign</th><th>Referral</th><th>Value</th><th>Owner</th><th>Next action</th></tr></thead><tbody>'+(rows||'<tr><td colspan="9" class="crm-empty">No leads match these filters.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderOpportunities(){
    var services=Array.from(new Set(SERVICES.concat(data.opportunities.map(function(x){return x.related_service||x.category;}).filter(Boolean)))).sort();
    var list=data.opportunities.filter(function(o){
      var q=filters.oppSearch.toLowerCase(),hay=[o.title,o.id,companyName(o.company_id),contactName(o.contact_id),o.related_service,o.category,o.next_step].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(filters.oppStage==='all'||String(o.stage||'').toLowerCase()===filters.oppStage)&&(filters.oppService==='all'||String(o.related_service||o.category||'')===filters.oppService)&&(filters.oppOwner==='all'||String(o.owner_person_id||'')===filters.oppOwner);
    });
    var pills=STAGE_ORDER.map(function(stage){var rows=data.opportunities.filter(function(o){return String(o.stage||'').toLowerCase()===stage;});return '<div class="crm-stage-pill"><span>'+html(STAGES[stage].label)+' · '+STAGES[stage].pct+'%</span><strong>'+rows.length+'</strong><small>'+cash(sum(rows,'estimated_value'))+'</small></div>';}).join('');
    var rows=list.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(o){var st=stageInfo(o.stage),q=latestQuote(o.id);return '<tr class="crm-row" data-crm-record="opportunity" data-crm-id="'+attr(o.id)+'"><td><strong>'+html(o.title)+'</strong><br><small>'+html(o.id)+'</small></td><td>'+html(companyName(o.company_id))+'</td><td>'+html(contactName(o.contact_id))+'</td><td>'+html(o.related_service||o.category||'—')+'</td><td><span class="badge">'+html(st.label)+'</span></td><td>'+cash(o.estimated_value)+'</td><td>'+pct(o.probability_pct==null?st.pct:o.probability_pct)+'</td><td>'+cash(Number(o.estimated_value||0)*Number(o.probability_pct==null?st.pct:o.probability_pct)/100)+'</td><td>'+html(personName(o.owner_person_id))+'</td><td>'+(q?'<span class="badge">'+html(q.status)+'</span>':'—')+'</td><td>'+html(o.next_step||'—')+'</td></tr>';}).join('');
    document.getElementById('crmOpportunities').innerHTML='<div class="crm-stage-pills">'+pills+'</div><div class="crm-filters"><input id="crmOppSearch" placeholder="Search opportunities…" value="'+attr(filters.oppSearch)+'"><select id="crmOppStageFilter"><option value="all">All stages</option>'+STAGE_ORDER.map(function(x){return '<option value="'+x+'" '+(filters.oppStage===x?'selected':'')+'>'+html(STAGES[x].label)+'</option>';}).join('')+'</select><select id="crmOppServiceFilter"><option value="all">All services</option>'+services.map(function(x){return '<option '+(filters.oppService===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select><select id="crmOppOwnerFilter"><option value="all">All owners</option>'+ownerOptions(filters.oppOwner,false)+'</select></div><div class="panel"><div class="panel-head"><div><h3>Opportunities</h3><p class="muted">Click an opportunity to edit it and review activities, quotes, invoices and linked work.</p></div><span class="badge">'+list.length+' of '+data.opportunities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Organization</th><th>Contact</th><th>Service</th><th>Stage</th><th>Value</th><th>Probability</th><th>Weighted</th><th>Owner</th><th>Quote</th><th>Next step</th></tr></thead><tbody>'+(rows||'<tr><td colspan="11" class="crm-empty">No opportunities match these filters.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderContacts(){
    var active=activeContacts();
    var list=active.filter(function(c){var q=filters.contactSearch.toLowerCase(),hay=[contactName(c.id),companyName(c.company_id),c.email,c.mobile,c.office_phone,c.title,c.role_type,c.contact_type].join(' ').toLowerCase();return (!q||hay.includes(q))&&(filters.contactType==='all'||String(c.contact_type||'other')===filters.contactType);});
    var rows=list.slice().sort(function(a,b){return contactName(a.id).localeCompare(contactName(b.id));}).map(function(c){var leadCount=data.leads.filter(function(l){return l.contact_id===c.id;}).length,oppCount=data.opportunities.filter(function(o){return o.contact_id===c.id;}).length;return '<tr class="crm-row" data-crm-record="contact" data-crm-id="'+attr(c.id)+'"><td><strong>'+html(contactName(c.id))+'</strong><br><small>'+html(c.title||c.role_type||'')+'</small></td><td>'+html(companyName(c.company_id))+'</td><td><span class="badge">'+html(CONTACT_TYPES[c.contact_type]||c.contact_type||'Other')+'</span></td><td>'+html(c.email||'—')+'</td><td>'+html(c.mobile||c.office_phone||'—')+'</td><td>'+leadCount+'</td><td>'+oppCount+'</td><td>'+html(c.next_action||'—')+'</td></tr>';}).join('');
    document.getElementById('crmContacts').innerHTML='<div class="crm-filters"><input id="crmContactSearch" placeholder="Search contacts…" value="'+attr(filters.contactSearch)+'"><select id="crmContactTypeFilter"><option value="all">All contact types</option>'+Object.keys(CONTACT_TYPES).map(function(k){return '<option value="'+k+'" '+(filters.contactType===k?'selected':'')+'>'+html(CONTACT_TYPES[k])+'</option>';}).join('')+'</select><button class="btn primary compact" id="crmContactCreateInline">+ Contact</button></div><div class="panel"><div class="panel-head"><div><h3>Contacts</h3><p class="muted">Click a contact to edit their details, classification or next action.</p></div><span class="badge">'+list.length+' of '+active.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Organization</th><th>Contact type</th><th>Email</th><th>Phone</th><th>Leads</th><th>Opportunities</th><th>Next action</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No contacts match these filters.</td></tr>')+'</tbody></table></div></div>';
    document.getElementById('crmContactCreateInline')?.addEventListener('click',newContact);
  }

  function renderOrganizations(){
    var companies=activeCompanies();
    var list=companies.filter(function(c){
      var q=filters.companySearch.toLowerCase(),hay=[c.name,c.primary_type,c.status,c.main_phone,c.general_email,c.website,c.city,c.state,c.territory].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(filters.companyType==='all'||String(c.primary_type||'prospect')===filters.companyType);
    });
    var types=Array.from(new Set(companies.map(function(c){return c.primary_type;}).filter(Boolean))).sort();
    var rows=list.slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).map(function(c){var contacts=data.contacts.filter(function(x){return !x.archived_at&&x.company_id===c.id;});var opps=data.opportunities.filter(function(x){return x.company_id===c.id;});return '<tr class="crm-row" data-crm-record="organization" data-crm-id="'+attr(c.id)+'"><td><strong>'+html(c.name)+'</strong><br><small>'+html(c.id)+'</small></td><td>'+html(c.primary_type||'—')+'</td><td>'+html(c.status||'—')+'</td><td>'+contacts.length+'</td><td>'+opps.length+'</td><td>'+cash(sum(opps.filter(openOpp),'estimated_value'))+'</td><td>'+html(c.main_phone||c.general_email||'—')+'</td><td>'+html([c.city,c.state].filter(Boolean).join(', ')||'—')+'</td></tr>';}).join('');
    document.getElementById('crmCompanies').innerHTML='<div class="crm-filters"><input id="crmCompanySearch" placeholder="Search companies…" value="'+attr(filters.companySearch)+'"><select id="crmCompanyTypeFilter"><option value="all">All company types</option>'+types.map(function(x){return '<option value="'+attr(x)+'" '+(filters.companyType===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select><button class="btn primary compact" id="crmCompanyCreateInline">+ Company</button></div><div class="panel"><div class="panel-head"><div><h3>Companies</h3><p class="muted">Dealerships, fleets, prospects, suppliers, distributors, partners and customer organizations.</p></div><span class="badge">'+list.length+' of '+companies.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Company</th><th>Type</th><th>Status</th><th>Contacts</th><th>Opportunities</th><th>Open pipeline</th><th>Primary contact</th><th>Location</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No companies match these filters.</td></tr>')+'</tbody></table></div></div>';
    document.getElementById('crmCompanyCreateInline')?.addEventListener('click',newCompany);
  }

  function renderActivity(){
    var rows=data.activities.slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,100).map(function(a){var regarding=a.opportunity_id||a.lead_id||a.job_id||'—';return '<tr><td>'+when(a.occurred_at)+'</td><td><span class="badge">'+html(a.activity_type)+'</span></td><td>'+html(a.direction||'—')+'</td><td><strong>'+html(a.subject||'—')+'</strong><br><small>'+html(a.summary||'')+'</small></td><td>'+html(contactName(a.contact_id))+'</td><td>'+html(regarding)+'</td></tr>';}).join('');
    document.getElementById('crmActivity').innerHTML='<div class="panel"><div class="panel-head"><div><h3>CRM activity</h3><p class="muted">Calls, emails, meetings, notes and correspondence linked to CRM records.</p></div><span class="badge">'+data.activities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Direction</th><th>Activity</th><th>Contact</th><th>Regarding</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="crm-empty">No activity logged yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function bindRows(){
    document.querySelectorAll('[data-crm-record]').forEach(function(row){row.onclick=function(e){if(e.target.closest('button,select,input,a,textarea'))return;openDetail(row.dataset.crmRecord,row.dataset.crmId);};});
  }

  function bindFilters(){
    var pairs=[
      ['crmLeadSearch','input','leadSearch',renderLeads],['crmLeadStatusFilter','change','leadStatus',renderLeads],['crmLeadServiceFilter','change','leadService',renderLeads],['crmLeadSourceFilter','change','leadSource',renderLeads],
      ['crmOppSearch','input','oppSearch',renderOpportunities],['crmOppStageFilter','change','oppStage',renderOpportunities],['crmOppServiceFilter','change','oppService',renderOpportunities],
      ['crmContactSearch','input','contactSearch',renderContacts],['crmContactTypeFilter','change','contactType',renderContacts],
      ['crmCompanySearch','input','companySearch',renderOrganizations],['crmCompanyTypeFilter','change','companyType',renderOrganizations],
      ['crmLeadOwnerFilter','change','leadOwner',renderLeads],['crmOppOwnerFilter','change','oppOwner',renderOpportunities]
    ];
    pairs.forEach(function(p){var el=document.getElementById(p[0]);if(!el)return;var handler=function(){filters[p[2]]=el.value;p[3]();bindRows();bindFilters();};if(p[1]==='input')el.oninput=handler;else el.onchange=handler;});
  }

  function refreshLeadFormOptions(){
    var sel=document.getElementById('crmReferralContact');if(!sel)return;var current=sel.value,contacts=activeContacts();
    sel.innerHTML='<option value="">No linked referrer</option>'+contacts.slice().sort(function(a,b){return contactName(a.id).localeCompare(contactName(b.id));}).map(function(c){return '<option value="'+attr(c.id)+'">'+html(contactName(c.id))+(c.company_id?' — '+html(companyName(c.company_id)):'')+'</option>';}).join('');
    if(current&&contacts.some(function(c){return c.id===current;}))sel.value=current;
    var owner=document.getElementById('crmLeadOwnerCreate');
    if(owner){var chosen=owner.value;owner.innerHTML='<option value="">Current user</option>'+ownerOptions(chosen,false);if(chosen)owner.value=chosen;}
  }

  function closeDetail(){selected={type:null,id:null};document.getElementById('crmDetailDrawer')?.classList.remove('open');document.getElementById('crmDetailBackdrop')?.classList.remove('open');}
  function openDetail(type,id,rerender){
    selected={type:type,id:id};var drawer=document.getElementById('crmDetailDrawer'),backdrop=document.getElementById('crmDetailBackdrop'),content=document.getElementById('crmDetailContent');if(!drawer||!content)return;
    var markup=type==='lead'?leadDetail(id):type==='opportunity'?opportunityDetail(id):type==='contact'?contactDetail(id):organizationDetail(id);
    content.innerHTML=markup;drawer.classList.add('open');backdrop?.classList.add('open');bindDetailActions(type,id);
    if(!rerender)drawer.scrollTop=0;
  }

  function detailHead(eyebrow,title,sub){return '<div class="crm-detail-head"><div><p class="eyebrow">'+html(eyebrow)+'</p><h3 style="margin:2px 0 4px">'+html(title)+'</h3><p class="muted" style="margin:0">'+html(sub||'')+'</p></div><button class="btn secondary compact" id="crmCloseDetail">Close</button></div>';}
  function meta(label,value){return '<div><small>'+html(label)+'</small><strong>'+html(value==null||value===''?'—':value)+'</strong></div>';}
  function activityMini(a){return '<div class="crm-link-item"><div><strong>'+html(a.subject||a.activity_type||'Activity')+'</strong><small>'+html(stageLabelActivity(a))+' · '+when(a.occurred_at)+'</small></div><span class="badge">'+html(a.activity_type||'note')+'</span></div>';}
  function stageLabelActivity(a){return [a.direction,a.summary].filter(Boolean).join(' · ');}
  function activitiesFor(field,id){return data.activities.filter(function(a){return a[field]===id;}).sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);});}
  function activityFormHTML(){return '<form id="crmActivityForm" class="crm-activity-form"><select name="activity_type"><option>call</option><option>email</option><option>meeting</option><option>text</option><option>note</option><option>task</option></select><input name="subject" placeholder="Subject" required><select name="direction"><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal</option></select><input name="occurred_at" type="datetime-local"><textarea name="summary" placeholder="Summary / correspondence notes"></textarea><button class="btn primary" type="submit">Log activity</button></form>';}

  function leadDetail(id){
    var l=data.leads.find(function(x){return x.id===id;});if(!l)return detailHead('LEAD','Lead not found','The record may have been archived.');
    var c=contact(l.contact_id),ref=l.referral_contact_id?contactName(l.referral_contact_id):(l.referral_name||'—'),acts=activitiesFor('lead_id',id),docs=data.documents.filter(function(d){return d.lead_id===id;});
    var opp=data.opportunities.find(function(o){return o.lead_id===id;});var status=String(l.status||'new').toLowerCase();
    var utm=[l.utm_source&&('source='+l.utm_source),l.utm_medium&&('medium='+l.utm_medium),l.utm_campaign&&('campaign='+l.utm_campaign),l.utm_content&&('content='+l.utm_content),l.utm_term&&('term='+l.utm_term)].filter(Boolean).join(' · ')||'—';
    return detailHead('LEAD',contactName(l.contact_id),companyName(l.company_id))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Edit lead</h4><span class="badge">'+html(status)+'</span></div><div class="crm-detail-grid">'+
      '<label>Status<select id="crmLeadStatus">'+['new','contacted','qualified','nurture','converted','lost'].map(function(x){return '<option value="'+x+'" '+(status===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select></label>'+
      '<label>Service<input id="crmLeadService" list="crmLeadServiceList" value="'+attr(l.service_interest||'')+'"><datalist id="crmLeadServiceList">'+SERVICES.map(function(x){return '<option value="'+attr(x)+'"></option>';}).join('')+'</datalist></label>'+
      '<label>Priority<select id="crmLeadPriority">'+['low','medium','high','critical'].map(function(x){return '<option value="'+x+'" '+(String(l.priority||'medium')===x?'selected':'')+'>'+x+'</option>';}).join('')+'</select></label>'+
      '<label>Estimated value<input id="crmLeadValue" type="number" min="0" step="0.01" value="'+attr(l.estimated_value==null?'':l.estimated_value)+'"></label>'+
      '<label>Source<input id="crmLeadSource" value="'+attr(l.source||'')+'"></label><label>Campaign<input id="crmLeadCampaign" value="'+attr(l.campaign||'')+'"></label>'+
      '<label>Source detail<input id="crmLeadSourceDetail" value="'+attr(l.source_detail||'')+'"></label><label>Owner<select id="crmLeadOwner">'+ownerOptions(l.owner_person_id,true)+'</select></label><label>Next action<input id="crmLeadNextAction" value="'+attr(l.next_action||'')+'"></label>'+
      '<label>Next action date<input id="crmLeadNextDate" type="datetime-local" value="'+attr(l.next_action_at?new Date(l.next_action_at).toISOString().slice(0,16):'')+'"></label>'+
      '<label>Lost reason<input id="crmLeadLostReason" value="'+attr(l.lost_reason||'')+'" placeholder="Use when status is lost"></label>'+
      '<label class="crm-span-2">Notes<textarea id="crmLeadNotes">'+html(l.description||'')+'</textarea></label></div>'+
      '<div class="crm-detail-meta top-gap">'+meta('Lead ID',l.id)+meta('Created',when(l.created_at))+meta('Referred by',ref)+meta('UTM',utm)+'</div><div class="crm-inline-actions top-gap"><button class="btn primary" id="crmSaveLead">Save lead</button>'+
      (status!=='qualified'&&status!=='converted'?'<button class="btn secondary" id="crmQualifyLead">Mark qualified</button>':'')+
      (status==='qualified'?'<button class="btn secondary" id="crmConvertLead">Convert to opportunity</button>':'')+
      (status!=='converted'?'<button class="btn secondary" id="crmNurtureLead">Move to nurture</button>':'')+
      (opp?'<button class="btn secondary" data-open-opportunity="'+attr(opp.id)+'">Open '+html(opp.id)+'</button>':'')+
      '<button class="btn danger" id="crmDeleteLead">Delete lead</button></div><p class="muted top-gap">Delete removes the lead from the active CRM while preserving audit history and linked records.</p></article>'+
      '<article class="crm-detail-card"><h4>Contact</h4><div class="crm-detail-meta">'+meta('Name',contactName(l.contact_id))+meta('Email',c?.email)+meta('Phone',c?.mobile||c?.office_phone)+meta('Organization',companyName(l.company_id))+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Activities & correspondence</h4><span class="badge">'+acts.length+'</span></div><div class="crm-link-list">'+(acts.map(activityMini).join('')||'<div class="crm-mini-empty">No activity logged for this lead.</div>')+'</div><div class="top-gap">'+activityFormHTML()+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><div><h4>Attachments</h4><p class="muted">Private files associated with this lead.</p></div><span class="badge">'+docs.length+'</span></div><div class="crm-link-list">'+(docs.map(documentMini).join('')||'<div class="crm-mini-empty">No files attached yet.</div>')+'</div><div class="top-gap">'+attachmentFormHTML('lead',id)+'</div></article>'+
    '</div>';
  }

  function opportunityRelations(o){
    var quotes=data.quotes.filter(function(q){return q.opportunity_id===o.id;});
    var jobs=data.jobs.filter(function(j){return j.opportunity_id===o.id||j.id===o.won_job_id;});
    var quoteIds=quotes.map(function(q){return q.id;}),jobIds=jobs.map(function(j){return j.id;});
    var invoices=data.invoices.filter(function(i){return jobIds.includes(i.job_id)||quoteIds.includes(i.quote_id);});
    var invoiceIds=invoices.map(function(i){return i.id;});
    var docs=data.documents.filter(function(d){return d.opportunity_id===o.id||(o.lead_id&&d.lead_id===o.lead_id)||jobIds.includes(d.job_id)||quoteIds.includes(d.quote_id)||invoiceIds.includes(d.invoice_id);});
    return {quotes:quotes,jobs:jobs,invoices:invoices,documents:docs};
  }

  function opportunityDetail(id){
    var o=data.opportunities.find(function(x){return x.id===id;});if(!o)return detailHead('OPPORTUNITY','Opportunity not found','The record may have been archived.');
    var st=stageInfo(o.stage),acts=activitiesFor('opportunity_id',id),rels=opportunityRelations(o),vehicle=(o.metadata&&o.metadata.vehicle)||{},weighted=Number(o.estimated_value||0)*Number(o.probability_pct==null?st.pct:o.probability_pct)/100;
    return detailHead('OPPORTUNITY',o.title,companyName(o.company_id)+' · '+contactName(o.contact_id))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Edit opportunity</h4><span class="badge">'+html(st.label)+' · '+pct(o.probability_pct==null?st.pct:o.probability_pct)+'</span></div><div class="crm-detail-grid">'+
      '<label>Opportunity name<input id="crmOppTitle" value="'+attr(o.title||'')+'"></label>'+
      '<label>Service<input id="crmOppService" list="crmOppServiceList" value="'+attr(o.related_service||o.category||'')+'"><datalist id="crmOppServiceList">'+SERVICES.map(function(x){return '<option value="'+attr(x)+'"></option>';}).join('')+'</datalist></label>'+
      '<label>Stage<select id="crmOpportunityStage">'+STAGE_ORDER.map(function(k){return '<option value="'+k+'" '+(k===String(o.stage||'').toLowerCase()?'selected':'')+'>'+html(STAGES[k].label)+' ('+STAGES[k].pct+'%)</option>';}).join('')+'</select></label>'+
      '<label>Estimated value<input id="crmOppValue" type="number" min="0" step="0.01" value="'+attr(o.estimated_value==null?'':o.estimated_value)+'"></label>'+
      '<label>Priority<select id="crmOppPriority">'+['low','medium','high','critical'].map(function(x){return '<option value="'+x+'" '+(String(o.priority||'medium')===x?'selected':'')+'>'+x+'</option>';}).join('')+'</select></label>'+
      '<label>Expected close<input id="crmOppClose" type="date" value="'+attr(o.expected_close_date||'')+'"></label>'+
      '<label>Source<input id="crmOppSource" value="'+attr(o.source||'')+'"></label><label>Owner<select id="crmOppOwner">'+ownerOptions(o.owner_person_id,true)+'</select></label><label>Next step<input id="crmOppNextStep" value="'+attr(o.next_step||'')+'"></label>'+
      '<label>Next step date<input id="crmOppNextDate" type="date" value="'+attr(o.next_step_date||'')+'"></label><label>Lost reason<input id="crmOppLostReason" value="'+attr(o.lost_reason||'')+'" placeholder="Use when stage is Closed Loss"></label>'+
      '<label>Vehicle year<input id="crmOppVehicleYear" value="'+attr(vehicle.year||'')+'"></label><label>Vehicle make<input id="crmOppVehicleMake" value="'+attr(vehicle.make||'')+'"></label><label>Vehicle model<input id="crmOppVehicleModel" value="'+attr(vehicle.model||'')+'"></label><label>VIN<input id="crmOppVehicleVin" maxlength="17" value="'+attr(vehicle.vin||'')+'"></label>'+
      '<label class="crm-span-2">Notes<textarea id="crmOppNotes">'+html(o.notes||'')+'</textarea></label></div>'+
      '<div class="crm-detail-meta top-gap">'+meta('Opportunity ID',o.id)+meta('Weighted value',cash(weighted))+meta('Created',when(o.created_at))+'</div><div class="crm-inline-actions top-gap"><button class="btn primary" id="crmSaveOpportunity">Save opportunity</button><button class="btn danger" id="crmDeleteOpportunity">Delete opportunity</button></div><p class="muted top-gap">Delete removes the opportunity from the active CRM without breaking linked quotes, jobs, invoices or audit history.</p></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Activities & correspondence</h4><span class="badge">'+acts.length+'</span></div><div class="crm-link-list">'+(acts.map(activityMini).join('')||'<div class="crm-mini-empty">No activity logged for this opportunity.</div>')+'</div><div class="top-gap">'+activityFormHTML()+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><div><h4>Quotes</h4><p class="muted">Proposal and approval control point before a job is created.</p></div><div class="crm-inline-actions"><span class="badge">'+rels.quotes.length+'</span><button class="btn secondary compact" id="crmCreateQuote">+ Quote</button></div></div><div class="crm-link-list">'+(rels.quotes.map(quoteMini).join('')||'<div class="crm-mini-empty">No quotations linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Jobs / Work Orders</h4><span class="badge">'+rels.jobs.length+'</span></div><div class="crm-link-list">'+(rels.jobs.map(jobMini).join('')||'<div class="crm-mini-empty">No jobs or work orders linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Invoices</h4><span class="badge">'+rels.invoices.length+'</span></div><div class="crm-link-list">'+(rels.invoices.map(invoiceMini).join('')||'<div class="crm-mini-empty">No invoices linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><div><h4>Documents & attachments</h4><p class="muted">Private opportunity files plus quote/job documents.</p></div><span class="badge">'+rels.documents.length+'</span></div><div class="crm-link-list">'+(rels.documents.map(documentMini).join('')||'<div class="crm-mini-empty">No related documents yet.</div>')+'</div><div class="top-gap">'+attachmentFormHTML('opportunity',id)+'</div></article>'+
    '</div>';
  }

  function quoteMini(q){
    var status=String(q.status||'draft').toLowerCase(),actions='';
    if(status==='draft')actions='<button class="btn secondary compact" data-quote-status="sent" data-quote-id="'+attr(q.id)+'">Mark sent</button><button class="btn primary compact" data-quote-status="approved" data-quote-id="'+attr(q.id)+'">Approve</button>';
    else if(status==='sent')actions='<button class="btn primary compact" data-quote-status="approved" data-quote-id="'+attr(q.id)+'">Approve</button><button class="btn danger compact" data-quote-status="declined" data-quote-id="'+attr(q.id)+'">Decline</button>';
    else if(status==='approved'&&!q.job_id)actions='<button class="btn primary compact" data-create-job-quote="'+attr(q.id)+'">Create job</button>';
    return '<div class="crm-link-item"><div><strong>'+html(q.id)+'</strong><small>'+html(status)+' · '+dateOnly(q.quote_date)+(q.customer_id?' · Customer '+html(q.customer_id):'')+'</small></div><div class="crm-quote-actions"><strong>'+cash(q.total)+'</strong>'+actions+(q.google_doc_url?'<a class="crm-primary-link" target="_blank" rel="noopener" href="'+attr(q.google_doc_url)+'">Open</a>':'')+'</div></div>';
  }
  function invoiceMini(i){var bal=i.balance_due==null?Number(i.total||0)-Number(i.amount_paid||0):Number(i.balance_due||0);return '<div class="crm-link-item"><div><strong>'+html(i.id)+'</strong><small>'+html(i.status)+' · Due '+dateOnly(i.due_date)+'</small></div><div>'+cash(i.total)+' · '+cash(bal)+' due</div></div>';}
  function jobMini(j){return '<div class="crm-link-item"><div><strong>'+html(j.work_order_id||j.id)+'</strong><small>'+html(j.status||'Job')+' · '+(j.appointment_local?when(j.appointment_local):'No appointment')+'</small></div><button class="btn secondary compact" data-open-job="'+attr(j.id)+'">Open Job</button></div>';}
  function documentMini(d){
    var open=d.drive_url?'<a class="crm-primary-link" target="_blank" rel="noopener" href="'+attr(d.drive_url)+'">Open</a>':d.storage_path?'<button class="btn secondary compact" data-open-attachment="'+attr(d.id)+'">Open</button>':'<span class="badge">Linked</span>';
    return '<div class="crm-link-item"><div><strong>'+html(d.title)+'</strong><small>'+html(d.document_type||'Document')+' · '+dateOnly(d.document_date)+'</small></div><div class="crm-quote-actions">'+open+(d.storage_path?'<button class="btn danger compact" data-remove-attachment="'+attr(d.id)+'">Remove</button>':'')+'</div></div>';
  }
  function attachmentFormHTML(type,id){
    return '<form class="crm-attachment-form" data-attachment-type="'+attr(type)+'" data-attachment-id="'+attr(id)+'"><div class="crm-detail-grid"><label>File title<input name="title" placeholder="Optional — defaults to filename"></label><label>File<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,.docx,.xlsx" required></label></div><div class="crm-inline-actions top-gap"><button class="btn secondary compact" type="submit">Attach file</button><small class="muted">Maximum 10 MB</small></div></form>';
  }

  function contactDetail(id){
    var c=contact(id);if(!c)return detailHead('CONTACT','Contact not found','');
    var leads=data.leads.filter(function(l){return l.contact_id===id;}),opps=data.opportunities.filter(function(o){return o.contact_id===id;}),acts=data.activities.filter(function(a){return a.contact_id===id;}).sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);});
    var companies=data.companies.slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
    var nextValue=c.next_action_at?new Date(c.next_action_at).toISOString().slice(0,16):'';
    var companyOptions='<option value="">No organization</option>'+companies.map(function(co){return '<option value="'+attr(co.id)+'" '+(co.id===c.company_id?'selected':'')+'>'+html(co.name)+'</option>';}).join('');
    var archived=!!c.archived_at;
    return detailHead(archived?'ARCHIVED CONTACT':'CONTACT',contactName(id),companyName(c.company_id))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>'+ (archived?'Archived contact':'Edit contact') +'</h4>'+(archived?'<span class="badge">Archived</span>':'')+'</div>'+
      (archived?'<p class="muted">This contact is retained for historical Leads, Opportunities and Activities.</p>':
      '<div class="crm-detail-grid">'+
      '<label>First name<input id="crmContactFirst" value="'+attr(c.first_name||'')+'"></label><label>Middle name<input id="crmContactMiddle" value="'+attr(c.middle_name||'')+'"></label>'+
      '<label>Last name<input id="crmContactLast" value="'+attr(c.last_name||'')+'"></label><label>Organization<select id="crmContactCompany">'+companyOptions+'</select></label>'+
      '<label>Job title<input id="crmContactTitle" value="'+attr(c.title||'')+'"></label><label>Role / function<input id="crmContactRole" value="'+attr(c.role_type||'')+'"></label>'+
      '<label>Contact type<select id="crmContactType">'+Object.keys(CONTACT_TYPES).map(function(k){return '<option value="'+k+'" '+(String(c.contact_type||'other')===k?'selected':'')+'>'+html(CONTACT_TYPES[k])+'</option>';}).join('')+'</select></label>'+
      '<label>Engagement strength<select id="crmContactStrength"><option value="">Not set</option>'+['New','Cold','Warm','Strong','Strategic'].map(function(x){return '<option '+(String(c.relationship_strength||'')===x?'selected':'')+'>'+x+'</option>';}).join('')+'</select></label>'+
      '<label>Email<input id="crmContactEmail" type="email" value="'+attr(c.email||'')+'"></label><label>Mobile<input id="crmContactMobile" value="'+attr(c.mobile||'')+'"></label>'+
      '<label>Office phone<input id="crmContactOffice" value="'+attr(c.office_phone||'')+'"></label><label>LinkedIn<input id="crmContactLinkedIn" value="'+attr(c.linkedin||'')+'"></label>'+
      '<label>Preferred contact<select id="crmContactPreferred"><option value="">Not set</option>'+['Email','Phone','Text','WhatsApp','In Person'].map(function(x){return '<option '+(String(c.preferred_contact_method||'').toLowerCase()===x.toLowerCase()?'selected':'')+'>'+x+'</option>';}).join('')+'</select></label>'+
      '<label>Territory<input id="crmContactTerritory" value="'+attr(c.territory||'')+'"></label>'+
      '<label>Source<input id="crmContactSource" value="'+attr(c.source||'')+'"></label><label>Next action<input id="crmContactNextAction" value="'+attr(c.next_action||'')+'"></label>'+
      '<label>Next action date<input id="crmContactNextDate" type="datetime-local" value="'+attr(nextValue)+'"></label><label class="crm-span-2">Notes<textarea id="crmContactNotes">'+html(c.notes||'')+'</textarea></label>'+
      '</div><div class="crm-inline-actions top-gap"><button class="btn primary" id="crmSaveContact">Save contact</button><button class="btn danger" id="crmDeleteContact">Delete contact</button></div><p class="muted top-gap">Delete removes the contact from the active Contacts list but keeps the record available to historical Leads, Opportunities and Activities.</p>')+
      '</article>'+
      '<article class="crm-detail-card"><h4>CRM relationships</h4><div class="crm-detail-meta">'+meta('Leads',leads.length)+meta('Opportunities',opps.length)+meta('Activities',acts.length)+meta('Last interaction',when(c.last_interaction_at))+'</div></article>'+
      '<article class="crm-detail-card"><h4>Recent activity</h4><div class="crm-link-list">'+(acts.slice(0,20).map(activityMini).join('')||'<div class="crm-mini-empty">No activity yet.</div>')+'</div></article></div>';
  }

  function organizationDetail(id){
    var co=company(id);if(!co)return detailHead('COMPANY','Company not found','');
    var contacts=activeContacts().filter(function(x){return x.company_id===id;}),leads=data.leads.filter(function(x){return x.company_id===id;}),opps=data.opportunities.filter(function(x){return x.company_id===id;});
    var archived=!!co.archived_at;
    return detailHead(archived?'ARCHIVED COMPANY':'COMPANY',co.name,[co.city,co.state].filter(Boolean).join(', '))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>'+(archived?'Archived company':'Edit company')+'</h4>'+(archived?'<span class="badge">Archived</span>':'')+'</div>'+
      (archived?'<p class="muted">This company remains available to historical CRM records.</p>':
      '<div class="crm-detail-grid"><label>Company name<input id="crmCompanyName" value="'+attr(co.name||'')+'"></label>'+
      '<label>Type<select id="crmCompanyType">'+['prospect','customer','dealership','fleet','vendor','supplier','distributor','partner','other'].map(function(x){return '<option value="'+x+'" '+(String(co.primary_type||'prospect')===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select></label>'+
      '<label>Status<select id="crmCompanyStatus">'+['active','inactive','prospect','customer'].map(function(x){return '<option value="'+x+'" '+(String(co.status||'active')===x?'selected':'')+'>'+html(x)+'</option>';}).join('')+'</select></label>'+
      '<label>Website<input id="crmCompanyWebsite" value="'+attr(co.website||'')+'"></label><label>Main phone<input id="crmCompanyPhone" value="'+attr(co.main_phone||'')+'"></label><label>General email<input id="crmCompanyEmail" type="email" value="'+attr(co.general_email||'')+'"></label>'+
      '<label>Address 1<input id="crmCompanyAddress1" value="'+attr(co.address1||'')+'"></label><label>Address 2<input id="crmCompanyAddress2" value="'+attr(co.address2||'')+'"></label>'+
      '<label>City<input id="crmCompanyCity" value="'+attr(co.city||'')+'"></label><label>State / Province<input id="crmCompanyState" value="'+attr(co.state||'')+'"></label><label>Postal code<input id="crmCompanyPostal" value="'+attr(co.postal_code||'')+'"></label><label>Country<input id="crmCompanyCountry" value="'+attr(co.country||'United States')+'"></label>'+
      '<label>Territory<input id="crmCompanyTerritory" value="'+attr(co.territory||'')+'"></label><label>Source<input id="crmCompanySource" value="'+attr(co.source||'')+'"></label><label class="crm-span-2">Notes<textarea id="crmCompanyNotes">'+html(co.notes||'')+'</textarea></label></div>'+
      '<div class="crm-inline-actions top-gap"><button class="btn primary" id="crmSaveCompany">Save company</button><button class="btn danger" id="crmDeleteCompany">Archive company</button></div>')+
      '</article><article class="crm-detail-card"><div class="panel-head"><h4>Contacts</h4><span class="badge">'+contacts.length+'</span></div><div class="crm-link-list">'+(contacts.map(function(x){return '<div class="crm-link-item"><div><strong>'+html(contactName(x.id))+'</strong><small>'+html(x.title||x.email||'')+'</small></div><button class="btn secondary compact" data-open-contact="'+attr(x.id)+'">Open</button></div>';}).join('')||'<div class="crm-mini-empty">No contacts linked.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><h4>CRM summary</h4><div class="crm-detail-meta">'+meta('Leads',leads.length)+meta('Opportunities',opps.length)+meta('Open pipeline',cash(sum(opps.filter(openOpp),'estimated_value')))+meta('Closed won',opps.filter(function(o){return o.stage==='closed_won';}).length)+'</div></article></div>';
  }

  function bindDetailActions(type,id){
    document.getElementById('crmCloseDetail')?.addEventListener('click',closeDetail);
    document.getElementById('crmQualifyLead')?.addEventListener('click',function(){updateLeadStatus(id,'qualified');});
    document.getElementById('crmNurtureLead')?.addEventListener('click',function(){updateLeadStatus(id,'nurture');});
    document.getElementById('crmConvertLead')?.addEventListener('click',function(){convertLead(id);});
    document.querySelectorAll('[data-open-opportunity]').forEach(function(b){b.onclick=function(){openDetail('opportunity',b.dataset.openOpportunity);};});
    document.querySelectorAll('[data-open-contact]').forEach(function(b){b.onclick=function(){openDetail('contact',b.dataset.openContact);};});
    document.querySelectorAll('[data-open-job]').forEach(function(b){b.onclick=function(){openJob(b.dataset.openJob);};});
    document.getElementById('crmSaveLead')?.addEventListener('click',function(){saveLead(id);});
    document.getElementById('crmSaveOpportunity')?.addEventListener('click',function(){saveOpportunity(id);});
    document.getElementById('crmSaveContact')?.addEventListener('click',function(){saveContact(id);});
    document.getElementById('crmSaveCompany')?.addEventListener('click',function(){saveCompany(id);});
    document.getElementById('crmCreateQuote')?.addEventListener('click',function(){openQuoteModal(id);});
    document.querySelectorAll('[data-quote-status]').forEach(function(b){b.onclick=function(){updateQuoteStatus(b.dataset.quoteId,b.dataset.quoteStatus);};});
    document.querySelectorAll('[data-create-job-quote]').forEach(function(b){b.onclick=function(){openJobModal(id,b.dataset.createJobQuote);};});
    document.getElementById('crmDeleteLead')?.addEventListener('click',function(){archiveRecord('lead',id);});
    document.getElementById('crmDeleteOpportunity')?.addEventListener('click',function(){archiveRecord('opportunity',id);});
    document.getElementById('crmDeleteContact')?.addEventListener('click',function(){archiveRecord('contact',id);});
    document.getElementById('crmDeleteCompany')?.addEventListener('click',function(){archiveRecord('company',id);});
    document.getElementById('crmActivityForm')?.addEventListener('submit',function(e){logActivity(e,type,id);});
    document.querySelector('.crm-attachment-form')?.addEventListener('submit',uploadAttachment);
    document.querySelectorAll('[data-open-attachment]').forEach(function(b){b.onclick=function(){openAttachment(b.dataset.openAttachment);};});
    document.querySelectorAll('[data-remove-attachment]').forEach(function(b){b.onclick=function(){removeAttachment(b.dataset.removeAttachment,type,id);};});
  }

  async function updateLeadStatus(id,status){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;var patch={status:status,updated_by:cloud.userId};if(status==='qualified'&&!data.leads.find(function(l){return l.id===id;})?.first_contact_at)patch.first_contact_at=new Date().toISOString();
    var out=await cloud.client.from('leads').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Lead update failed: '+out.error.message);await cloud.audit?.('lead',id,'status_changed',{status:status});data.loaded=false;await load(true);toastSafe('Lead moved to '+status+'.');
  }

  async function convertLead(id){
    var cloud=window.TTTCloud,lead=data.leads.find(function(x){return x.id===id;});if(!cloud?.ready||!lead)return;if(String(lead.status||'').toLowerCase()!=='qualified')return toastSafe('Qualify the lead before converting it.');
    try{
      var existing=data.opportunities.find(function(o){return o.lead_id===id;});if(existing){openDetail('opportunity',existing.id);return;}
      var title=[contactName(lead.contact_id),lead.service_interest].filter(function(x){return x&&x!=='—';}).join(' · ')||('Opportunity '+lead.id);
      var out=await cloud.client.from('opportunities').insert({organization_id:cloud.organizationId,lead_id:lead.id,company_id:lead.company_id,contact_id:lead.contact_id,customer_id:lead.customer_id||null,title:title,stage:'prospecting',priority:lead.priority||'medium',estimated_value:lead.estimated_value||null,probability_pct:10,related_service:lead.service_interest||null,owner_person_id:cloud.profile?.person_id||null,source:[lead.source,lead.campaign].filter(Boolean).join(' · ')||'TTT-OS CRM',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
      if(out.error)throw out.error;
      var upd=await cloud.client.from('leads').update({status:'converted',converted_at:new Date().toISOString(),updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',lead.id);if(upd.error)throw upd.error;
      await cloud.audit?.('lead',lead.id,'lead_converted',{opportunity_id:out.data.id});data.loaded=false;selected={type:'opportunity',id:out.data.id};await load(true);toastSafe('Lead converted to '+out.data.id);
    }catch(err){console.error(err);toastSafe('Lead conversion failed: '+String(err.message||err));}
  }

  async function saveLead(id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;var status=document.getElementById('crmLeadStatus')?.value||'new',nextRaw=document.getElementById('crmLeadNextDate')?.value||'';
    var patch={status:status,service_interest:document.getElementById('crmLeadService')?.value.trim()||null,owner_person_id:document.getElementById('crmLeadOwner')?.value||null,lost_reason:document.getElementById('crmLeadLostReason')?.value.trim()||null,priority:document.getElementById('crmLeadPriority')?.value||'medium',estimated_value:Number(document.getElementById('crmLeadValue')?.value||0)||null,source:document.getElementById('crmLeadSource')?.value.trim()||null,campaign:document.getElementById('crmLeadCampaign')?.value.trim()||null,source_detail:document.getElementById('crmLeadSourceDetail')?.value.trim()||null,next_action:document.getElementById('crmLeadNextAction')?.value.trim()||null,next_action_at:nextRaw?new Date(nextRaw).toISOString():null,description:document.getElementById('crmLeadNotes')?.value.trim()||null,updated_by:cloud.userId};
    var out=await cloud.client.from('leads').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Lead update failed: '+out.error.message);await cloud.audit?.('lead',id,'lead_updated',{status:status,service_interest:patch.service_interest});data.loaded=false;await load(true);toastSafe('Lead updated.');
  }

  async function saveOpportunity(id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;var current=data.opportunities.find(function(x){return x.id===id;})||{},stage=document.getElementById('crmOpportunityStage')?.value||'prospecting',info=stageInfo(stage);var vehicle={year:document.getElementById('crmOppVehicleYear')?.value.trim()||'',make:document.getElementById('crmOppVehicleMake')?.value.trim()||'',model:document.getElementById('crmOppVehicleModel')?.value.trim()||'',vin:document.getElementById('crmOppVehicleVin')?.value.trim().toUpperCase()||''};var patch={title:document.getElementById('crmOppTitle')?.value.trim()||('Opportunity '+id),related_service:document.getElementById('crmOppService')?.value.trim()||null,owner_person_id:document.getElementById('crmOppOwner')?.value||null,stage:stage,probability_pct:info.pct,estimated_value:Number(document.getElementById('crmOppValue')?.value||0)||null,priority:document.getElementById('crmOppPriority')?.value||'medium',expected_close_date:document.getElementById('crmOppClose')?.value||null,source:document.getElementById('crmOppSource')?.value.trim()||null,next_step:document.getElementById('crmOppNextStep')?.value.trim()||null,next_step_date:document.getElementById('crmOppNextDate')?.value||null,lost_reason:document.getElementById('crmOppLostReason')?.value.trim()||null,metadata:Object.assign({},current.metadata||{},{vehicle:vehicle}),notes:document.getElementById('crmOppNotes')?.value.trim()||null,updated_by:cloud.userId};
    var out=await cloud.client.from('opportunities').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Opportunity update failed: '+out.error.message);await cloud.audit?.('opportunity',id,'opportunity_updated',{stage:stage,probability_pct:info.pct,related_service:patch.related_service});data.loaded=false;await load(true);toastSafe('Opportunity updated.');
  }

  async function saveContact(id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;
    var first=document.getElementById('crmContactFirst')?.value.trim()||'',middle=document.getElementById('crmContactMiddle')?.value.trim()||'',last=document.getElementById('crmContactLast')?.value.trim()||'';
    var nextRaw=document.getElementById('crmContactNextDate')?.value||'';
    var patch={
      first_name:first||null,middle_name:middle||null,last_name:last||null,display_name:[first,middle,last].filter(Boolean).join(' ')||contactName(id),
      company_id:document.getElementById('crmContactCompany')?.value||null,title:document.getElementById('crmContactTitle')?.value.trim()||null,role_type:document.getElementById('crmContactRole')?.value.trim()||null,
      contact_type:document.getElementById('crmContactType')?.value||'other',relationship_strength:document.getElementById('crmContactStrength')?.value||null,
      email:document.getElementById('crmContactEmail')?.value.trim()||null,mobile:document.getElementById('crmContactMobile')?.value.trim()||null,office_phone:document.getElementById('crmContactOffice')?.value.trim()||null,
      linkedin:document.getElementById('crmContactLinkedIn')?.value.trim()||null,preferred_contact_method:document.getElementById('crmContactPreferred')?.value||null,
      territory:document.getElementById('crmContactTerritory')?.value.trim()||null,source:document.getElementById('crmContactSource')?.value.trim()||null,
      next_action:document.getElementById('crmContactNextAction')?.value.trim()||null,next_action_at:nextRaw?new Date(nextRaw).toISOString():null,notes:document.getElementById('crmContactNotes')?.value.trim()||null,
      updated_by:cloud.userId
    };
    var out=await cloud.client.from('contacts').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Contact update failed: '+out.error.message);
    await cloud.audit?.('contact',id,'contact_updated',{contact_type:patch.contact_type,company_id:patch.company_id});data.loaded=false;await load(true);toastSafe('Contact updated.');
  }


  async function saveCompany(id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;
    var patch={name:document.getElementById('crmCompanyName')?.value.trim()||companyName(id),primary_type:document.getElementById('crmCompanyType')?.value||'prospect',status:document.getElementById('crmCompanyStatus')?.value||'active',website:document.getElementById('crmCompanyWebsite')?.value.trim()||null,main_phone:document.getElementById('crmCompanyPhone')?.value.trim()||null,general_email:document.getElementById('crmCompanyEmail')?.value.trim()||null,address1:document.getElementById('crmCompanyAddress1')?.value.trim()||null,address2:document.getElementById('crmCompanyAddress2')?.value.trim()||null,city:document.getElementById('crmCompanyCity')?.value.trim()||null,state:document.getElementById('crmCompanyState')?.value.trim()||null,postal_code:document.getElementById('crmCompanyPostal')?.value.trim()||null,country:document.getElementById('crmCompanyCountry')?.value.trim()||'United States',territory:document.getElementById('crmCompanyTerritory')?.value.trim()||null,source:document.getElementById('crmCompanySource')?.value.trim()||null,notes:document.getElementById('crmCompanyNotes')?.value.trim()||null,updated_by:cloud.userId};
    var out=await cloud.client.from('companies').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Company update failed: '+out.error.message);
    await cloud.audit?.('company',id,'company_updated',{primary_type:patch.primary_type,status:patch.status});data.loaded=false;await load(true);toastSafe('Company updated.');
  }

  async function archiveRecord(type,id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;var table=type==='lead'?'leads':type==='opportunity'?'opportunities':type==='company'?'companies':'contacts',label=type==='lead'?'lead':type==='opportunity'?'opportunity':type==='company'?'company':'contact';
    if(!window.confirm('Delete this '+label+' from the active CRM? Its audit history and linked records will be preserved.'))return;
    var out=await cloud.client.from(table).update({archived_at:new Date().toISOString(),updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',id);
    if(out.error)return toastSafe('Delete failed: '+out.error.message);await cloud.audit?.(label,id,label+'_archived',{});closeDetail();data.loaded=false;await load(true);toastSafe((type==='lead'?'Lead':type==='opportunity'?'Opportunity':type==='company'?'Company':'Contact')+' removed from active CRM.');
  }

  async function uploadAttachment(ev){
    ev.preventDefault();var form=ev.currentTarget,cloud=window.TTTCloud;if(!cloud?.ready)return;
    var file=form.elements.file?.files?.[0];if(!file)return;
    if(file.size>10*1024*1024)return toastSafe('Attachment must be 10 MB or smaller.');
    var type=form.dataset.attachmentType,id=form.dataset.attachmentId,safe=String(file.name||'attachment').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);
    var path=cloud.organizationId+'/'+type+'/'+id+'/'+Date.now()+'_'+safe;
    var button=form.querySelector('button[type="submit"]');
    try{
      if(button){button.disabled=true;button.textContent='Uploading…';}
      var upload=await cloud.client.storage.from('crm-attachments').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});if(upload.error)throw upload.error;
      var parent=type==='lead'?data.leads.find(function(x){return x.id===id;}):data.opportunities.find(function(x){return x.id===id;});
      var row={organization_id:cloud.organizationId,company_id:parent?.company_id||null,contact_id:parent?.contact_id||null,customer_id:parent?.customer_id||null,lead_id:type==='lead'?id:null,opportunity_id:type==='opportunity'?id:null,document_type:'crm_attachment',title:String(new FormData(form).get('title')||'').trim()||file.name,document_date:todayISO(),storage_path:path,mime_type:file.type||null,confidentiality:'internal',created_by:cloud.userId,updated_by:cloud.userId};
      var out=await cloud.client.from('documents').insert(row).select('*').single();if(out.error){await cloud.client.storage.from('crm-attachments').remove([path]);throw out.error;}
      await cloud.audit?.('document',out.data.id,'crm_attachment_added',{regarding_type:type,regarding_id:id});data.loaded=false;await load(true);toastSafe('Attachment added.');
    }catch(err){console.error(err);toastSafe('Attachment upload failed: '+String(err.message||err));}
    finally{if(button){button.disabled=false;button.textContent='Attach file';}}
  }
  async function openAttachment(documentId){
    var cloud=window.TTTCloud,d=data.documents.find(function(x){return x.id===documentId;});if(!cloud?.ready||!d?.storage_path)return;
    var out=await cloud.client.storage.from('crm-attachments').createSignedUrl(d.storage_path,300);
    if(out.error)return toastSafe('Attachment could not be opened: '+out.error.message);
    if(out.data?.signedUrl)window.open(out.data.signedUrl,'_blank','noopener');
  }
  async function removeAttachment(documentId,type,id){
    var cloud=window.TTTCloud,d=data.documents.find(function(x){return x.id===documentId;});if(!cloud?.ready||!d)return;
    if(!window.confirm('Remove this attachment from the CRM record?'))return;
    if(d.storage_path){var storage=await cloud.client.storage.from('crm-attachments').remove([d.storage_path]);if(storage.error)return toastSafe('Attachment file could not be removed: '+storage.error.message);}
    var out=await cloud.client.from('documents').update({archived_at:new Date().toISOString(),updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',documentId);if(out.error)return toastSafe('Attachment record could not be removed: '+out.error.message);
    await cloud.audit?.('document',documentId,'crm_attachment_removed',{regarding_type:type,regarding_id:id});data.loaded=false;await load(true);toastSafe('Attachment removed.');
  }

  async function logActivity(ev,type,id){
    ev.preventDefault();var cloud=window.TTTCloud;if(!cloud?.ready)return;var fd=new FormData(ev.currentTarget),row={organization_id:cloud.organizationId,activity_type:String(fd.get('activity_type')||'note'),direction:String(fd.get('direction')||'internal'),status:'completed',subject:String(fd.get('subject')||'').trim(),summary:String(fd.get('summary')||'').trim()||null,occurred_at:fd.get('occurred_at')?new Date(String(fd.get('occurred_at'))).toISOString():new Date().toISOString(),owner_person_id:cloud.profile?.person_id||null,created_by:cloud.userId,updated_by:cloud.userId};
    if(type==='lead'){var l=data.leads.find(function(x){return x.id===id;});row.lead_id=id;row.contact_id=l?.contact_id||null;row.company_id=l?.company_id||null;}
    if(type==='opportunity'){var o=data.opportunities.find(function(x){return x.id===id;});row.opportunity_id=id;row.contact_id=o?.contact_id||null;row.company_id=o?.company_id||null;row.customer_id=o?.customer_id||null;}
    var out=await cloud.client.from('activities').insert(row).select('*').single();if(out.error)return toastSafe('Activity could not be logged: '+out.error.message);await cloud.audit?.('activity',out.data.id,'activity_logged',{regarding_type:type,regarding_id:id});data.loaded=false;await load(true);toastSafe('Activity logged.');
  }

  function openJob(id){
    try{
      if(typeof window.currentJobId!=='undefined')window.currentJobId=id;else if(typeof currentJobId!=='undefined')currentJobId=id;
      if(typeof show==='function')show('jobdetail');
      if(typeof renderJobDetail==='function')renderJobDetail();
      closeDetail();
    }catch(err){console.warn('Could not open job directly',err);toastSafe('Job '+id+' is linked. Open it from the Jobs tab.');}
  }


  function withLoaded(callback,attempt){
    attempt=Number(attempt||0);
    if(data.loaded){callback();return;}
    if(attempt>30){toastSafe('CRM data is taking longer than expected to load. Please refresh and try again.');return;}
    if(!data.loading)load(true);
    setTimeout(function(){withLoaded(callback,attempt+1);},150);
  }
  function openCoreJobWhenReady(id,attempt){
    attempt=Number(attempt||0);
    try{if(typeof db!=='undefined'&&Array.isArray(db?.jobs)&&db.jobs.some(function(j){return j.id===id;})){openJob(id);return;}}catch(e){}
    if(attempt>24){toastSafe('Job '+id+' was created. Open it from Jobs once synchronization completes.');return;}
    setTimeout(function(){openCoreJobWhenReady(id,attempt+1);},125);
  }

  function newLead(){
    if(typeof show==='function')show('crm');activateTab('leads');
    withLoaded(function(){document.getElementById('crmLeadFormWrap')?.classList.add('open');refreshLeadFormOptions();setTimeout(function(){document.querySelector('#crmLeadForm [name="first_name"]')?.focus();},0);});
  }
  function closeCreateModal(){document.getElementById('crmCreateModal')?.classList.remove('open');}
  function openCreateModal(title,subtitle,body){
    var wrap=document.getElementById('crmCreateModal'),content=document.getElementById('crmCreateModalContent');if(!wrap||!content)return;
    content.innerHTML='<div class="crm-modal-head"><div><p class="eyebrow">CRM</p><h3 style="margin:2px 0 4px">'+html(title)+'</h3><p class="muted" style="margin:0">'+html(subtitle||'')+'</p></div><button class="btn secondary compact" id="crmCloseCreateModal">Close</button></div><div class="crm-modal-body">'+body+'</div>';
    wrap.classList.add('open');document.getElementById('crmCloseCreateModal')?.addEventListener('click',closeCreateModal);
  }
  function newContact(){
    if(typeof show==='function')show('crm');activateTab('contacts');
    if(!data.loaded){withLoaded(newContact);return;}
    var companies=activeCompanies().slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
    openCreateModal('New contact','Create a customer, prospect, vendor, supplier, distributor, partner or referral contact.',
      '<form id="crmNewContactForm"><div class="crm-detail-grid"><label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label><label>Company<select name="company_id"><option value="">No company</option>'+companies.map(function(x){return '<option value="'+attr(x.id)+'">'+html(x.name)+'</option>';}).join('')+'</select></label><label>Contact type<select name="contact_type">'+Object.keys(CONTACT_TYPES).map(function(k){return '<option value="'+k+'">'+html(CONTACT_TYPES[k])+'</option>';}).join('')+'</select></label><label>Job title<input name="title"></label><label>Email<input type="email" name="email"></label><label>Mobile<input name="mobile"></label><label>Office phone<input name="office_phone"></label><label>Source<input name="source" value="TTT-OS CRM"></label><label class="crm-span-2">Notes<textarea name="notes"></textarea></label></div><div class="crm-inline-actions top-gap"><button class="btn primary" type="submit">Create contact</button></div></form>');
    document.getElementById('crmNewContactForm')?.addEventListener('submit',createContact);
  }
  function newCompany(){
    if(typeof show==='function')show('crm');activateTab('companies');
    if(!data.loaded){withLoaded(newCompany);return;}
    openCreateModal('New company','Create an organization once, then attach contacts, leads and opportunities to it.',
      '<form id="crmNewCompanyForm"><div class="crm-detail-grid"><label>Company name<input name="name" required></label><label>Type<select name="primary_type">'+['prospect','customer','dealership','fleet','vendor','supplier','distributor','partner','other'].map(function(x){return '<option value="'+x+'">'+html(x)+'</option>';}).join('')+'</select></label><label>Main phone<input name="main_phone"></label><label>General email<input type="email" name="general_email"></label><label>Website<input name="website"></label><label>Territory<input name="territory"></label><label>City<input name="city"></label><label>State / Province<input name="state"></label><label>Postal code<input name="postal_code"></label><label>Country<input name="country" value="United States"></label><label>Source<input name="source" value="TTT-OS CRM"></label><label class="crm-span-2">Notes<textarea name="notes"></textarea></label></div><div class="crm-inline-actions top-gap"><button class="btn primary" type="submit">Create company</button></div></form>');
    document.getElementById('crmNewCompanyForm')?.addEventListener('submit',createCompany);
  }
  async function createContact(ev){
    ev.preventDefault();var cloud=window.TTTCloud,fd=new FormData(ev.currentTarget);if(!cloud?.ready)return;
    var first=String(fd.get('first_name')||'').trim(),last=String(fd.get('last_name')||'').trim();
    var row={organization_id:cloud.organizationId,company_id:String(fd.get('company_id')||'')||null,first_name:first,last_name:last,display_name:[first,last].filter(Boolean).join(' '),contact_type:String(fd.get('contact_type')||'other'),title:String(fd.get('title')||'').trim()||null,email:String(fd.get('email')||'').trim()||null,mobile:String(fd.get('mobile')||'').trim()||null,office_phone:String(fd.get('office_phone')||'').trim()||null,source:String(fd.get('source')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,owner_person_id:cloud.profile?.person_id||null,created_by:cloud.userId,updated_by:cloud.userId};
    var out=await cloud.client.from('contacts').insert(row).select('*').single();if(out.error)return toastSafe('Contact could not be created: '+out.error.message);
    await cloud.audit?.('contact',out.data.id,'contact_created',{contact_type:row.contact_type});closeCreateModal();data.loaded=false;selected={type:'contact',id:out.data.id};await load(true);toastSafe('Contact created.');
  }
  async function createCompany(ev){
    ev.preventDefault();var cloud=window.TTTCloud,fd=new FormData(ev.currentTarget);if(!cloud?.ready)return;
    var row={organization_id:cloud.organizationId,name:String(fd.get('name')||'').trim(),primary_type:String(fd.get('primary_type')||'prospect'),status:'active',main_phone:String(fd.get('main_phone')||'').trim()||null,general_email:String(fd.get('general_email')||'').trim()||null,website:String(fd.get('website')||'').trim()||null,territory:String(fd.get('territory')||'').trim()||null,city:String(fd.get('city')||'').trim()||null,state:String(fd.get('state')||'').trim()||null,postal_code:String(fd.get('postal_code')||'').trim()||null,country:String(fd.get('country')||'').trim()||'United States',source:String(fd.get('source')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,owner_person_id:cloud.profile?.person_id||null,created_by:cloud.userId,updated_by:cloud.userId};
    var existing=activeCompanies().find(function(x){return String(x.name||'').trim().toLowerCase()===row.name.toLowerCase();});if(existing){closeCreateModal();openDetail('organization',existing.id);return toastSafe('That company already exists.');}
    var out=await cloud.client.from('companies').insert(row).select('*').single();if(out.error)return toastSafe('Company could not be created: '+out.error.message);
    await cloud.audit?.('company',out.data.id,'company_created',{primary_type:row.primary_type});closeCreateModal();data.loaded=false;selected={type:'organization',id:out.data.id};await load(true);toastSafe('Company created.');
  }

  function openQuoteModal(opportunityId){
    var o=data.opportunities.find(function(x){return x.id===opportunityId;});if(!o)return;
    var expires=new Date();expires.setDate(expires.getDate()+30);
    openCreateModal('Create quote',o.title,
      '<form id="crmQuoteForm"><div class="crm-detail-grid"><label>Service / description<input name="description" value="'+attr(o.related_service||o.title||'Service')+'" required></label><label>Subtotal<input name="subtotal" type="number" min="0" step="0.01" value="'+attr(Number(o.estimated_value||0).toFixed(2))+'" required></label><label>Discount<input name="discount" type="number" min="0" step="0.01" value="0"></label><label>Tax<input name="tax" type="number" min="0" step="0.01" value="0"></label><label>Deposit required<input name="deposit" type="number" min="0" step="0.01" value="0"></label><label>Expires<input name="expires_at" type="date" value="'+expires.toISOString().slice(0,10)+'"></label><label class="crm-span-2">Terms<textarea name="terms" placeholder="Quote terms, exclusions and approval conditions"></textarea></label><label class="crm-span-2">Notes<textarea name="notes" placeholder="Internal or customer-facing quote notes"></textarea></label></div><div class="crm-inline-actions top-gap"><button class="btn primary" type="submit">Create draft quote</button></div></form>');
    document.getElementById('crmQuoteForm')?.addEventListener('submit',function(e){createQuote(e,opportunityId);});
  }
  async function createQuote(ev,opportunityId){
    ev.preventDefault();var cloud=window.TTTCloud,o=data.opportunities.find(function(x){return x.id===opportunityId;}),fd=new FormData(ev.currentTarget);if(!cloud?.ready||!o)return;
    var subtotal=Math.max(0,Number(fd.get('subtotal')||0)),discount=Math.max(0,Number(fd.get('discount')||0)),tax=Math.max(0,Number(fd.get('tax')||0)),total=Math.max(0,subtotal-discount+tax);
    var row={organization_id:cloud.organizationId,opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null,customer_id:o.customer_id||null,status:'draft',quote_date:todayISO(),expires_at:String(fd.get('expires_at')||'')||null,subtotal,discount_total:discount,tax_total:tax,total,deposit_required:Math.max(0,Number(fd.get('deposit')||0)),terms:String(fd.get('terms')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,created_by:cloud.userId,updated_by:cloud.userId};
    var out=await cloud.client.from('quotes').insert(row).select('*').single();if(out.error)return toastSafe('Quote could not be created: '+out.error.message);
    var line={organization_id:cloud.organizationId,quote_id:out.data.id,line_type:'service',description:String(fd.get('description')||o.related_service||o.title),quantity:1,unit_price:subtotal,line_total:subtotal,sort_order:1};
    var lineOut=await cloud.client.from('quote_lines').insert(line);if(lineOut.error){console.warn('Quote line creation failed',lineOut.error);toastSafe('Quote created, but its first line needs attention.');}
    await cloud.client.from('opportunities').update({stage:'proposal',probability_pct:50,next_step:'Review / approve quote '+out.data.id,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',o.id);
    await cloud.audit?.('quote',out.data.id,'quote_created',{opportunity_id:o.id,total});closeCreateModal();data.loaded=false;selected={type:'opportunity',id:o.id};await load(true);toastSafe('Draft quote '+out.data.id+' created.');
  }
  async function ensureCustomerForOpportunity(o){
    var cloud=window.TTTCloud;if(!cloud?.ready||!o)return null;
    if(o.customer_id){return data.customers.find(function(x){return x.id===o.customer_id;})||{id:o.customer_id};}
    var con=contact(o.contact_id);if(!con)return null;
    var existing=data.customers.find(function(x){return (x.primary_contact_id&&x.primary_contact_id===con.id)||(x.email&&con.email&&String(x.email).toLowerCase()===String(con.email).toLowerCase());});
    var customer=existing;
    if(!customer){
      var id=idToken('cus_'),display=con.display_name||[con.first_name,con.middle_name,con.last_name].filter(Boolean).join(' ')||'Customer';
      var source={id:id,firstName:con.first_name||'',middleName:con.middle_name||'',lastName:con.last_name||'',name:display,phone:con.mobile||con.office_phone||'',email:con.email||'',address1:'',address2:'',city:'',state:'',postalCode:'',country:'US',notes:'Created from CRM opportunity '+o.id,companyId:o.company_id||null,primaryContactId:con.id};
      var row={organization_id:cloud.organizationId,id:id,first_name:con.first_name||null,middle_name:con.middle_name||null,last_name:con.last_name||null,display_name:display,phone:con.mobile||con.office_phone||null,email:con.email||null,country:'US',notes:'Created from CRM opportunity '+o.id,company_id:o.company_id||null,primary_contact_id:con.id,source_revision:Number(cloud.revision||0),source_json:source,last_synced_by:cloud.userId};
      var out=await cloud.client.from('customers').insert(row).select('*').single();if(out.error)throw out.error;customer=out.data;
    }
    await cloud.client.from('contacts').update({contact_type:'customer',updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',con.id);
    await cloud.client.from('opportunities').update({customer_id:customer.id,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',o.id);
    if(o.lead_id)await cloud.client.from('leads').update({customer_id:customer.id,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',o.lead_id);
    return customer;
  }
  async function updateQuoteStatus(quoteId,status){
    var cloud=window.TTTCloud,q=data.quotes.find(function(x){return x.id===quoteId;});if(!cloud?.ready||!q)return;
    var patch={status:status,updated_by:cloud.userId};var now=new Date().toISOString();
    if(status==='sent')patch.sent_at=now;
    if(status==='approved')patch.approved_at=now;
    if(status==='declined')patch.declined_at=now;
    try{
      if(status==='approved'){
        var o=data.opportunities.find(function(x){return x.id===q.opportunity_id;});
        var customer=await ensureCustomerForOpportunity(o);if(customer)patch.customer_id=customer.id;
        if(o)await cloud.client.from('opportunities').update({stage:'closed_won',probability_pct:100,customer_id:customer?.id||o.customer_id||null,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',o.id);
      }
      var out=await cloud.client.from('quotes').update(patch).eq('organization_id',cloud.organizationId).eq('id',quoteId);if(out.error)throw out.error;
      await cloud.audit?.('quote',quoteId,'quote_status_changed',{status:status});data.loaded=false;await load(true);toastSafe('Quote '+quoteId+' marked '+status+'.');
    }catch(err){console.error(err);toastSafe('Quote update failed: '+String(err.message||err));}
  }
  function openJobModal(opportunityId,quoteId){
    var o=data.opportunities.find(function(x){return x.id===opportunityId;}),q=data.quotes.find(function(x){return x.id===quoteId;});if(!o||!q)return;
    if(q.job_id){openJob(q.job_id);return;}
    if(String(q.status||'').toLowerCase()!=='approved')return toastSafe('Approve the quote before creating a job.');
    var vehicles=data.vehicles.filter(function(v){return o.customer_id&&v.customer_id===o.customer_id;}),vehicle=(o.metadata&&o.metadata.vehicle)||{};
    openCreateModal('Create job from approved quote',o.title,
      '<form id="crmJobForm"><div class="crm-detail-grid"><label>Existing vehicle<select name="vehicle_id"><option value="">Create / leave vehicle blank</option>'+vehicles.map(function(v){return '<option value="'+attr(v.id)+'">'+html([v.year,v.make,v.model,v.trim].filter(Boolean).join(' ')||v.vin||v.id)+'</option>';}).join('')+'</select></label><label>Preferred appointment<input name="appointment" type="datetime-local"></label><label>Year<input name="year" value="'+attr(vehicle.year||'')+'"></label><label>Make<input name="make" value="'+attr(vehicle.make||'')+'"></label><label>Model<input name="model" value="'+attr(vehicle.model||'')+'"></label><label>Trim<input name="trim"></label><label>VIN<input name="vin" maxlength="17" value="'+attr(vehicle.vin||'')+'"></label><label>Color<input name="color"></label><label>Vehicle type<input name="vehicle_type"></label><label>Plate<input name="plate"></label><label>Expected duration<select name="duration"><option>Same day</option><option>1 day</option><option>2–3 days</option><option>4–7 days</option><option>1–2 weeks</option><option>Custom / TBD</option></select></label><label>Parts readiness<select name="parts_status"><option>No special parts required</option><option>Need to confirm parts</option><option>Parts need ordering</option><option>Parts ordered</option><option>Parts received</option><option>Customer supplied</option></select></label><label class="crm-span-2">Job / scope notes<textarea name="notes">'+html(o.notes||'')+'</textarea></label></div><div class="crm-inline-actions top-gap"><button class="btn primary" type="submit">Create linked job</button></div></form>');
    document.getElementById('crmJobForm')?.addEventListener('submit',function(e){createJobFromOpportunity(e,opportunityId,quoteId);});
  }
  async function createJobFromOpportunity(ev,opportunityId,quoteId){
    ev.preventDefault();var cloud=window.TTTCloud,o=data.opportunities.find(function(x){return x.id===opportunityId;}),q=data.quotes.find(function(x){return x.id===quoteId;}),fd=new FormData(ev.currentTarget);if(!cloud?.ready||!o||!q)return;
    try{
      var customer=await ensureCustomerForOpportunity(o);if(!customer)throw new Error('A contact is required before a customer/job can be created.');
      var vehicleId=String(fd.get('vehicle_id')||'').trim()||null;
      if(!vehicleId){
        var year=String(fd.get('year')||'').trim(),make=String(fd.get('make')||'').trim(),model=String(fd.get('model')||'').trim(),vin=String(fd.get('vin')||'').trim().toUpperCase();
        if(year||make||model||vin){
          vehicleId=idToken('veh_');
          var vehicleSource={id:vehicleId,customerId:customer.id,vin:vin,year:year,make:make,model:model,trim:String(fd.get('trim')||'').trim(),color:String(fd.get('color')||'').trim(),wrap:'',type:String(fd.get('vehicle_type')||'').trim(),plate:String(fd.get('plate')||'').trim()};
          var vr=await cloud.client.from('vehicles').insert({organization_id:cloud.organizationId,id:vehicleId,customer_id:customer.id,vin:vin||null,year:year||null,make:make||null,model:model||null,trim:vehicleSource.trim||null,color:vehicleSource.color||null,vehicle_type:vehicleSource.type||null,plate:vehicleSource.plate||null,source_revision:Number(cloud.revision||0),source_json:vehicleSource,last_synced_by:cloud.userId}).select('*').single();
          if(vr.error)throw vr.error;
        }
      }
      var appointment=String(fd.get('appointment')||'').trim(),jid=jobId(),amount=Number(q.total||o.estimated_value||0),service=o.related_service||o.category||'Other',createdAt=new Date().toISOString(),status=appointment?'Scheduled':'Approved / Unscheduled';
      var jobSource={id:jid,estimateId:q.id,workOrderId:null,customerId:customer.id,vehicleId:vehicleId,services:[service],equipment:[],requestNotes:String(fd.get('notes')||'').trim()||o.notes||'',estimate:{parts:0,labor:amount,fees:0,deposit:Number(q.deposit_required||0)},estimateTotal:amount,status:status,appointment:appointment,partsStatus:String(fd.get('parts_status')||'No special parts required'),duration:String(fd.get('duration')||'Same day'),createdAt:createdAt,createdBy:null,audit:[{at:createdAt,actor:cloud.profile?.person_id||null,action:'job_created_from_crm'}],opportunityId:o.id,primaryQuoteId:q.id,primaryInvoiceId:null};
      var jr=await cloud.client.from('jobs').insert({organization_id:cloud.organizationId,id:jid,estimate_id:q.id,work_order_id:null,customer_id:customer.id,vehicle_id:vehicleId,status:status,appointment_local:appointment||null,appointment_timezone:'America/Chicago',parts_status:jobSource.partsStatus,duration:jobSource.duration,request_notes:jobSource.requestNotes,estimate:jobSource.estimate,estimate_total:amount,services:[service],equipment:[],legacy_audit:jobSource.audit,created_by_user_id:cloud.userId,source_revision:Number(cloud.revision||0),source_json:jobSource,last_synced_by:cloud.userId,opportunity_id:o.id,primary_quote_id:q.id}).select('*').single();
      if(jr.error)throw jr.error;
      await cloud.client.from('quotes').update({job_id:jid,customer_id:customer.id,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',q.id);
      await cloud.client.from('opportunities').update({stage:'closed_won',probability_pct:100,customer_id:customer.id,won_job_id:jid,updated_by:cloud.userId}).eq('organization_id',cloud.organizationId).eq('id',o.id);
      await cloud.audit?.('job',jid,'job_created_from_opportunity',{opportunity_id:o.id,quote_id:q.id,customer_id:customer.id});
      closeCreateModal();data.loaded=false;await load(true);toastSafe('Job '+jid+' created from '+q.id+'.');openCoreJobWhenReady(jid,0);
    }catch(err){console.error(err);toastSafe('Job creation failed: '+String(err.message||err));}
  }

  async function createLead(ev){
    ev.preventDefault();var cloud=window.TTTCloud;if(!cloud||!cloud.ready)return toastSafe('TTT Cloud is not ready.');
    var form=ev.currentTarget,fd=new FormData(form),org=cloud.organizationId,profile=cloud.profile||{},email=String(fd.get('email')||'').trim(),companyInput=String(fd.get('company')||'').trim(),refId=String(fd.get('referral_contact_id')||'').trim()||null;var submit=form.querySelector('button[type="submit"]');
    try{
      submit.disabled=true;submit.textContent='Creating…';var companyId=null;
      if(companyInput){var comp=activeCompanies().find(function(x){return String(x.name||'').trim().toLowerCase()===companyInput.toLowerCase();});if(!comp){var cr=await cloud.client.from('companies').insert({organization_id:org,name:companyInput,primary_type:'prospect',status:'active',owner_person_id:profile.person_id||null,source:'TTT-OS CRM',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();if(cr.error)throw cr.error;comp=cr.data;data.companies.push(comp);}companyId=comp.id;}
      var con=email?activeContacts().find(function(x){return String(x.email||'').trim().toLowerCase()===email.toLowerCase();}):null;
      if(!con){var first=String(fd.get('first_name')||'').trim(),last=String(fd.get('last_name')||'').trim();var co=await cloud.client.from('contacts').insert({organization_id:org,company_id:companyId,first_name:first,last_name:last,display_name:[first,last].filter(Boolean).join(' '),email:email||null,mobile:String(fd.get('mobile')||'').trim()||null,owner_person_id:profile.person_id||null,source:'TTT-OS CRM',contact_type:'prospect',relationship_strength:'New',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();if(co.error)throw co.error;con=co.data;data.contacts.push(con);}else if(companyId&&!con.company_id){var cu=await cloud.client.from('contacts').update({company_id:companyId,updated_by:cloud.userId}).eq('organization_id',org).eq('id',con.id).select('*').single();if(cu.error)throw cu.error;Object.assign(con,cu.data);}
      var ref=refId?contact(refId):null;
      var nextAt=String(fd.get('next_action_at')||'');
      var lr=await cloud.client.from('leads').insert({organization_id:org,company_id:companyId||con.company_id||null,contact_id:con.id,source:String(fd.get('source')||'Other'),source_detail:String(fd.get('source_detail')||'').trim()||null,campaign:String(fd.get('campaign')||'').trim()||null,status:'new',service_interest:String(fd.get('service_interest')||'').trim()||null,description:String(fd.get('description')||'').trim()||null,estimated_value:Number(fd.get('estimated_value')||0)||null,priority:String(fd.get('priority')||'medium'),owner_person_id:String(fd.get('owner_person_id')||'').trim()||profile.person_id||null,next_action:String(fd.get('next_action')||'').trim()||null,next_action_at:nextAt?new Date(nextAt).toISOString():null,referral_contact_id:refId,referral_company_id:ref?.company_id||null,referral_name:String(fd.get('referral_name')||'').trim()||null,utm_source:String(fd.get('utm_source')||'').trim()||null,utm_medium:String(fd.get('utm_medium')||'').trim()||null,utm_campaign:String(fd.get('utm_campaign')||'').trim()||null,utm_content:String(fd.get('utm_content')||'').trim()||null,utm_term:String(fd.get('utm_term')||'').trim()||null,created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
      if(lr.error)throw lr.error;if(cloud.audit)await cloud.audit('lead',lr.data.id,'lead_created',{source:lr.data.source,campaign:lr.data.campaign,referral_contact_id:lr.data.referral_contact_id,contact_id:lr.data.contact_id});form.reset();document.getElementById('crmLeadFormWrap')?.classList.remove('open');data.loaded=false;await load(true);toastSafe('Lead '+lr.data.id+' created');
    }catch(err){console.error('TTT CRM lead creation failed',err);toastSafe('Could not create lead: '+String(err.message||err));}
    finally{submit.disabled=false;submit.textContent='Create lead';}
  }

  function subscribeRealtime(){
    var cloud=window.TTTCloud;if(realtimeChannel||!cloud?.client||!cloud.organizationId)return;
    realtimeChannel=cloud.client.channel('ttt-crm-v16-'+cloud.organizationId);
    ['companies','contacts','leads','opportunities','activities','quotes','quote_lines','customers','vehicles','invoices','jobs','documents'].forEach(function(table){realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table:table,filter:'organization_id=eq.'+cloud.organizationId},function(){data.loaded=false;if(document.getElementById('crm')?.classList.contains('active'))load(true);});});
    realtimeChannel.subscribe();
  }

  function augmentJobOpportunityLink(){
    if(!data.loaded)return;
    var jobId=null;
    try{if(typeof currentJobId!=='undefined')jobId=currentJobId;else jobId=window.currentJobId||null;}catch(e){jobId=window.currentJobId||null;}
    if(!jobId)return;
    var j=data.jobs.find(function(x){return x.id===jobId;});
    if(!j||!j.opportunity_id)return;
    var o=data.opportunities.find(function(x){return x.id===j.opportunity_id;});
    var body=document.getElementById('jobDetailBody');
    if(!body||body.querySelector('[data-crm-job-opportunity]'))return;
    body.insertAdjacentHTML('afterbegin','<article class="panel detail-section" data-crm-job-opportunity><div class="panel-head"><div><p class="eyebrow">CRM OPPORTUNITY</p><h3>'+html(o?o.title:j.opportunity_id)+'</h3><p class="muted">'+html(o?(stageInfo(o.stage).label+' · '+cash(o.estimated_value)):'Linked opportunity')+'</p></div><button class="btn secondary" id="crmOpenJobOpportunity">Open Opportunity</button></div></article>');
    document.getElementById('crmOpenJobOpportunity')?.addEventListener('click',function(){show('crm');activateTab('opportunities');if(!data.loaded){load(true).then(function(){openDetail('opportunity',j.opportunity_id);});}else openDetail('opportunity',j.opportunity_id);});
  }

  function installJobOpportunityBridge(){
    if(typeof window.renderJobDetail!=='function'||window.renderJobDetail.__tttCrmV16Bridge)return;
    var original=window.renderJobDetail;
    var wrapped=function(){var result=original.apply(this,arguments);setTimeout(augmentJobOpportunityLink,0);return result;};
    wrapped.__tttCrmV16Bridge=true;
    window.renderJobDetail=wrapped;
  }

  function start(){inject();installJobOpportunityBridge();if(window.TTTCloud&&window.TTTCloud.ready)load().then(augmentJobOpportunityLink);}
  window.addEventListener('ttt:cloud-state-applied',function(){data.loaded=false;if(document.getElementById('crm')?.classList.contains('active'))load(true);});
  window.TTTCRM={load:function(){return load(true);},state:data,stages:STAGES,workbookUrl:WORKBOOK_URL,activateTab:activateTab,newLead:newLead,newContact:newContact,newCompany:newCompany,openLead:function(id){openDetail('lead',id);},openOpportunity:function(id){openDetail('opportunity',id);},openContact:function(id){openDetail('contact',id);},openCompany:function(id){openDetail('organization',id);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
