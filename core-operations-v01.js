// TTT OS Core Operations Consolidation v1.0
(function(){
'use strict';
const DB_KEY='ttt-os-v0.2';
let client=null,orgId=null,userId=null,ready=false,applying=false,channel=null,timer=null,lastHash='';
const clone=v=>JSON.parse(JSON.stringify(v));
const now=()=>new Date().toISOString();
const clean=v=>v==null||String(v).trim()===''?null:String(v);
const num=(v,d=0)=>{const n=Number(v);return v==null||v===''||Number.isNaN(n)?d:n;};
function jobs(){return Array.isArray(window.db?.jobs)?window.db.jobs:[];}
function stateHash(){return JSON.stringify(jobs().map(j=>({id:j.id,workOrderId:j.workOrderId,finalAuthorization:j.finalAuthorization,workExecution:j.workExecution,changeOrders:j.changeOrders})));}

function workOrderRow(j){
  const w=j.workExecution||{}, changes=Array.isArray(j.changeOrders)?j.changeOrders:[];
  const approved=changes.filter(x=>String(x.status).toLowerCase()==='approved').reduce((s,x)=>s+num(x.totalDelta),0);
  return {organization_id:orgId,id:String(j.workOrderId),job_id:String(j.id),status:clean(j.status)||'open',
    authorized_total:num(j.quote?.snapshot?.estimateTotal??j.estimateTotal)+approved,
    started_at:w.startedAt||null,completed_at:w.completedAt||null,
    final_authorization:j.finalAuthorization&&typeof j.finalAuthorization==='object'?clone(j.finalAuthorization):{},
    notes:clean(w.notes),source_json:{jobId:j.id,workOrderId:j.workOrderId},
    archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};
}
function changeOrderRow(j,co){
  return {organization_id:orgId,id:String(co.id),job_id:String(j.id),work_order_id:String(j.workOrderId),
    status:clean(co.status)||'Draft',reason:clean(co.reason),description:clean(co.description)||'',
    schedule_impact:clean(co.scheduleImpact),parts_delta:num(co.partsDelta),labor_delta:num(co.laborDelta),
    fees_delta:num(co.feesDelta),total_delta:num(co.totalDelta),signer_name:clean(co.signerName),
    approved_at:co.approvedAt||null,approval_method:clean(co.approvalMethod),
    previous_authorized_total:co.previousAuthorizedTotal==null?null:num(co.previousAuthorizedTotal),
    revised_authorized_total:co.revisedAuthorizedTotal==null?null:num(co.revisedAuthorizedTotal),
    source_json:clone(co),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};
}
function lineRow(j,line,index){
  return {organization_id:orgId,id:String(line.id||('WL-'+String(index+1).padStart(3,'0'))),
    work_order_id:String(j.workOrderId),job_id:String(j.id),change_order_id:clean(line.changeOrderId),
    line_type:'service',category:clean(line.category),brand:clean(line.brand),model:clean(line.model),
    quantity:num(line.qty,1),status:clean(line.status)||'Not Started',serial_number:clean(line.serialNumber),
    installed_location:clean(line.installedLocation),actual_labor_hours:line.laborHours===''||line.laborHours==null?null:num(line.laborHours),
    material_cost:line.materialCost==null?null:num(line.materialCost),labor_cost:line.laborCost==null?null:num(line.laborCost),
    technician_notes:clean(line.technicianNotes),completion_notes:clean(line.completionNotes),sort_order:index+1,
    source_json:clone(line),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};
}
async function load(){
  if(!client||!orgId)return;
  const [wo,lines,co]=await Promise.all([
    client.from('work_orders').select('*').eq('organization_id',orgId).is('archived_at',null),
    client.from('work_order_lines').select('*').eq('organization_id',orgId).is('archived_at',null),
    client.from('change_orders').select('*').eq('organization_id',orgId).is('archived_at',null)
  ]);
  const bad=[wo,lines,co].find(x=>x.error);if(bad)throw bad.error;
  applying=true;
  try{
    for(const w of wo.data||[]){
      const j=jobs().find(x=>String(x.id)===String(w.job_id));if(!j)continue;
      j.workOrderId=w.id;
      if(w.final_authorization&&Object.keys(w.final_authorization).length)j.finalAuthorization=clone(w.final_authorization);
      const ls=(lines.data||[]).filter(x=>x.work_order_id===w.id).sort((a,b)=>a.sort_order-b.sort_order).map(x=>Object.assign({},x.source_json||{},{
        id:x.id,category:x.category||'',brand:x.brand||'',model:x.model||'',qty:Number(x.quantity||1),status:x.status,
        changeOrderId:x.change_order_id||'',serialNumber:x.serial_number||'',installedLocation:x.installed_location||'',
        laborHours:x.actual_labor_hours??'',materialCost:x.material_cost??'',laborCost:x.labor_cost??'',
        technicianNotes:x.technician_notes||'',completionNotes:x.completion_notes||''
      }));
      j.workExecution=Object.assign({},j.workExecution||{},{startedAt:w.started_at||'',completedAt:w.completed_at||'',notes:w.notes||'',lines:ls});
      j.changeOrders=(co.data||[]).filter(x=>x.job_id===j.id).map(x=>Object.assign({},x.source_json||{},{
        id:x.id,status:x.status,reason:x.reason||'',description:x.description||'',scheduleImpact:x.schedule_impact||'',
        partsDelta:Number(x.parts_delta||0),laborDelta:Number(x.labor_delta||0),feesDelta:Number(x.fees_delta||0),totalDelta:Number(x.total_delta||0),
        signerName:x.signer_name||'',approvedAt:x.approved_at||'',approvalMethod:x.approval_method||'',
        previousAuthorizedTotal:x.previous_authorized_total,revisedAuthorizedTotal:x.revised_authorized_total
      }));
    }
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    window.TTTCoreRelational?.captureAll?.();
    lastHash=stateHash();
    if(typeof render==='function')render();
  }finally{applying=false;}
}
async function sync(){
  if(!ready||applying)return;
  const hash=stateHash();if(hash===lastHash)return;
  for(const j of jobs()){
    if(!j.workOrderId)continue;
    const wo=await client.from('work_orders').upsert(workOrderRow(j),{onConflict:'organization_id,id'});if(wo.error)throw wo.error;
    const changes=Array.isArray(j.changeOrders)?j.changeOrders:[];
    for(const co of changes){const r=await client.from('change_orders').upsert(changeOrderRow(j,co),{onConflict:'organization_id,id'});if(r.error)throw r.error;}
    const lines=Array.isArray(j.workExecution?.lines)?j.workExecution.lines:[];
    for(let i=0;i<lines.length;i++){const r=await client.from('work_order_lines').upsert(lineRow(j,lines[i],i),{onConflict:'organization_id,id'});if(r.error)throw r.error;}
    const currentCo=new Set(changes.map(x=>String(x.id))),currentLines=new Set(lines.map((x,i)=>String(x.id||('WL-'+String(i+1).padStart(3,'0')))));
    const [oldCo,oldLines]=await Promise.all([
      client.from('change_orders').select('id').eq('organization_id',orgId).eq('job_id',j.id).is('archived_at',null),
      client.from('work_order_lines').select('id').eq('organization_id',orgId).eq('job_id',j.id).is('archived_at',null)
    ]);
    if(oldCo.error)throw oldCo.error;if(oldLines.error)throw oldLines.error;
    for(const row of oldCo.data||[]){if(!currentCo.has(String(row.id))){const ar=await client.from('change_orders').update({archived_at:now(),updated_at:now(),updated_by:userId}).eq('organization_id',orgId).eq('id',row.id);if(ar.error)throw ar.error;}}
    for(const row of oldLines.data||[]){if(!currentLines.has(String(row.id))){const ar=await client.from('work_order_lines').update({archived_at:now(),updated_at:now(),updated_by:userId}).eq('organization_id',orgId).eq('id',row.id);if(ar.error)throw ar.error;}}
  }
  lastHash=stateHash();
  window.TTTCloud?.audit?.('core_operations',null,'operations_normalized',{jobs:jobs().filter(j=>j.workOrderId).map(j=>j.id)});
}
function queue(){if(!ready||applying)return;clearTimeout(timer);timer=setTimeout(()=>sync().catch(e=>console.error('Core operations sync failed',e)),180);}
function subscribe(){
  if(channel)return;channel=client.channel('ttt-core-operations-'+orgId);
  ['work_orders','work_order_lines','change_orders'].forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+orgId},()=>{clearTimeout(timer);timer=setTimeout(()=>load().catch(console.error),180);}));
  channel.subscribe();
}
async function jobCost(jobId){
  const {data,error}=await client.from('job_cost_summary').select('*').eq('organization_id',orgId).eq('job_id',jobId).maybeSingle();
  if(error)throw error;return data;
}
async function init(){
  for(let i=0;i<160;i++){if(window.TTTCloud?.ready&&window.TTTCloud.organizationId){client=window.TTTCloud.client;orgId=window.TTTCloud.organizationId;userId=window.TTTCloud.userId;break;}await new Promise(r=>setTimeout(r,125));}
  if(!client)return console.error('Core operations could not initialize');
  await load();subscribe();ready=true;lastHash=stateHash();
}
const priorRender=typeof render==='function'?render:null;
if(priorRender){render=function(){const r=priorRender.apply(this,arguments);queue();return r;};}
window.TTTCoreOperations={get ready(){return ready;},syncNow:sync,reload:load,jobCost};
window.addEventListener('ttt:job-operational-change',queue);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
})();