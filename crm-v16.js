// TTT OS CRM v1.6 — focused Supabase-native customer relationship management.
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
  var data={loaded:false,loading:false,companies:[],contacts:[],leads:[],opportunities:[],activities:[],quotes:[],invoices:[],jobs:[],documents:[]};
  var realtimeChannel=null;
  var selected={type:null,id:null};

  function html(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function attr(v){return html(v).replace(/`/g,'&#96;');}
  function cash(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));}
  function pct(v){return (Number(v||0)).toFixed(Number(v||0)%1?1:0)+'%';}
  function when(v){if(!v)return '—';var d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}
  function dateOnly(v){if(!v)return '—';var d=new Date(String(v).length===10?v+'T12:00:00':v);return isNaN(d.getTime())?'—':d.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});}
  function contact(id){return data.contacts.find(function(x){return x.id===id;})||null;}
  function contactName(id){var c=contact(id);return c?(c.display_name||[c.first_name,c.last_name].filter(Boolean).join(' ')):'—';}
  function company(id){return data.companies.find(function(x){return x.id===id;})||null;}
  function companyName(id){var c=company(id);return c?c.name:'—';}
  function stageInfo(stage){return STAGES[String(stage||'').toLowerCase()]||{label:String(stage||'Unspecified'),pct:0};}
  function openOpp(o){return !['closed_won','closed_loss'].includes(String(o.stage||'').toLowerCase());}
  function isOpenLead(l){return !['converted','lost'].includes(String(l.status||'').toLowerCase());}
  function sum(rows,key){return rows.reduce(function(s,x){return s+Number(x[key]||0);},0);}
  function toastSafe(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}

  function injectStyles(){
    if(document.getElementById('tttCrmStyles'))return;
    var s=document.createElement('style');s.id='tttCrmStyles';
    s.textContent=`
      .crm-toolbar,.crm-tabs,.crm-inline-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.crm-tabs{margin:16px 0}.crm-tab{border:1px solid #d7e0eb;background:#fff;color:#4b5d73;border-radius:999px;padding:8px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.crm-tab.active{background:#0b1220;color:#fff;border-color:#0b1220}.crm-pane{display:none}.crm-pane.active{display:block}
      .crm-form-wrap{display:none;margin-bottom:16px}.crm-form-wrap.open{display:block}.crm-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.crm-form-grid label,.crm-detail-grid label{font-size:12px;font-weight:700;color:#334155}.crm-form-grid input,.crm-form-grid select,.crm-form-grid textarea,.crm-detail-grid input,.crm-detail-grid select,.crm-detail-grid textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #d6deea;border-radius:9px;padding:10px;font:inherit;background:#fff}.crm-form-grid textarea,.crm-detail-grid textarea{min-height:80px;resize:vertical}.crm-span-2{grid-column:span 2}.crm-span-4{grid-column:span 4}.crm-empty{padding:24px;text-align:center;color:#64748b}.crm-row{cursor:pointer}.crm-row:hover{background:#f8fafc}.crm-row button,.crm-row select{cursor:pointer}
      .crm-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0}.crm-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px}.crm-kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.crm-kpi strong{display:block;font-size:21px;margin-top:4px}.crm-kpi small{color:#64748b}.crm-dashboard-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:14px}.crm-chart{display:grid;gap:10px}.crm-chart-row{display:grid;grid-template-columns:110px 1fr 88px;gap:10px;align-items:center;font-size:12px}.crm-chart-track{height:12px;background:#edf2f7;border-radius:999px;overflow:hidden}.crm-chart-bar{height:100%;background:#1d4ed8;border-radius:999px;min-width:2px}.crm-chart-label{font-weight:700;color:#334155}.crm-chart-value{text-align:right;color:#64748b}.crm-stage-pills{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.crm-stage-pill{border:1px solid #dfe6ef;background:#fff;border-radius:10px;padding:9px 11px;min-width:112px}.crm-stage-pill span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.crm-stage-pill strong{display:block;margin-top:2px}.crm-stage-pill small{color:#64748b}
      .crm-detail-backdrop{position:fixed;inset:0;background:rgba(5,12,24,.38);z-index:900;display:none}.crm-detail-backdrop.open{display:block}.crm-detail{position:fixed;top:0;right:0;bottom:0;width:min(760px,96vw);background:#f7f9fc;box-shadow:-18px 0 50px rgba(15,23,42,.2);z-index:901;transform:translateX(105%);transition:transform .18s ease;overflow:auto}.crm-detail.open{transform:translateX(0)}.crm-detail-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:18px 20px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.crm-detail-body{padding:16px 20px 28px;display:grid;gap:14px}.crm-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.crm-detail-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}.crm-detail-card h4{margin:0 0 10px}.crm-detail-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.crm-detail-meta div{padding:9px;background:#f8fafc;border-radius:9px}.crm-detail-meta small{display:block;color:#64748b}.crm-detail-meta strong{display:block;margin-top:2px}.crm-link-list{display:grid;gap:7px}.crm-link-item{border:1px solid #e5ebf3;border-radius:9px;padding:9px 10px;display:flex;justify-content:space-between;gap:10px;align-items:center}.crm-link-item small{display:block;color:#64748b;margin-top:2px}.crm-activity-form{display:grid;grid-template-columns:140px 1fr;gap:9px}.crm-activity-form textarea{grid-column:1/-1}.crm-activity-form button{justify-self:end;grid-column:1/-1}.crm-source-line{font-size:12px;color:#64748b}.crm-source-line b{color:#334155}.crm-mini-empty{color:#64748b;font-size:12px;padding:8px 0}.crm-primary-link{color:#1457a8;text-decoration:none;font-weight:700}.crm-primary-link:hover{text-decoration:underline}
      @media(max-width:1180px){.crm-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.crm-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.crm-span-4{grid-column:span 2}.crm-dashboard-grid{grid-template-columns:1fr}.crm-chart-row{grid-template-columns:95px 1fr 78px}}@media(max-width:620px){.crm-kpis,.crm-form-grid,.crm-detail-grid{grid-template-columns:1fr}.crm-span-2,.crm-span-4{grid-column:span 1}.crm-chart-row{grid-template-columns:82px 1fr 68px}.crm-detail{width:100vw}.crm-detail-meta{grid-template-columns:1fr}.crm-activity-form{grid-template-columns:1fr}.crm-activity-form textarea,.crm-activity-form button{grid-column:1}}
    `;
    document.head.appendChild(s);
  }

  function inject(){
    injectStyles();
    var nav=document.querySelector('.sidebar nav');
    if(nav){
      var existing=nav.querySelector('[data-view="crm"]');
      if(existing){existing.textContent='CRM';}
      else{
        var b=document.createElement('button');b.className='nav-item';b.dataset.view='crm';b.textContent='CRM';
        var jobs=nav.querySelector('[data-view="jobs"]');nav.insertBefore(b,jobs||nav.firstChild);
        b.addEventListener('click',function(){show('crm');load();});
      }
    }
    var main=document.querySelector('main.main');
    if(main&&!document.getElementById('crm')){
      var section=document.createElement('section');section.id='crm';section.className='view';
      section.innerHTML=
        '<div class="section-head"><div><p class="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</p><h2>CRM</h2><p class="muted">Leads, relationships, opportunities and customer correspondence. Supabase is the system of record; Google Workspace is the communication and document layer.</p></div>'+
        '<div class="crm-toolbar"><button class="btn secondary" id="crmRefreshBtn">Refresh</button><a class="btn secondary" href="'+WORKBOOK_URL+'" target="_blank" rel="noopener">Open Workspace mirror</a><button class="btn primary" id="crmNewLeadBtn">+ New lead</button></div></div>'+
        '<div class="workflow-note"><strong>Sales workflow:</strong> Lead → Qualified → Opportunity → Proposal / Quote → Closed Won → Job / Work Order. ERP remains separate and receives the downstream operational records.</div>'+
        '<div class="crm-form-wrap panel" id="crmLeadFormWrap"><div class="panel-head"><div><h3>Create lead</h3><p class="muted">Capture the person, organization, source attribution and sales context at the moment the lead enters TTT.</p></div><button class="link-btn" type="button" id="crmCancelLead">Cancel</button></div>'+leadFormHTML()+'</div>'+
        '<div class="crm-tabs"><button class="crm-tab active" data-crm-tab="dashboard">Dashboard</button><button class="crm-tab" data-crm-tab="leads">Leads</button><button class="crm-tab" data-crm-tab="opportunities">Opportunities</button><button class="crm-tab" data-crm-tab="contacts">Contacts</button><button class="crm-tab" data-crm-tab="organizations">Organizations</button><button class="crm-tab" data-crm-tab="activity">Activity</button></div>'+
        '<div id="crmLoading" class="panel crm-empty">Loading CRM data…</div>'+
        '<div id="crmBody" style="display:none">'+
          '<div class="crm-pane active" data-crm-pane="dashboard"><div id="crmDashboard"></div></div>'+
          '<div class="crm-pane" data-crm-pane="leads"><div id="crmLeads"></div></div>'+
          '<div class="crm-pane" data-crm-pane="opportunities"><div id="crmOpportunities"></div></div>'+
          '<div class="crm-pane" data-crm-pane="contacts"><div id="crmContacts"></div></div>'+
          '<div class="crm-pane" data-crm-pane="organizations"><div id="crmOrganizations"></div></div>'+
          '<div class="crm-pane" data-crm-pane="activity"><div id="crmActivity"></div></div>'+
        '</div>';
      var settings=document.getElementById('settings');main.insertBefore(section,settings||null);
    }
    if(!document.getElementById('crmDetailDrawer')){
      document.body.insertAdjacentHTML('beforeend','<div class="crm-detail-backdrop" id="crmDetailBackdrop"></div><aside class="crm-detail" id="crmDetailDrawer" aria-label="CRM record details"><div id="crmDetailContent"></div></aside>');
    }
    bind();
  }

  function leadFormHTML(){
    return '<form id="crmLeadForm"><div class="crm-form-grid">'+
      '<label>Organization<input name="company" placeholder="Optional company / dealership / fleet"></label>'+
      '<label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label><label>Email<input name="email" type="email"></label>'+
      '<label>Phone<input name="mobile"></label><label>Lead source<select name="source"><option>Website</option><option>Referral</option><option>Phone</option><option>Walk-in</option><option>Google</option><option>Social</option><option>Marketing Campaign</option><option>Vendor / Partner</option><option>Event</option><option>Other</option></select></label>'+
      '<label>Source detail<input name="source_detail" placeholder="e.g. Google Maps, Facebook, Cars & Coffee"></label><label>Campaign<input name="campaign" placeholder="Campaign / promotion name"></label>'+
      '<label>Referred by<select name="referral_contact_id" id="crmReferralContact"><option value="">No linked referrer</option></select></label><label>Referrer / partner name<input name="referral_name" placeholder="Use if not already a contact"></label>'+
      '<label>Service interest<input name="service_interest" placeholder="Window tint, audio, SignalTrace…"></label><label>Estimated value<input name="estimated_value" type="number" min="0" step="0.01"></label>'+
      '<label>Priority<select name="priority"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></label><label>Next action<input name="next_action" placeholder="Call, site visit, send options…"></label>'+
      '<label>Next action date<input name="next_action_at" type="datetime-local"></label><label>UTM source<input name="utm_source" placeholder="google, facebook, newsletter…"></label><label>UTM medium<input name="utm_medium" placeholder="cpc, organic, email…"></label><label>UTM campaign<input name="utm_campaign"></label>'+
      '<label>UTM content<input name="utm_content"></label><label>UTM term<input name="utm_term"></label><label class="crm-span-2">Notes<textarea name="description"></textarea></label>'+
    '</div><div class="top-gap"><button class="btn primary" type="submit">Create lead</button></div></form>';
  }

  function bind(){
    document.getElementById('crmRefreshBtn')?.addEventListener('click',function(){load(true);});
    document.getElementById('crmNewLeadBtn')?.addEventListener('click',function(){document.getElementById('crmLeadFormWrap')?.classList.add('open');refreshLeadFormOptions();});
    document.getElementById('crmCancelLead')?.addEventListener('click',function(){document.getElementById('crmLeadFormWrap')?.classList.remove('open');});
    document.querySelectorAll('[data-crm-tab]').forEach(function(btn){btn.addEventListener('click',function(){activateTab(btn.dataset.crmTab);});});
    document.getElementById('crmLeadForm')?.addEventListener('submit',createLead);
    document.getElementById('crmDetailBackdrop')?.addEventListener('click',closeDetail);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDetail();});
  }

  function activateTab(name){
    document.querySelectorAll('[data-crm-tab]').forEach(function(x){x.classList.toggle('active',x.dataset.crmTab===name);});
    document.querySelectorAll('[data-crm-pane]').forEach(function(x){x.classList.toggle('active',x.dataset.crmPane===name);});
  }

  async function load(force){
    var cloud=window.TTTCloud;
    if(!cloud||!cloud.ready||!cloud.client||!cloud.organizationId){var wait=document.getElementById('crmLoading');if(wait)wait.textContent='Sign in to TTT OS and wait for the shared cloud database to finish loading.';return;}
    if(data.loading)return;if(data.loaded&&!force){render();return;}data.loading=true;
    var loading=document.getElementById('crmLoading');if(loading){loading.style.display='block';loading.textContent='Loading CRM data…';}var body=document.getElementById('crmBody');if(body)body.style.display='none';
    var org=cloud.organizationId;
    var specs=[
      ['companies','id,name,primary_type,status,website,main_phone,general_email,address1,address2,city,state,postal_code,country,territory,owner_person_id,source,notes,updated_at'],
      ['contacts','id,company_id,display_name,first_name,middle_name,last_name,title,role_type,mobile,office_phone,email,linkedin,preferred_contact_method,relationship_strength,source,last_interaction_at,next_action,next_action_at,notes,updated_at'],
      ['leads','id,company_id,contact_id,customer_id,source,source_detail,campaign,status,service_interest,description,estimated_value,priority,owner_person_id,first_contact_at,last_contact_at,next_action,next_action_at,converted_at,lost_reason,referral_contact_id,referral_company_id,referral_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at,updated_at'],
      ['opportunities','id,lead_id,company_id,contact_id,customer_id,title,opportunity_type,category,stage,priority,estimated_value,probability_pct,expected_close_date,next_step,next_step_date,owner_person_id,source,source_evidence_url,related_service,won_job_id,lost_reason,notes,created_at,updated_at'],
      ['activities','id,activity_type,direction,status,subject,summary,company_id,contact_id,lead_id,opportunity_id,customer_id,job_id,owner_person_id,occurred_at,due_at,gmail_message_id,gmail_thread_id,calendar_event_id,source_url,metadata,updated_at'],
      ['quotes','id,opportunity_id,customer_id,company_id,contact_id,job_id,status,quote_date,expires_at,total,deposit_required,google_doc_url,pdf_drive_file_id,sent_at,approved_at,declined_at,updated_at'],
      ['invoices','id,quote_id,customer_id,company_id,contact_id,job_id,status,invoice_date,due_date,total,amount_paid,balance_due,paid_at,updated_at'],
      ['jobs','id,work_order_id,customer_id,vehicle_id,status,appointment_local,estimate_total,opportunity_id,primary_quote_id,primary_invoice_id,updated_at'],
      ['documents','id,company_id,contact_id,customer_id,job_id,quote_id,invoice_id,document_type,title,document_date,drive_url,mime_type,confidentiality,notes,updated_at']
    ];
    try{
      var results=await Promise.all(specs.map(function(spec){return cloud.client.from(spec[0]).select(spec[1]).eq('organization_id',org).is('archived_at',null);}));
      for(var i=0;i<results.length;i++){if(results[i].error)throw new Error(specs[i][0]+': '+results[i].error.message);data[specs[i][0]]=results[i].data||[];}
      data.loaded=true;render();if(loading)loading.style.display='none';if(body)body.style.display='block';
    }catch(err){console.error('TTT CRM load failed',err);if(loading){loading.style.display='block';loading.textContent='CRM could not load: '+String(err.message||err);}if(body)body.style.display='none';}
    finally{data.loading=false;}
  }

  function render(){
    renderDashboard();renderLeads();renderOpportunities();renderContacts();renderOrganizations();renderActivity();refreshLeadFormOptions();bindRows();subscribeRealtime();
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
    var rows=data.leads.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(l){var ref=l.referral_contact_id?contactName(l.referral_contact_id):(l.referral_name||'—');return '<tr class="crm-row" data-crm-record="lead" data-crm-id="'+attr(l.id)+'"><td><strong>'+html(contactName(l.contact_id))+'</strong><br><small>'+html(l.id)+'</small></td><td>'+html(companyName(l.company_id))+'</td><td><span class="badge">'+html(l.status||'new')+'</span></td><td>'+html(l.source||'—')+(l.campaign?'<br><small>'+html(l.campaign)+'</small>':'')+'</td><td>'+html(ref)+'</td><td>'+html(l.service_interest||'—')+'</td><td>'+cash(l.estimated_value)+'</td><td>'+html(l.next_action||'—')+'</td></tr>';}).join('');
    document.getElementById('crmLeads').innerHTML='<div class="panel"><div class="panel-head"><div><h3>Lead register</h3><p class="muted">Click a lead to review attribution, qualification and correspondence.</p></div><span class="badge">'+data.leads.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Organization</th><th>Status</th><th>Source / Campaign</th><th>Referral</th><th>Interest</th><th>Value</th><th>Next action</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No leads yet. Create the first lead above.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderOpportunities(){
    var pills=STAGE_ORDER.map(function(stage){var rows=data.opportunities.filter(function(o){return String(o.stage||'').toLowerCase()===stage;});return '<div class="crm-stage-pill"><span>'+html(STAGES[stage].label)+' · '+STAGES[stage].pct+'%</span><strong>'+rows.length+'</strong><small>'+cash(sum(rows,'estimated_value'))+'</small></div>';}).join('');
    var rows=data.opportunities.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(o){var st=stageInfo(o.stage);return '<tr class="crm-row" data-crm-record="opportunity" data-crm-id="'+attr(o.id)+'"><td><strong>'+html(o.title)+'</strong><br><small>'+html(o.id)+'</small></td><td>'+html(companyName(o.company_id))+'</td><td>'+html(contactName(o.contact_id))+'</td><td><span class="badge">'+html(st.label)+'</span></td><td>'+cash(o.estimated_value)+'</td><td>'+pct(o.probability_pct==null?st.pct:o.probability_pct)+'</td><td>'+cash(Number(o.estimated_value||0)*Number(o.probability_pct==null?st.pct:o.probability_pct)/100)+'</td><td>'+html(o.next_step||'—')+'</td></tr>';}).join('');
    document.getElementById('crmOpportunities').innerHTML='<div class="crm-stage-pills">'+pills+'</div><div class="panel"><div class="panel-head"><div><h3>Opportunities</h3><p class="muted">Click an opportunity for stage, activities, quotes, invoices and linked work.</p></div><span class="badge">'+data.opportunities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Organization</th><th>Contact</th><th>Stage</th><th>Value</th><th>Probability</th><th>Weighted</th><th>Next step</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No opportunities yet. Qualify and convert a lead to begin.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderContacts(){
    var rows=data.contacts.slice().sort(function(a,b){return contactName(a.id).localeCompare(contactName(b.id));}).map(function(c){var leadCount=data.leads.filter(function(l){return l.contact_id===c.id;}).length,oppCount=data.opportunities.filter(function(o){return o.contact_id===c.id;}).length;return '<tr class="crm-row" data-crm-record="contact" data-crm-id="'+attr(c.id)+'"><td><strong>'+html(contactName(c.id))+'</strong><br><small>'+html(c.title||c.role_type||'')+'</small></td><td>'+html(companyName(c.company_id))+'</td><td>'+html(c.email||'—')+'</td><td>'+html(c.mobile||c.office_phone||'—')+'</td><td>'+html(c.relationship_strength||'—')+'</td><td>'+leadCount+'</td><td>'+oppCount+'</td><td>'+html(c.next_action||'—')+'</td></tr>';}).join('');
    document.getElementById('crmContacts').innerHTML='<div class="panel"><div class="panel-head"><div><h3>Contacts</h3><p class="muted">People are independent records and may be linked to an organization.</p></div><span class="badge">'+data.contacts.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Organization</th><th>Email</th><th>Phone</th><th>Relationship</th><th>Leads</th><th>Opportunities</th><th>Next action</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No contacts yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderOrganizations(){
    var rows=data.companies.slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).map(function(c){var contacts=data.contacts.filter(function(x){return x.company_id===c.id;});var opps=data.opportunities.filter(function(x){return x.company_id===c.id;});return '<tr class="crm-row" data-crm-record="organization" data-crm-id="'+attr(c.id)+'"><td><strong>'+html(c.name)+'</strong><br><small>'+html(c.id)+'</small></td><td>'+html(c.primary_type||'—')+'</td><td>'+html(c.status||'—')+'</td><td>'+contacts.length+'</td><td>'+opps.length+'</td><td>'+cash(sum(opps,'estimated_value'))+'</td><td>'+html(c.main_phone||c.general_email||'—')+'</td><td>'+html([c.city,c.state].filter(Boolean).join(', ')||'—')+'</td></tr>';}).join('');
    document.getElementById('crmOrganizations').innerHTML='<div class="panel"><div class="panel-head"><div><h3>Organizations</h3><p class="muted">Companies, dealerships, fleets, partners and other account-level relationships.</p></div><span class="badge">'+data.companies.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Organization</th><th>Type</th><th>Status</th><th>Contacts</th><th>Opportunities</th><th>Pipeline</th><th>Primary contact</th><th>Location</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="crm-empty">No organizations yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderActivity(){
    var rows=data.activities.slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,100).map(function(a){var regarding=a.opportunity_id||a.lead_id||a.job_id||'—';return '<tr><td>'+when(a.occurred_at)+'</td><td><span class="badge">'+html(a.activity_type)+'</span></td><td>'+html(a.direction||'—')+'</td><td><strong>'+html(a.subject||'—')+'</strong><br><small>'+html(a.summary||'')+'</small></td><td>'+html(contactName(a.contact_id))+'</td><td>'+html(regarding)+'</td></tr>';}).join('');
    document.getElementById('crmActivity').innerHTML='<div class="panel"><div class="panel-head"><div><h3>CRM activity</h3><p class="muted">Calls, emails, meetings, notes and correspondence linked to CRM records.</p></div><span class="badge">'+data.activities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Direction</th><th>Activity</th><th>Contact</th><th>Regarding</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="crm-empty">No activity logged yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function bindRows(){
    document.querySelectorAll('[data-crm-record]').forEach(function(row){row.onclick=function(e){if(e.target.closest('button,select,input,a,textarea'))return;openDetail(row.dataset.crmRecord,row.dataset.crmId);};});
  }

  function refreshLeadFormOptions(){
    var sel=document.getElementById('crmReferralContact');if(!sel)return;var current=sel.value;
    sel.innerHTML='<option value="">No linked referrer</option>'+data.contacts.slice().sort(function(a,b){return contactName(a.id).localeCompare(contactName(b.id));}).map(function(c){return '<option value="'+attr(c.id)+'">'+html(contactName(c.id))+(c.company_id?' — '+html(companyName(c.company_id)):'')+'</option>';}).join('');
    if(current&&data.contacts.some(function(c){return c.id===current;}))sel.value=current;
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
    var c=contact(l.contact_id),ref=l.referral_contact_id?contactName(l.referral_contact_id):(l.referral_name||'—'),acts=activitiesFor('lead_id',id);
    var opp=data.opportunities.find(function(o){return o.lead_id===id;});var status=String(l.status||'new').toLowerCase();
    var utm=[l.utm_source&&('source='+l.utm_source),l.utm_medium&&('medium='+l.utm_medium),l.utm_campaign&&('campaign='+l.utm_campaign),l.utm_content&&('content='+l.utm_content),l.utm_term&&('term='+l.utm_term)].filter(Boolean).join(' · ')||'—';
    return detailHead('LEAD',contactName(l.contact_id),companyName(l.company_id))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Qualification</h4><span class="badge">'+html(status)+'</span></div><div class="crm-detail-meta">'+meta('Lead ID',l.id)+meta('Estimated value',cash(l.estimated_value))+meta('Service interest',l.service_interest)+meta('Priority',l.priority)+meta('Created',when(l.created_at))+meta('Next action',l.next_action)+(l.next_action_at?meta('Next action due',when(l.next_action_at)):'')+'</div><div class="crm-inline-actions top-gap">'+
      (status!=='qualified'&&status!=='converted'?'<button class="btn secondary" id="crmQualifyLead">Mark qualified</button>':'')+
      (status==='qualified'?'<button class="btn primary" id="crmConvertLead">Convert to opportunity</button>':'')+
      (status!=='converted'?'<button class="btn secondary" id="crmNurtureLead">Move to nurture</button>':'')+
      (opp?'<button class="btn secondary" data-open-opportunity="'+attr(opp.id)+'">Open '+html(opp.id)+'</button>':'')+'</div></article>'+
      '<article class="crm-detail-card"><h4>Lead attribution</h4><div class="crm-detail-meta">'+meta('Source',l.source)+meta('Source detail',l.source_detail)+meta('Campaign',l.campaign)+meta('Referred by',ref)+meta('Referral organization',companyName(l.referral_company_id)) + meta('UTM',utm)+'</div></article>'+
      '<article class="crm-detail-card"><h4>Contact</h4><div class="crm-detail-meta">'+meta('Name',contactName(l.contact_id))+meta('Email',c?.email)+meta('Phone',c?.mobile||c?.office_phone)+meta('Organization',companyName(l.company_id))+'</div></article>'+
      '<article class="crm-detail-card"><h4>Notes</h4><p class="muted" style="white-space:pre-wrap">'+html(l.description||'No notes yet.')+'</p></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Activities & correspondence</h4><span class="badge">'+acts.length+'</span></div><div class="crm-link-list">'+(acts.map(activityMini).join('')||'<div class="crm-mini-empty">No activity logged for this lead.</div>')+'</div><div class="top-gap">'+activityFormHTML()+'</div></article>'+
    '</div>';
  }

  function opportunityRelations(o){
    var quotes=data.quotes.filter(function(q){return q.opportunity_id===o.id;});
    var jobs=data.jobs.filter(function(j){return j.opportunity_id===o.id||j.id===o.won_job_id;});
    var quoteIds=quotes.map(function(q){return q.id;}),jobIds=jobs.map(function(j){return j.id;});
    var invoices=data.invoices.filter(function(i){return jobIds.includes(i.job_id)||quoteIds.includes(i.quote_id);});
    var invoiceIds=invoices.map(function(i){return i.id;});
    var docs=data.documents.filter(function(d){return jobIds.includes(d.job_id)||quoteIds.includes(d.quote_id)||invoiceIds.includes(d.invoice_id);});
    return {quotes:quotes,jobs:jobs,invoices:invoices,documents:docs};
  }

  function opportunityDetail(id){
    var o=data.opportunities.find(function(x){return x.id===id;});if(!o)return detailHead('OPPORTUNITY','Opportunity not found','The record may have been archived.');
    var st=stageInfo(o.stage),acts=activitiesFor('opportunity_id',id),rels=opportunityRelations(o),weighted=Number(o.estimated_value||0)*Number(o.probability_pct==null?st.pct:o.probability_pct)/100;
    return detailHead('OPPORTUNITY',o.title,companyName(o.company_id)+' · '+contactName(o.contact_id))+'<div class="crm-detail-body">'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Opportunity</h4><span class="badge">'+html(st.label)+' · '+pct(o.probability_pct==null?st.pct:o.probability_pct)+'</span></div><div class="crm-detail-grid"><label>Stage<select id="crmOpportunityStage">'+STAGE_ORDER.map(function(k){return '<option value="'+k+'" '+(k===String(o.stage||'').toLowerCase()?'selected':'')+'>'+html(STAGES[k].label)+' ('+STAGES[k].pct+'%)</option>';}).join('')+'</select></label><label>Expected close<input id="crmOppClose" type="date" value="'+attr(o.expected_close_date||'')+'"></label><label>Next step<input id="crmOppNextStep" value="'+attr(o.next_step||'')+'"></label><label>Next step date<input id="crmOppNextDate" type="date" value="'+attr(o.next_step_date||'')+'"></label></div><div class="crm-detail-meta top-gap">'+meta('Opportunity ID',o.id)+meta('Estimated value',cash(o.estimated_value))+meta('Weighted value',cash(weighted))+meta('Related service',o.related_service||o.category)+meta('Source',o.source)+meta('Created',when(o.created_at))+'</div><div class="crm-inline-actions top-gap"><button class="btn primary" id="crmSaveOpportunity">Save opportunity</button></div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Activities & correspondence</h4><span class="badge">'+acts.length+'</span></div><div class="crm-link-list">'+(acts.map(activityMini).join('')||'<div class="crm-mini-empty">No activity logged for this opportunity.</div>')+'</div><div class="top-gap">'+activityFormHTML()+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Quotes</h4><span class="badge">'+rels.quotes.length+'</span></div><div class="crm-link-list">'+(rels.quotes.map(quoteMini).join('')||'<div class="crm-mini-empty">No quotations linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Jobs / Work Orders</h4><span class="badge">'+rels.jobs.length+'</span></div><div class="crm-link-list">'+(rels.jobs.map(jobMini).join('')||'<div class="crm-mini-empty">No jobs or work orders linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Invoices</h4><span class="badge">'+rels.invoices.length+'</span></div><div class="crm-link-list">'+(rels.invoices.map(invoiceMini).join('')||'<div class="crm-mini-empty">No invoices linked yet.</div>')+'</div></article>'+
      '<article class="crm-detail-card"><div class="panel-head"><h4>Documents</h4><span class="badge">'+rels.documents.length+'</span></div><div class="crm-link-list">'+(rels.documents.map(documentMini).join('')||'<div class="crm-mini-empty">No related documents yet.</div>')+'</div></article>'+
    '</div>';
  }

  function quoteMini(q){return '<div class="crm-link-item"><div><strong>'+html(q.id)+'</strong><small>'+html(q.status)+' · '+dateOnly(q.quote_date)+'</small></div><div>'+cash(q.total)+(q.google_doc_url?' · <a class="crm-primary-link" target="_blank" rel="noopener" href="'+attr(q.google_doc_url)+'">Open</a>':'')+'</div></div>';}
  function invoiceMini(i){var bal=i.balance_due==null?Number(i.total||0)-Number(i.amount_paid||0):Number(i.balance_due||0);return '<div class="crm-link-item"><div><strong>'+html(i.id)+'</strong><small>'+html(i.status)+' · Due '+dateOnly(i.due_date)+'</small></div><div>'+cash(i.total)+' · '+cash(bal)+' due</div></div>';}
  function jobMini(j){return '<div class="crm-link-item"><div><strong>'+html(j.work_order_id||j.id)+'</strong><small>'+html(j.status||'Job')+' · '+(j.appointment_local?when(j.appointment_local):'No appointment')+'</small></div><button class="btn secondary compact" data-open-job="'+attr(j.id)+'">Open Job</button></div>';}
  function documentMini(d){return '<div class="crm-link-item"><div><strong>'+html(d.title)+'</strong><small>'+html(d.document_type||'Document')+' · '+dateOnly(d.document_date)+'</small></div>'+(d.drive_url?'<a class="crm-primary-link" target="_blank" rel="noopener" href="'+attr(d.drive_url)+'">Open</a>':'<span class="badge">Linked</span>')+'</div>';}

  function contactDetail(id){
    var c=contact(id);if(!c)return detailHead('CONTACT','Contact not found','');var leads=data.leads.filter(function(l){return l.contact_id===id;}),opps=data.opportunities.filter(function(o){return o.contact_id===id;}),acts=data.activities.filter(function(a){return a.contact_id===id;}).sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);});
    return detailHead('CONTACT',contactName(id),companyName(c.company_id))+'<div class="crm-detail-body"><article class="crm-detail-card"><h4>Contact details</h4><div class="crm-detail-meta">'+meta('Email',c.email)+meta('Mobile',c.mobile)+meta('Office phone',c.office_phone)+meta('Title',c.title||c.role_type)+meta('Preferred contact',c.preferred_contact_method)+meta('Relationship',c.relationship_strength)+meta('Last interaction',when(c.last_interaction_at))+meta('Next action',c.next_action)+'</div></article><article class="crm-detail-card"><h4>CRM relationships</h4><div class="crm-detail-meta">'+meta('Leads',leads.length)+meta('Opportunities',opps.length)+meta('Activities',acts.length)+meta('Organization',companyName(c.company_id))+'</div></article><article class="crm-detail-card"><h4>Recent activity</h4><div class="crm-link-list">'+(acts.slice(0,20).map(activityMini).join('')||'<div class="crm-mini-empty">No activity yet.</div>')+'</div></article></div>';
  }

  function organizationDetail(id){
    var c=company(id);if(!c)return detailHead('ORGANIZATION','Organization not found','');var contacts=data.contacts.filter(function(x){return x.company_id===id;}),leads=data.leads.filter(function(x){return x.company_id===id;}),opps=data.opportunities.filter(function(x){return x.company_id===id;});
    return detailHead('ORGANIZATION',c.name,[c.city,c.state].filter(Boolean).join(', '))+'<div class="crm-detail-body"><article class="crm-detail-card"><h4>Organization details</h4><div class="crm-detail-meta">'+meta('Type',c.primary_type)+meta('Status',c.status)+meta('Phone',c.main_phone)+meta('Email',c.general_email)+meta('Website',c.website)+meta('Territory',c.territory)+meta('Source',c.source)+meta('Pipeline',cash(sum(opps,'estimated_value')))+'</div></article><article class="crm-detail-card"><div class="panel-head"><h4>Contacts</h4><span class="badge">'+contacts.length+'</span></div><div class="crm-link-list">'+(contacts.map(function(x){return '<div class="crm-link-item"><div><strong>'+html(contactName(x.id))+'</strong><small>'+html(x.title||x.email||'')+'</small></div><button class="btn secondary compact" data-open-contact="'+attr(x.id)+'">Open</button></div>';}).join('')||'<div class="crm-mini-empty">No contacts linked.</div>')+'</div></article><article class="crm-detail-card"><h4>CRM summary</h4><div class="crm-detail-meta">'+meta('Leads',leads.length)+meta('Opportunities',opps.length)+meta('Open pipeline',cash(sum(opps.filter(openOpp),'estimated_value')))+meta('Closed won',opps.filter(function(o){return o.stage==='closed_won';}).length)+'</div></article></div>';
  }

  function bindDetailActions(type,id){
    document.getElementById('crmCloseDetail')?.addEventListener('click',closeDetail);
    document.getElementById('crmQualifyLead')?.addEventListener('click',function(){updateLeadStatus(id,'qualified');});
    document.getElementById('crmNurtureLead')?.addEventListener('click',function(){updateLeadStatus(id,'nurture');});
    document.getElementById('crmConvertLead')?.addEventListener('click',function(){convertLead(id);});
    document.querySelectorAll('[data-open-opportunity]').forEach(function(b){b.onclick=function(){openDetail('opportunity',b.dataset.openOpportunity);};});
    document.querySelectorAll('[data-open-contact]').forEach(function(b){b.onclick=function(){openDetail('contact',b.dataset.openContact);};});
    document.querySelectorAll('[data-open-job]').forEach(function(b){b.onclick=function(){openJob(b.dataset.openJob);};});
    document.getElementById('crmSaveOpportunity')?.addEventListener('click',function(){saveOpportunity(id);});
    document.getElementById('crmActivityForm')?.addEventListener('submit',function(e){logActivity(e,type,id);});
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

  async function saveOpportunity(id){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;var stage=document.getElementById('crmOpportunityStage')?.value||'prospecting',info=stageInfo(stage);var patch={stage:stage,probability_pct:info.pct,expected_close_date:document.getElementById('crmOppClose')?.value||null,next_step:document.getElementById('crmOppNextStep')?.value.trim()||null,next_step_date:document.getElementById('crmOppNextDate')?.value||null,updated_by:cloud.userId};
    var out=await cloud.client.from('opportunities').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);if(out.error)return toastSafe('Opportunity update failed: '+out.error.message);await cloud.audit?.('opportunity',id,'opportunity_updated',{stage:stage,probability_pct:info.pct});data.loaded=false;await load(true);toastSafe('Opportunity updated.');
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

  async function createLead(ev){
    ev.preventDefault();var cloud=window.TTTCloud;if(!cloud||!cloud.ready)return toastSafe('TTT Cloud is not ready.');
    var form=ev.currentTarget,fd=new FormData(form),org=cloud.organizationId,profile=cloud.profile||{},email=String(fd.get('email')||'').trim(),companyInput=String(fd.get('company')||'').trim(),refId=String(fd.get('referral_contact_id')||'').trim()||null;var submit=form.querySelector('button[type="submit"]');
    try{
      submit.disabled=true;submit.textContent='Creating…';var companyId=null;
      if(companyInput){var comp=data.companies.find(function(x){return String(x.name||'').trim().toLowerCase()===companyInput.toLowerCase();});if(!comp){var cr=await cloud.client.from('companies').insert({organization_id:org,name:companyInput,primary_type:'prospect',status:'active',owner_person_id:profile.person_id||null,source:'TTT-OS CRM',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();if(cr.error)throw cr.error;comp=cr.data;data.companies.push(comp);}companyId=comp.id;}
      var con=email?data.contacts.find(function(x){return String(x.email||'').trim().toLowerCase()===email.toLowerCase();}):null;
      if(!con){var first=String(fd.get('first_name')||'').trim(),last=String(fd.get('last_name')||'').trim();var co=await cloud.client.from('contacts').insert({organization_id:org,company_id:companyId,first_name:first,last_name:last,display_name:[first,last].filter(Boolean).join(' '),email:email||null,mobile:String(fd.get('mobile')||'').trim()||null,owner_person_id:profile.person_id||null,source:'TTT-OS CRM',relationship_strength:'New',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();if(co.error)throw co.error;con=co.data;data.contacts.push(con);}else if(companyId&&!con.company_id){var cu=await cloud.client.from('contacts').update({company_id:companyId,updated_by:cloud.userId}).eq('organization_id',org).eq('id',con.id).select('*').single();if(cu.error)throw cu.error;Object.assign(con,cu.data);}
      var ref=refId?contact(refId):null;
      var nextAt=String(fd.get('next_action_at')||'');
      var lr=await cloud.client.from('leads').insert({organization_id:org,company_id:companyId||con.company_id||null,contact_id:con.id,source:String(fd.get('source')||'Other'),source_detail:String(fd.get('source_detail')||'').trim()||null,campaign:String(fd.get('campaign')||'').trim()||null,status:'new',service_interest:String(fd.get('service_interest')||'').trim()||null,description:String(fd.get('description')||'').trim()||null,estimated_value:Number(fd.get('estimated_value')||0)||null,priority:String(fd.get('priority')||'medium'),owner_person_id:profile.person_id||null,next_action:String(fd.get('next_action')||'').trim()||null,next_action_at:nextAt?new Date(nextAt).toISOString():null,referral_contact_id:refId,referral_company_id:ref?.company_id||null,referral_name:String(fd.get('referral_name')||'').trim()||null,utm_source:String(fd.get('utm_source')||'').trim()||null,utm_medium:String(fd.get('utm_medium')||'').trim()||null,utm_campaign:String(fd.get('utm_campaign')||'').trim()||null,utm_content:String(fd.get('utm_content')||'').trim()||null,utm_term:String(fd.get('utm_term')||'').trim()||null,created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
      if(lr.error)throw lr.error;if(cloud.audit)await cloud.audit('lead',lr.data.id,'lead_created',{source:lr.data.source,campaign:lr.data.campaign,referral_contact_id:lr.data.referral_contact_id,contact_id:lr.data.contact_id});form.reset();document.getElementById('crmLeadFormWrap')?.classList.remove('open');data.loaded=false;await load(true);toastSafe('Lead '+lr.data.id+' created');
    }catch(err){console.error('TTT CRM lead creation failed',err);toastSafe('Could not create lead: '+String(err.message||err));}
    finally{submit.disabled=false;submit.textContent='Create lead';}
  }

  function subscribeRealtime(){
    var cloud=window.TTTCloud;if(realtimeChannel||!cloud?.client||!cloud.organizationId)return;
    realtimeChannel=cloud.client.channel('ttt-crm-v16-'+cloud.organizationId);
    ['companies','contacts','leads','opportunities','activities','quotes','invoices','jobs','documents'].forEach(function(table){realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table:table,filter:'organization_id=eq.'+cloud.organizationId},function(){data.loaded=false;if(document.getElementById('crm')?.classList.contains('active'))load(true);});});
    realtimeChannel.subscribe();
  }

  function start(){inject();if(window.TTTCloud&&window.TTTCloud.ready)load();}
  window.addEventListener('ttt:cloud-state-applied',function(){data.loaded=false;if(document.getElementById('crm')?.classList.contains('active'))load(true);});
  window.TTTCRM={load:function(){return load(true);},state:data,stages:STAGES,workbookUrl:WORKBOOK_URL,openLead:function(id){openDetail('lead',id);},openOpportunity:function(id){openDetail('opportunity',id);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
