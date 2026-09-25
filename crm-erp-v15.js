// TTT OS CRM/ERP v1.5 — Supabase-native sales and operations cockpit
(function(){
  'use strict';
  var WORKBOOK_URL='https://docs.google.com/spreadsheets/d/1N67KaF8q-0FnVaYN41zI5lTVlUoj06pHNAuF1TQrJ8I/edit';
  var data={loaded:false,loading:false,companies:[],contacts:[],leads:[],opportunities:[],activities:[],quotes:[],invoices:[],vendors:[],appointments:[]};
  var realtimeChannel=null;
  var STAGES=['identified','researching','contacted','evaluating','quoted','negotiating','won','lost'];

  function html(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function cash(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));}
  function when(v){if(!v)return '—';var d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}
  function contactName(id){var c=data.contacts.find(function(x){return x.id===id;});return c?(c.display_name||[c.first_name,c.last_name].filter(Boolean).join(' ')):'—';}
  function companyName(id){var c=data.companies.find(function(x){return x.id===id;});return c?c.name:'—';}

  function injectStyles(){
    if(document.getElementById('tttCrmStyles'))return;
    var s=document.createElement('style');s.id='tttCrmStyles';
    s.textContent='.crm-toolbar,.crm-tabs{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.crm-tabs{margin:16px 0}.crm-tab{border:1px solid #d7e0eb;background:#fff;color:#4b5d73;border-radius:999px;padding:8px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.crm-tab.active{background:#0b1220;color:#fff;border-color:#0b1220}.crm-pane{display:none}.crm-pane.active{display:block}.crm-stage-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.crm-stage{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px}.crm-stage span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.crm-stage strong{display:block;font-size:21px;margin-top:4px}.crm-stage small{color:#64748b}.crm-form-wrap{display:none;margin-bottom:16px}.crm-form-wrap.open{display:block}.crm-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.crm-form-grid label{font-size:12px;font-weight:700;color:#334155}.crm-form-grid input,.crm-form-grid select,.crm-form-grid textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #d6deea;border-radius:9px;padding:10px;font:inherit;background:#fff}.crm-form-grid textarea{min-height:80px;resize:vertical}.crm-span-2{grid-column:span 2}.crm-empty{padding:24px;text-align:center;color:#64748b}.crm-mini-list{display:grid;gap:8px}.crm-mini-row{border:1px solid #e5ebf3;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;gap:12px}.crm-mini-row small{display:block;color:#64748b;margin-top:3px}@media(max-width:900px){.crm-stage-grid,.crm-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.crm-stage-grid,.crm-form-grid{grid-template-columns:1fr}.crm-span-2{grid-column:span 1}}';
    document.head.appendChild(s);
  }

  function inject(){
    injectStyles();
    var nav=document.querySelector('.sidebar nav');
    if(nav&&!nav.querySelector('[data-view="crm"]')){
      var b=document.createElement('button');b.className='nav-item';b.dataset.view='crm';b.textContent='CRM & ERP';
      var jobs=nav.querySelector('[data-view="jobs"]');nav.insertBefore(b,jobs||nav.firstChild);
      b.addEventListener('click',function(){show('crm');load();});
    }
    var main=document.querySelector('main.main');
    if(main&&!document.getElementById('crm')){
      var section=document.createElement('section');section.id='crm';section.className='view';
      section.innerHTML=
        '<div class="section-head"><div><p class="eyebrow">BUSINESS OPERATIONS</p><h2>CRM & ERP</h2><p class="muted">Supabase is the system of record. Google Workspace is the document, email and reporting layer.</p></div>'+
        '<div class="crm-toolbar"><button class="btn secondary" id="crmRefreshBtn">Refresh</button><a class="btn secondary" href="'+WORKBOOK_URL+'" target="_blank" rel="noopener">Open Workspace mirror</a><button class="btn primary" id="crmNewLeadBtn">+ New lead</button></div></div>'+
        '<div class="workflow-note"><strong>Connected workflow:</strong> Lead → Opportunity → Quote → Job → Invoice → Payment. Gmail, Calendar and Drive actions are available from the Google Workspace bridge.</div>'+
        '<div class="crm-form-wrap panel" id="crmLeadFormWrap"><div class="panel-head"><div><h3>Create lead</h3><p class="muted">Creates or links a company/contact, then writes the lead directly to Supabase.</p></div><button class="link-btn" type="button" id="crmCancelLead">Cancel</button></div>'+
        '<form id="crmLeadForm"><div class="crm-form-grid">'+
        '<label>Company<input name="company" placeholder="Optional company / dealership / fleet"></label>'+
        '<label>First name<input name="first_name" required></label><label>Last name<input name="last_name" required></label><label>Email<input name="email" type="email"></label>'+
        '<label>Phone<input name="mobile"></label><label>Lead source<select name="source"><option>Website</option><option>Referral</option><option>Phone</option><option>Walk-in</option><option>Google</option><option>Social</option><option>Vendor / Partner</option><option>Other</option></select></label>'+
        '<label>Service interest<input name="service_interest" placeholder="Window tint, audio, SignalTrace…"></label><label>Estimated value<input name="estimated_value" type="number" min="0" step="0.01"></label>'+
        '<label>Priority<select name="priority"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></label>'+
        '<label class="crm-span-2">Notes<textarea name="description"></textarea></label></div><div class="top-gap"><button class="btn primary" type="submit">Create lead</button></div></form></div>'+
        '<div class="stats" id="crmStats"></div>'+
        '<div class="crm-tabs"><button class="crm-tab active" data-crm-tab="pipeline">Pipeline</button><button class="crm-tab" data-crm-tab="leads">Leads</button><button class="crm-tab" data-crm-tab="companies">Companies & Contacts</button><button class="crm-tab" data-crm-tab="operations">Operations</button><button class="crm-tab" data-crm-tab="activity">Activity</button></div>'+
        '<div id="crmLoading" class="panel crm-empty">Loading CRM/ERP data…</div>'+
        '<div id="crmBody" style="display:none"><div class="crm-pane active" data-crm-pane="pipeline"><div id="crmPipeline"></div></div><div class="crm-pane" data-crm-pane="leads"><div id="crmLeads"></div></div><div class="crm-pane" data-crm-pane="companies"><div id="crmCompanies"></div></div><div class="crm-pane" data-crm-pane="operations"><div id="crmOperations"></div></div><div class="crm-pane" data-crm-pane="activity"><div id="crmActivity"></div></div></div>';
      var settings=document.getElementById('settings');main.insertBefore(section,settings||null);
      bind();
    }
  }

  function bind(){
    document.getElementById('crmRefreshBtn').addEventListener('click',function(){load(true);});
    document.getElementById('crmNewLeadBtn').addEventListener('click',function(){document.getElementById('crmLeadFormWrap').classList.add('open');});
    document.getElementById('crmCancelLead').addEventListener('click',function(){document.getElementById('crmLeadFormWrap').classList.remove('open');});
    document.querySelectorAll('[data-crm-tab]').forEach(function(btn){btn.addEventListener('click',function(){
      document.querySelectorAll('[data-crm-tab]').forEach(function(x){x.classList.toggle('active',x===btn);});
      document.querySelectorAll('[data-crm-pane]').forEach(function(x){x.classList.toggle('active',x.dataset.crmPane===btn.dataset.crmTab);});
    });});
    document.getElementById('crmLeadForm').addEventListener('submit',createLead);
  }

  async function load(force){
    var cloud=window.TTTCloud;
    if(!cloud||!cloud.ready||!cloud.client||!cloud.organizationId){
      var wait=document.getElementById('crmLoading');if(wait)wait.textContent='Sign in to TTT OS and wait for the shared cloud database to finish loading.';return;
    }
    if(data.loading)return;if(data.loaded&&!force){render();return;}data.loading=true;
    document.getElementById('crmLoading').style.display='block';document.getElementById('crmLoading').textContent='Loading CRM/ERP data…';document.getElementById('crmBody').style.display='none';
    var org=cloud.organizationId;
    var specs=[
      ['companies','id,name,primary_type,status,website,main_phone,general_email,owner_person_id,updated_at'],
      ['contacts','id,company_id,display_name,first_name,last_name,title,mobile,email,relationship_strength,next_action,next_action_at,updated_at'],
      ['leads','id,company_id,contact_id,source,status,service_interest,description,estimated_value,priority,owner_person_id,next_action,next_action_at,created_at,updated_at'],
      ['opportunities','id,company_id,contact_id,customer_id,title,stage,priority,estimated_value,probability_pct,expected_close_date,next_step,next_step_date,owner_person_id,updated_at'],
      ['activities','id,activity_type,direction,status,subject,summary,company_id,contact_id,lead_id,opportunity_id,customer_id,job_id,occurred_at,due_at,updated_at'],
      ['quotes','id,customer_id,company_id,contact_id,job_id,status,quote_date,total,deposit_required,sent_at,approved_at,updated_at'],
      ['invoices','id,customer_id,company_id,contact_id,job_id,status,invoice_date,due_date,total,amount_paid,balance_due,paid_at,updated_at'],
      ['vendors','company_id,vendor_status,primary_categories,brands_represented,overall_score,last_reviewed_at,updated_at'],
      ['appointments','id,customer_id,company_id,contact_id,job_id,title,appointment_type,starts_at,ends_at,status,assigned_person_id,updated_at']
    ];
    try{
      var results=await Promise.all(specs.map(function(spec){return cloud.client.from(spec[0]).select(spec[1]).eq('organization_id',org).is('archived_at',null);}));
      for(var i=0;i<results.length;i++){if(results[i].error)throw new Error(specs[i][0]+': '+results[i].error.message);data[specs[i][0]]=results[i].data||[];}
      data.loaded=true;render();document.getElementById('crmLoading').style.display='none';document.getElementById('crmBody').style.display='block';
    }catch(err){
      console.error('TTT CRM load failed',err);document.getElementById('crmLoading').style.display='block';document.getElementById('crmLoading').textContent='CRM/ERP could not load: '+String(err.message||err);document.getElementById('crmBody').style.display='none';
    }finally{data.loading=false;}
  }

  function render(){
    var openLeads=data.leads.filter(function(x){return !['converted','lost'].includes(String(x.status||'').toLowerCase());});
    var openOpps=data.opportunities.filter(function(x){return !['won','lost'].includes(String(x.stage||'').toLowerCase());});
    var pipeline=openOpps.reduce(function(s,x){return s+Number(x.estimated_value||0);},0);
    var openQuotes=data.quotes.filter(function(x){return !['approved','declined','expired','cancelled'].includes(String(x.status||'').toLowerCase());});
    var receivables=data.invoices.filter(function(x){return !['paid','void'].includes(String(x.status||'').toLowerCase());}).reduce(function(s,x){return s+Number(x.balance_due==null?(Number(x.total||0)-Number(x.amount_paid||0)):x.balance_due);},0);
    var upcoming=data.appointments.filter(function(x){return ['scheduled','confirmed'].includes(String(x.status||'').toLowerCase())&&new Date(x.starts_at)>=new Date();});
    document.getElementById('crmStats').innerHTML=[['Open leads',openLeads.length],['Pipeline',cash(pipeline)],['Open quotes',openQuotes.length],['Receivables',cash(receivables)],['Upcoming appointments',upcoming.length]].map(function(x){return '<div class="stat"><span>'+html(x[0])+'</span><strong>'+html(x[1])+'</strong></div>';}).join('');
    renderPipeline();renderLeads();renderCompanies();renderOperations(upcoming);renderActivity();bindRowActions();subscribeRealtime();
  }

  function renderPipeline(){
    var cards=STAGES.map(function(stage){var rows=data.opportunities.filter(function(x){return String(x.stage||'').toLowerCase()===stage;});var value=rows.reduce(function(s,x){return s+Number(x.estimated_value||0);},0);return '<div class="crm-stage"><span>'+html(stage)+'</span><strong>'+rows.length+'</strong><small>'+cash(value)+'</small></div>';}).join('');
    var rows=data.opportunities.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(o){return '<tr><td><strong>'+html(o.title)+'</strong><br><small>'+html(o.id)+'</small></td><td>'+html(companyName(o.company_id))+'</td><td>'+html(contactName(o.contact_id))+'</td><td><span class="badge">'+html(o.stage)+'</span></td><td>'+cash(o.estimated_value)+'</td><td>'+(o.probability_pct==null?'—':html(o.probability_pct)+'%')+'</td><td>'+html(o.next_step||'—')+'</td></tr>';}).join('');
    document.getElementById('crmPipeline').innerHTML='<div class="crm-stage-grid">'+cards+'</div><div class="panel"><div class="panel-head"><h3>Opportunities</h3><span class="badge">'+data.opportunities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Company</th><th>Contact</th><th>Stage</th><th>Value</th><th>Probability</th><th>Next step</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="crm-empty">No opportunities yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderLeads(){
    var rows=data.leads.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).map(function(l){return '<tr><td><strong>'+html(contactName(l.contact_id))+'</strong><br><small>'+html(l.id)+'</small></td><td>'+html(companyName(l.company_id))+'</td><td>'+html(l.service_interest||'—')+'</td><td><span class="badge">'+html(l.status)+'</span></td><td>'+html(l.priority||'—')+'</td><td>'+cash(l.estimated_value)+'</td><td>'+html(l.source||'—')+'</td><td>'+html(l.next_action||'—')+'</td></tr>';}).join('');
    document.getElementById('crmLeads').innerHTML='<div class="panel"><div class="panel-head"><h3>Lead register</h3><span class="badge">'+data.leads.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Company</th><th>Interest</th><th>Status</th><th>Priority</th><th>Value</th><th>Source</th><th>Next action</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="9" class="crm-empty">No leads yet. Create the first lead above.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderCompanies(){
    var rows=data.companies.slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).map(function(c){var contacts=data.contacts.filter(function(x){return x.company_id===c.id;});return '<tr><td><strong>'+html(c.name)+'</strong><br><small>'+html(c.id)+'</small></td><td>'+html(c.primary_type||'—')+'</td><td>'+html(c.status||'—')+'</td><td>'+contacts.length+'</td><td>'+html(contacts.map(function(x){return x.display_name||[x.first_name,x.last_name].filter(Boolean).join(' ');}).filter(Boolean).join(', ')||'—')+'</td><td>'+html(c.main_phone||c.general_email||'—')+'</td></tr>';}).join('');
    document.getElementById('crmCompanies').innerHTML='<div class="panel"><div class="panel-head"><h3>Companies & linked contacts</h3><span class="badge">'+data.companies.length+' companies</span></div><div class="table-wrap"><table><thead><tr><th>Company</th><th>Type</th><th>Status</th><th>Contacts</th><th>People</th><th>Primary contact</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="crm-empty">No companies yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderOperations(upcoming){
    var activeVendors=data.vendors.filter(function(x){return ['approved','active'].includes(String(x.vendor_status||'').toLowerCase());}).length;
    var openInvoices=data.invoices.filter(function(x){return !['paid','void'].includes(String(x.status||'').toLowerCase());});
    var quoteRows=data.quotes.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).slice(0,8).map(function(q){return '<tr><td><strong>'+html(q.id)+'</strong></td><td>'+html(q.status)+'</td><td>'+cash(q.total)+'</td><td>'+html(q.job_id||'—')+'</td><td>'+when(q.updated_at)+'</td></tr>';}).join('');
    var invoiceRows=openInvoices.slice().sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);}).slice(0,8).map(function(i){var bal=i.balance_due==null?(Number(i.total||0)-Number(i.amount_paid||0)):i.balance_due;return '<tr><td><strong>'+html(i.id)+'</strong></td><td>'+html(i.status)+'</td><td>'+cash(i.total)+'</td><td>'+cash(bal)+'</td><td>'+html(i.due_date||'—')+'</td></tr>';}).join('');
    var appts=upcoming.slice(0,5).map(function(a){return '<div class="crm-mini-row"><div><strong>'+html(a.title)+'</strong><small>'+when(a.starts_at)+'</small></div><span class="badge">'+html(a.status)+'</span></div>';}).join('');
    document.getElementById('crmOperations').innerHTML='<div class="grid two"><article class="panel"><div class="panel-head"><h3>Purchasing & vendors</h3><span class="badge">'+data.vendors.length+' vendors</span></div><div class="checklist"><div><strong>'+activeVendors+'</strong> approved / active vendors</div><div>Product, inventory and purchase-order tables are live in Supabase and the Workspace workbook.</div><div>The original vendor directory remains a migration/reference source.</div></div></article><article class="panel"><div class="panel-head"><h3>Schedule</h3><span class="badge">'+upcoming.length+' upcoming</span></div><div class="crm-mini-list">'+(appts||'<div class="crm-empty">No upcoming appointments.</div>')+'</div></article></div><div class="grid two"><article class="panel"><div class="panel-head"><h3>Recent quotes</h3></div><div class="table-wrap"><table><thead><tr><th>Quote</th><th>Status</th><th>Total</th><th>Job</th><th>Updated</th></tr></thead><tbody>'+(quoteRows||'<tr><td colspan="5" class="crm-empty">No quotes yet.</td></tr>')+'</tbody></table></div></article><article class="panel"><div class="panel-head"><h3>Open invoices</h3></div><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Status</th><th>Total</th><th>Balance</th><th>Due</th></tr></thead><tbody>'+(invoiceRows||'<tr><td colspan="5" class="crm-empty">No open invoices.</td></tr>')+'</tbody></table></div></article></div>';
  }

  function renderActivity(){
    var rows=data.activities.slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,30).map(function(a){return '<tr><td>'+when(a.occurred_at)+'</td><td><span class="badge">'+html(a.activity_type)+'</span></td><td>'+html(a.direction||'—')+'</td><td><strong>'+html(a.subject||'—')+'</strong><br><small>'+html(a.summary||'')+'</small></td><td>'+html(contactName(a.contact_id))+'</td></tr>';}).join('');
    document.getElementById('crmActivity').innerHTML='<div class="panel"><div class="panel-head"><h3>Activity timeline</h3><span class="badge">'+data.activities.length+'</span></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Direction</th><th>Activity</th><th>Contact</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" class="crm-empty">No activity logged yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function bindRowActions(){
    document.querySelectorAll('[data-convert-lead]').forEach(function(btn){btn.onclick=function(){convertLead(btn.dataset.convertLead);};});
    document.querySelectorAll('[data-opp-stage]').forEach(function(sel){sel.onchange=function(){updateOpportunityStage(sel.dataset.oppStage,sel.value);};});
  }

  async function convertLead(id){
    var cloud=window.TTTCloud,lead=data.leads.find(function(x){return x.id===id;});if(!cloud?.ready||!lead)return;
    try{
      var title=[contactName(lead.contact_id),lead.service_interest].filter(function(x){return x&&x!=='—';}).join(' · ')||('Opportunity '+lead.id);
      var out=await cloud.client.from('opportunities').insert({
        organization_id:cloud.organizationId,lead_id:lead.id,company_id:lead.company_id,contact_id:lead.contact_id,
        title:title,stage:'identified',priority:lead.priority||'medium',estimated_value:lead.estimated_value||null,
        probability_pct:10,related_service:lead.service_interest||null,owner_person_id:cloud.profile?.person_id||null,
        source:lead.source||'TTT-OS CRM',created_by:cloud.userId,updated_by:cloud.userId
      }).select('*').single();
      if(out.error)throw out.error;
      var upd=await cloud.client.from('leads').update({status:'converted',converted_at:new Date().toISOString(),updated_by:cloud.userId})
        .eq('organization_id',cloud.organizationId).eq('id',lead.id);
      if(upd.error)throw upd.error;
      await cloud.audit?.('lead',lead.id,'lead_converted',{opportunity_id:out.data.id});
      data.loaded=false;await load(true);toast('Lead converted to '+out.data.id);
    }catch(err){console.error(err);toast('Lead conversion failed: '+String(err.message||err));}
  }

  async function updateOpportunityStage(id,stage){
    var cloud=window.TTTCloud;if(!cloud?.ready)return;
    var pct={identified:10,researching:20,contacted:30,evaluating:45,quoted:60,negotiating:80,won:100,lost:0}[stage];
    var patch={stage:stage,updated_by:cloud.userId};if(pct!=null)patch.probability_pct=pct;
    var out=await cloud.client.from('opportunities').update(patch).eq('organization_id',cloud.organizationId).eq('id',id);
    if(out.error){toast('Stage update failed: '+out.error.message);return;}
    await cloud.audit?.('opportunity',id,'stage_changed',{stage:stage});
    data.loaded=false;await load(true);
  }

  function subscribeRealtime(){
    var cloud=window.TTTCloud;if(realtimeChannel||!cloud?.client||!cloud.organizationId)return;
    realtimeChannel=cloud.client.channel('ttt-crm-'+cloud.organizationId);
    ['companies','contacts','leads','opportunities','activities','quotes','invoices','vendors','appointments'].forEach(function(table){
      realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table:table,filter:'organization_id=eq.'+cloud.organizationId},function(){
        data.loaded=false;if(document.getElementById('crm')?.classList.contains('active'))load(true);
      });
    });
    realtimeChannel.subscribe();
  }

  async function createLead(ev){
    ev.preventDefault();var cloud=window.TTTCloud;if(!cloud||!cloud.ready)return toast('TTT Cloud is not ready.');
    var form=ev.currentTarget,fd=new FormData(form),org=cloud.organizationId,profile=cloud.profile||{},email=String(fd.get('email')||'').trim(),companyInput=String(fd.get('company')||'').trim();
    var submit=form.querySelector('button[type="submit"]');
    try{
      submit.disabled=true;submit.textContent='Creating…';var companyId=null;
      if(companyInput){
        var company=data.companies.find(function(x){return String(x.name||'').trim().toLowerCase()===companyInput.toLowerCase();});
        if(!company){
          var cr=await cloud.client.from('companies').insert({organization_id:org,name:companyInput,primary_type:'prospect',status:'active',owner_person_id:profile.person_id||null,source:'TTT-OS CRM',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
          if(cr.error)throw cr.error;company=cr.data;data.companies.push(company);
        }
        companyId=company.id;
      }
      var contact=email?data.contacts.find(function(x){return String(x.email||'').trim().toLowerCase()===email.toLowerCase();}):null;
      if(!contact){
        var first=String(fd.get('first_name')||'').trim(),last=String(fd.get('last_name')||'').trim();
        var co=await cloud.client.from('contacts').insert({organization_id:org,company_id:companyId,first_name:first,last_name:last,display_name:[first,last].filter(Boolean).join(' '),email:email||null,mobile:String(fd.get('mobile')||'').trim()||null,owner_person_id:profile.person_id||null,source:'TTT-OS CRM',relationship_strength:'New',created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
        if(co.error)throw co.error;contact=co.data;data.contacts.push(contact);
      }else if(companyId&&!contact.company_id){
        var cu=await cloud.client.from('contacts').update({company_id:companyId,updated_by:cloud.userId}).eq('organization_id',org).eq('id',contact.id).select('*').single();
        if(cu.error)throw cu.error;Object.assign(contact,cu.data);
      }
      var lr=await cloud.client.from('leads').insert({organization_id:org,company_id:companyId||contact.company_id||null,contact_id:contact.id,source:String(fd.get('source')||'Other'),status:'new',service_interest:String(fd.get('service_interest')||'').trim()||null,description:String(fd.get('description')||'').trim()||null,estimated_value:Number(fd.get('estimated_value')||0)||null,priority:String(fd.get('priority')||'medium'),owner_person_id:profile.person_id||null,created_by:cloud.userId,updated_by:cloud.userId}).select('*').single();
      if(lr.error)throw lr.error;
      if(cloud.audit)await cloud.audit('lead',lr.data.id,'lead_created',{source:lr.data.source,contact_id:lr.data.contact_id});
      form.reset();document.getElementById('crmLeadFormWrap').classList.remove('open');data.loaded=false;await load(true);toast('Lead '+lr.data.id+' created');
    }catch(err){console.error('TTT CRM lead creation failed',err);toast('Could not create lead: '+String(err.message||err));}
    finally{submit.disabled=false;submit.textContent='Create lead';}
  }

  function start(){inject();if(window.TTTCloud&&window.TTTCloud.ready)load();}
  window.addEventListener('ttt:cloud-state-applied',function(){data.loaded=false;if(document.getElementById('crm')&&document.getElementById('crm').classList.contains('active'))load(true);});
  window.TTTCRM={load:function(){return load(true);},state:data,workbookUrl:WORKBOOK_URL};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();