(function(){
'use strict';
var S={days:30,loading:false,visitors:[],sessions:[],events:[],questions:[],journeys:[],followups:[]};

function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cloud(){return window.TTTCloud&&window.TTTCloud.ready&&window.TTTCloud.client?window.TTTCloud:null;}
function dt(v){if(!v)return '—';var d=new Date(v);return isNaN(d)?'—':d.toLocaleString();}
function cash(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));}
function pct(a,b){return b?Math.round(a/b*100)+'%':'—';}
function unique(rows,key){return new Set(rows.map(function(r){return r[key];}).filter(Boolean)).size;}
function isDone(row){return row.activity_status==='completed'||row.activity_status==='cancelled'||row.due_state==='done';}
function host(v){if(!v)return 'Direct / unknown';try{return new URL(v).hostname.replace(/^www\./,'')}catch{return String(v).slice(0,80)}}
function countBy(rows,keyFn){var out={};rows.forEach(function(r){var k=keyFn(r)||'Unknown';out[k]=(out[k]||0)+1});return Object.keys(out).map(function(k){return {label:k,count:out[k]}}).sort(function(a,b){return b.count-a.count})}
function sum(rows,key){return rows.reduce(function(n,r){return n+Number(r[key]||0)},0)}
function kpi(l,v,s,cls){return '<div class="wa-kpi '+(cls||'')+'"><span>'+e(l)+'</span><strong>'+e(v)+'</strong><small>'+e(s)+'</small></div>'}

function style(){
  if(document.getElementById('websiteAnalyticsStylesV2'))return;
  var x=document.createElement('style');x.id='websiteAnalyticsStylesV2';
  x.textContent='.wa-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0}.wa-kpi{background:#fff;border:1px solid #dfe6ef;border-radius:12px;padding:13px}.wa-kpi span,.wa-kpi small{display:block;color:#728095;font-size:10px}.wa-kpi strong{display:block;font-size:24px;margin:4px 0}.wa-kpi.warn strong{color:#b42318}.wa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.wa-list{display:grid;gap:8px}.wa-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.wa-bar{height:7px;background:#e9eef5;border-radius:999px;overflow:hidden;margin-top:4px}.wa-bar i{display:block;height:100%;background:#1769d2;border-radius:999px}.wa-source{display:inline-flex;border-radius:999px;padding:3px 6px;background:#eef4fd;color:#255b9f;font-size:9px;font-weight:800}.wa-source.ai{background:#eee9ff;color:#6542b2}.wa-state{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:800;background:#eef4fd;color:#285b99}.wa-state.overdue{background:#fff0ee;color:#b42318}.wa-state.due_soon{background:#fff7e6;color:#9a6700}.wa-state.done{background:#eaf8ef;color:#1f7a45}.wa-funnel{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.wa-funnel div{position:relative;background:#f7f9fc;border:1px solid #e3e9f1;border-radius:10px;padding:12px}.wa-funnel strong,.wa-funnel span,.wa-funnel small{display:block}.wa-funnel strong{font-size:20px}.wa-funnel span{font-size:10px;color:#738197;margin-top:3px}.wa-funnel small{font-size:9px;color:#8a97a8;margin-top:4px}.wa-filter{display:flex;gap:8px;align-items:center}.wa-filter select{border:1px solid #d6dfeb;border-radius:8px;padding:8px 10px;background:#fff}.wa-actions{display:flex;gap:6px;flex-wrap:wrap}.wa-mini{font-size:10px;padding:5px 8px}.wa-muted{color:#728095}.wa-money{font-weight:800}.wa-followups{margin-top:12px}.wa-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.wa-summary-card{background:#f8fafc;border:1px solid #e3e9f1;border-radius:10px;padding:11px}.wa-summary-card span{display:block;font-size:10px;color:#728095}.wa-summary-card strong{display:block;margin-top:4px;font-size:18px}@media(max-width:1100px){.wa-kpis{grid-template-columns:repeat(3,1fr)}.wa-funnel{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.wa-kpis{grid-template-columns:repeat(2,1fr)}.wa-grid{grid-template-columns:1fr}.wa-funnel,.wa-summary-grid{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(x);
}

function inject(){
  style();
  var m=document.querySelector('main.main');
  if(m&&!document.getElementById('websiteAnalytics')){
    var s=document.createElement('section');s.id='websiteAnalytics';s.className='view';
    s.innerHTML='<div class="section-head"><div><p class="eyebrow">INSIGHTS</p><h2>Website Analytics</h2><p class="muted">Visitor journey, Tessa performance, CRM conversion and follow-up SLA.</p></div><div class="wa-filter"><select id="waRange"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select><button class="btn secondary" id="waRefresh">Refresh</button></div></div><div id="waBody"><div class="panel">Loading analytics…</div></div>';
    m.insertBefore(s,document.getElementById('settings')||null);
    document.getElementById('waRange').onchange=function(ev){S.days=Number(ev.target.value)||30;load(true)};
    document.getElementById('waRefresh').onclick=function(){load(true)};
  }
}

function show(){
  inject();
  document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id==='websiteAnalytics')});
  document.querySelectorAll('.nav-item').forEach(function(v){v.classList.toggle('active',v.dataset.view==='websiteAnalytics')});
  var t=document.getElementById('pageTitle');if(t)t.textContent='Website Analytics';
  load(true);
}

async function load(force){
  inject();
  var c=cloud(),body=document.getElementById('waBody');
  if(!c){body.innerHTML='<div class="panel">Sign in and wait for the shared database.</div>';return}
  if(S.loading)return;
  S.loading=true;
  body.innerHTML='<div class="panel">Loading website, Tessa and CRM attribution…</div>';
  var since=new Date(Date.now()-S.days*86400000).toISOString();
  try{
    var r=await Promise.all([
      c.client.from('website_visitors').select('visitor_id,first_seen_at,last_seen_at,first_path,last_path,first_referrer,first_utm_source,country,region,city,session_count,event_count').gte('last_seen_at',since).order('last_seen_at',{ascending:false}).limit(5000),
      c.client.from('website_sessions').select('session_id,visitor_id,started_at,last_seen_at,first_path,last_path,referrer,utm_source,utm_medium,utm_campaign,country,region,city,pageview_count,event_count').gte('started_at',since).order('started_at',{ascending:false}).limit(5000),
      c.client.from('website_events').select('id,visitor_id,session_id,event_type,event_name,path,referrer,metadata,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(5000),
      c.client.from('tessa_question_log').select('id,visitor_id,website_session_id,question,matched,matched_intent_id,confidence,service,response_source,model_name,latency_ms,page_path,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(5000),
      c.client.from('tessa_conversion_journey').select('*').gte('lead_created_at',since).order('lead_created_at',{ascending:false}).limit(5000),
      c.client.from('tessa_follow_up_queue').select('*').order('due_at',{ascending:true}).limit(2000)
    ]);
    for(var i=0;i<r.length;i++)if(r[i].error)throw r[i].error;
    S.visitors=r[0].data||[];S.sessions=r[1].data||[];S.events=r[2].data||[];S.questions=r[3].data||[];S.journeys=r[4].data||[];S.followups=r[5].data||[];
    render();
  }catch(err){
    console.error('Website analytics load failed',err);
    body.innerHTML='<div class="panel">Unable to load website analytics: '+e(err.message||err)+'</div>';
  }finally{S.loading=false}
}

function list(title,desc,rows){
  var max=Math.max(1,...rows.map(function(x){return x.count}));
  return '<article class="panel"><div class="panel-head"><div><h3>'+e(title)+'</h3><p class="muted">'+e(desc)+'</p></div></div><div class="wa-list">'+
    (rows.slice(0,12).map(function(x){return '<div class="wa-row"><div><strong>'+e(x.label)+'</strong><div class="wa-bar"><i style="width:'+Math.max(3,Math.round(x.count/max*100))+'%"></i></div></div><span class="badge">'+x.count+'</span></div>'}).join('')||'<div class="muted">No data yet.</div>')+
    '</div></article>';
}

function openLead(id){
  if(typeof show==='function')show('crm');
  window.TTTCRM?.activateTab?.('leads');
  if(window.TTTCRM?.openLead)window.TTTCRM.openLead(id);
}

async function markContacted(activityId,leadId){
  var c=cloud();if(!c)return;
  var button=document.querySelector('[data-wa-contact="'+activityId+'"]');
  if(button){button.disabled=true;button.textContent='Saving…'}
  try{
    var now=new Date().toISOString();
    var a=await c.client.from('activities').update({status:'completed',updated_at:now}).eq('id',activityId);
    if(a.error)throw a.error;
    var j=S.journeys.find(function(x){return x.lead_id===leadId});
    var update={last_contact_at:now,next_action:'Qualify / quote as appropriate',next_action_at:null,updated_at:now};
    if(j&&j.lead_status==='new'){update.status='contacted';update.first_contact_at=now}
    var l=await c.client.from('leads').update(update).eq('id',leadId);
    if(l.error)throw l.error;
    await load(true);
  }catch(err){
    console.error('Could not complete Tessa follow-up',err);
    if(button){button.disabled=false;button.textContent='Mark contacted'}
  }
}

function render(){
  var b=document.getElementById('waBody');if(!b)return;
  var pageViews=S.events.filter(function(x){return x.event_type==='page_view'});
  var opens=S.events.filter(function(x){return x.event_type==='tessa'&&x.event_name==='open'});
  var matched=S.questions.filter(function(x){return x.matched}).length;
  var ai=S.questions.filter(function(x){return String(x.response_source||'').indexOf('model')===0}).length;
  var engagedVisitors=unique(S.questions,'visitor_id');
  var leadCount=S.journeys.length;
  var opportunityRows=S.journeys.filter(function(x){return x.opportunity_id});
  var opportunityCount=opportunityRows.length;
  var wonRows=S.journeys.filter(function(x){return x.job_id||x.opportunity_stage==='closed_won'});
  var wonCount=wonRows.length;
  var pipeline=sum(opportunityRows.filter(function(x){return !['closed_won','closed_loss'].includes(String(x.opportunity_stage||''))}),'opportunity_value');
  var wonValue=sum(wonRows,'job_value')||sum(wonRows,'opportunity_value');
  var activeFollowups=S.followups.filter(function(x){return !isDone(x)});
  var overdue=activeFollowups.filter(function(x){return x.due_state==='overdue'});
  var dueSoon=activeFollowups.filter(function(x){return x.due_state==='due_soon'});

  var pages=countBy(pageViews,function(x){return String(x.path||'/').split('?')[0]});
  var refs=countBy(S.sessions,function(x){return host(x.referrer)});
  var geo=countBy(S.sessions,function(x){return [x.city,x.region,x.country].filter(Boolean).join(', ')||'Unknown'});
  var services=countBy(S.questions.filter(function(x){return x.service}),function(x){return x.service});
  var leadServices=countBy(S.journeys,function(x){return x.service_interest||'Unspecified'});

  b.innerHTML=
    '<div class="wa-kpis">'+
      kpi('Visitors',S.visitors.length,'Anonymous first-party IDs')+
      kpi('Tessa engaged',engagedVisitors,pct(engagedVisitors,S.visitors.length)+' of visitors')+
      kpi('Tessa leads',leadCount,pct(leadCount,Math.max(engagedVisitors,1))+' of engaged')+
      kpi('Opportunities',opportunityCount,pct(opportunityCount,leadCount)+' of Tessa leads')+
      kpi('Won / jobs',wonCount,pct(wonCount,opportunityCount)+' of opportunities')+
      kpi('Overdue follow-up',overdue.length,activeFollowups.length+' open tasks',overdue.length?'warn':'')+
    '</div>'+
    '<article class="panel"><div class="panel-head"><div><h3>Visitor → Tessa → Lead → Opportunity → Job</h3><p class="muted">End-to-end attribution from anonymous website traffic into CRM and downstream work.</p></div></div>'+
      '<div class="wa-funnel">'+
        '<div><strong>'+S.visitors.length+'</strong><span>Visitors</span><small>Tracked browsers</small></div>'+
        '<div><strong>'+engagedVisitors+'</strong><span>Tessa engaged</span><small>'+pct(engagedVisitors,S.visitors.length)+' of visitors</small></div>'+
        '<div><strong>'+leadCount+'</strong><span>CRM leads</span><small>'+pct(leadCount,Math.max(engagedVisitors,1))+' of engaged</small></div>'+
        '<div><strong>'+opportunityCount+'</strong><span>Opportunities</span><small>'+pct(opportunityCount,leadCount)+' of leads</small></div>'+
        '<div><strong>'+wonCount+'</strong><span>Won / jobs</span><small>'+pct(wonCount,opportunityCount)+' of opportunities</small></div>'+
      '</div>'+
      '<div class="wa-summary-grid">'+
        '<div class="wa-summary-card"><span>Open attributed pipeline</span><strong>'+cash(pipeline)+'</strong></div>'+
        '<div class="wa-summary-card"><span>Attributed won/job value</span><strong>'+cash(wonValue)+'</strong></div>'+
        '<div class="wa-summary-card"><span>AI-assisted questions</span><strong>'+ai+' · '+pct(ai,S.questions.length)+'</strong></div>'+
        '<div class="wa-summary-card"><span>Tessa answer rate</span><strong>'+pct(matched,S.questions.length)+'</strong></div>'+
      '</div>'+
    '</article>'+
    renderFollowups(activeFollowups,overdue,dueSoon)+
    '<div class="wa-grid">'+
      list('Top pages','Most viewed website paths.',pages)+
      list('Traffic sources','Referrer hosts for sessions.',refs)+
      list('Visitor geography','Coarse city / region / country from hosting headers.',geo)+
      list('Tessa question interest','Services classified from customer questions.',services)+
      list('Tessa lead mix','Services that actually became CRM leads.',leadServices)+
    '</div>'+
    renderLeadJourney()+
    renderQuestions();

  document.querySelectorAll('[data-wa-open-lead]').forEach(function(btn){btn.onclick=function(){openLead(btn.dataset.waOpenLead)}});
  document.querySelectorAll('[data-wa-contact]').forEach(function(btn){btn.onclick=function(){markContacted(btn.dataset.waContact,btn.dataset.leadId)}});
}

function renderFollowups(active,overdue,dueSoon){
  var rows=active.slice().sort(function(a,b){return new Date(a.due_at||'9999-01-01')-new Date(b.due_at||'9999-01-01')}).slice(0,20);
  return '<article class="panel wa-followups"><div class="panel-head"><div><h3>Tessa lead follow-up queue</h3><p class="muted">New Tessa leads automatically receive a sales task. During Houston business hours the target is one hour; after-hours leads roll to the next business morning.</p></div><div><span class="badge">'+active.length+' open</span> <span class="badge">'+overdue.length+' overdue</span> <span class="badge">'+dueSoon.length+' due soon</span></div></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Contact</th><th>Service</th><th>Lead</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    (rows.map(function(x){return '<tr><td><strong>'+e(x.contact_name||'Unnamed lead')+'</strong><br><small>'+e(x.contact_email||x.contact_phone||'')+'</small></td><td>'+e(x.service_interest||'—')+'</td><td>'+e(x.lead_status||'—')+'</td><td>'+e(dt(x.due_at))+'</td><td><span class="wa-state '+e(x.due_state)+'">'+e(String(x.due_state||'').replace('_',' '))+'</span></td><td><div class="wa-actions"><button class="btn secondary wa-mini" data-wa-open-lead="'+e(x.lead_id)+'">Open lead</button><button class="btn primary wa-mini" data-wa-contact="'+e(x.activity_id)+'" data-lead-id="'+e(x.lead_id)+'">Mark contacted</button></div></td></tr>'}).join('')||'<tr><td colspan="6">No open Tessa follow-up tasks.</td></tr>')+
    '</tbody></table></div></article>';
}

function renderLeadJourney(){
  var rows=S.journeys.slice(0,40);
  return '<article class="panel top-gap"><div class="panel-head"><div><h3>Tessa CRM conversion journey</h3><p class="muted">The latest attributed Tessa leads and how far each one has moved through CRM.</p></div></div><div class="table-wrap"><table><thead><tr><th>Lead</th><th>Service</th><th>Lead status</th><th>Opportunity</th><th>Job</th><th>Value</th><th>Created</th></tr></thead><tbody>'+
    (rows.map(function(x){
      var value=x.job_value!=null?x.job_value:x.opportunity_value;
      return '<tr><td><strong>'+e(x.contact_name||x.lead_id)+'</strong><br><small>'+e(x.project_request_reference||x.lead_id)+'</small></td><td>'+e(x.service_interest||'—')+'</td><td>'+e(x.lead_status||'—')+'</td><td>'+e(x.opportunity_stage||'—')+'</td><td>'+e(x.job_status||'—')+'</td><td class="wa-money">'+(value==null?'—':cash(value))+'</td><td>'+e(dt(x.lead_created_at))+'</td></tr>';
    }).join('')||'<tr><td colspan="7">No Tessa-generated CRM leads in this period yet.</td></tr>')+
    '</tbody></table></div></article>';
}

function renderQuestions(){
  return '<article class="panel top-gap"><div class="panel-head"><div><h3>Recent Tessa questions</h3><p class="muted">Shows deterministic, AI-grounded, qualification and handoff response paths.</p></div></div><div class="table-wrap"><table><thead><tr><th>Question</th><th>Service</th><th>Result</th><th>Answer path</th><th>Confidence</th><th>Latency</th><th>Asked</th></tr></thead><tbody>'+
    (S.questions.slice(0,40).map(function(q){var aiRow=String(q.response_source||'').indexOf('model')===0;return '<tr><td><strong>'+e(q.question)+'</strong></td><td>'+e(q.service||'—')+'</td><td>'+(q.matched?'Matched':'Handoff')+'</td><td><span class="wa-source '+(aiRow?'ai':'')+'">'+e(q.response_source||'legacy')+'</span></td><td>'+(q.confidence==null?'—':Math.round(Number(q.confidence)*100)+'%')+'</td><td>'+(q.latency_ms==null?'—':e(q.latency_ms+' ms'))+'</td><td>'+e(dt(q.created_at))+'</td></tr>'}).join('')||'<tr><td colspan="7">No Tessa questions in this period.</td></tr>')+
    '</tbody></table></div></article>';
}

function boot(){inject()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.TTTWebsiteAnalytics={show:show,load:load};
})();