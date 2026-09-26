// TTT OS Product Master v1.6 — consolidated ERP inventory, reorder alerts, Wishlist and PO review.
(function(){
'use strict';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],inventory=[],suppliers=[],wishlist=[],reorderAlerts=[],purchaseOrders=[],purchaseOrderLines=[],companies=[],channel=null,selected=null,activeTab='inventory';

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

function injectERPStyle(){
 if(document.getElementById('tttErpV16Styles'))return;
 const s=document.createElement('style');s.id='tttErpV16Styles';s.textContent=
 '.pm-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.pm-tab{border:1px solid #d8e0ea;background:#fff;color:#536379;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer}.pm-tab.active{background:#142238;color:#fff;border-color:#142238}.pm-tab .count{margin-left:5px;opacity:.75}.pm-alert{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:850;background:#fff3e8;color:#a65309}.pm-wish-priority{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:800;background:#eef3f8;color:#536379}.pm-wish-priority.high,.pm-wish-priority.urgent{background:#fff0ee;color:#b42318}.pm-action-row{display:flex;gap:6px;flex-wrap:wrap}.pm-subtle{color:#718096;font-size:10px}.pm-empty-block{padding:28px;text-align:center;color:#718096}.pm-po-progress{min-width:110px}.pm-po-progress span{display:block;height:6px;background:#edf2f7;border-radius:999px;overflow:hidden}.pm-po-progress i{display:block;height:100%;background:#4776ad;border-radius:999px}.pm-form-note{font-size:10px;color:#6f7f93;margin-top:5px}@media(max-width:720px){.pm-tabs{display:grid;grid-template-columns:1fr 1fr}.pm-tab{border-radius:9px}}';
 document.head.appendChild(s);
}
function productLabel(id){
 const p=products.find(x=>x.id===id);return p?[p.ttt_sku,p.brand,p.model||p.name,p.variant].filter(Boolean).join(' · '):(id||'Unlinked item');
}
function companyLabel(id){return companies.find(x=>x.id===id)?.name||id||'—';}
function available(i){return Number(i.quantity_on_hand||0)-Number(i.quantity_reserved||0);}
function wishlistOpen(){return wishlist.filter(x=>!x.archived_at&&!['purchased','received','cancelled'].includes(String(x.status||'').toLowerCase()));}
function poProgress(po){
 const lines=purchaseOrderLines.filter(x=>x.purchase_order_id===po.id&&!x.archived_at);
 const ordered=lines.reduce((s,x)=>s+Number(x.quantity||0),0),received=lines.reduce((s,x)=>s+Number(x.received_quantity||0),0);
 return {ordered,received,pct:ordered?Math.min(100,Math.round(received/ordered*100)):0,lines};
}
function setTab(tab){activeTab=tab||'inventory';render();}
async function load(){
 if(!await waitCloud())return;
 const c=cloud().client,o=cloud().organizationId;
 const [p,i,s,w,a,po,pol,co]=await Promise.all([
  c.from('products_services').select('id,ttt_sku,dealer_sku,brand,category,subcategory,model,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,source_file,source_url,effective_date,active,updated_at').eq('organization_id',o).is('archived_at',null).order('brand'),
  c.from('inventory_items').select('id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,updated_at').eq('organization_id',o).is('archived_at',null),
  c.from('supplier_products').select('id,product_id,vendor_company_id,dealer_sku,dealer_cost,map_price,msrp,moq,lead_time_days,preferred,status,source_url').eq('organization_id',o).is('archived_at',null),
  c.from('inventory_wishlist').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
  c.from('inventory_reorder_alerts').select('*').eq('organization_id',o).eq('status','open').order('last_triggered_at',{ascending:false}),
  c.from('purchase_orders').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
  c.from('purchase_order_lines').select('*').eq('organization_id',o).is('archived_at',null),
  c.from('companies').select('id,name,primary_type,status').eq('organization_id',o).is('archived_at',null)
 ]);
 const bad=[p,i,s,w,a,po,pol,co].find(x=>x.error);
 if(bad){console.error('TTT ERP load failed',bad.error);return;}
 products=p.data||[];inventory=i.data||[];suppliers=s.data||[];wishlist=w.data||[];reorderAlerts=a.data||[];purchaseOrders=po.data||[];purchaseOrderLines=pol.data||[];companies=co.data||[];
 window.TTTProductMaster={
   products,inventory,suppliers,wishlist,reorderAlerts,purchaseOrders,purchaseOrderLines,reload:load,
   find:q=>products.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())),
   openTab:tab=>setTab(tab)
 };
 render();subscribe();
 window.dispatchEvent(new CustomEvent('ttt:product-master-loaded',{detail:{products:products.length,inventory:inventory.length,supplierProducts:suppliers.length,reorderAlerts:reorderAlerts.length,wishlist:wishlistOpen().length,purchaseOrders:purchaseOrders.length}}));
}
function render(){
 injectStyle();injectERPStyle();const r=root();if(!r)return;
 const totalValue=inventory.reduce((sum,x)=>sum+Number(x.quantity_on_hand||0)*Number(x.average_cost||0),0);
 const tabs='<div class="pm-tabs">'+
   '<button class="pm-tab '+(activeTab==='inventory'?'active':'')+'" data-pm-tab="inventory">Products & Inventory <span class="count">'+products.length+'</span></button>'+
   '<button class="pm-tab '+(activeTab==='reorder'?'active':'')+'" data-pm-tab="reorder">Reorder Alerts <span class="count">'+reorderAlerts.length+'</span></button>'+
   '<button class="pm-tab '+(activeTab==='wishlist'?'active':'')+'" data-pm-tab="wishlist">Wishlist <span class="count">'+wishlistOpen().length+'</span></button>'+
   '<button class="pm-tab '+(activeTab==='purchase-orders'?'active':'')+'" data-pm-tab="purchase-orders">Purchase Orders <span class="count">'+purchaseOrders.length+'</span></button></div>';
 const head='<div class="section-head"><div><p class="eyebrow">ERP & INVENTORY</p><h2>Product Master & Inventory</h2><p class="muted">Supabase is the operating source of truth for products, stock, replenishment and purchasing.</p></div><div class="pm-action-row"><button class="btn secondary" id="pmRefresh">Refresh</button><button class="btn primary" id="pmNew">+ New product</button></div></div>'+
 '<div class="pm-kpis"><div class="pm-kpi"><span>Products</span><strong>'+products.length+'</strong></div><div class="pm-kpi"><span>Inventory value</span><strong>'+money(totalValue)+'</strong></div><div class="pm-kpi"><span>Reorder alerts</span><strong>'+reorderAlerts.length+'</strong></div><div class="pm-kpi"><span>Wishlist</span><strong>'+wishlistOpen().length+'</strong></div></div>'+tabs+
 '<div class="pm-panel" id="pmProductPanel"></div><div class="pm-panel" id="pmStockPanel"></div><div class="pm-panel" id="pmWishlistPanel"></div>';
 r.innerHTML='<div class="card">'+head+'<div id="pmTabBody"></div></div>';
 renderTab();bind();
}
function renderTab(){
 const body=document.getElementById('pmTabBody');if(!body)return;
 if(activeTab==='reorder'){renderReorder(body);return;}
 if(activeTab==='wishlist'){renderWishlist(body);return;}
 if(activeTab==='purchase-orders'){renderPurchaseOrders(body);return;}
 renderInventory(body);
}
function renderInventory(body){
 const q=(document.getElementById('pmSearch')?.value||'').trim().toLowerCase();
 const visible=products.filter(p=>!q||[p.ttt_sku,p.dealer_sku,p.brand,p.model,p.variant,p.name,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
 const rows=visible.map(p=>{const inv=invFor(p.id),m=margin(p),cost=Number(p.dealer_cost||0),sell=Number(p.sell_price||p.map_price||0),records=invRows(p.id),reorder=records.some(x=>x.reorder_point!=null&&available(x)<=Number(x.reorder_point||0));
 return '<tr class="pm-row" data-product-id="'+esc(p.id)+'"><td><b>'+esc(p.ttt_sku||'Pending')+'</b></td><td>'+esc(p.brand||'—')+'</td><td>'+esc(p.model||p.name||'—')+'</td><td>'+esc(p.variant||'—')+'</td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+money(cost)+'</td><td>'+money(sell)+'</td><td>'+(m==null?'—':m.toFixed(1)+'%')+'</td><td>'+inv.on+'</td><td>'+(inv.on-inv.res)+'</td><td>'+(reorder?'<span class="pm-alert">REORDER</span>':'—')+'</td><td class="pm-stock"><button class="btn secondary compact" data-stock="'+esc(p.id)+'">Stock</button></td></tr>'}).join('');
 body.innerHTML='<div class="pm-toolbar"><input id="pmSearch" placeholder="Search SKU, brand, model, category…" value="'+esc(q)+'"></div>'+
 '<div class="table-wrap"><table><thead><tr><th>TTT SKU</th><th>Brand</th><th>Model</th><th>Variant</th><th>Dealer SKU</th><th>Dealer Cost</th><th>TTT Price</th><th>Margin</th><th>On Hand</th><th>Available</th><th>Reorder</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="12" class="pm-empty">No products match this view.</td></tr>')+'</tbody></table></div>';
 document.getElementById('pmSearch')?.addEventListener('input',render);
 body.querySelectorAll('.pm-row').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('[data-stock]'))return;openProduct(products.find(p=>p.id===tr.dataset.productId));}));
 body.querySelectorAll('[data-stock]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openStock(products.find(p=>p.id===b.dataset.stock));}));
}
function renderReorder(body){
 const rows=reorderAlerts.map(a=>{const item=inventory.find(x=>x.id===a.inventory_item_id),p=products.find(x=>x.id===a.product_id||x.id===item?.product_id);
 return '<tr><td><strong>'+esc(productLabel(p?.id||a.product_id))+'</strong><br><small>'+esc(item?.location||'Main')+'</small></td><td>'+Number(a.available_quantity||0)+'</td><td>'+Number(a.reorder_point||0)+'</td><td><strong>'+Number(a.recommended_quantity||0)+'</strong></td><td>'+new Date(a.last_triggered_at).toLocaleString()+'</td><td><div class="pm-action-row"><button class="btn secondary compact" data-wish-alert="'+esc(a.id)+'">Add to Wishlist</button><button class="btn secondary compact" data-ack-alert="'+esc(a.id)+'">'+(a.acknowledged_at?'Acknowledged':'Acknowledge')+'</button></div></td></tr>';}).join('');
 body.innerHTML='<div class="panel-head"><div><h3>Reorder alerts</h3><p class="muted">Automatically triggered whenever available stock (on hand − reserved) reaches or falls below the configured reorder point.</p></div><span class="badge">'+reorderAlerts.length+' open</span></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Available</th><th>Reorder point</th><th>Recommended qty</th><th>Last triggered</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="pm-empty-block">No reorder alerts. Set reorder points from a product’s Stock editor.</td></tr>')+'</tbody></table></div>';
 body.querySelectorAll('[data-ack-alert]').forEach(b=>b.onclick=()=>ackAlert(b.dataset.ackAlert));
 body.querySelectorAll('[data-wish-alert]').forEach(b=>b.onclick=()=>wishFromAlert(b.dataset.wishAlert));
}
function renderWishlist(body){
 const rows=wishlist.filter(x=>!x.archived_at).map(w=>'<tr><td><strong>'+esc(w.item_name)+'</strong><br><small>'+esc(w.product_id?productLabel(w.product_id):'Uncatalogued item')+'</small></td><td>'+Number(w.desired_quantity||1)+'</td><td><span class="pm-wish-priority '+esc(String(w.priority||'normal').toLowerCase())+'">'+esc(w.priority||'normal')+'</span></td><td>'+esc(w.needed_by||'—')+'</td><td>'+esc(companyLabel(w.preferred_vendor_company_id))+'</td><td>'+money(w.estimated_unit_cost)+'</td><td>'+esc(w.status||'wishlist')+'</td><td><div class="pm-action-row"><button class="btn secondary compact" data-wish-edit="'+esc(w.id)+'">Edit</button><button class="btn secondary compact" data-wish-status="'+esc(w.id)+'" data-status="purchased">Purchased</button></div></td></tr>').join('');
 body.innerHTML='<div class="panel-head"><div><h3>Wishlist</h3><p class="muted">Keep track of tools, products, equipment and stock TTT wants or needs before they become a formal purchase order.</p></div><button class="btn primary compact" id="pmAddWishlist">+ Add Wishlist item</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Priority</th><th>Needed by</th><th>Preferred vendor</th><th>Est. unit cost</th><th>Status</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="pm-empty-block">Wishlist is empty.</td></tr>')+'</tbody></table></div>';
 document.getElementById('pmAddWishlist')?.addEventListener('click',()=>openWishlist(null));
 body.querySelectorAll('[data-wish-edit]').forEach(b=>b.onclick=()=>openWishlist(wishlist.find(x=>x.id===b.dataset.wishEdit)));
 body.querySelectorAll('[data-wish-status]').forEach(b=>b.onclick=()=>setWishlistStatus(b.dataset.wishStatus,b.dataset.status));
}
function renderPurchaseOrders(body){
 const rows=purchaseOrders.map(po=>{const p=poProgress(po);return '<tr><td><strong>'+esc(po.id)+'</strong><br><small>'+esc(po.vendor_reference||'')+'</small></td><td>'+esc(companyLabel(po.vendor_company_id))+'</td><td><span class="badge">'+esc(po.status)+'</span></td><td>'+esc(po.order_date||'—')+'</td><td>'+esc(po.expected_date||'—')+'</td><td>'+money(po.total)+'</td><td class="pm-po-progress"><small>'+p.received+' / '+p.ordered+' received</small><span><i style="width:'+p.pct+'%"></i></span></td><td>'+esc(po.job_id||'—')+'</td></tr>';}).join('');
 body.innerHTML='<div class="panel-head"><div><h3>Purchase Orders</h3><p class="muted">Existing Supabase PO model: vendor, optional Job, order/expected/received dates and line-level receiving quantities.</p></div><span class="badge">'+purchaseOrders.length+' PO'+(purchaseOrders.length===1?'':'s')+'</span></div>'+
 '<div class="table-wrap"><table><thead><tr><th>PO</th><th>Vendor</th><th>Status</th><th>Ordered</th><th>Expected</th><th>Total</th><th>Receiving</th><th>Job</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="pm-empty-block">No Purchase Orders yet. The underlying PO and PO-line model is ready for the purchasing workflow.</td></tr>')+'</tbody></table></div>';
}
function bind(){
 document.querySelectorAll('[data-pm-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.pmTab)));
 document.getElementById('pmRefresh')?.addEventListener('click',load);
 document.getElementById('pmNew')?.addEventListener('click',()=>openProduct(null));
}
function openWishlist(w){
 const panel=document.getElementById('pmWishlistPanel');if(!panel)return;panel.classList.add('open');
 const productOpts='<option value="">Uncatalogued / free-text item</option>'+products.map(p=>'<option value="'+esc(p.id)+'" '+(w?.product_id===p.id?'selected':'')+'>'+esc(productLabel(p.id))+'</option>').join('');
 const vendors=companies.filter(x=>['vendor','supplier','distributor'].includes(String(x.primary_type||'').toLowerCase()));
 panel.innerHTML='<div class="panel-head"><h3>'+(w?'Edit Wishlist item':'Add Wishlist item')+'</h3><button class="link-btn" type="button" id="pmCloseWishlist">Close</button></div>'+
 '<form id="pmWishlistForm"><div class="pm-grid"><label>Catalog product<select name="product_id">'+productOpts+'</select></label><label>Item name<input name="item_name" required value="'+esc(w?.item_name||'')+'"></label><label>Desired qty<input name="desired_quantity" type="number" min="0.01" step=".01" value="'+esc(w?.desired_quantity??1)+'"></label><label>Priority<select name="priority">'+['low','normal','high','urgent'].map(x=>'<option '+(w?.priority===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Needed by<input name="needed_by" type="date" value="'+esc(w?.needed_by||'')+'"></label><label>Preferred vendor<select name="preferred_vendor_company_id"><option value="">No preference</option>'+vendors.map(v=>'<option value="'+esc(v.id)+'" '+(w?.preferred_vendor_company_id===v.id?'selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></label><label>Estimated unit cost<input name="estimated_unit_cost" type="number" min="0" step=".01" value="'+esc(w?.estimated_unit_cost??'')+'"></label><label>Status<select name="status">'+['wishlist','researching','ready_to_buy','purchased','received','cancelled'].map(x=>'<option '+(w?.status===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label class="pm-span2">Reason<input name="reason" value="'+esc(w?.reason||'')+'"></label><label class="pm-span2">Notes<textarea name="notes">'+esc(w?.notes||'')+'</textarea></label></div><div class="pm-actions"><button class="btn primary" type="submit">Save Wishlist item</button></div></form>';
 panel.querySelector('[name="product_id"]').onchange=e=>{if(!panel.querySelector('[name="item_name"]').value&&e.target.value)panel.querySelector('[name="item_name"]').value=productLabel(e.target.value);};
 document.getElementById('pmCloseWishlist').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmWishlistForm').onsubmit=e=>saveWishlist(e,w);
}
async function saveWishlist(e,w){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),row={organization_id:c.organizationId,product_id:String(fd.get('product_id')||'')||null,item_name:String(fd.get('item_name')||'').trim(),desired_quantity:Number(fd.get('desired_quantity')||1),priority:String(fd.get('priority')||'normal'),needed_by:String(fd.get('needed_by')||'')||null,reason:String(fd.get('reason')||'').trim()||null,preferred_vendor_company_id:String(fd.get('preferred_vendor_company_id')||'')||null,estimated_unit_cost:num(fd.get('estimated_unit_cost')),status:String(fd.get('status')||'wishlist'),notes:String(fd.get('notes')||'').trim()||null,updated_by:c.userId};
 let q;if(w)q=c.client.from('inventory_wishlist').update(row).eq('organization_id',c.organizationId).eq('id',w.id).select('*').single();else{row.created_by=c.userId;q=c.client.from('inventory_wishlist').insert(row).select('*').single();}
 const {data,error}=await q;if(error)return toast('Wishlist save failed: '+error.message);
 await c.audit?.('inventory_wishlist',data.id,w?'wishlist_updated':'wishlist_created',{product_id:data.product_id,priority:data.priority,status:data.status});
 document.getElementById('pmWishlistPanel')?.classList.remove('open');toast('Wishlist updated');await load();activeTab='wishlist';render();
}
async function setWishlistStatus(id,status){
 const c=cloud(),{error}=await c.client.from('inventory_wishlist').update({status,updated_by:c.userId,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id);
 if(error)return toast('Wishlist update failed: '+error.message);await c.audit?.('inventory_wishlist',id,'wishlist_status_changed',{status});await load();activeTab='wishlist';render();
}
async function ackAlert(id){
 const c=cloud(),a=reorderAlerts.find(x=>x.id===id);if(!a)return;
 const {error}=await c.client.from('inventory_reorder_alerts').update({acknowledged_at:a.acknowledged_at?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id);
 if(error)return toast('Alert update failed: '+error.message);await load();activeTab='reorder';render();
}
async function wishFromAlert(id){
 const c=cloud(),a=reorderAlerts.find(x=>x.id===id),item=inventory.find(x=>x.id===a?.inventory_item_id);if(!a)return;
 const productId=a.product_id||item?.product_id||null,name=productLabel(productId);
 const existing=wishlistOpen().find(x=>x.product_id&&x.product_id===productId);
 if(existing){activeTab='wishlist';render();return toast('This product is already on the Wishlist.');}
 const row={organization_id:c.organizationId,product_id:productId,item_name:name,desired_quantity:Number(a.recommended_quantity||1),priority:'high',reason:'Automatic reorder alert at '+Number(a.available_quantity||0)+' available; reorder point '+Number(a.reorder_point||0),status:'ready_to_buy',created_by:c.userId,updated_by:c.userId};
 const {data,error}=await c.client.from('inventory_wishlist').insert(row).select('*').single();if(error)return toast('Could not add reorder item to Wishlist: '+error.message);
 await c.audit?.('inventory_wishlist',data.id,'created_from_reorder_alert',{reorder_alert_id:id,product_id:productId});toast('Reorder item added to Wishlist.');await load();activeTab='wishlist';render();
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
 ['products_services','inventory_items','supplier_products','inventory_wishlist','inventory_reorder_alerts','purchase_orders','purchase_order_lines'].forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+cloud().organizationId},()=>load()));
 channel.subscribe();
}
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();