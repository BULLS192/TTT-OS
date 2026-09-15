(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.TTTSchedulingCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='0.9';
  const DEFAULT_SERVICE_TEMPLATES=[
    {id:'svc_diagnostic',service:'Diagnostic',defaultMinutes:15,bufferMinutes:5,resourceType:'diagnostic',skill:'General technician',active:true},
    {id:'svc_tint',service:'Window tint',defaultMinutes:240,bufferMinutes:15,resourceType:'tint',skill:'Tint installer',active:true},
    {id:'svc_audio',service:'Car stereo installation',defaultMinutes:240,bufferMinutes:15,resourceType:'install',skill:'Audio technician',active:true},
    {id:'svc_alarm',service:'Car alarms',defaultMinutes:120,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_radar',service:'Radar detectors',defaultMinutes:90,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_dashcam',service:'Dash cams',defaultMinutes:90,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_ppf',service:'Paint protection',defaultMinutes:360,bufferMinutes:20,resourceType:'detail',skill:'Film installer',active:true},
    {id:'svc_marine',service:'Marine audio',defaultMinutes:360,bufferMinutes:20,resourceType:'install',skill:'Audio technician',active:true},
    {id:'svc_gps',service:'GPS trackers',defaultMinutes:60,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_intlight',service:'Interior lighting',defaultMinutes:120,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_extlight',service:'Exterior lighting',defaultMinutes:150,bufferMinutes:10,resourceType:'install',skill:'Electronics',active:true},
    {id:'svc_truck',service:'Truck accessories',defaultMinutes:180,bufferMinutes:15,resourceType:'install',skill:'General technician',active:true},
    {id:'svc_other',service:'Other',defaultMinutes:60,bufferMinutes:10,resourceType:'install',skill:'General technician',active:true}
  ];

  const DEFAULT_TECHNICIANS=[
    {id:'tech_derek',name:'Derek Thompson',active:true,skills:['General technician','Tint installer','Audio technician','Electronics','Film installer'],workingHours:{start:'08:00',end:'18:00'}}
  ];

  const DEFAULT_RESOURCES=[
    {id:'res_tint_1',name:'Tint Bay 1',type:'tint',active:true},
    {id:'res_install_1',name:'Install Bay 1',type:'install',active:true},
    {id:'res_diag_1',name:'Diagnostic Area',type:'diagnostic',active:true},
    {id:'res_detail_1',name:'Film / Detail Bay',type:'detail',active:true}
  ];

  const DEFAULT_HOURS={0:null,1:{start:'08:00',end:'18:00'},2:{start:'08:00',end:'18:00'},3:{start:'08:00',end:'18:00'},4:{start:'08:00',end:'18:00'},5:{start:'08:00',end:'18:00'},6:{start:'09:00',end:'14:00'}};
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function uid(prefix){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
  function parseDate(v){const d=v instanceof Date?new Date(v.getTime()):new Date(v);return Number.isNaN(d.getTime())?null:d;}
  function isoLocal(d){const x=parseDate(d);if(!x)return '';const p=n=>String(n).padStart(2,'0');return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate())+'T'+p(x.getHours())+':'+p(x.getMinutes());}
  function addMinutes(v,m){const d=parseDate(v);if(!d)return null;d.setMinutes(d.getMinutes()+Number(m||0));return d;}
  function endOf(op){return addMinutes(op.start,Number(op.durationMinutes||0)+Number(op.bufferMinutes||0));}
  function overlaps(aStart,aEnd,bStart,bEnd){return aStart<bEnd&&bStart<aEnd;}
  function normalizeName(s){return String(s||'').trim().toLowerCase();}

  function ensureModel(db){
    if(!db||typeof db!=='object')throw new Error('A database object is required');
    if(!db.scheduling||typeof db.scheduling!=='object')db.scheduling={};
    const s=db.scheduling;s.version=VERSION;
    if(!s.settings)s.settings={timezone:'America/Chicago',businessHours:clone(DEFAULT_HOURS),slotMinutes:15};
    if(!s.settings.businessHours)s.settings.businessHours=clone(DEFAULT_HOURS);
    if(!Array.isArray(s.serviceTemplates))s.serviceTemplates=[];
    DEFAULT_SERVICE_TEMPLATES.forEach(t=>{if(!s.serviceTemplates.some(x=>normalizeName(x.service)===normalizeName(t.service)))s.serviceTemplates.push(clone(t));});
    if(!Array.isArray(s.technicians))s.technicians=[];
    DEFAULT_TECHNICIANS.forEach(t=>{if(!s.technicians.some(x=>x.id===t.id||normalizeName(x.name)===normalizeName(t.name)))s.technicians.push(clone(t));});
    if(!Array.isArray(s.resources))s.resources=[];
    DEFAULT_RESOURCES.forEach(r=>{if(!s.resources.some(x=>x.id===r.id||normalizeName(x.name)===normalizeName(r.name)))s.resources.push(clone(r));});
    if(!Array.isArray(s.appointments))s.appointments=[];
    if(!Array.isArray(s.operations))s.operations=[];
    if(Array.isArray(db.jobs))s.operations.forEach(op=>{const j=db.jobs.find(x=>x.id===op.jobId);if(j)op.workOrderId=j.workOrderId||null;});
    return s;
  }
  function getTemplate(db,service){const s=ensureModel(db);return s.serviceTemplates.find(x=>normalizeName(x.service)===normalizeName(service))||s.serviceTemplates.find(x=>x.service==='Other');}
  function getResourceForType(db,type){return ensureModel(db).resources.find(r=>r.active!==false&&r.type===type)||null;}
  function getTechnicianForSkill(db,skill){const techs=ensureModel(db).technicians.filter(t=>t.active!==false);return techs.find(t=>(t.skills||[]).includes(skill))||techs[0]||null;}
  function jobOperations(db,jobId){return ensureModel(db).operations.filter(o=>o.jobId===jobId);}
  function operationConflicts(db,candidate,ignoreId){
    const cStart=parseDate(candidate.start);if(!cStart)return [];const cEnd=endOf(candidate);if(!cEnd)return [];const conflicts=[];
    ensureModel(db).operations.forEach(op=>{if(op.id===ignoreId||op.status==='cancelled'||!op.start)return;const oStart=parseDate(op.start),oEnd=endOf(op);if(!oStart||!oEnd||!overlaps(cStart,cEnd,oStart,oEnd))return;if(candidate.technicianId&&op.technicianId===candidate.technicianId)conflicts.push({type:'technician',operationId:op.id,message:'Technician is already scheduled during this time.'});if(candidate.resourceId&&op.resourceId===candidate.resourceId)conflicts.push({type:'resource',operationId:op.id,message:'Shop resource is already scheduled during this time.'});if(candidate.jobId&&op.jobId===candidate.jobId&&op.service===candidate.service&&op.id!==candidate.id)conflicts.push({type:'duplicate',operationId:op.id,message:'This service already has a scheduled operation for the job.'});});
    return conflicts;
  }
  function businessWindow(db,date){const d=parseDate(date);if(!d)return null;const h=ensureModel(db).settings.businessHours[d.getDay()];if(!h)return null;const[sh,sm]=h.start.split(':').map(Number),[eh,em]=h.end.split(':').map(Number);const start=new Date(d);start.setHours(sh,sm,0,0);const end=new Date(d);end.setHours(eh,em,0,0);return{start,end};}
  function alignToSlot(date,slotMinutes){const d=parseDate(date);if(!d)return null;const slot=Math.max(5,Number(slotMinutes||15));const mins=d.getMinutes(),rounded=Math.ceil(mins/slot)*slot;d.setMinutes(rounded,0,0);return d;}
  function nextBusinessStart(db,from){let d=alignToSlot(from,ensureModel(db).settings.slotMinutes)||new Date();for(let i=0;i<15;i++){const w=businessWindow(db,d);if(!w){d.setDate(d.getDate()+1);d.setHours(0,0,0,0);continue;}if(d<w.start)return new Date(w.start);if(d<w.end)return d;d.setDate(d.getDate()+1);d.setHours(0,0,0,0);}return d;}
  function suggestNextStart(db,opts){const durationMinutes=Math.max(5,Number(opts.durationMinutes||15)),bufferMinutes=Math.max(0,Number(opts.bufferMinutes||0));let cursor=nextBusinessStart(db,opts.from||new Date());const step=Math.max(5,Number(ensureModel(db).settings.slotMinutes||15));for(let i=0;i<14*24*60/step;i++){const w=businessWindow(db,cursor);if(!w){cursor=nextBusinessStart(db,addMinutes(cursor,step));continue;}const end=addMinutes(cursor,durationMinutes+bufferMinutes);if(end>w.end){cursor=nextBusinessStart(db,new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1));continue;}const candidate={id:'__candidate',start:isoLocal(cursor),durationMinutes,bufferMinutes,technicianId:opts.technicianId||'',resourceId:opts.resourceId||'',jobId:opts.jobId||'',service:opts.service||''};if(operationConflicts(db,candidate,'__candidate').length===0)return new Date(cursor);cursor=addMinutes(cursor,step);}return cursor;}
  function generateJobOperations(db,job,opts){ensureModel(db);if(!job||!job.id)throw new Error('A job with an id is required');const existing=jobOperations(db,job.id);if(existing.length&&!opts?.replace)return existing;if(opts?.replace)db.scheduling.operations=db.scheduling.operations.filter(o=>o.jobId!==job.id);const services=(job.services&&job.services.length?job.services:['Diagnostic']).slice();let cursor=parseDate(opts?.start||job.appointment)||new Date();const created=[];services.forEach(service=>{const t=getTemplate(db,service)||getTemplate(db,'Other'),tech=getTechnicianForSkill(db,t.skill),resource=getResourceForType(db,t.resourceType),suggested=suggestNextStart(db,{from:cursor,durationMinutes:t.defaultMinutes,bufferMinutes:t.bufferMinutes,technicianId:tech?.id,resourceId:resource?.id,jobId:job.id,service});const op={id:uid('op'),jobId:job.id,workOrderId:job.workOrderId||null,service,templateId:t.id,start:isoLocal(suggested),durationMinutes:t.defaultMinutes,bufferMinutes:t.bufferMinutes,technicianId:tech?.id||'',resourceId:resource?.id||'',status:'scheduled',actualStart:null,actualEnd:null,notes:''};db.scheduling.operations.push(op);created.push(op);cursor=endOf(op)||cursor;});return created;}
  function upsertOperation(db,input){ensureModel(db);const op=Object.assign({id:uid('op'),jobId:'',workOrderId:null,service:'Diagnostic',start:'',durationMinutes:15,bufferMinutes:0,technicianId:'',resourceId:'',status:'scheduled',actualStart:null,actualEnd:null,notes:''},input||{});op.durationMinutes=Math.max(5,Number(op.durationMinutes||15));op.bufferMinutes=Math.max(0,Number(op.bufferMinutes||0));const idx=db.scheduling.operations.findIndex(x=>x.id===op.id);if(idx>=0)db.scheduling.operations[idx]=op;else db.scheduling.operations.push(op);return op;}
  function removeOperation(db,id){ensureModel(db);const before=db.scheduling.operations.length;db.scheduling.operations=db.scheduling.operations.filter(x=>x.id!==id);return before-db.scheduling.operations.length;}
  function setOperationStatus(db,id,status,at){const op=ensureModel(db).operations.find(x=>x.id===id);if(!op)return null;const now=at||new Date().toISOString();op.status=status;if(status==='in_progress'&&!op.actualStart)op.actualStart=now;if(status==='complete'&&!op.actualEnd){if(!op.actualStart)op.actualStart=now;op.actualEnd=now;}return op;}
  function actualMinutes(op){const a=parseDate(op.actualStart),b=parseDate(op.actualEnd);if(!a||!b)return null;return Math.max(0,Math.round((b-a)/60000));}
  function variance(op){const actual=actualMinutes(op);if(actual===null)return null;return{planned:Number(op.durationMinutes||0),actual,difference:actual-Number(op.durationMinutes||0),percent:Number(op.durationMinutes||0)?Math.round(((actual-Number(op.durationMinutes||0))/Number(op.durationMinutes||0))*100):0};}
  function dayOperations(db,date){const d=parseDate(date);if(!d)return [];const y=d.getFullYear(),m=d.getMonth(),day=d.getDate();return ensureModel(db).operations.filter(o=>{const x=parseDate(o.start);return x&&x.getFullYear()===y&&x.getMonth()===m&&x.getDate()===day&&o.status!=='cancelled';}).sort((a,b)=>String(a.start).localeCompare(String(b.start)));}
  function capacitySummary(db,date){const ops=dayOperations(db,date),scheduledMinutes=ops.reduce((n,o)=>n+Number(o.durationMinutes||0),0),activeTechs=ensureModel(db).technicians.filter(t=>t.active!==false).length,w=businessWindow(db,date),availableMinutes=w?Math.max(0,(w.end-w.start)/60000)*activeTechs:0;return{scheduledMinutes,availableMinutes,utilization:availableMinutes?Math.round(scheduledMinutes/availableMinutes*100):0,operationCount:ops.length};}
  return{VERSION,DEFAULT_SERVICE_TEMPLATES,DEFAULT_TECHNICIANS,DEFAULT_RESOURCES,ensureModel,getTemplate,getResourceForType,getTechnicianForSkill,jobOperations,operationConflicts,businessWindow,suggestNextStart,generateJobOperations,upsertOperation,removeOperation,setOperationStatus,actualMinutes,variance,dayOperations,capacitySummary,isoLocal,endOf};
});