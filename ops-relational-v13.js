// TTT OS operational relational adapter.
// Scheduling and warranties use Supabase rows as the authoritative shared data.
(function(){
  'use strict';

  const DB_KEY='ttt-os-v0.2';
  let client=null,orgId=null,userId=null,profile=null,ready=false,applying=false,channel=null,timer=null;
  const priorSave=typeof save==='function'?save:null;
  const snapshots={
    resources:new Map(),templates:new Map(),technicians:new Map(),operations:new Map(),warranties:new Map()
  };
  let settingsHash='';

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function hash(v){return JSON.stringify(v);}
  function now(){return new Date().toISOString();}
  function clean(v){return v==null||String(v).trim()===''?null:String(v);}
  function n(v,d=null){const x=Number(v);return v==null||v===''||Number.isNaN(x)?d:x;}
  function admin(){return profile?.role==='owner_admin';}
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
    settingsHash=hash(s.settings||{});
  }
  function obj(row){return Object.assign({},row.source_json||{},{id:String(row.id)});}
  function rowResource(x){return{organization_id:orgId,id:String(x.id),name:clean(x.name)||String(x.id),resource_type:clean(x.type)||'other',active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function rowTemplate(x){return{organization_id:orgId,id:String(x.id),service:clean(x.service)||String(x.id),default_minutes:Math.max(5,n(x.defaultMinutes,60)),buffer_minutes:Math.max(0,n(x.bufferMinutes,0)),resource_type:clean(x.resourceType),required_skill:clean(x.skill),active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function rowTech(x){return{organization_id:orgId,id:String(x.id),person_id:clean(x.personId),display_name:clean(x.name)||String(x.id),skills:Array.isArray(x.skills)?x.skills:[],working_hours:x.workingHours&&typeof x.workingHours==='object'?x.workingHours:{},active:x.active!==false,source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId};}
  function asTimestamp(v){if(!v)return null;const s=String(v);if(!(/[zZ]$|[+-]\d\d:\d\d$/.test(s)))return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString();}
  function rowOperation(x){return{organization_id:orgId,id:String(x.id),job_id:clean(x.jobId),work_order_id:clean(x.workOrderId),service:clean(x.service)||'Other',template_id:clean(x.templateId),start_at:asTimestamp(x.start),local_start:clean(x.start),timezone:'America/Chicago',duration_minutes:Math.max(5,n(x.durationMinutes,15)),buffer_minutes:Math.max(0,n(x.bufferMinutes,0)),technician_id:clean(x.technicianId),resource_id:clean(x.resourceId),status:clean(x.status)||'scheduled',actual_start:asTimestamp(x.actualStart),actual_end:asTimestamp(x.actualEnd),notes:clean(x.notes),source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}
  function rowWarranty(x){return{organization_id:orgId,id:String(x.id),job_id:clean(x.jobId),customer_id:clean(x.customerId),vehicle_id:clean(x.vehicleId),warranty_type:clean(x.type||x.warrantyType),status:clean(x.status)||'active',provider:clean(x.provider),description:clean(x.description||x.notes),starts_on:clean(x.startsOn||x.startDate),expires_on:clean(x.expiresOn||x.expiryDate),terms:x.terms&&typeof x.terms==='object'?x.terms:{},source_json:clone(x),archived_at:null,updated_at:now(),updated_by:userId,created_by:userId};}

  async function loadAll(){
    const [resR,tplR,techR,opR,warR,setR]=await Promise.all([
      client.from('shop_resources').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('service_templates').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('scheduling_technicians').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('work_operations').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('warranties').select('id,source_json,archived_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('scheduling_settings').select('settings').eq('organization_id',orgId).maybeSingle()
    ]);
    const all=[resR,tplR,techR,opR,warR,setR];
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
      ['shop_resources',s.resources,snapshots.resources,rowResource,admin()],
      ['service_templates',s.serviceTemplates,snapshots.templates,rowTemplate,admin()],
      ['scheduling_technicians',s.technicians,snapshots.technicians,rowTech,admin()],
      ['work_operations',s.operations,snapshots.operations,rowOperation,true],
      ['warranties',Array.isArray(db.warranties)?db.warranties:[],snapshots.warranties,rowWarranty,true]
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

  function subscribe(){
    if(channel)return;
    channel=client.channel('ttt-operational-'+orgId);
    ['shop_resources','service_templates','scheduling_technicians','work_operations','warranties'].forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+orgId},p=>applyArray(table,p.new||p.old,p.eventType));
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
    reload:loadAll
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
