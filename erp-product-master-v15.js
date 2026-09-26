// TTT OS Product Master v1.5 — Supabase-native catalog, pricing and inventory controls.
(function(){
'use strict';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],inventory=[],suppliers=[],channel=null,selected=null;

async function waitCloud(){for(let i=0;i<120;i++){if(window.TTTCloud?.ready&&window.TTTCloud.organizationId)return true;await new Promise(r=>setTimeout(r,100));}return false;}
function cloud(){return window.TTTCloud;}
function invRows(id){return inventory.filter(x=>x.product_id===id);}
function invFor(id){return invRows(id).reduce((a,x)=>({on:a.on+Number(x.quantity_on_hand||0),res:a.res+Number(x.quantity_reserved||0)}),{on:0,res:0});}
function margin(p){const cost=Number(p.dealer_cost||0),sell=Number(p.sell_price||p.map_price||0);return sell?((sell-cost)/sell*100):null;}
function root(){return document.getElementById('pricing-catalog')||document.querySelector('#pricingCatalogView,#catalogView');}
function num(v){return v===''||v==null?null:Number(v);}
function injectStyle(){
 if(document.getElementById('tttProductOpsStyles'))return;
 const s=document.createElement('style');s.id='tttProductOpsStyles';s.textContent=
 '.pm-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}.pm-toolbar input{min-width:220px;flex:1;border:1px solid #d7e0ea;border-radius:9px;padding:9px 11px}.pm-panel{display:none;background:#fff;border:1px solid #dde5ee;border-radius:12px;padding:14px;margin:12px 0}.pm-panel.open{display:block}.pm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.pm-grid label{font-size:11px;font-weight:700;color:#475569}.pm-grid input,.pm-grid textarea,.pm-grid select{width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #d7e0ea;border-radius:8px;padding:9px;font:inherit}.pm-grid textarea{min-height:72px}.pm-span2{grid-column:span 2}.pm-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.pm-row{cursor:pointer}.pm-row:hover{background:#f8fafc}.pm-stock{white-space:nowrap}.pm-empty{text-align:center;color:#64748b;padding:22px}.pm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.pm-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:12px}.pm-kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.pm-kpi strong{display:block;font-size:20px;margin-top:4px}@media(max-width:900px){.pm-grid,.pm-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.pm-grid,.pm-kpis{grid-template-columns:1fr}.pm-span2{grid-column:auto}}';
 document.head.appendChild(s);
}
async function load(){
 if(!await waitCloud())return;
 const c=cloud().client,o=cloud().organizationId;
 const [p,i,s]=await Promise.all([
  c.from('products_services').select('id,ttt_sku,dealer_sku,brand,category,subcategory,model,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,source_file,source_url,effective_date,active,updated_at').eq('organization_id',o).is('archived_at',null).order('brand'),
  c.from('inventory_items').select('id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,updated_at').eq('organization_id',o).is('archived_at',null),
  c.from('supplier_products').select('id,product_id,vendor_company_id,dealer_sku,dealer_cost,map_price,msrp,moq,lead_time_days,preferred,status,source_url').eq('organization_id',o).is('archived_at',null)
 ]);
 if(p.error||i.error||s.error){console.error('TTT ERP catalog load failed',p.error||i.error||s.error);return;}
 products=p.data||[];inventory=i.data||[];suppliers=s.data||[];
 window.TTTProductMaster={products,inventory,suppliers,reload:load,find:q=>products.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase()))};
 render();
 subscribe();
 window.dispatchEvent(new CustomEvent('ttt:product-master-loaded',{detail:{products:products.length,inventory:inventory.length,supplierProducts:suppliers.length}}));
}
function render(){
 injectStyle();const r=root();if(!r)return;
 const q=(document.getElementById('pmSearch')?.value||'').trim().toLowerCase();
 const visible=products.filter(p=>!q||[p.ttt_sku,p.dealer_sku,p.brand,p.model,p.variant,p.name,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
 const totalValue=inventory.reduce((sum,x)=>sum+Number(x.quantity_on_hand||0)*Number(x.average_cost||0),0);
 const low=inventory.filter(x=>x.reorder_point!=null&&Number(x.quantity_on_hand||0)-Number(x.quantity_reserved||0)<=Number(x.reorder_point||0)).length;
 const rows=visible.map(p=>{const inv=invFor(p.id),m=margin(p),cost=Number(p.dealer_cost||0),sell=Number(p.sell_price||p.map_price||0);
 return '<tr class="pm-row" data-product-id="'+esc(p.id)+'"><td><b>'+esc(p.ttt_sku||'Pending')+'</b></td><td>'+esc(p.brand||'—')+'</td><td>'+esc(p.model||p.name||'—')+'</td><td>'+esc(p.variant||'—')+'</td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+money(cost)+'</td><td>'+money(sell)+'</td><td>'+(m==null?'—':m.toFixed(1)+'%')+'</td><td>'+inv.on+'</td><td>'+(inv.on-inv.res)+'</td><td>'+esc(p.moq??'—')+'</td><td class="pm-stock"><button class="btn secondary compact" data-stock="'+esc(p.id)+'">Stock</button></td></tr>'}).join('');
 r.innerHTML='<div class="card"><div class="section-head"><div><h2>Products & Pricing</h2><p class="muted">Supabase Product Master · live ERP catalog</p></div><button class="btn primary" id="pmNew">+ New product</button></div>'+
 '<div class="pm-kpis"><div class="pm-kpi"><span>Products</span><strong>'+products.length+'</strong></div><div class="pm-kpi"><span>Inventory records</span><strong>'+inventory.length+'</strong></div><div class="pm-kpi"><span>Inventory value</span><strong>'+money(totalValue)+'</strong></div><div class="pm-kpi"><span>At / below reorder</span><strong>'+low+'</strong></div></div>'+
 '<div class="pm-toolbar"><input id="pmSearch" placeholder="Search SKU, brand, model, category…" value="'+esc(q)+'"><button class="btn secondary" id="pmRefresh">Refresh</button></div>'+
 '<div class="pm-panel" id="pmProductPanel"></div><div class="pm-panel" id="pmStockPanel"></div>'+
 '<div class="table-wrap"><table><thead><tr><th>TTT SKU</th><th>Brand</th><th>Model</th><th>Variant</th><th>Dealer SKU</th><th>Dealer Cost</th><th>TTT Price</th><th>Margin</th><th>On Hand</th><th>Available</th><th>MOQ</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="12" class="pm-empty">No products match this view.</td></tr>')+'</tbody></table></div></div>';
 bind();
}
function bind(){
 document.getElementById('pmSearch')?.addEventListener('input',render);
 document.getElementById('pmRefresh')?.addEventListener('click',load);
 document.getElementById('pmNew')?.addEventListener('click',()=>openProduct(null));
 root()?.querySelectorAll('.pm-row').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('[data-stock]'))return;openProduct(products.find(p=>p.id===tr.dataset.productId));}));
 root()?.querySelectorAll('[data-stock]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openStock(products.find(p=>p.id===b.dataset.stock));}));
}
function openProduct(p){
 selected=p||null;const panel=document.getElementById('pmProductPanel');if(!panel)return;panel.classList.add('open');
 panel.innerHTML='<div class="panel-head"><h3>'+(p?'Edit product':'New product')+'</h3><button class="link-btn" type="button" id="pmCloseProduct">Close</button></div>'+
 '<form id="pmProductForm"><div class="pm-grid">'+
 '<label>TTT SKU<input name="ttt_sku" value="'+esc(p?.ttt_sku||'')+'"></label><label>Dealer SKU<input name="dealer_sku" value="'+esc(p?.dealer_sku||'')+'"></label>'+
 '<label>Brand<input name="brand" required value="'+esc(p?.brand||'')+'"></label><label>Model<input name="model" value="'+esc(p?.model||'')+'"></label>'+
 '<label>Variant<input name="variant" value="'+esc(p?.variant||'')+'"></label><label>Category<input name="category" value="'+esc(p?.category||'')+'"></label>'+
 '<label>Subcategory<input name="subcategory" value="'+esc(p?.subcategory||'')+'"></label><label>Name<input name="name" required value="'+esc(p?.name||p?.model||'')+'"></label>'+
 '<label>Dealer cost<input name="dealer_cost" type="number" min="0" step=".01" value="'+esc(p?.dealer_cost??'')+'"></label><label>MAP<input name="map_price" type="number" min="0" step=".01" value="'+esc(p?.map_price??'')+'"></label>'+
 '<label>MSRP<input name="msrp" type="number" min="0" step=".01" value="'+esc(p?.msrp??'')+'"></label><label>TTT selling price<input name="sell_price" type="number" min="0" step=".01" value="'+esc(p?.sell_price??'')+'"></label>'+
 '<label>MOQ<input name="moq" type="number" min="0" step="1" value="'+esc(p?.moq??'')+'"></label><label>Lead time (days)<input name="lead_time_days" type="number" min="0" step="1" value="'+esc(p?.lead_time_days??'')+'"></label>'+
 '<label class="pm-span2">Source URL<input name="source_url" value="'+esc(p?.source_url||'')+'"></label><label class="pm-span2">Description<textarea name="description">'+esc(p?.description||'')+'</textarea></label>'+
 '</div><div class="pm-actions"><button class="btn secondary" type="button" id="pmCancelProduct">Cancel</button><button class="btn primary" type="submit">Save product</button></div></form>';
 document.getElementById('pmCloseProduct').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmCancelProduct').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmProductForm').onsubmit=saveProduct;
}
async function saveProduct(e){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),row={
  organization_id:c.organizationId,ttt_sku:String(fd.get('ttt_sku')||'').trim()||null,dealer_sku:String(fd.get('dealer_sku')||'').trim()||null,
  brand:String(fd.get('brand')||'').trim()||null,model:String(fd.get('model')||'').trim()||null,variant:String(fd.get('variant')||'').trim()||null,
  category:String(fd.get('category')||'').trim()||null,subcategory:String(fd.get('subcategory')||'').trim()||null,name:String(fd.get('name')||'').trim(),
  description:String(fd.get('description')||'').trim()||null,dealer_cost:num(fd.get('dealer_cost')),map_price:num(fd.get('map_price')),msrp:num(fd.get('msrp')),sell_price:num(fd.get('sell_price')),
  moq:num(fd.get('moq')),lead_time_days:num(fd.get('lead_time_days')),source_url:String(fd.get('source_url')||'').trim()||null,
  item_type:'product',active:true,updated_by:c.userId
 };
 let q;if(selected){q=c.client.from('products_services').update(row).eq('organization_id',c.organizationId).eq('id',selected.id).select('*').single();}
 else{row.created_by=c.userId;q=c.client.from('products_services').insert(row).select('*').single();}
 const {data,error}=await q;if(error){console.error(error);toast('Product save failed: '+error.message);return;}
 await c.audit?.('product',data.id,selected?'product_updated':'product_created',{ttt_sku:data.ttt_sku,brand:data.brand,model:data.model});
 document.getElementById('pmProductPanel')?.classList.remove('open');toast('Product saved');await load();
}
function openStock(p){
 if(!p)return;const rows=invRows(p.id),current=rows[0]||null,panel=document.getElementById('pmStockPanel');panel.classList.add('open');
 panel.innerHTML='<div class="panel-head"><div><h3>Inventory · '+esc(p.brand||'')+' '+esc(p.model||p.name||'')+'</h3><p class="muted">'+esc(p.ttt_sku||p.dealer_sku||p.id)+'</p></div><button class="link-btn" id="pmCloseStock" type="button">Close</button></div>'+
 '<form id="pmStockForm"><div class="pm-grid"><label>Location<input name="location" value="'+esc(current?.location||'Main')+'"></label><label>On hand<input name="quantity_on_hand" type="number" step=".01" min="0" value="'+esc(current?.quantity_on_hand??0)+'"></label>'+
 '<label>Reserved<input name="quantity_reserved" type="number" step=".01" min="0" value="'+esc(current?.quantity_reserved??0)+'"></label><label>Reorder point<input name="reorder_point" type="number" step=".01" min="0" value="'+esc(current?.reorder_point??'')+'"></label>'+
 '<label>Reorder qty<input name="reorder_quantity" type="number" step=".01" min="0" value="'+esc(current?.reorder_quantity??'')+'"></label><label>Average cost<input name="average_cost" type="number" step=".01" min="0" value="'+esc(current?.average_cost??p.dealer_cost??'')+'"></label></div>'+
 '<div class="pm-actions"><button class="btn primary" type="submit">Save inventory</button></div></form>';
 document.getElementById('pmCloseStock').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmStockForm').onsubmit=async e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget),c=cloud(),row={organization_id:c.organizationId,product_id:p.id,sku:p.ttt_sku||p.dealer_sku||null,location:String(fd.get('location')||'Main'),quantity_on_hand:Number(fd.get('quantity_on_hand')||0),quantity_reserved:Number(fd.get('quantity_reserved')||0),reorder_point:num(fd.get('reorder_point')),reorder_quantity:num(fd.get('reorder_quantity')),average_cost:num(fd.get('average_cost')),updated_by:c.userId,last_counted_at:new Date().toISOString()};
  let q;if(current)q=c.client.from('inventory_items').update(row).eq('organization_id',c.organizationId).eq('id',current.id).select('*').single();else{row.created_by=c.userId;q=c.client.from('inventory_items').insert(row).select('*').single();}
  const {data,error}=await q;if(error){toast('Inventory save failed: '+error.message);return;}
  await c.audit?.('inventory',data.id,current?'inventory_updated':'inventory_created',{product_id:p.id,quantity_on_hand:data.quantity_on_hand,location:data.location});
  panel.classList.remove('open');toast('Inventory saved');await load();
 };
}
function subscribe(){
 if(channel||!cloud()?.client||!cloud().organizationId)return;
 channel=cloud().client.channel('ttt-product-master-'+cloud().organizationId);
 ['products_services','inventory_items','supplier_products'].forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+cloud().organizationId},()=>load()));
 channel.subscribe();
}
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();