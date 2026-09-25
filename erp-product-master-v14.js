// TTT OS Product Master / ERP catalog adapter v1.5.
// Supabase is authoritative. The embedded BlackVue/JL snapshot is only a one-time migration source.
(function(){
'use strict';

const SEED='2026-09-20';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],inventory=[],suppliers=[],client=null,orgId=null,profile=null,channel=null,ready=false,importing=false;
let snapshot=null;

async function waitCloud(){
  for(let i=0;i<120;i++){
    if(window.TTTCloud?.ready&&window.TTTCloud.organizationId&&window.TTTCloud.client)return true;
    await new Promise(r=>setTimeout(r,125));
  }
  return false;
}

function hash64(input){
  let h=0xcbf29ce484222325n;
  for(let i=0;i<input.length;i++){h^=BigInt(input.charCodeAt(i));h=BigInt.asUintN(64,h*0x100000001b3n);}
  return h.toString(16).padStart(16,'0').toUpperCase();
}
function sourceKey(p){return JSON.stringify([p.brand||'',p.category||'',p.subcategory||'',p.model||'',p.sku||'',p.variant||'',p.description||'']);}
function brandCode(b){if(b==='BlackVue')return'BV';if(b==='JL Audio')return'JL';return(String(b||'GEN').replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase()||'GEN');}
function productSeedRow(p){
  const h=hash64(sourceKey(p)),id='PRD-SEED-'+h.slice(0,12);
  return {
    organization_id:orgId,id,
    item_type:String(p.category||'').toLowerCase()==='service'?'service':'product',
    brand:p.brand||null,category:p.category||null,subcategory:p.subcategory||null,
    model:p.model||null,sku:p.sku||null,dealer_sku:p.sku||null,
    ttt_sku:'TTT-'+brandCode(p.brand)+'-'+h.slice(0,12),
    variant:p.variant||null,
    name:p.model||p.description||p.sku||((p.brand||'')+' item'),
    description:p.description||null,
    dealer_cost:p.dealerCost==null?null:Number(p.dealerCost),
    sell_price:p.sellingPrice==null?null:Number(p.sellingPrice),
    active:true,
    effective_date:p.effectiveDate?String(p.effectiveDate).slice(0,10):null,
    source_file:p.sourceFile||null,
    last_cost_update_at:p.effectiveDate?String(p.effectiveDate).slice(0,10)+'T00:00:00Z':null,
    metadata:{catalog_seed:SEED,source_status:p.status||null,legacy_sku:p.sku||null},
    created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null
  };
}
function supplierSeedRow(p,row){
  const h=hash64(sourceKey(p));
  return {
    organization_id:orgId,id:'SUP-SEED-'+h.slice(0,12),product_id:row.id,
    vendor_company_id:null,dealer_sku:p.sku||null,
    dealer_cost:p.dealerCost==null?null:Number(p.dealerCost),
    map_price:null,msrp:p.sellingPrice==null?null:Number(p.sellingPrice),
    moq:null,lead_time_days:null,preferred:false,
    effective_date:p.effectiveDate?String(p.effectiveDate).slice(0,10):null,
    source_url:null,status:String(p.status||'reference').toLowerCase(),
    metadata:{catalog_seed:SEED,source_file:p.sourceFile||null,brand:p.brand||null},
    created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null
  };
}
function invId(id){return'INV-SEED-'+hash64(id+'|Main Shop').slice(0,12);}

async function migrateSnapshot(){
  if(importing||profile?.role!=='owner_admin'||!Array.isArray(snapshot)||!snapshot.length)return;
  importing=true;
  try{
    const uniq=new Map();
    snapshot.forEach(p=>{const row=productSeedRow(p);uniq.set(row.id,{source:p,row});});
    const entries=[...uniq.values()];
    const {count,error:countError}=await client.from('products_services').select('id',{count:'exact',head:true})
      .eq('organization_id',orgId).contains('metadata',{catalog_seed:SEED}).is('archived_at',null);
    if(countError)throw countError;

    if(Number(count||0)<entries.length){
      for(let i=0;i<entries.length;i+=100){
        const batch=entries.slice(i,i+100).map(x=>x.row);
        const {error}=await client.from('products_services').upsert(batch,{onConflict:'organization_id,id'});
        if(error)throw error;
      }
    }

    const supplierRows=entries.map(x=>supplierSeedRow(x.source,x.row));
    const {count:supplierCount,error:supplierCountError}=await client.from('supplier_products').select('id',{count:'exact',head:true})
      .eq('organization_id',orgId).contains('metadata',{catalog_seed:SEED}).is('archived_at',null);
    if(supplierCountError)throw supplierCountError;
    if(Number(supplierCount||0)<supplierRows.length){
      for(let i=0;i<supplierRows.length;i+=100){
        const {error}=await client.from('supplier_products').upsert(supplierRows.slice(i,i+100),{onConflict:'organization_id,id'});
        if(error)throw error;
      }
    }

    const productRows=entries.map(x=>x.row).filter(x=>x.item_type==='product');
    const {data:existing,error:invReadError}=await client.from('inventory_items').select('product_id')
      .eq('organization_id',orgId).contains('metadata',{catalog_seed:SEED}).is('archived_at',null).limit(2000);
    if(invReadError)throw invReadError;
    const have=new Set((existing||[]).map(x=>x.product_id));
    const missing=productRows.filter(x=>!have.has(x.id)).map(x=>({
      organization_id:orgId,id:invId(x.id),product_id:x.id,sku:x.ttt_sku,location:'Main Shop',
      quantity_on_hand:0,quantity_reserved:0,average_cost:x.dealer_cost,
      metadata:{catalog_seed:SEED},created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null
    }));
    for(let i=0;i<missing.length;i+=100){
      const {error}=await client.from('inventory_items').insert(missing.slice(i,i+100));
      if(error)throw error;
    }

    await window.TTTCloud?.audit?.('catalog','dealer_snapshot','catalog_migrated',{
      source_rows:snapshot.length,products:entries.length,supplier_rows:supplierRows.length,inventory_created:missing.length
    });
  }catch(err){
    console.error('TTT Product Master migration failed',err);
    if(typeof toast==='function')toast('Product Master migration needs attention: '+String(err.message||err));
  }finally{importing=false;}
}

async function load(){
  if(!await waitCloud())return;
  client=window.TTTCloud.client;orgId=window.TTTCloud.organizationId;profile=window.TTTCloud.profile;
  if(!snapshot&&Array.isArray(window.TTTProductCatalog?.products))snapshot=window.TTTProductCatalog.products.slice();
  await migrateSnapshot();
  const [p,i,s]=await Promise.all([
    client.from('products_services').select('id,item_type,ttt_sku,dealer_sku,brand,category,subcategory,model,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,serialized,warranty_summary,source_file,source_url,effective_date,active').eq('organization_id',orgId).is('archived_at',null).eq('active',true).limit(2500),
    client.from('inventory_items').select('id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,last_counted_at').eq('organization_id',orgId).is('archived_at',null).limit(2500),
    client.from('supplier_products').select('id,product_id,vendor_company_id,dealer_sku,dealer_cost,map_price,msrp,moq,lead_time_days,preferred,status,source_url').eq('organization_id',orgId).is('archived_at',null).limit(2500)
  ]);
  if(p.error||i.error||s.error){console.error('TTT ERP catalog load failed',p.error||i.error||s.error);return;}
  products=p.data||[];inventory=i.data||[];suppliers=s.data||[];ready=true;
  expose();bindFilters();renderCatalog();subscribe();
  window.dispatchEvent(new CustomEvent('ttt:product-master-loaded',{detail:{products:products.length,inventory:inventory.length,supplierProducts:suppliers.length}}));
}

function invFor(id){return inventory.filter(x=>x.product_id===id).reduce((a,x)=>({on:a.on+Number(x.quantity_on_hand||0),res:a.res+Number(x.quantity_reserved||0)}),{on:0,res:0});}
function find(opts={}){
  const brand=opts.brand||'',category=opts.category||'',q=String(opts.query||'').toLowerCase();
  return products.filter(p=>(!brand||p.brand===brand)&&(!category||p.category===category)&&(!q||[p.ttt_sku,p.dealer_sku,p.brand,p.model,p.name,p.variant,p.description].join(' ').toLowerCase().includes(q)));
}
function expose(){
  window.TTTProductMaster={products,inventory,suppliers,reload:load,find};
  if(window.TTTProductCatalog){
    window.TTTProductCatalog.cloudProducts=products;
    window.TTTProductCatalog.find=find;
    window.TTTProductCatalog.brands=()=>[...new Set(products.map(p=>p.brand).filter(Boolean))].sort();
    window.TTTProductCatalog.modelsFor=brand=>[...new Set(products.filter(p=>p.brand===brand).map(p=>p.model).filter(Boolean))].sort();
    window.TTTProductCatalog.inventoryFor=id=>inventory.filter(x=>x.product_id===id);
  }
}
function bindFilters(){
  ['catalogSearch','catalogBrand','catalogCategory'].forEach(id=>{
    const el=document.getElementById(id);if(!el||el.dataset.productMasterBound)return;
    el.dataset.productMasterBound='1';el.addEventListener(id==='catalogSearch'?'input':'change',renderCatalog);
  });
}
function renderCatalog(){
  const root=document.getElementById('catalog'),body=document.getElementById('catalogBody');
  if(!root||!body||!ready)return;
  const brandEl=document.getElementById('catalogBrand'),catEl=document.getElementById('catalogCategory');
  if(brandEl){
    const current=brandEl.value;brandEl.innerHTML='<option value="">All brands</option>'+[...new Set(products.map(p=>p.brand).filter(Boolean))].sort().map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');
  }
  if(catEl){
    const current=catEl.value;catEl.innerHTML='<option value="">All categories</option>'+[...new Set(products.map(p=>p.category).filter(Boolean))].sort().map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');
  }
  const rows=find({brand:brandEl?.value||'',category:catEl?.value||'',query:document.getElementById('catalogSearch')?.value||''});
  const table=body.closest('table');
  if(table)table.querySelector('thead').innerHTML='<tr><th>TTT SKU</th><th>Brand</th><th>Model / Variant</th><th>Dealer SKU</th><th>Dealer Cost</th><th>TTT Price</th><th>Margin</th><th>On Hand</th><th>Available</th><th>MOQ</th><th>Source</th></tr>';
  body.innerHTML=rows.slice(0,800).map(p=>{
    const inv=invFor(p.id),cost=Number(p.dealer_cost),sell=Number(p.sell_price??p.map_price),m=Number.isFinite(cost)&&Number.isFinite(sell)&&sell>0?((sell-cost)/sell*100):null;
    return '<tr><td><b>'+esc(p.ttt_sku||'Pending')+'</b></td><td>'+esc(p.brand||'—')+'</td><td><strong>'+esc(p.model||p.name||'—')+'</strong><br><small>'+esc(p.variant||p.subcategory||'')+'</small></td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+money(p.dealer_cost)+'</td><td>'+money(p.sell_price??p.map_price)+'</td><td>'+(m==null?'—':m.toFixed(1)+'%')+'</td><td>'+inv.on+'</td><td>'+(inv.on-inv.res)+'</td><td>'+esc(p.moq??'—')+'</td><td>'+esc(p.source_file||'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="11">No matching Supabase catalog records.</td></tr>';
  const stats=document.getElementById('catalogStats');
  if(stats)stats.innerHTML='<div class="stat"><span>Live products</span><strong>'+rows.length+'</strong></div><div class="stat"><span>BlackVue</span><strong>'+rows.filter(p=>p.brand==='BlackVue').length+'</strong></div><div class="stat"><span>JL Audio</span><strong>'+rows.filter(p=>p.brand==='JL Audio').length+'</strong></div><div class="stat"><span>Database</span><strong>Supabase</strong></div>';
  const desc=root.querySelector('.section-head .muted');if(desc)desc.textContent='Live supplier catalog from Supabase with dealer cost, TTT price and stock availability.';
}

function subscribe(){
  if(channel||!client||!orgId)return;
  channel=client.channel('ttt-product-master-'+orgId)
    .on('postgres_changes',{event:'*',schema:'public',table:'products_services',filter:'organization_id=eq.'+orgId},()=>load())
    .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items',filter:'organization_id=eq.'+orgId},()=>load())
    .on('postgres_changes',{event:'*',schema:'public',table:'supplier_products',filter:'organization_id=eq.'+orgId},()=>load())
    .subscribe();
}

const priorRender=window.render;
if(typeof priorRender==='function'){
  window.render=function(){const out=priorRender.apply(this,arguments);if(ready)setTimeout(()=>{bindFilters();renderCatalog();},0);return out;};
}
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
