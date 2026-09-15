// TTT OS v1.0 — draggable Day / 5 Day / Week / Month calendar enhancement
(function(){
  'use strict';
  if(!window.TTTSchedulingCore||typeof db==='undefined')return;
  const Core=window.TTTSchedulingCore;
  const VERSION='20260914-scheduling-v10';
  const RANGE_KEYS=['day','five','week','month'];
  let selectedDate=new Date();
  let mode='shop';
  let range='day';
  let laneMode='resource';
  let armedMove=null;
  let rendering=false;

  function p2(n){return String(n).padStart(2,'0');}
  function dateKey(v){const d=new Date(v);return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
  function localDateTime(date,time){return date+'T'+time;}
  function addDays(v,n){const d=new Date(v);d.setDate(d.getDate()+n);return d;}
  function sameDay(a,b){return dateKey(a)===dateKey(b);}
  function startOfWeek(v){const d=new Date(v),day=d.getDay(),diff=(day+6)%7;d.setDate(d.getDate()-diff);d.setHours(12,0,0,0);return d;}
  function monthStart(v){const d=new Date(v);d.setDate(1);d.setHours(12,0,0,0);return d;}
  function monthGridStart(v){const d=monthStart(v);d.setDate(d.getDate()-d.getDay());return d;}
  function fmtDay(v){return new Date(v).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});}
  function fmtMonth(v){return new Date(v).toLocaleDateString([],{month:'long',year:'numeric'});}
  function fmtTime(v){return new Date(v).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
  function esc2(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function minsLabel(n){n=Number(n||0);const h=Math.floor(n/60),m=n%60;return h?(h+'h'+(m?' '+m+'m':'')):(m+'m');}
  function notify(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}
  function ensure(){return Core.ensureModel(db);}
  function getJob(id){return (db.jobs||[]).find(j=>j.id===id);}
  function getVehicle(id){return (db.vehicles||[]).find(v=>v.id===id);}
  function getCustomer(id){return (db.customers||[]).find(c=>c.id===id);}
  function getOp(id){return ensure().operations.find(o=>o.id===id);}
  function getAppointment(id){return ensure().appointments.find(a=>a.id===id);}
  function minutesSinceMidnight(v){const d=new Date(v);return d.getHours()*60+d.getMinutes();}
  function timeFromMinutes(n){return p2(Math.floor(n/60))+':'+p2(n%60);}
  function durationFor(e){return Number(e.durationMinutes||30);}

  function injectCss(){if(document.getElementById('ttt-scheduling-v10-css'))return;const l=document.createElement('link');l.id='ttt-scheduling-v10-css';l.rel='stylesheet';l.href='/scheduling-v10.css?v='+VERSION;document.head.appendChild(l);}

  function events(){
    const s=ensure();
    if(mode==='shop')return s.operations.filter(o=>o.status!=='cancelled').map(o=>{const j=getJob(o.jobId),v=j?getVehicle(j.vehicleId):null;return{kind:'op',id:o.id,start:o.start,durationMinutes:o.durationMinutes,bufferMinutes:o.bufferMinutes,title:o.service,subtitle:[j?.workOrderId||j?.id,[v?.year,v?.make,v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),status:o.status,jobId:o.jobId,resourceId:o.resourceId,technicianId:o.technicianId};});
    const custom=s.appointments.map(a=>({kind:'mgmt',id:a.id,start:a.start,durationMinutes:a.durationMinutes||30,title:a.title,subtitle:a.type||'Management',jobId:a.jobId||''}));
    const jobAppts=(db.jobs||[]).filter(j=>j.appointment&&!['Closed','Declined'].includes(j.status)).map(j=>{const c=getCustomer(j.customerId),v=getVehicle(j.vehicleId);return{kind:'jobappt',id:j.id,start:j.appointment,durationMinutes:30,title:'Customer appointment · '+j.id,subtitle:[c?.name,[v?.year,v?.make,v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),jobId:j.id};});
    return custom.concat(jobAppts);
  }

  function dateList(){if(range==='day')return[new Date(selectedDate)];if(range==='five')return Array.from({length:5},(_,i)=>addDays(selectedDate,i));if(range==='week'){const s=startOfWeek(selectedDate);return Array.from({length:7},(_,i)=>addDays(s,i));}return[];}
  function rangeTitle(){if(range==='month')return fmtMonth(selectedDate);const ds=dateList();if(ds.length===1)return fmtDay(ds[0]);return fmtDay(ds[0])+' – '+fmtDay(ds[ds.length-1]);}
  function shift(dir){if(range==='month'){selectedDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth()+dir,1,12);return;}const step=range==='day'?1:range==='five'?5:7;selectedDate=addDays(selectedDate,dir*step);}

  function card(e,compact=false){
    const armed=armedMove&&armedMove.kind===e.kind&&armedMove.id===e.id;
    let conflict='';if(e.kind==='op'){const o=getOp(e.id);if(o&&Core.operationConflicts(db,o,o.id).length)conflict=' conflict';}
    return `<div class="v10-event ${e.kind==='op'?'op '+esc2(e.status||''):e.kind}${conflict}${armed?' v10-move-armed':''}" draggable="true" data-event-kind="${e.kind}" data-event-id="${esc2(e.id)}" title="Drag to move · ${esc2(e.title)}"><strong>${compact?'':esc2(fmtTime(e.start))+' · '}${esc2(e.title)}</strong><small>${esc2(e.subtitle||'')}${e.kind==='op'?' · '+minsLabel(e.durationMinutes):''}</small><button type="button" class="v10-move-btn" data-arm-kind="${e.kind}" data-arm-id="${esc2(e.id)}" aria-label="Move ${esc2(e.title)}">↔</button></div>`;
  }

  function renderUnscheduled(){if(mode!=='shop')return'';const jobs=(db.jobs||[]).filter(j=>!['Closed','Declined'].includes(j.status)&&Core.jobOperations(db,j.id).length===0);if(!jobs.length)return'';return `<article class="panel"><div class="panel-head"><div><h3>Unscheduled jobs</h3><p class="muted">Generate operations from service-time defaults, then drag them into place.</p></div><span class="badge">${jobs.length}</span></div><div class="v10-unscheduled">${jobs.map(j=>{const v=getVehicle(j.vehicleId),c=getCustomer(j.customerId);return `<div class="v10-unscheduled-card"><strong>${esc2(j.id)} · ${esc2(c?.name||'Customer')}</strong><small>${esc2([v?.year,v?.make,v?.model].filter(Boolean).join(' '))}<br>${esc2((j.services||[]).join(', ')||'Diagnostic')}</small><button type="button" class="v10-chip-btn primary" data-plan-job="${esc2(j.id)}">Plan operations</button></div>`}).join('')}</div></article>`;}

  function dayLanes(){if(mode==='management')return[{id:'management',name:'Management / Sales',type:'appointments'}];const s=ensure();return laneMode==='resource'?s.resources.filter(x=>x.active!==false):s.technicians.filter(x=>x.active!==false);}
  function eventMatchesLane(e,lane){if(mode==='management')return true;if(laneMode==='resource')return e.resourceId===lane.id;return e.technicianId===lane.id;}

  function renderDay(){
    const day=dateKey(selectedDate),all=events().filter(e=>dateKey(e.start)===day),lanes=dayLanes(),slots=40;
    const timeHead=Array.from({length:slots},(_,i)=>{const min=480+i*15;return `<div class="v10-day-time" style="grid-column:${i+2}">${i%4===0?esc2(new Date('2000-01-01T'+timeFromMinutes(min)).toLocaleTimeString([],{hour:'numeric'})):''}</div>`}).join('');
    const rows=lanes.map(lane=>{const laneEvents=all.filter(e=>eventMatchesLane(e,lane)&&minutesSinceMidnight(e.start)>=480&&minutesSinceMidnight(e.start)<1080);const drops=Array.from({length:slots},(_,i)=>`<div class="v10-drop-slot" style="grid-column:${i+2}" data-drop-date="${day}" data-drop-time="${timeFromMinutes(480+i*15)}" data-drop-lane="${esc2(lane.id)}"></div>`).join('');const blocks=laneEvents.map(e=>{const start=Math.max(0,Math.floor((minutesSinceMidnight(e.start)-480)/15)),span=Math.max(1,Math.ceil((durationFor(e)+(e.bufferMinutes||0))/15)),left=start+2,maxSpan=Math.max(1,42-left);return `<div style="grid-column:${left}/span ${Math.min(span,maxSpan)};grid-row:1;z-index:3;min-width:0">${card(e,true)}</div>`}).join('');return `<div class="v10-day-row"><div class="v10-row-label">${esc2(lane.name)}<small>${esc2(lane.type||((lane.skills||[]).slice(0,2).join(' · ')))}</small></div>${drops}${blocks}</div>`}).join('');
    return `<div class="v10-day-board"><div class="v10-day-head"><div class="v10-lane-label">${mode==='management'?'Calendar':laneMode==='resource'?'Bay / Resource':'Technician'}</div>${timeHead}</div>${rows||'<div class="v10-empty">No active lanes configured.</div>'}</div>`;
  }

  function renderMulti(){
    const ds=dateList(),all=events(),slots=20,heads=ds.map(d=>`<div>${esc2(d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}))}</div>`).join('');
    const rows=Array.from({length:slots},(_,r)=>{const min=480+r*30;const cells=ds.map(d=>{const dk=dateKey(d),items=all.filter(e=>dateKey(e.start)===dk&&Math.floor((minutesSinceMidnight(e.start)-480)/30)===r);return `<div class="v10-grid-cell" data-drop-date="${dk}" data-drop-time="${timeFromMinutes(min)}">${items.map(e=>card(e,false)).join('')}</div>`}).join('');return `<div class="v10-multi-row" style="--days:${ds.length}"><div class="v10-multi-time">${esc2(new Date('2000-01-01T'+timeFromMinutes(min)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</div>${cells}</div>`}).join('');
    return `<div class="v10-multi-wrap"><div class="v10-multi-grid" style="--days:${ds.length}"><div class="v10-multi-head" style="--days:${ds.length}"><div>Time</div>${heads}</div>${rows}</div></div>`;
  }

  function renderMonth(){
    const start=monthGridStart(selectedDate),currentMonth=selectedDate.getMonth(),all=events(),heads=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="v10-month-head">${x}</div>`).join('');
    const days=Array.from({length:42},(_,i)=>{const d=addDays(start,i),dk=dateKey(d),items=all.filter(e=>dateKey(e.start)===dk).sort((a,b)=>String(a.start).localeCompare(String(b.start)));return `<div class="v10-month-day ${d.getMonth()!==currentMonth?'outside':''}" data-drop-date="${dk}"><div class="v10-month-date">${d.getDate()}</div>${items.slice(0,6).map(e=>card(e,false)).join('')}${items.length>6?`<div class="v10-statusline">+${items.length-6} more</div>`:''}</div>`}).join('');return `<div class="v10-month">${heads}${days}</div>`;
  }

  function renderCalendar(){return range==='day'?renderDay():range==='month'?renderMonth():renderMulti();}

  function render(){
    const root=document.getElementById('schedulingBody');if(!root)return;rendering=true;ensure();
    root.innerHTML=`<div class="v10-scheduler"><div class="v10-head"><div><p class="eyebrow">DRAGGABLE PLANNING + SHOP CAPACITY</p><h2>Scheduling</h2></div><div class="v10-mode-tabs"><button class="v10-chip-btn ${mode==='management'?'active':''}" data-mode="management">Management / Sales</button><button class="v10-chip-btn ${mode==='shop'?'active':''}" data-mode="shop">Shop Operations</button></div></div><div class="v10-help"><strong>Drag any card to reschedule it.</strong> On a phone or tablet, tap ↔ on the card and then tap the destination. Shop moves are checked for technician/bay conflicts before they are saved.</div><div class="v10-toolbar"><div class="v10-nav"><button class="v10-chip-btn" data-shift="-1">‹</button><button class="v10-chip-btn" data-today>Today</button><button class="v10-chip-btn" data-shift="1">›</button><label>Jump to<input type="date" data-jump value="${dateKey(selectedDate)}"></label><span class="v10-range-title">${esc2(rangeTitle())}</span></div><div class="v10-view-tabs">${[['day','Day'],['five','5 Day'],['week','Week'],['month','Month']].map(([k,l])=>`<button class="v10-chip-btn ${range===k?'active':''}" data-range="${k}">${l}</button>`).join('')}</div></div>${mode==='shop'&&range==='day'?`<div class="v10-lane-tabs"><span class="v10-statusline">Day lanes:</span><button class="v10-chip-btn ${laneMode==='resource'?'active':''}" data-lane="resource">Bay / Resource</button><button class="v10-chip-btn ${laneMode==='technician'?'active':''}" data-lane="technician">Technician</button><button class="v10-chip-btn primary" data-new-op>+ Operation</button></div>`:mode==='management'?'<div><button class="v10-chip-btn primary" data-new-event>+ Management event</button></div>':''}${renderUnscheduled()}<article class="panel"><div class="panel-head"><div><h3>${esc2(rangeTitle())}</h3><p class="muted">${mode==='shop'?'Work-order operations · assignments stay linked to technicians and resources.':'Sales, customer, vendor and management commitments.'}</p></div><span class="badge">${events().filter(e=>range==='month'?new Date(e.start).getMonth()===selectedDate.getMonth():dateList().some(d=>sameDay(d,e.start))).length} items</span></div>${renderCalendar()}</article></div>`;
    bind(root);rendering=false;
  }

  function bind(root){
    root.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;armedMove=null;render();}));
    root.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{range=RANGE_KEYS.includes(b.dataset.range)?b.dataset.range:'day';armedMove=null;render();}));
    root.querySelectorAll('[data-shift]').forEach(b=>b.addEventListener('click',()=>{shift(Number(b.dataset.shift));armedMove=null;render();}));
    root.querySelector('[data-today]')?.addEventListener('click',()=>{selectedDate=new Date();armedMove=null;render();});
    root.querySelector('[data-jump]')?.addEventListener('change',e=>{selectedDate=new Date(e.target.value+'T12:00');armedMove=null;render();});
    root.querySelectorAll('[data-lane]').forEach(b=>b.addEventListener('click',()=>{laneMode=b.dataset.lane;armedMove=null;render();}));
    root.querySelectorAll('[data-plan-job]').forEach(b=>b.addEventListener('click',()=>planJob(b.dataset.planJob)));
    root.querySelector('[data-new-op]')?.addEventListener('click',()=>window.TTTSchedulingUI?.openOperationModal?.());
    root.querySelector('[data-new-event]')?.addEventListener('click',()=>openEventModal());
    root.querySelectorAll('[data-arm-kind]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();armedMove={kind:b.dataset.armKind,id:b.dataset.armId};notify('Move selected · tap the destination');render();}));
    root.querySelectorAll('[data-event-kind]').forEach(el=>{el.addEventListener('dragstart',e=>{armedMove=null;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',JSON.stringify({kind:el.dataset.eventKind,id:el.dataset.eventId}));});el.addEventListener('click',e=>{if(e.target.closest('[data-arm-kind]'))return;openEvent(el.dataset.eventKind,el.dataset.eventId);});});
    root.querySelectorAll('[data-drop-date]').forEach(z=>{z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('drag-over');});z.addEventListener('dragleave',()=>z.classList.remove('drag-over'));z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('drag-over');let payload;try{payload=JSON.parse(e.dataTransfer.getData('text/plain'))}catch{return}applyMove(payload,z);});z.addEventListener('click',e=>{if(!armedMove||e.target.closest('[data-event-kind]'))return;const m=armedMove;armedMove=null;applyMove(m,z);});});
  }

  function targetStartFor(payload,zone){const dk=zone.dataset.dropDate,time=zone.dataset.dropTime;if(time)return localDateTime(dk,time);const existing=payload.kind==='op'?getOp(payload.id):payload.kind==='mgmt'?getAppointment(payload.id):getJob(payload.id);const source=existing?.start||existing?.appointment||new Date().toISOString(),d=new Date(source);return localDateTime(dk,p2(d.getHours())+':'+p2(d.getMinutes()));}
  function compatibility(candidate,zone){if(candidate.kind!=='op'||!zone.dataset.dropLane||range!=='day'||mode!=='shop')return{ok:true};const op=getOp(candidate.id),template=Core.getTemplate(db,op?.service);if(laneMode==='resource'){const r=ensure().resources.find(x=>x.id===zone.dataset.dropLane);if(template&&r&&r.type!==template.resourceType)return{ok:false,message:'That bay/resource is not configured for '+op.service+'.'};}else{const t=ensure().technicians.find(x=>x.id===zone.dataset.dropLane);if(template&&t&&!(t.skills||[]).includes(template.skill))return{ok:false,message:t.name+' is not currently qualified for '+op.service+'.'};}return{ok:true};}

  function applyMove(payload,zone){
    if(!payload||!payload.kind||!payload.id)return;const start=targetStartFor(payload,zone);
    if(payload.kind==='op'){
      const op=getOp(payload.id);if(!op)return;const compat=compatibility(payload,zone);if(!compat.ok){notify('Move blocked · '+compat.message);render();return;}
      const candidate=Object.assign({},op,{start});if(range==='day'&&zone.dataset.dropLane){if(laneMode==='resource')candidate.resourceId=zone.dataset.dropLane;else candidate.technicianId=zone.dataset.dropLane;}
      const windowHours=Core.businessWindow(db,new Date(start));const end=Core.endOf(candidate);if(!windowHours||new Date(start)<windowHours.start||end>windowHours.end){notify('Move blocked · operation falls outside configured shop hours.');render();return;}
      const conflicts=Core.operationConflicts(db,candidate,op.id);if(conflicts.length){notify('Move blocked · '+conflicts.map(c=>c.message).join(' '));render();return;}
      Object.assign(op,candidate);save();const j=getJob(op.jobId);if(j&&window.TTTSync?.queueJob)TTTSync.queueJob(j);selectedDate=new Date(start);notify('Operation moved to '+fmtDay(start)+' '+fmtTime(start));render();return;
    }
    if(payload.kind==='mgmt'){
      const a=getAppointment(payload.id);if(!a)return;a.start=start;save();selectedDate=new Date(start);notify('Management event moved');render();return;
    }
    if(payload.kind==='jobappt'){
      const j=getJob(payload.id);if(!j)return;const old=j.appointment;j.appointment=start;j.audit=j.audit||[];j.audit.push({at:new Date().toISOString(),actor:'usr_derek',action:'appointment_rescheduled',from:old,to:start});save();if(window.TTTSync?.queueJob)TTTSync.queueJob(j);selectedDate=new Date(start);notify(j.id+' appointment moved');render();
    }
  }

  function planJob(id){const j=getJob(id);if(!j)return;const created=Core.generateJobOperations(db,j,{start:j.appointment||selectedDate});save();if(window.TTTSync?.queueJob)TTTSync.queueJob(j);if(created[0])selectedDate=new Date(created[0].start);range='day';mode='shop';notify(created.length+' operation'+(created.length===1?'':'s')+' planned');render();}

  function openEvent(kind,id){if(kind==='op'){window.TTTSchedulingUI?.openOperationModal?.(id);return;}if(kind==='jobappt'){if(window.openJob)openJob(id);return;}if(kind==='mgmt')openEventModal(id);}
  function closeModal(){document.getElementById('v10ModalBackdrop')?.remove();}
  function openEventModal(id){
    closeModal();const s=ensure(),a=id?getAppointment(id):null,start=a?.start?new Date(a.start):new Date(selectedDate);if(!a)start.setHours(9,0,0,0);const back=document.createElement('div');back.id='v10ModalBackdrop';back.className='v10-modal-backdrop';back.innerHTML=`<div class="v10-modal"><div class="v10-modal-head"><h3>${a?'Edit':'New'} management event</h3><button type="button" class="v10-modal-close" data-close>×</button></div><form id="v10EventForm"><div class="v10-form-grid"><label>Title<input name="title" required value="${esc2(a?.title||'')}"></label><label>Type<select name="type">${['Sales / Consultation','Customer Drop-Off','Customer Pickup','Dealer Meeting','Vendor Meeting','Internal','Other'].map(x=>`<option ${a?.type===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Date<input type="date" name="date" required value="${dateKey(start)}"></label><label>Time<input type="time" name="time" required value="${p2(start.getHours())}:${p2(start.getMinutes())}"></label><label>Duration (min)<input type="number" min="5" step="5" name="duration" value="${Number(a?.durationMinutes||30)}"></label><label>Link job<select name="jobId"><option value="">None</option>${(db.jobs||[]).filter(j=>!['Closed','Declined'].includes(j.status)).map(j=>`<option value="${j.id}" ${a?.jobId===j.id?'selected':''}>${esc2(j.id)} · ${esc2(getCustomer(j.customerId)?.name||'')}</option>`).join('')}</select></label></div><label style="display:grid;gap:5px;margin-top:10px;color:#536176;font-size:12px;font-weight:700">Notes<textarea name="notes">${esc2(a?.notes||'')}</textarea></label><div class="v10-modal-actions">${a?'<button type="button" class="v10-chip-btn" data-delete>Delete</button>':''}<button type="button" class="v10-chip-btn" data-close>Cancel</button><button class="v10-chip-btn primary" type="submit">Save</button></div></form></div>`;document.body.appendChild(back);back.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);back.addEventListener('click',e=>{if(e.target===back)closeModal();});back.querySelector('#v10EventForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget),obj={id:a?.id||('appt_'+Date.now().toString(36)),title:fd.get('title'),type:fd.get('type'),start:fd.get('date')+'T'+fd.get('time'),durationMinutes:Math.max(5,Number(fd.get('duration')||30)),jobId:fd.get('jobId')||'',notes:fd.get('notes')||''};if(a)Object.assign(a,obj);else s.appointments.push(obj);save();selectedDate=new Date(obj.start);closeModal();notify('Management event saved');render();};back.querySelector('[data-delete]')?.addEventListener('click',()=>{s.appointments=s.appointments.filter(x=>x.id!==a.id);save();closeModal();notify('Management event deleted');render();});
  }

  function install(){injectCss();const nav=document.querySelector('.sidebar nav');if(nav&&!nav.dataset.v10Bound){nav.dataset.v10Bound='1';nav.addEventListener('click',e=>{const b=e.target.closest('[data-view="scheduling"]');if(b)setTimeout(render,0);},true);}document.addEventListener('click',e=>{if(e.target.closest('#opsGoSchedule'))setTimeout(render,0);},true);const root=document.getElementById('schedulingBody');if(root){new MutationObserver(()=>{if(rendering)return;if(document.getElementById('scheduling')?.classList.contains('active')&&!root.querySelector('.v10-scheduler'))setTimeout(render,0);}).observe(root,{childList:true});if(document.getElementById('scheduling')?.classList.contains('active'))render();}window.TTTSchedulerV10={render,applyMove,setView:v=>{if(RANGE_KEYS.includes(v)){range=v;render();}},version:'1.0'};}
  install();
})();