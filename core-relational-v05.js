// TTT OS relational core adapter.
// Customers, Vehicles, Jobs and Personnel synchronize as individual Supabase rows.
// app_state remains only as a compatibility layer for modules not yet normalized.
(function(){
  'use strict';

  const DB_KEY='ttt-os-v0.2';
  const KINDS=['customers','vehicles','personnel','jobs'];
  const snapshots=Object.fromEntries(KINDS.map(k=>[k,new Map()]));
  let client=null;
  let orgId=null;
  let userId=null;
  let ready=false;
  let applyingRemote=false;
  let timer=null;
  let channel=null;
  const priorSave=typeof save==='function'?save:null;

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function hash(v){return JSON.stringify(v);}
  function now(){return new Date().toISOString();}
  function cleanText(v){return v==null||String(v).trim()===''?null:String(v);}
  function num(v){const n=Number(v);return v==null||v===''||Number.isNaN(n)?null:n;}

  function currentArray(kind){
    return Array.isArray(db?.[kind])?db[kind]:[];
  }

  function capture(kind){
    const m=snapshots[kind];
    m.clear();
    currentArray(kind).forEach(x=>m.set(String(x.id),hash(x)));
  }
  function captureAll(){KINDS.forEach(capture);}

  function baseRow(obj){
    return {
      organization_id:orgId,
      id:String(obj.id),
      source_revision:Number(window.TTTCloud?.revision||0),
      source_json:clone(obj),
      archived_at:null,
      updated_at:now(),
      last_synced_by:userId
    };
  }

  function customerRow(x){
    return Object.assign(baseRow(x),{
      first_name:cleanText(x.firstName),
      middle_name:cleanText(x.middleName),
      last_name:cleanText(x.lastName),
      display_name:cleanText(x.name)||cleanText([x.firstName,x.middleName,x.lastName].filter(Boolean).join(' ')),
      phone:cleanText(x.phone),
      email:cleanText(x.email),
      address1:cleanText(x.address1),
      address2:cleanText(x.address2),
      city:cleanText(x.city),
      state:cleanText(x.state),
      postal_code:cleanText(x.postalCode),
      country:cleanText(x.country),
      notes:cleanText(x.notes)
    });
  }

  function vehicleRow(x){
    return Object.assign(baseRow(x),{
      customer_id:cleanText(x.customerId),
      vin:cleanText(x.vin),
      year:cleanText(x.year),
      make:cleanText(x.make),
      model:cleanText(x.model),
      trim:cleanText(x.trim),
      color:cleanText(x.color),
      exterior_finish:cleanText(x.wrap),
      vehicle_type:cleanText(x.type),
      plate:cleanText(x.plate)
    });
  }

  function personnelRow(x){
    return Object.assign(baseRow(x),{
      legacy_user_id:cleanText(x.userId),
      display_name:cleanText(x.displayName)||'Unnamed Person',
      first_name:cleanText(x.firstName),
      last_name:cleanText(x.lastName),
      relationship:cleanText(x.relationship),
      job_title:cleanText(x.jobTitle),
      department:cleanText(x.department),
      status:cleanText(x.status),
      email:cleanText(x.email),
      phone:cleanText(x.phone),
      scheduling_eligible:!!x.schedulingEligible,
      roles:Array.isArray(x.roles)?x.roles:[],
      skills:Array.isArray(x.skills)?x.skills:[],
      certifications:Array.isArray(x.certifications)?x.certifications:[],
      availability:x.availability&&typeof x.availability==='object'?x.availability:{},
      scheduling_id:cleanText(x.schedulingId),
      start_date:cleanText(x.startDate),
      notes:cleanText(x.notes)
    });
  }

  function jobRow(x){
    return Object.assign(baseRow(x),{
      estimate_id:cleanText(x.estimateId),
      work_order_id:cleanText(x.workOrderId),
      customer_id:cleanText(x.customerId),
      vehicle_id:cleanText(x.vehicleId),
      status:cleanText(x.status),
      appointment_local:cleanText(x.appointment),
      appointment_timezone:'America/Chicago',
      parts_status:cleanText(x.partsStatus),
      duration:cleanText(x.duration),
      request_notes:cleanText(x.requestNotes),
      estimate:x.estimate&&typeof x.estimate==='object'?x.estimate:{},
      estimate_total:num(x.estimateTotal),
      services:Array.isArray(x.services)?x.services:[],
      equipment:Array.isArray(x.equipment)?x.equipment:[],
      check_in:x.checkIn&&typeof x.checkIn==='object'?x.checkIn:null,
      legacy_audit:Array.isArray(x.audit)?x.audit:[],
      created_by_legacy_user_id:cleanText(x.createdBy)
    });
  }

  function rowFor(kind,obj){
    if(kind==='customers')return customerRow(obj);
    if(kind==='vehicles')return vehicleRow(obj);
    if(kind==='personnel')return personnelRow(obj);
    return jobRow(obj);
  }

  function withoutKeys(row){
    const out=Object.assign({},row);
    delete out.organization_id;
    delete out.id;
    return out;
  }

  async function syncKind(kind){
    const arr=currentArray(kind);
    const before=snapshots[kind];
    const current=new Map(arr.map(x=>[String(x.id),x]));
    const changed=[];
    const created=[];
    const updated=[];
    for(const [id,obj] of current){
      const h=hash(obj);
      if(before.get(id)===h)continue;
      if(before.has(id))updated.push(obj);
      else created.push(obj);
      changed.push(id);
    }
    const removed=[...before.keys()].filter(id=>!current.has(id));
    if(!changed.length&&!removed.length)return true;

    for(const obj of created){
      const {error}=await client.from(kind).insert(rowFor(kind,obj));
      if(error){
        console.error('TTT relational insert failed',kind,obj.id,error);
        return false;
      }
    }

    for(const obj of updated){
      const row=withoutKeys(rowFor(kind,obj));
      const {error}=await client.from(kind)
        .update(row)
        .eq('organization_id',orgId)
        .eq('id',String(obj.id));
      if(error){
        console.error('TTT relational update failed',kind,obj.id,error);
        return false;
      }
    }

    if(removed.length){
      const {error}=await client.from(kind)
        .update({archived_at:now(),updated_at:now(),last_synced_by:userId})
        .eq('organization_id',orgId)
        .in('id',removed);
      if(error){
        console.error('TTT relational archive failed',kind,error);
        return false;
      }
    }

    capture(kind);
    if(window.TTTCloud?.audit){
      window.TTTCloud.audit('relational_sync',kind,'core_rows_synced',{
        created:created.map(x=>x.id),
        updated:updated.map(x=>x.id),
        archived:removed
      });
    }
    return true;
  }

  async function syncAll(){
    if(!ready||applyingRemote||!client||!orgId)return;
    const status=document.getElementById('tttCloudStatus');
    if(status){status.textContent='Saving…';status.dataset.state='busy';}
    // FK-safe order: parent records before dependent records.
    for(const kind of KINDS){
      const ok=await syncKind(kind);
      if(!ok){
        if(status){status.textContent='Core sync error';status.dataset.state='error';}
        return;
      }
    }
    if(status){status.textContent='Synced';status.dataset.state='ok';}
  }

  function queue(){
    if(!ready||applyingRemote)return;
    clearTimeout(timer);
    timer=setTimeout(syncAll,220);
  }

  function persistLocal(){
    try{localStorage.setItem(DB_KEY,JSON.stringify(db));}catch(err){console.warn('TTT local cache write failed',err);}
  }

  function applyRow(kind,row,eventType){
    if(!ready||!row)return;
    applyingRemote=true;
    try{
      const arr=currentArray(kind);
      const id=String(row.id);
      const idx=arr.findIndex(x=>String(x.id)===id);
      if(eventType==='DELETE'||row.archived_at){
        if(idx>=0)arr.splice(idx,1);
        snapshots[kind].delete(id);
      }else{
        const obj=Object.assign({},row.source_json||{},{id});
        if(idx>=0)arr[idx]=obj;else arr.push(obj);
        snapshots[kind].set(id,hash(obj));
      }
      persistLocal();
      if(typeof render==='function')render();
      if(kind==='personnel'&&window.TTTPersonnel&&!window.TTTPersonnel.dirty){
        window.TTTPersonnel.render?.();
      }
      window.dispatchEvent(new CustomEvent('ttt:core-row-applied',{detail:{kind,id,eventType}}));
    }finally{applyingRemote=false;}
  }

  function subscribe(){
    if(channel||!client||!orgId)return;
    channel=client.channel('ttt-core-'+orgId);
    for(const kind of KINDS){
      channel.on('postgres_changes',{
        event:'*',schema:'public',table:kind,filter:'organization_id=eq.'+orgId
      },payload=>applyRow(kind,payload.new||payload.old,payload.eventType));
    }
    channel.subscribe(status=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('TTT relational realtime reconnecting');
    });
  }

  async function init(){
    let attempts=0;
    while(attempts++<160){
      const cloud=window.TTTCloud;
      if(cloud?.ready&&cloud?.relationalCoreLoaded&&cloud.profile&&cloud.organizationId){
        client=cloud.client;
        orgId=cloud.organizationId;
        userId=cloud.userId;
        captureAll();
        subscribe();
        ready=true;
        window.dispatchEvent(new CustomEvent('ttt:relational-core-ready'));
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,125));
    }
    console.error('TTT relational core did not initialize.');
  }

  if(priorSave){
    save=function(){
      priorSave();
      queue();
    };
  }

  window.TTTCoreRelational={
    get ready(){return ready;},
    syncNow:syncAll,
    captureAll
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
