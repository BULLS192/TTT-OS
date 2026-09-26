// TTT Expenses cloud adapter v05 — Supabase ledger + normalized multi-work allocation + private receipts.
(function(){
  'use strict';

  const KEY='ttt-os-expenses-v1';
  const DEFAULT_POLICIES={alcoholPct:30,receiptThreshold:75};
  const BUCKET='expense-receipts';
  let orgId=null;
  let client=null;
  let profile=null;
  let channel=null;
  let saveTimer=null;
  let applying=false;
  let cloudIds=new Set();
  const lastHashes=new Map();

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function readLocal(){
    try{return JSON.parse(localStorage.getItem(KEY))||{expenses:[],policies:clone(DEFAULT_POLICIES)}}
    catch{return {expenses:[],policies:clone(DEFAULT_POLICIES)}}
  }
  function writeLocal(state){localStorage.setItem(KEY,JSON.stringify(state));}
  function stable(v){return JSON.stringify(v);}
  function sameExpense(a,b){
    if(!a||!b)return false;
    return String(a.merchant||'')===String(b.merchant||'')
      && String(a.date||'')===String(b.date||'')
      && Math.abs((+a.total||0)-(+b.total||0))<0.01
      && String(a.category||'')===String(b.category||'');
  }
  function collisionId(oldId){
    const year=new Date().getFullYear();
    return 'EXP-'+year+'-MIG-'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();
  }
  function sanitizeFileName(name){
    return String(name||'receipt').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)||'receipt';
  }
  function stripBinary(exp){
    const x=clone(exp||{});
    delete x.receiptData;
    delete x._receiptFile;
    return x;
  }
  function rowFromExpense(exp){
    const source=stripBinary(exp);
    return {
      organization_id:orgId,
      id:String(exp.id),
      expense_date:exp.date||null,
      expense_type:exp.type||null,
      merchant:exp.merchant||null,
      category:exp.category||null,
      purchased_by:exp.purchasedBy||null,
      purchased_by_person_id:personIdForName(exp.purchasedBy),
      payment_source:exp.paymentSource||null,
      subtotal:numOrNull(exp.subtotal),
      sales_tax:numOrNull(exp.tax),
      tip:numOrNull(exp.tip),
      total:numOrNull(exp.total),
      business_purpose:exp.businessPurpose||null,
      notes:exp.notes||null,
      attendees:exp.attendees||null,
      business_relationship:exp.businessRelationship||null,
      food_amount:numOrNull(exp.food),
      alcohol_amount:numOrNull(exp.alcohol),
      meal_purpose:exp.mealPurpose||null,
      meal_type:exp.mealType||null,
      job_ref:exp.jobRef||null,
      customer_id:exp.customerId||null,
      vehicle_id:exp.vehicleId||null,
      work_order_id:exp.workOrderId||null,
      reimbursed:!!exp.reimbursed,
      receipt_name:exp.receiptName||null,
      receipt_path:exp.receiptPath||null,
      receipt_status:(exp.receiptPath||exp.receiptName)?'attached':(exp.noReceipt?'missing_declared':(exp.receiptStatus||'not_provided')),
      no_receipt:!!exp.noReceipt,
      missing_receipt_reason:exp.missingReceiptReason||null,
      missing_receipt_declared_at:exp.missingReceiptDeclaredAt||null,
      missing_receipt_declared_by:exp.missingReceiptDeclaredBy||null,
      line_items:Array.isArray(exp.lineItems)?exp.lineItems:[],
      allocation_summary:exp.allocationSummary&&typeof exp.allocationSummary==='object'?exp.allocationSummary:{},
      source_json:source,
      archived_at:null,
      updated_at:new Date().toISOString(),
      updated_by:profile?.user_id||null,
      created_by:profile?.user_id||null
    };
  }
  function numOrNull(v){const n=Number(v);return v===''||v==null||Number.isNaN(n)?null:n;}
  function personIdForName(name){
    const people=window.db?.personnel||[];
    return people.find(p=>String(p.displayName||'').toLowerCase()===String(name||'').toLowerCase())?.id||null;
  }

  async function uploadLegacyReceipt(exp){
    if(!exp?.receiptData||exp.receiptPath||!client||!orgId)return exp;
    try{
      const response=await fetch(exp.receiptData);
      const blob=await response.blob();
      const safe=sanitizeFileName(exp.receiptName||('receipt.'+(blob.type.split('/')[1]||'bin')));
      const path=orgId+'/'+encodeURIComponent(String(exp.id))+'/'+Date.now()+'-'+safe;
      const {error}=await client.storage.from(BUCKET).upload(path,blob,{contentType:blob.type||undefined,upsert:false});
      if(error)throw error;
      exp.receiptPath=path;
      delete exp.receiptData;
    }catch(err){
      console.warn('TTT Expenses: receipt cloud upload deferred',err);
    }
    return exp;
  }

  function applyToExpenseModule(state){
    writeLocal(state);
    const mod=window.TTTExpenses;
    if(!mod?.state)return;
    applying=true;
    try{
      mod.state.expenses.splice(0,mod.state.expenses.length,...state.expenses.map(clone));
      mod.state.policies=Object.assign({},DEFAULT_POLICIES,state.policies||{});
      mod.render?.();
    }finally{applying=false;}
  }

  async function loadCloud(){
    const [{data:rows,error:rowsError},{data:settings,error:settingsError},{data:allocations,error:allocError}]=await Promise.all([
      client.from('expenses').select('id,source_json,receipt_name,receipt_path,receipt_status,no_receipt,missing_receipt_reason,missing_receipt_declared_at,missing_receipt_declared_by,archived_at,updated_at').eq('organization_id',orgId).is('archived_at',null),
      client.from('expense_settings').select('policies').eq('organization_id',orgId).maybeSingle(),
      client.from('expense_allocations').select('*').eq('organization_id',orgId).is('archived_at',null)
    ]);
    if(rowsError)throw rowsError;
    if(settingsError)console.warn('TTT Expenses: settings load warning',settingsError);
    if(allocError)console.warn('TTT Expenses: allocation load warning',allocError);

    const cloud=(rows||[]).map(r=>{
      const exp=Object.assign({},r.source_json||{},{
        id:r.id,
        receiptName:r.receipt_name||(r.source_json||{}).receiptName||'',
        receiptPath:r.receipt_path||(r.source_json||{}).receiptPath||'',
        receiptStatus:r.receipt_status||(r.source_json||{}).receiptStatus||'not_provided',
        noReceipt:!!r.no_receipt,
        missingReceiptReason:r.missing_receipt_reason||(r.source_json||{}).missingReceiptReason||'',
        missingReceiptDeclaredAt:r.missing_receipt_declared_at||(r.source_json||{}).missingReceiptDeclaredAt||'',
        missingReceiptDeclaredBy:r.missing_receipt_declared_by||(r.source_json||{}).missingReceiptDeclaredBy||''
      });
      const linked=(allocations||[]).filter(a=>a.expense_id===r.id);
      exp.allocations=linked.map(a=>({id:a.id,lineItemId:a.line_item_id||'',allocationType:a.allocation_type,jobId:a.job_id||'',workOrderId:a.work_order_id||'',amount:Number(a.amount||0),category:a.category||'',note:a.note||''}));
      if(Array.isArray(exp.lineItems)){
        exp.lineItems=exp.lineItems.map(li=>{const a=linked.find(x=>x.line_item_id===li.id);return a?Object.assign({},li,{allocationType:a.allocation_type,jobId:a.job_id||'',workOrderId:a.work_order_id||'',amount:Number(a.amount||li.amount||0),category:a.category||li.category||'',note:a.note||li.note||''}):li;});
      }else if(linked.length){
        exp.lineItems=linked.map(a=>({id:a.line_item_id||a.id,description:a.note||a.category||'Expense allocation',qty:1,amount:Number(a.amount||0),allocationType:a.allocation_type,jobId:a.job_id||'',workOrderId:a.work_order_id||'',category:a.category||'',note:a.note||''}));
      }
      return exp;
    });
    cloudIds=new Set(cloud.map(x=>x.id));

    const local=readLocal();
    const cloudById=new Map(cloud.map(x=>[x.id,x]));
    const imports=[];
    for(const original of (local.expenses||[])){
      let e=clone(original);
      const existing=cloudById.get(e.id);
      if(existing){
        if(sameExpense(existing,e))continue;
        e.legacyExpenseId=e.id;
        e.id=collisionId(e.id);
      }
      imports.push(e);
      cloudById.set(e.id,e);
    }

    const merged=[...cloudById.values()];
    const state={expenses:merged,policies:Object.assign({},DEFAULT_POLICIES,settings?.policies||local.policies||{})};
    applyToExpenseModule(state);
    if(imports.length)await saveState(state,{forceIds:new Set(imports.map(x=>x.id))});
    else snapshotHashes(state);
    subscribe();
  }

  function snapshotHashes(state){
    lastHashes.clear();
    for(const e of (state.expenses||[]))lastHashes.set(e.id,stable(stripBinary(e)));
  }

  function allocationRows(exp){
    const rows=[];
    const items=Array.isArray(exp.lineItems)?exp.lineItems:[];
    if(items.length){
      items.forEach((x,i)=>{
        const id='EXA-'+String(exp.id).replace(/[^A-Za-z0-9_-]/g,'_')+'-'+String(x.id||('LI'+i)).replace(/[^A-Za-z0-9_-]/g,'_');
        rows.push({organization_id:orgId,id,expense_id:String(exp.id),line_item_id:String(x.id||''),allocation_type:x.allocationType||'General TTT Expense',job_id:x.jobId||null,work_order_id:x.workOrderId||null,amount:numOrNull(x.amount)||0,category:x.category||exp.category||null,note:x.note||null,source_json:clone(x),archived_at:null,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null,created_by:profile?.user_id||null});
      });
    }else if(exp.jobRef||exp.workOrderId){
      rows.push({organization_id:orgId,id:'EXA-'+String(exp.id).replace(/[^A-Za-z0-9_-]/g,'_')+'-MAIN',expense_id:String(exp.id),line_item_id:null,allocation_type:'Existing Job',job_id:exp.jobRef||null,work_order_id:exp.workOrderId||null,amount:numOrNull(exp.total)||0,category:exp.category||null,note:exp.businessPurpose||null,source_json:{source:'expense_header'},archived_at:null,updated_at:new Date().toISOString(),updated_by:profile?.user_id||null,created_by:profile?.user_id||null});
    }
    return rows;
  }
  async function syncAllocations(expenses){
    for(const exp of expenses){
      const rows=allocationRows(exp),ids=rows.map(x=>x.id);
      if(rows.length){const up=await client.from('expense_allocations').upsert(rows,{onConflict:'organization_id,id'});if(up.error)throw up.error;}
      const existing=await client.from('expense_allocations').select('id').eq('organization_id',orgId).eq('expense_id',String(exp.id)).is('archived_at',null);
      if(existing.error){console.warn('TTT Expenses: allocation reconciliation warning',existing.error);continue;}
      const keep=new Set(ids.map(String));
      for(const old of existing.data||[]){if(!keep.has(String(old.id))){const gone=await client.from('expense_allocations').update({archived_at:new Date().toISOString(),updated_at:new Date().toISOString(),updated_by:profile.user_id}).eq('organization_id',orgId).eq('id',old.id);if(gone.error)console.warn('TTT Expenses: allocation archive warning',gone.error);}}
    }
  }

  async function saveState(input,options={}){
    if(applying||!client||!orgId||!profile)return;
    const state=input||readLocal();
    const expenses=state.expenses||[];
    for(const e of expenses)await uploadLegacyReceipt(e);

    const forceIds=options.forceIds||new Set();
    const changed=[];
    for(const e of expenses){
      const clean=stripBinary(e);
      const h=stable(clean);
      if(forceIds.has(e.id)||lastHashes.get(e.id)!==h){
        changed.push(rowFromExpense(e));
        lastHashes.set(e.id,h);
      }
    }
    if(changed.length){
      const {error}=await client.from('expenses').upsert(changed,{onConflict:'organization_id,id'});
      if(error){console.error('TTT Expenses: cloud save failed',error);return;}
      changed.forEach(r=>cloudIds.add(r.id));
    }
    try{await syncAllocations(expenses);}catch(err){console.error('TTT Expenses: allocation sync failed',err);}

    const currentIds=new Set(expenses.map(e=>String(e.id)));
    const missing=[...cloudIds].filter(id=>!currentIds.has(String(id)));
    if(missing.length){
      const {error}=await client.from('expenses')
        .update({archived_at:new Date().toISOString(),updated_at:new Date().toISOString(),updated_by:profile.user_id})
        .eq('organization_id',orgId)
        .in('id',missing);
      if(error)console.error('TTT Expenses: archive sync failed',error);
      else missing.forEach(id=>cloudIds.delete(id));
    }

    if(profile?.role==='owner_admin'){
      const {error:settingsError}=await client.from('expense_settings').upsert({
        organization_id:orgId,
        policies:Object.assign({},DEFAULT_POLICIES,state.policies||{}),
        updated_at:new Date().toISOString(),
        updated_by:profile.user_id
      },{onConflict:'organization_id'});
      if(settingsError)console.warn('TTT Expenses: settings save failed',settingsError);
    }

    state.expenses.forEach(e=>delete e.receiptData);
    writeLocal(state);
  }

  function queueSave(state){
    if(applying)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>saveState(state||readLocal()),350);
  }
  function queueFromLocal(){queueSave(readLocal());}

  function subscribe(){
    if(channel||!client||!orgId)return;
    channel=client.channel('ttt-expenses-'+orgId)
      .on('postgres_changes',{event:'*',schema:'public',table:'expenses',filter:'organization_id=eq.'+orgId},payload=>{
        const row=payload.new||payload.old;
        if(!row)return;
        const state=readLocal();
        const list=state.expenses||[];
        const idx=list.findIndex(x=>x.id===row.id);
        if(payload.eventType==='DELETE'||row.archived_at){
          if(idx>=0)list.splice(idx,1);
          cloudIds.delete(row.id);
          lastHashes.delete(row.id);
        }else{
          const exp=Object.assign({},row.source_json||{},{id:row.id,receiptPath:row.receipt_path||(row.source_json||{}).receiptPath||''});
          if(idx>=0)list[idx]=exp;else list.push(exp);
          cloudIds.add(row.id);
          lastHashes.set(row.id,stable(stripBinary(exp)));
        }
        state.expenses=list;
        applyToExpenseModule(state);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'expense_allocations',filter:'organization_id=eq.'+orgId},()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>loadCloud().catch(err=>console.error('TTT Expenses: allocation reload failed',err)),180);})
      .subscribe();
  }

  async function init(){
    let tries=0;
    while(tries++<160){
      if(window.TTTCloud?.profile&&window.TTTCloud?.client){
        profile=window.TTTCloud.profile;
        client=window.TTTCloud.client;
        orgId=profile.organization_id;
        try{await loadCloud();}
        catch(err){console.error('TTT Expenses: cloud initialization failed',err);}
        return;
      }
      await new Promise(r=>setTimeout(r,250));
    }
  }

  window.TTTExpenseCloud={
    queueSave,
    queueFromLocal,
    saveState,
    get organizationId(){return orgId;}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(),{once:true});
  else init();
})();
