// TTT OS People Time Off v1.0 — PTO/sick requests + scheduling unavailability.
(function(){
'use strict';
let requests=[],channel=null,wrapped=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cloud(){return window.TTTCloud;}
function canManage(){return ['owner_admin','manager'].includes(cloud()?.profile?.role);}
function ownPersonId(){return cloud()?.profile?.person_id||null;}
function people(){try{return Array.isArray(db.personnel)?db.personnel:[];}catch(e){return [];}}
function name(id){return people().find(p=>p.id===id)?.displayName||id||'—';}
function toastMsg(m){if(typeof toast==='function')toast(m);else console.log(m);}
function daysInclusive(a,b){if(!a||!b)return 0;const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');return Math.max(0,Math.floor((y-x)/86400000)+1);}
function ensure(){
 const main=document.querySelector('main.main'),settings=document.getElementById('settings');if(!main)return;
 if(!document.getElementById('time-off')){const s=document.createElement('section');s.id='time-off';s.className='view';s.innerHTML='<div id="timeOffBody"></div>';main.insertBefore(s,settings||null);}
 if(!document.getElementById('timeOffStyle')){const st=document.createElement('style');st.id='timeOffStyle';st.textContent=
 '.to-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.to-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:12px}.to-kpi span{display:block;font-size:10px;text-transform:uppercase;color:#64748b}.to-kpi strong{font-size:20px;display:block;margin-top:4px}.to-modal{position:fixed;inset:0;background:#07101dcc;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:8vh 14px}.to-dialog{width:min(720px,100%);background:#f8fafc;border-radius:16px;padding:18px}.to-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.to-form label{font-size:11px;font-weight:700;color:#556579}.to-form input,.to-form select,.to-form textarea{width:100%;box-sizing:border-box;margin-top:4px}.to-span{grid-column:1/-1}.to-actions{display:flex;gap:6px;flex-wrap:wrap}.to-approved{color:#1f7a4c}.to-declined{color:#a63b32}@media(max-width:620px){.to-kpis,.to-form{grid-template-columns:1fr}.to-span{grid-column:auto}}';document.head.appendChild(st);}
 ensureNav();
}
function ensureNav(){
 const group=[...document.querySelectorAll('.nav-group')].find(g=>g.querySelector('.nav-group-toggle')?.textContent.includes('PEOPLE')),items=group?.querySelector('.nav-group-items');if(!items||items.querySelector('[data-shell-view="time-off"]'))return;
 const b=document.createElement('button');b.className='nav-item';b.type='button';b.dataset.shellView='time-off';b.textContent='Time Off';items.appendChild(b);b.addEventListener('click',()=>{if(typeof show==='function')show('time-off');load();});
}
async function load(){
 ensure();if(!cloud()?.ready)return;
 const {data,error}=await cloud().client.from('personnel_leave_requests').select('*').eq('organization_id',cloud().organizationId).is('archived_at',null).order('start_date',{ascending:false});
 if(error){console.error('Time Off load failed',error);return;}requests=data||[];render();wrapConflicts();subscribe();
}
function render(){
 const body=document.getElementById('timeOffBody');if(!body)return;
 const mine=requests.filter(r=>r.person_id===ownPersonId()),pending=requests.filter(r=>r.status==='pending'),approved=requests.filter(r=>r.status==='approved');
 const upcoming=approved.filter(r=>r.end_date>=new Date().toISOString().slice(0,10));
 const visible=canManage()?requests:mine;
 const rows=visible.map(r=>'<tr><td><strong>'+esc(name(r.person_id))+'</strong></td><td>'+esc(r.leave_type)+'</td><td>'+esc(r.start_date)+(r.end_date!==r.start_date?' → '+esc(r.end_date):'')+(r.partial_day?' · partial':'')+'</td><td>'+Number(r.day_count||0)+'</td><td><span class="badge '+(r.status==='approved'?'to-approved':r.status==='declined'?'to-declined':'')+'">'+esc(r.status)+'</span></td><td>'+esc(r.reason||'—')+'</td><td><div class="to-actions">'+(canManage()&&r.status==='pending'?'<button class="btn primary compact" data-leave-approve="'+esc(r.id)+'">Approve</button><button class="btn secondary compact" data-leave-decline="'+esc(r.id)+'">Decline</button>':'')+(r.person_id===ownPersonId()&&r.status==='pending'?'<button class="btn danger compact" data-leave-cancel="'+esc(r.id)+'">Cancel</button>':'')+'</div></td></tr>').join('');
 body.innerHTML='<div class="section-head"><div><p class="eyebrow">PEOPLE & AVAILABILITY</p><h2>Time Off</h2><p class="muted">PTO and sick-leave requests automatically block approved dates from technician scheduling.</p></div><button class="btn primary" id="toRequest">+ Request Time Off</button></div>'+
 '<div class="to-kpis"><div class="to-kpi"><span>My requests</span><strong>'+mine.length+'</strong></div><div class="to-kpi"><span>Pending approval</span><strong>'+pending.length+'</strong></div><div class="to-kpi"><span>Approved upcoming</span><strong>'+upcoming.length+'</strong></div><div class="to-kpi"><span>Approved days</span><strong>'+approved.reduce((s,r)=>s+Number(r.day_count||0),0)+'</strong></div></div>'+
 '<article class="panel"><div class="panel-head"><div><h3>'+(canManage()?'Team requests':'My requests')+'</h3><p class="muted">Approved requests are enforced as scheduling unavailability.</p></div></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="muted">No time-off requests yet.</td></tr>')+'</tbody></table></div></article>';
 document.getElementById('toRequest')?.addEventListener('click',openRequest);
 body.querySelectorAll('[data-leave-approve]').forEach(b=>b.onclick=()=>decide(b.dataset.leaveApprove,'approved'));
 body.querySelectorAll('[data-leave-decline]').forEach(b=>b.onclick=()=>decide(b.dataset.leaveDecline,'declined'));
 body.querySelectorAll('[data-leave-cancel]').forEach(b=>b.onclick=()=>cancelRequest(b.dataset.leaveCancel));
}
function openRequest(){
 const own=ownPersonId(),eligible=canManage()?people().filter(p=>p.status==='Active'):people().filter(p=>p.id===own),today=new Date().toISOString().slice(0,10);
 const m=document.createElement('div');m.id='toModal';m.className='to-modal';m.innerHTML='<div class="to-dialog"><div class="panel-head"><div><p class="eyebrow">TIME OFF REQUEST</p><h2>Request absence</h2></div><button class="btn secondary" id="toClose">Close</button></div><form id="toForm" class="to-form"><label>Person<select name="person_id" '+(!canManage()?'disabled':'')+'>'+eligible.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===own?'selected':'')+'>'+esc(p.displayName)+'</option>').join('')+'</select></label><label>Type<select name="leave_type"><option>PTO</option><option>Sick</option><option>Unpaid</option><option>Bereavement</option><option>Other</option></select></label><label>Start date<input name="start_date" type="date" min="'+today+'" value="'+today+'" required></label><label>End date<input name="end_date" type="date" min="'+today+'" value="'+today+'" required></label><label class="to-span"><input name="partial_day" type="checkbox"> Partial day</label><label class="to-partial" hidden>Start time<input name="start_time" type="time" value="09:00"></label><label class="to-partial" hidden>End time<input name="end_time" type="time" value="13:00"></label><label class="to-span">Reason / note<textarea name="reason" placeholder="Optional context for approver"></textarea></label><div class="to-span"><strong id="toDays">1 day</strong></div><div class="to-span to-actions" style="justify-content:flex-end"><button class="btn primary" type="submit">Submit request</button></div></form></div>';document.body.appendChild(m);
 const form=m.querySelector('#toForm'),person=form.elements.person_id;if(!canManage())person.value=own;
 const update=()=>{if(form.elements.end_date.value<form.elements.start_date.value)form.elements.end_date.value=form.elements.start_date.value;form.elements.end_date.min=form.elements.start_date.value;const d=daysInclusive(form.elements.start_date.value,form.elements.end_date.value);m.querySelector('#toDays').textContent=(form.elements.partial_day.checked?'Partial day':d+' day'+(d===1?'':'s'));m.querySelectorAll('.to-partial').forEach(x=>x.hidden=!form.elements.partial_day.checked);};
 form.elements.start_date.onchange=update;form.elements.end_date.onchange=update;form.elements.partial_day.onchange=update;update();
 m.querySelector('#toClose').onclick=()=>m.remove();form.onsubmit=e=>submitRequest(e,m);
}
async function submitRequest(e,m){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),personId=canManage()?String(fd.get('person_id')||ownPersonId()):ownPersonId(),start=String(fd.get('start_date')),end=String(fd.get('end_date')),partial=fd.get('partial_day')==='on';
 const row={organization_id:c.organizationId,person_id:personId,leave_type:String(fd.get('leave_type')||'PTO'),start_date:start,end_date:end,day_count:partial?0.5:daysInclusive(start,end),partial_day:partial,start_time:partial?String(fd.get('start_time')||'')||null:null,end_time:partial?String(fd.get('end_time')||'')||null:null,reason:String(fd.get('reason')||'').trim()||null,status:'pending',created_by:c.userId,updated_by:c.userId};
 const {data,error}=await c.client.from('personnel_leave_requests').insert(row).select('*').single();if(error)return toastMsg('Time-off request failed: '+error.message);await c.audit?.('personnel_leave',data.id,'leave_requested',{person_id:personId,leave_type:row.leave_type,start_date:start,end_date:end});m.remove();toastMsg('Time-off request submitted');await load();
}
async function decide(id,status){
 if(!canManage())return;const c=cloud(),note=status==='declined'?prompt('Optional decline reason:','')||null:null,{error}=await c.client.from('personnel_leave_requests').update({status,decided_at:new Date().toISOString(),decided_by:c.userId,decision_note:note,updated_by:c.userId,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id);if(error)return toastMsg('Decision failed: '+error.message);await c.audit?.('personnel_leave',id,'leave_'+status,{decision_note:note});toastMsg('Request '+status);await load();
}
async function cancelRequest(id){
 const c=cloud(),{error}=await c.client.from('personnel_leave_requests').update({status:'cancelled',updated_by:c.userId,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id);if(error)return toastMsg('Cancel failed: '+error.message);toastMsg('Request cancelled');await load();
}
function isUnavailable(personId,start,end){
 if(!personId||!start)return null;const s=start instanceof Date?start:new Date(start),e=end?(end instanceof Date?end:new Date(end)):s;if(Number.isNaN(s.getTime()))return null;
 const sd=s.toISOString().slice(0,10),ed=e.toISOString().slice(0,10);
 return requests.find(r=>r.person_id===personId&&r.status==='approved'&&r.start_date<=ed&&r.end_date>=sd&&(!r.partial_day||partialOverlap(r,s,e)))||null;
}
function partialOverlap(r,s,e){
 if(!r.start_time||!r.end_time)return true;const date=r.start_date;if(s.toISOString().slice(0,10)!==date&&e.toISOString().slice(0,10)!==date)return true;
 const rs=new Date(date+'T'+r.start_time),re=new Date(date+'T'+r.end_time);return s<re&&e>rs;
}
function wrapConflicts(){
 if(wrapped||!window.TTTSchedulingCore?.operationConflicts)return;wrapped=true;const prior=window.TTTSchedulingCore.operationConflicts;
 window.TTTSchedulingCore.operationConflicts=function(database,candidate,ignoreId){
   const out=prior(database,candidate,ignoreId)||[];
   try{
     if(candidate?.technicianId&&candidate?.start){
       const s=window.TTTSchedulingCore.ensureModel(database),tech=s.technicians.find(t=>t.id===candidate.technicianId),start=new Date(candidate.start),end=new Date(start.getTime()+(Number(candidate.durationMinutes||0)+Number(candidate.bufferMinutes||0))*60000),leave=isUnavailable(tech?.personId,start,end);
       if(leave)out.push({type:'leave',operationId:leave.id,message:name(leave.person_id)+' is unavailable ('+leave.leave_type+') '+leave.start_date+(leave.end_date!==leave.start_date?'–'+leave.end_date:'')+'.'});
     }
   }catch(e){}
   return out;
 };
}
function subscribe(){
 if(channel||!cloud()?.ready)return;channel=cloud().client.channel('ttt-leave-'+cloud().organizationId).on('postgres_changes',{event:'*',schema:'public',table:'personnel_leave_requests',filter:'organization_id=eq.'+cloud().organizationId},()=>load());channel.subscribe();
}
function init(){ensure();load();setInterval(ensureNav,1500);}
window.TTTLeave={reload:load,isUnavailable,requests:()=>requests};
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();