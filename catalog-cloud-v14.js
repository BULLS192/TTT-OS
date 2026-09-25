// TTT OS catalog cloud adapter v1.4.
// Supabase owns live catalog/inventory data. The embedded dealer snapshot is only a one-time migration source.
(function(){
  'use strict';
  const SEED='2026-09-20';
  let client=null,orgId=null,profile=null,ready=false,products=[],inventory=[];
  let importing=false;

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function money(v){return v==null||v===''||Number.isNaN(Number(v))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));}
  function hash64(input){
    let h=0xcbf29ce484222325n;
    for(let i=0;i<input.length;i++){h^=BigInt(input.charCodeAt(i));h=BigInt.asUintN(64,h*0x100000001b3n);}
    return h.toString(16).padStart(16,'0').toUpperCase();
  }
  function keyFor(p){return JSON.stringify([p.brand||'',p.category||'',p.subcategory||'',p.model||'',p.sku||'',p.variant||'',p.description||'']);}
  function brandCode(brand){if(brand==='BlackVue')return'BV';if(brand==='JL Audio')return'JL';return String(brand||'GEN').replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase()||'GEN';}
  function seedRow(p){
    const h=hash64(keyFor(p)),id='PRD-SEED-'+h.slice(0,12);
    return {
      organization_id:orgId,id,
      item_type:String(p.category||'').toLowerCase()==='service'?'service':'product',
      brand:p.brand||null,category:p.category||null,subcategory:p.subcategory||null,
      model:p.model||null,sku:p.sku||null,dealer_sku:p.sku||null,
      ttt_sku:'TTT-'+brandCode(p.brand)+'-'+h.slice(0,12),
      variant:p.variant||null,name:p.model||p.description||p.sku||((p.brand||'')+' item'),
      description:p.description||null,dealer_cost:p.dealerCost==null?null:Number(p.dealerCost),
      sell_price:p.sellingPrice==null?null:Number(p.sellingPrice),
      active:true,effective_date:p.effectiveDate?String(p.effectiveDate).slice(0,10):null,
      source_file:p.sourceFile||null,last_cost_update_at:p.effectiveDate?String(p.effectiveDate).slice(0,10)+'T00:00:00Z':null,
      metadata:{catalog_seed:SEED,source_status:p.status||null,legacy_sku:p.sku||null}
    };
  }
  function inventoryId(productId){return'INV-SEED-'+hash64(productId+'|Main Shop').slice(0,12);}

  async function migrateSnapshot(){
    if(importing||profile?.role!=='owner_admin'||!window.TTTProductCatalog?.products?.length)return;
    importing=true;
    try{
      const staticRows=window.TTTProductCatalog.products;
      const uniq=new Map();
      staticRows.forEach(p=>{const row=seedRow(p);uniq.set(row.id,row);});
      const rows=[...uniq.values()];
      const {count,error:countError}=await client.from('products_services')
        .select('id',{count:'exact',head:true})
        .eq('organization_id',orgId)
        .eq('metadata->>catalog_seed',SEED)
        .is('archived_at',null);
      if(countError)throw countError;
      if(Number(count||0)<rows.length){
        for(let i=0;i<rows.length;i+=100){
          const {error}=await client.from('products_services').upsert(rows.slice(i,i+100),{onConflict:'organization_id,id'});
          if(error)throw error;
        }
      }
      const {data:seeded,error:seedError}=await client.from('products_services')
        .select('id,ttt_sku,dealer_cost,item_type')
        .eq('organization_id',orgId).eq('metadata->>catalog_seed',SEED).is('archived_at',null).limit(2000);
      if(seedError)throw seedError;
      const {data:existing,error:invError}=await client.from('inventory_items')
        .select('product_id').eq('organization_id',orgId).eq('metadata->>catalog_seed',SEED).is('archived_at',null).limit(2000);
      if(invError)throw invError;
      const have=new Set((existing||[]).map(x=>x.product_id));
      const missing=(seeded||[]).filter(x=>x.item_type==='product'&&!have.has(x.id)).map(x=>({
        organization_id:orgId,id:inventoryId(x.id),product_id:x.id,sku:x.ttt_sku,location:'Main Shop',
        quantity_on_hand:0,quantity_reserved:0,average_cost:x.dealer_cost,
        metadata:{catalog_seed:SEED},created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null
      }));
      for(let i=0;i<missing.length;i+=100){
        const {error}=await client.from('inventory_items').insert(missing.slice(i,i+100));
        if(error)throw error;
      }
      await window.TTTCloud?.audit?.('catalog','dealer_snapshot','catalog_migrated',{source_rows:staticRows.length,unique_rows:rows.length,inventory_created:missing.length});
    }catch(err){
      console.error('TTT catalog migration failed',err);
      if(typeof toast==='function')toast('Catalog cloud migration needs attention: '+String(err.message||err));
    }finally{importing=false;}
  }

  async function load(){
    const [p,i]=await Promise.all([
      client.from('products_services').select('id,item_type,brand,category,subcategory,model,sku,dealer_sku,ttt_sku,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,serialized,warranty_summary,source_file,effective_date,active').eq('organization_id',orgId).is('archived_at',null).eq('active',true).limit(2000),
      client.from('inventory_items').select('id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,last_counted_at').eq('organization_id',orgId).is('archived_at',null).limit(2000)
    ]);
    if(p.error)throw p.error;if(i.error)throw i.error;
    products=p.data||[];inventory=i.data||[];
    ready=true;
    overrideLegacyCatalog();
    renderCatalog();
    window.dispatchEvent(new CustomEvent('ttt:catalog-cloud-ready',{detail:{products:products.length,inventory:inventory.length}}));
  }

  function inventoryFor(id){return inventory.filter(x=>x.product_id===id);}
  function availableQty(id){return inventoryFor(id).reduce((n,x)=>n+Number(x.quantity_on_hand||0)-Number(x.quantity_reserved||0),0);}
  function overrideLegacyCatalog(){
    if(!window.TTTProductCatalog)return;
    window.TTTProductCatalog.cloudProducts=products;
    window.TTTProductCatalog.products=products;
    window.TTTProductCatalog.find=function({brand,category,query}={}){
      const q=String(query||'').trim().toLowerCase();
      return products.filter(p=>(!brand||p.brand===brand)&&(!category||p.category===category)&&(!q||[p.brand,p.model,p.name,p.dealer_sku,p.ttt_sku,p.variant,p.description].join(' ').toLowerCase().includes(q)));
    };
    window.TTTProductCatalog.brands=function(){return [...new Set(products.map(p=>p.brand).filter(Boolean))].sort();};
    window.TTTProductCatalog.modelsFor=function(brand){return [...new Set(products.filter(p=>p.brand===brand).map(p=>p.model).filter(Boolean))].sort();};
    window.TTTProductCatalog.inventoryFor=inventoryFor;
    window.TTTProductCatalog.availableQty=availableQty;
    window.TTTProductCatalog.reload=load;
  }

  function renderCatalog(){
    const body=document.getElementById('catalogBody');if(!body)return;
    const brandEl=document.getElementById('catalogBrand'),catEl=document.getElementById('catalogCategory'),searchEl=document.getElementById('catalogSearch');
    const brand=brandEl?.value||'',category=catEl?.value||'',q=searchEl?.value||'';
    if(brandEl){
      const current=brandEl.value;brandEl.innerHTML='<option value="">All brands</option>'+[...new Set(products.map(p=>p.brand).filter(Boolean))].sort().map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');
    }
    if(catEl){
      const current=catEl.value;catEl.innerHTML='<option value="">All categories</option>'+[...new Set(products.map(p=>p.category).filter(Boolean))].sort().map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');
    }
    const rows=window.TTTProductCatalog?.find({brand,category,query:q})||[];
    const table=body.closest('table');
    if(table){
      table.querySelector('thead').innerHTML='<tr><th>Brand</th><th>Model / Variant</th><th>Dealer SKU</th><th>TTT SKU</th><th>Dealer cost</th><th>Sell price</th><th>Margin</th><th>Available</th><th>MOQ</th><th>Source</th></tr>';
    }
    body.innerHTML=rows.slice(0,700).map(p=>{
      const cost=Number(p.dealer_cost),sell=Number(p.sell_price),margin=Number.isFinite(cost)&&Number.isFinite(sell)&&sell>0?((sell-cost)/sell*100):null;
      return '<tr><td>'+esc(p.brand||'—')+'</td><td><strong>'+esc(p.model||p.name||'—')+'</strong><br><small>'+esc(p.variant||p.subcategory||'')+'</small></td><td>'+esc(p.dealer_sku||p.sku||'—')+'</td><td><strong>'+esc(p.ttt_sku||'—')+'</strong></td><td>'+money(p.dealer_cost)+'</td><td>'+money(p.sell_price)+'</td><td>'+(margin==null?'—':margin.toFixed(1)+'%')+'</td><td>'+availableQty(p.id)+'</td><td>'+esc(p.moq??'—')+'</td><td>'+esc(p.source_file||'—')+'</td></tr>';
    }).join('')||'<tr><td colspan="10" class="crm-empty">No matching catalog items.</td></tr>';
    const st=document.getElementById('catalogStats');
    if(st){
      const invValue=inventory.reduce((sum,x)=>sum+Number(x.quantity_on_hand||0)*Number(x.average_cost||0),0);
      st.innerHTML='<div class="stat"><span>Live catalog</span><strong>'+products.length+'</strong></div><div class="stat"><span>BlackVue</span><strong>'+products.filter(p=>p.brand==='BlackVue').length+'</strong></div><div class="stat"><span>JL Audio</span><strong>'+products.filter(p=>p.brand==='JL Audio').length+'</strong></div><div class="stat"><span>Inventory value</span><strong>'+money(invValue)+'</strong></div>';
    }
    const heading=document.querySelector('#catalog .section-head .muted');if(heading)heading.textContent='Live supplier catalog from Supabase. Dealer files remain traceable as source documents.';
  }

  function bindFilters(){
    ['catalogSearch','catalogBrand','catalogCategory'].forEach(id=>{
      const el=document.getElementById(id);if(!el||el.dataset.cloudBound)return;
      el.dataset.cloudBound='1';el.addEventListener(id==='catalogSearch'?'input':'change',renderCatalog);
    });
  }

  function subscribe(){
    const ch=client.channel('ttt-catalog-'+orgId)
      .on('postgres_changes',{event:'*',schema:'public',table:'products_services',filter:'organization_id=eq.'+orgId},()=>load().catch(console.error))
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items',filter:'organization_id=eq.'+orgId},()=>load().catch(console.error))
      .subscribe();
    window.addEventListener('beforeunload',()=>client.removeChannel(ch),{once:true});
  }

  async function init(){
    let tries=0;
    while(tries++<160){
      const cloud=window.TTTCloud;
      if(cloud?.ready&&cloud.client&&cloud.organizationId&&window.TTTProductCatalog){
        client=cloud.client;orgId=cloud.organizationId;profile=cloud.profile;
        await migrateSnapshot();
        await load();
        bindFilters();subscribe();
        return;
      }
      await new Promise(r=>setTimeout(r,125));
    }
  }

  window.TTTCatalogCloud={get ready(){return ready;},get products(){return products;},get inventory(){return inventory;},reload:load,migrateSnapshot};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
