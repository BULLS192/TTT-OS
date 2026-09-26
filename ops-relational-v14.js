// TTT OS operational relational adapter v1.4 — scheduling, warranties, work orders and change orders are relational authority.
// Scheduling and warranties use Supabase rows as the authoritative shared data.
(function(){
  'use strict';

  const DB_KEY='ttt-os-v0.2';
  let client=null,orgId=null,userId=null,profile=null,ready=false,applying=false,channel=null,timer=null;
  const priorSave=typeof save==='function'?save:null;
  const snapshots={
    resources:new Map(),templates:new Map(),technicians:new Map(),operations:new Map(),warranties:new Map(),workOrders:new Map(),changeOrders:new Map()
  };
  let settingsHash='';

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function hash(v){return JSON.stringify(v);}
  function now(){return new Date().toISOString();}
  function clean(v){return v==null||String(v).trim()===''?null:String(v);}
  function n(v,d=null){const x=Number(v);return v==null||v===''||Number.isNaN(x)?d:x;}
  function admin(){return profile?.role==='owner_admin';}
  function manager(){return ['owner_admin','manager'].includes(profile?.role);}
  function sched(){
    if(!db.scheduling||typeof db.scheduling!=='object')db.scheduling={};
    const s=db.scheduling;
    if(!s.settings)s.settings={timezone:'America/Chicago',businessHours:{},slotMinutes:15};
    if(!Array.isArray(s.resources))s.resources=[];
    if(!Array.isArray(s.serviceTemplates))s.serviceTemplates=[];
    if(!Array.isArray(s.technicians))s.technicians=[];
    if(!Array.isArray(s.operations))s.operations=[];
    if(!Array.isArray(s.appointments))s.appointments=[];
    return s;
  }
  function persist(){
    try{localStorage.setItem(DB_KEY,JSON.stringify(db));}catch(err){console.warn('TTT operational cache write failed',err);}
  }
  function setMap(map,arr){map.clear();(arr||[]).forEach(x=>map.set(String(x.id),hash(x)));}
  function captureAll(){
    const s=sched();
    setMap(snapshots.resources,s.resources);
    setMap(snapshots.templates,s.serviceTemplates);
    setMap(snapshots.technicians,s.technicians);
    setMap(snapshots.operations,s.operations);
    setMap(snapshots.warranties,Array.isArray(db.warranties)?db.warranties:[]);
    setMap(snapshots.workOrders,deriveWorkOrders());
    setMap(snapshots.changeOrders,deriveChangeOrders());
    settingsHash=hash(s.settings||{});
  }
  function obj(row){return Object.assign({},row.source_json||{},{id:String(row.id)});}
  function rowResource(x){return{organization_id:orgId,id:String(x.id),name:clean(x.name)||String(x.id),resource_type:clean(x.type)||'other',active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function rowTemplate(x){return{organization_id:orgId,id:String(x.id),service:clean(x.service)||String(x.id),default_minutes:Math.max(5,n(x.defaultMinutes,60)),buffer_minutes:Math.max(0,n(x.bufferMinutes,0)),resource_type:clean(x.resourceType),required_skill:clean(x.skill),active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function rowTech(x){return{organization_id:orgId,id:String(x.id),person_id:clean(x.personId),display_name:clean(x.name)||String(x.id),skills:Array.isArray(x.skills)?x.skills:[],working_hours:x.workingHours&&typeof x.workingHours==='object'?x.workingHours:{},active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function asTimestamp(v){if(!v)return null;const s=String(v);if(!(/[zZ]$|[+-]\d\d:\d\d$/.test(s)))return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString();}
  function rowOperation(x){return{organization_id:orgId,id:String(x.id),job_id:clean(x.jobId),work_order_id:clean(x.workOrderId),service:clean(x.service)||'Other',template_id:clean(x.templateId),start_at:asTimestamp(x.start),local_start:clean(x.start),timezone:'America/Chicago',duration_minutes:Math.max(5,n(x.durationMinutes,15)),buffer_minutes:Math.max(0,n(x.bufferMinutes,0)),technician_id:clean(x.technicianId),resource_id:clean(x.resourceId),status:clean(x.status)||'scheduled',actual_start:asTimestamp(x.actualStart),actual_end:asTimestamp(x.actualEnd),notes:clean(x.notes),source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}
  function jobs(){return Array.isArray(db.jobs)?db.jobs:[];}
  function deriveWorkOrders(){
    return jobs().filter(j=>j.workOrderId).map(j=>{
      const changes=Array.isArray(j.changeOrders)?j.changeOrders:[];
      const approvedDelta=changes.filter(x=>String(x.status||'').toLowerCase()==='approved').reduce((n,x)=>n+Number(x.totalDelta||0),0);
      const authorized=Number(j.finalAuthorization?.total??j.authorizedTotal??j.estimateTotal??0)+approvedDelta;
      return {id:String(j.workOrderId),jobId:String(j.id),status:j.status||'open',authorizedTotal:authorized,startedAt:j.workStartedAt||null,completedAt:j.completedAt||null,finalAuthorization:j.finalAuthorization||{},notes:j.workOrderNotes||'',source:{jobId:j.id,workOrderId:j.workOrderId}};
    });
  }
  function deriveChangeOrders(){
    const rows=[];
    jobs().forEach(j=>{
      if(!j.workOrderId)return;
      (Array.isArray(j.changeOrders)?j.changeOrders:[]).forEach(co=>rows.push(Object.assign({},co,{jobId:j.id,workOrderId:j.workOrderId})));
    });
    return rows;
  }
  function rowWorkOrder(x){return{organization_id:orgId,id:String(x.id),job_id:String(x.jobId),status:clean(x.status)||'open',authorized_total:n(x.authorizedTotal,0),started_at:asTimestamp(x.startedAt),completed_at:asTimestamp(x.completedAt),final_authorization:x.finalAuthorization&&typeof x.finalAuthorization==='object'?x.finalAuthorization:{},notes:clean(x.notes),source_json:x.source&&typeof x.source==='object'?clone(x.source):{jobId:x.jobId,workOrderId:x.id},archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}
  function rowChangeOrder(x){return{organization_id:orgId,id:String(x.id),job_id:String(x.jobId),work_order_id:String(x.workOrderId),status:clean(x.status)||'Draft',reason:clean(x.reason),description:clean(x.description)||'',schedule_impact:clean(x.scheduleImpact),parts_delta:n(x.partsDelta,0),labor_delta:n(x.laborDelta,0),fees_delta:n(x.feesDelta,0),total_delta:n(x.totalDelta,0),signer_name:clean(x.signerName),approved_at:asTimestamp(x.approvedAt),approval_method:clean(x.approvalMethod),previous_authorized_total:n(x.previousAuthorizedTotal,null),revised_authorized_total:n(x.revisedAuthorizedTotal,null),source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}
  function hydrateWorkRecords(workRows,changeRows){
    const byJob=new Map((workRows||[]).map(r=>[String(r.job_id),r]));
    const changesByJob=new Map();
    (changeRows||[]).forEach(r=>{const k=String(r.job_id);if(!changesByJob.has(k))changesByJob.set(k,[]);changesByJob.get(k).push(Object.assign({},r.source_json||{},{id:r.id,status:r.status,reason:r.reason,description:r.description,scheduleImpact:r.schedule_impact,partsDelta:Number(r.parts_delta||0),laborDelta:Number(r.labor_delta||0),feesDelta:Number(r.fees_delta||0),totalDelta:Number(r.total_delta||0),signerName:r.signer_name,approvedAt:r.approved_at,approvalMethod:r.approval_method,previousAuthorizedTotal:r.previous_authorized_total,revisedAuthorizedTotal:r.revised_authorized_total}));});
    jobs().forEach(j=>{
      const wo=byJob.get(String(j.id));
      if(wo){j.workOrderId=wo.id;j.finalAuthorization=wo.final_authorization||j.finalAuthorization||{};j.workOrderNotes=wo.notes||j.workOrderNotes||'';j.workStartedAt=wo.started_at||j.workStartedAt||null;j.completedAt=wo.completed_at||j.completedAt||null;}
      j.changeOrders=changesByJob.get(String(j.id))||[];
    });
  }

  function rowWarranty(x){return{organization_id:orgId,id:String(x.id),job_id:clean(x.jobId),customer_id:clean(x.customerId),vehicle_id:clean(x.vehicleId),warranty_type:clean(x.type||x.warrantyType),status:clean(x.status)||'active',provider:clean(x.provider),description:clean(x.description||x.notes),starts_on:clean(x.startsOn||x.startDate),expires_on:clean(x.expiresOn||x.expiryDate),terms:x.terms&&typeof x.terms==='object'?x.terms:{},source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}

  async function loadAll(){
    const [resR,tplR,techR,opR,warR,setR,woR,coR]=await Promise.all([
      client.from('shop_resources').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('service_templates').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('scheduling_technicians').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('work_operations').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('warranties').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('scheduling_settings').select('settings').eq('organization_id',orgId).maybeSingle(),
      client.from('work_orders').select('*').eq('organization_id',orgId).is('archived_at',null),
      client.from('change_orders').select('*').eq('organization_id',orgId).is('archived_at',null)
    ]);
    const all=[resR,tplR,techR,opR,warR,setR,woR,coR];
    const bad=all.find(x=>x.error);
    if(bad)throw bad.error;

    applying=true;
    try{
      const s=sched();
      s.resources=(resR.data||[]).map(obj);
      s.serviceTemplates=(tplR.data||[]).map(obj);
      s.technicians=(techR.data||[]).map(obj);
      s.operations=(opR.data||[]).map(obj);
      if(setR.data?.settings)s.settings=clone(setR.data.settings);
      db.warranties=(warR.data||[]).map(obj);
      hydrateWorkRecords(woR.data||[],coR.data||[]);
      persist();
      if(typeof render==='function')render();
      window.TTTCloud?.setOperationalRelationalLoaded?.(true);
      captureAll();
    }finally{applying=false;}
  }

  async function syncArray(table,arr,map,rowFn,allowWrite=true){
    if(!allowWrite){setMap(map,arr);return true;}
    const current=new Map((arr||[]).map(x=>[String(x.id),x]));
    const changed=[];
    for(const [id,x] of current){if(map.get(id)!==hash(x))changed.push(x);}
    const removed=[...map.keys()].filter(id=>!current.has(id));
    if(changed.length){
      const {error}=await client.from(table).upsert(changed.map(rowFn),{onConflict:'organization_id,id'});
      if(error){console.error('TTT operational upsert failed',table,error);return false;}
    }
    if(removed.length){
      const {error}=await client.from(table).update({archived_at:now(),updated_at:now(),updated_by:userId}).eq('organization_id',orgId).in('id',removed);
      if(error){console.error('TTT operational archive failed',table,error);return false;}
    }
    setMap(map,arr);
    return true;
  }

  async function syncAll(){
    if(!ready||applying||!client||!orgId)return;
    const s=sched();
    const status=document.getElementById('tttCloudStatus');
    if(status){status.textContent='Saving…';status.dataset.state='busy';}
    if(admin()&&settingsHash!==hash(s.settings||{})){
      const {error}=await client.from('scheduling_settings').upsert({organization_id:orgId,settings:clone(s.settings||{}),updated_at:now(),updated_by:userId},{onConflict:'organization_id'});
      if(error){console.error('TTT scheduling settings save failed',error);if(status){status.textContent='Schedule sync error';status.dataset.state='error';}return;}
      settingsHash=hash(s.settings||{});
    }
    const steps=[
      ['shop_resources',s.resources,snapshots.resources,rowResource,manager()],
      ['service_templates',s.serviceTemplates,snapshots.templates,rowTemplate,manager()],
      ['scheduling_technicians',s.technicians,snapshots.technicians,rowTech,admin()],
      ['work_operations',s.operations,snapshots.operations,rowOperation,true],
      ['warranties',Array.isArray(db.warranties)?db.warranties:[],snapshots.warranties,rowWarranty,true],
      ['work_orders',deriveWorkOrders(),snapshots.workOrders,rowWorkOrder,true],
      ['change_orders',deriveChangeOrders(),snapshots.changeOrders,rowChangeOrder,true]
    ];
    for(const step of steps){if(!(await syncArray(...step))){if(status){status.textContent='Operational sync error';status.dataset.state='error';}return;}}
    if(status){status.textContent='Synced';status.dataset.state='ok';}
  }
  function queue(){if(!ready||applying)return;clearTimeout(timer);timer=setTimeout(syncAll,260);}

  function applyArray(kind,row,eventType){
    if(!row)return;
    applying=true;
    try{
      const s=sched();
      const targets={
        shop_resources:[s.resources,snapshots.resources],
        service_templates:[s.serviceTemplates,snapshots.templates],
        scheduling_technicians:[s.technicians,snapshots.technicians],
        work_operations:[s.operations,snapshots.operations],
        warranties:[db.warranties||(db.warranties=[]),snapshots.warranties]
      };
      const [arr,map]=targets[kind];
      const id=String(row.id),idx=arr.findIndex(x=>String(x.id)===id);
      if(eventType==='DELETE'||row.archived_at){if(idx>=0)arr.splice(idx,1);map.delete(id);}
      else{const x=obj(row);if(idx>=0)arr[idx]=x;else arr.push(x);map.set(id,hash(x));}
      persist();
      if(typeof render==='function')render();
      window.dispatchEvent(new CustomEvent('ttt:operational-row-applied',{detail:{kind,id,eventType}}));
    }finally{applying=false;}
  }

  function applyWorkRecord(kind,row,eventType){
    if(!row)return;
    applying=true;
    try{
      const j=jobs().find(x=>String(x.id)===String(row.job_id));if(!j)return;
      if(kind==='work_orders'){
        if(eventType==='DELETE'||row.archived_at){if(String(j.workOrderId||'')===String(row.id))j.workOrderId=null;}
        else{j.workOrderId=row.id;j.finalAuthorization=row.final_authorization||{};j.workOrderNotes=row.notes||'';j.workStartedAt=row.started_at||null;j.completedAt=row.completed_at||null;}
      }else{
        if(!Array.isArray(j.changeOrders))j.changeOrders=[];
        const idx=j.changeOrders.findIndex(x=>String(x.id)===String(row.id));
        if(eventType==='DELETE'||row.archived_at){if(idx>=0)j.changeOrders.splice(idx,1);}
        else{const co=Object.assign({},row.source_json||{},{id:row.id,status:row.status,reason:row.reason,description:row.description,scheduleImpact:row.schedule_impact,partsDelta:Number(row.parts_delta||0),laborDelta:Number(row.labor_delta||0),feesDelta:Number(row.fees_delta||0),totalDelta:Number(row.total_delta||0),signerName:row.signer_name,approvedAt:row.approved_at,approvalMethod:row.approval_method,previousAuthorizedTotal:row.previous_authorized_total,revisedAuthorizedTotal:row.revised_authorized_total});if(idx>=0)j.changeOrders[idx]=co;else j.changeOrders.push(co);}
      }
      persist();if(typeof render==='function')render();
    }finally{applying=false;}
  }

  function subscribe(){
    if(channel)return;
    channel=client.channel('ttt-operational-'+orgId);
    ['shop_resources','service_templates','scheduling_technicians','work_operations','warranties'].forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+orgId},p=>applyArray(table,p.new||p.old,p.eventType));
    });
    ['work_orders','change_orders'].forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+orgId},p=>applyWorkRecord(table,p.new||p.old,p.eventType));
    });
    channel.on('postgres_changes',{event:'*',schema:'public',table:'scheduling_settings',filter:'organization_id=eq.'+orgId},p=>{
      if(!p.new?.settings)return;
      applying=true;
      try{sched().settings=clone(p.new.settings);settingsHash=hash(sched().settings);persist();if(typeof render==='function')render();}
      finally{applying=false;}
    });
    channel.subscribe();
  }

  async function init(){
    let tries=0;
    while(tries++<160){
      const cloud=window.TTTCloud;
      if(cloud?.ready&&cloud.profile&&cloud.organizationId){
        client=cloud.client;orgId=cloud.organizationId;userId=cloud.userId;profile=cloud.profile;
        try{
          await loadAll();
          subscribe();
          ready=true;
          window.dispatchEvent(new CustomEvent('ttt:operational-relational-ready'));
        }catch(err){console.error('TTT operational relational initialization failed',err);}
        return;
      }
      await new Promise(r=>setTimeout(r,125));
    }
  }

  if(priorSave){
    save=function(){priorSave();queue();};
  }

  window.TTTOperationalRelational={
    get ready(){return ready;},
    syncNow:syncAll,
    reload:loadAll,
    get workOrders(){return deriveWorkOrders();},
    get changeOrders(){return deriveChangeOrders();}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
