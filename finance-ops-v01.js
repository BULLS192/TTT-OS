// TTT OS Finance Operations v1.0 — consolidated Job Costing.
(function(){
'use strict';
let rows=[],channel=null;
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function cloud(){return window.TTTCloud;}
function customer(id){try{return db.customers.find(x=>x.id===id);}catch(e){return null;}}
function vehicle(id){try{return db.vehicles.find(x=>x.id===id);}catch(e){return null;}}
function ensure(){
 const main=document.querySelector('main.main'),settings=document.getElementById('settings');if(!main)return;
 if(!document.getElementById('job-costing')){
  const s=document.createElement('section');s.id='job-costing';s.className='view';s.innerHTML='<div id="jobCostingBody"></div>';
  main.insertBefore(s,settings||null);
 }
 if(!document.getElementById('jobCostingStyles')){
  const st=document.createElement('style');st.id='jobCostingStyles';st.textContent=
   '.jc-profit.positive{color:#277047}.jc-profit.negative{color:#b42318}.jc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.jc-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:12px}.jc-kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.jc-kpi strong{display:block;font-size:20px;margin-top:4px}.jc-row{cursor:pointer}.jc-row:hover{background:#f8fafc}@media(max-width:760px){.jc-kpis{grid-template-columns:1fr 1fr}}';
  document.head.appendChild(st);
 }
}
async function load(){
 ensure();if(!cloud()?.ready)return;
 const {data,error}=await cloud().client.from('job_cost_summary').select('*').eq('organization_id',cloud().organizationId);
 if(error){console.error('Job costing load failed',error);return;}
 rows=data||[];render();subscribe();
}
function render(){
 const body=document.getElementById('jobCostingBody');if(!body)return;
 const rev=rows.reduce((s,x)=>s+Number(x.authorized_revenue||0),0),cost=rows.reduce((s,x)=>s+Number(x.actual_cost||0),0),profit=rows.reduce((s,x)=>s+Number(x.gross_profit||0),0);
 const withCost=rows.filter(x=>Number(x.actual_cost||0)>0).length;
 const trs=rows.slice().sort((a,b)=>String(b.job_id).localeCompare(String(a.job_id))).map(x=>{
  const c=customer(x.customer_id),v=vehicle(x.vehicle_id),margin=Number(x.authorized_revenue||0)?Number(x.gross_profit||0)/Number(x.authorized_revenue||0)*100:null;
  return '<tr class="jc-row" data-job-id="'+esc(x.job_id)+'"><td><strong>'+esc(x.job_id)+'</strong></td><td>'+esc(c?.name||c?.displayName||'—')+'</td><td>'+esc([v?.year,v?.make,v?.model].filter(Boolean).join(' ')||'—')+'</td><td><span class="badge">'+esc(x.status||'—')+'</span></td><td>'+money(x.quoted_revenue)+'</td><td>'+money(x.approved_change_revenue)+'</td><td>'+money(x.material_cost)+'</td><td>'+money(x.labor_cost)+'</td><td>'+money(x.allocated_expenses)+'</td><td><strong>'+money(x.actual_cost)+'</strong></td><td><strong class="jc-profit '+(Number(x.gross_profit||0)>=0?'positive':'negative')+'">'+money(x.gross_profit)+'</strong><br><small>'+(margin==null?'—':margin.toFixed(1)+'%')+'</small></td></tr>';
 }).join('');
 body.innerHTML='<div class="section-head"><div><p class="eyebrow">FINANCE & OPERATIONS</p><h2>Job Costing</h2><p class="muted">Authorized revenue compared with actual Work Order costs and allocated Expenses.</p></div><button class="btn secondary" id="jcRefresh">Refresh</button></div>'+
 '<div class="jc-kpis"><div class="jc-kpi"><span>Authorized revenue</span><strong>'+money(rev)+'</strong></div><div class="jc-kpi"><span>Actual costs</span><strong>'+money(cost)+'</strong></div><div class="jc-kpi"><span>Gross profit</span><strong class="jc-profit '+(profit>=0?'positive':'negative')+'">'+money(profit)+'</strong></div><div class="jc-kpi"><span>Jobs with actual cost</span><strong>'+withCost+'</strong></div></div>'+
 '<article class="panel"><div class="panel-head"><div><h3>Profitability by Job</h3><p class="muted">Quote + approved Change Orders − materials − labor − allocated Expenses.</p></div></div><div class="table-wrap"><table><thead><tr><th>Job</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Quote</th><th>Changes</th><th>Materials</th><th>Labor</th><th>Expenses</th><th>Actual cost</th><th>Gross profit</th></tr></thead><tbody>'+(trs||'<tr><td colspan="11" class="muted">No Jobs available for costing yet.</td></tr>')+'</tbody></table></div></article>';
 document.getElementById('jcRefresh')?.addEventListener('click',load);
 body.querySelectorAll('[data-job-id]').forEach(tr=>tr.addEventListener('click',()=>window.openJob?.(tr.dataset.jobId)));
}
function subscribe(){
 if(channel||!cloud()?.ready)return;
 channel=cloud().client.channel('ttt-job-costing-'+cloud().organizationId);
 ['jobs','quotes','change_orders','work_order_lines','expense_allocations'].forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+cloud().organizationId},()=>load()));
 channel.subscribe();
}
window.TTTFinanceOps={reload:load,rows:()=>rows};
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();