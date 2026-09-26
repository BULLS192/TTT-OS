// TTT OS ERP v1.8 — unified Inventory master with Pricing and Review.
(function(){
'use strict';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],inventory=[],suppliers=[],wishlist=[],reorderAlerts=[],purchaseOrders=[],purchaseOrderLines=[],companies=[],pricingRules=[],channel=null,selected=null,selectedRule=null,activeTab='inventory',searchTerm='',stockFilter='all';

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
 const [p,i,s,w,a,po,pol,co,pr]=await Promise.all([
  c.from('products_services').select('id,item_type,ttt_sku,dealer_sku,brand,category,subcategory,model,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,source_file,source_url,effective_date,unit,taxable,active,updated_at').eq('organization_id',o).is('archived_at',null).order('brand'),
  c.from('inventory_items').select('id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,updated_at').eq('organization_id',o).is('archived_at',null),
  c.from('supplier_products').select('id,product_id,vendor_company_id,dealer_sku,dealer_cost,map_price,msrp,moq,lead_time_days,preferred,status,source_url').eq('organization_id',o).is('archived_at',null),
  c.from('inventory_wishlist').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
  c.from('inventory_reorder_alerts').select('*').eq('organization_id',o).eq('status','open').order('last_triggered_at',{ascending:false}),
  c.from('purchase_orders').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
  c.from('purchase_order_lines').select('*').eq('organization_id',o).is('archived_at',null),
  c.from('companies').select('id,name,primary_type,status').eq('organization_id',o).is('archived_at',null),
  c.from('pricing_rules').select('*').eq('organization_id',o).is('archived_at',null).order('priority')
 ]);
 const bad=[p,i,s,w,a,po,pol,co,pr].find(x=>x.error);
 if(bad){console.error('TTT ERP load failed',bad.error);return;}
 products=p.data||[];inventory=i.data||[];suppliers=s.data||[];wishlist=w.data||[];reorderAlerts=a.data||[];purchaseOrders=po.data||[];purchaseOrderLines=pol.data||[];companies=co.data||[];pricingRules=pr.data||[];
 window.TTTProductMaster={
   products,inventory,suppliers,wishlist,reorderAlerts,purchaseOrders,purchaseOrderLines,pricingRules,reload:load,
   find:q=>products.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase())),
   openTab:tab=>setTab(tab)
 };
 render();subscribe();
 window.dispatchEvent(new CustomEvent('ttt:product-master-loaded',{detail:{products:products.length,inventory:inventory.length,supplierProducts:suppliers.length,reorderAlerts:reorderAlerts.length,wishlist:wishlistOpen().length,purchaseOrders:purchaseOrders.length}}));
}
function render(){
 injectStyle();injectERPStyle();const r=root();if(!r)return;
 const physical=products.filter(p=>['product','material'].includes(String(p.item_type||'product').toLowerCase()));
 const totalValue=inventory.reduce((sum,x)=>sum+Number(x.quantity_on_hand||0)*Number(x.average_cost||0),0);
 const tabs='<div class="pm-tabs">'+
   '<button class="pm-tab '+(activeTab==='inventory'?'active':'')+'" data-pm-tab="inventory">Inventory <span class="count">'+physical.length+'</span></button>'+
   '<button class="pm-tab '+(activeTab==='pricing'?'active':'')+'" data-pm-tab="pricing">Pricing <span class="count">'+products.length+'</span></button>'+
   '<button class="pm-tab '+(activeTab==='review'?'active':'')+'" data-pm-tab="review">Review <span class="count">'+wishlistOpen().length+'</span></button></div>';
 const head='<div class="section-head"><div><p class="eyebrow">ERP & INVENTORY</p><h2>Inventory</h2><p class="muted">One master for TTT products, materials, services, labor, pricing, supplier references, stock and reorder points.</p></div><div class="pm-action-row"><button class="btn secondary" id="pmRefresh">Refresh</button><button class="btn primary" id="pmNew">+ New item</button></div></div>'+
 '<div class="pm-kpis"><div class="pm-kpi"><span>Catalog items</span><strong>'+physical.length+'</strong></div><div class="pm-kpi"><span>In stock</span><strong>'+physical.filter(p=>invFor(p.id).on>0).length+'</strong></div><div class="pm-kpi"><span>Inventory value</span><strong>'+money(totalValue)+'</strong></div><div class="pm-kpi"><span>Review</span><strong>'+wishlistOpen().length+'</strong></div></div>'+tabs+
 '<div class="pm-panel" id="pmProductPanel"></div><div class="pm-panel" id="pmStockPanel"></div><div class="pm-panel" id="pmReviewPanel"></div><div class="pm-panel" id="pmPricingPanel"></div>';
 r.innerHTML='<div class="card">'+head+'<div id="pmTabBody"></div></div>';
 renderTab();bind();
}
function renderTab(){
 const body=document.getElementById('pmTabBody');if(!body)return;
 if(activeTab==='pricing'){renderPricing(body);return;}
 if(activeTab==='reorder'){renderReorder(body);return;}
 if(activeTab==='review'){renderReview(body);return;}
 if(activeTab==='purchase-orders'){renderPurchaseOrders(body);return;}
 renderInventory(body);
}
function renderInventory(body){
 const q=searchTerm.trim().toLowerCase();
 const physical=products.filter(p=>['product','material'].includes(String(p.item_type||'product').toLowerCase()));
 const visible=physical.filter(p=>{
   const rows=invRows(p.id),tot=invFor(p.id),has=rows.length>0,avail=tot.on-tot.res;
   const pass=stockFilter==='all'||(stockFilter==='in_stock'&&avail>0)||(stockFilter==='out_of_stock'&&has&&avail<=0)||(stockFilter==='catalog_only'&&!has)||(stockFilter==='ttt_stock'&&tot.on>0);
   return pass&&(!q||[p.ttt_sku,p.dealer_sku,p.brand,p.model,p.variant,p.name,p.category,p.source_file].some(v=>String(v||'').toLowerCase().includes(q)));
 });
 const rows=visible.map(p=>{const inv=invFor(p.id),records=invRows(p.id),first=records[0]||{},m=margin(p),cost=Number(p.dealer_cost||0),sell=Number(p.sell_price||p.map_price||0),reorder=records.some(x=>x.reorder_point!=null&&available(x)<=Number(x.reorder_point||0));
 return '<tr class="pm-row" data-product-id="'+esc(p.id)+'"><td><b>'+esc(p.ttt_sku||'Auto')+'</b><br><small>'+esc(p.item_type||'product')+'</small></td><td>'+esc(p.brand||'—')+'</td><td>'+esc(p.model||p.name||'—')+'<br><small>'+esc(p.variant||'')+'</small></td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+money(cost)+'</td><td>'+money(sell)+'</td><td>'+(m==null?'—':m.toFixed(1)+'%')+'</td><td>'+inv.on+'</td><td>'+(inv.on-inv.res)+'</td><td><input class="pm-reorder-inline" type="number" min="0" step="1" value="'+esc(first.reorder_point??'')+'" placeholder="—" data-reorder-product="'+esc(p.id)+'"></td><td>'+(reorder?'<span class="pm-alert">REORDER</span>':(records.length?'<span class="badge">Tracked</span>':'<span class="pm-subtle">Catalog only</span>'))+'</td><td class="pm-stock"><button class="btn secondary compact" data-stock="'+esc(p.id)+'">Stock</button></td></tr>'}).join('');
 body.innerHTML='<div class="pm-toolbar"><input id="pmSearch" placeholder="Search TTT SKU, dealer SKU, brand, model, category…" value="'+esc(searchTerm)+'"><select id="pmStockFilter"><option value="all">All catalog items</option><option value="ttt_stock">TTT has on hand</option><option value="in_stock">Available stock</option><option value="out_of_stock">Tracked / out of stock</option><option value="catalog_only">Catalog only / not stocked</option></select></div>'+
 '<div class="table-wrap"><table><thead><tr><th>TTT SKU</th><th>Brand</th><th>Item</th><th>Dealer SKU</th><th>Cost</th><th>TTT Price</th><th>Margin</th><th>On Hand</th><th>Available</th><th>Reorder point</th><th>State</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="12" class="pm-empty">No items match this inventory view.</td></tr>')+'</tbody></table></div>';
 const sf=document.getElementById('pmStockFilter');if(sf)sf.value=stockFilter;
 document.getElementById('pmSearch')?.addEventListener('input',e=>{searchTerm=e.target.value;renderInventory(body);});
 sf?.addEventListener('change',e=>{stockFilter=e.target.value;renderInventory(body);});
 body.querySelectorAll('.pm-row').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('[data-stock],[data-reorder-product]'))return;openProduct(products.find(p=>p.id===tr.dataset.productId));}));
 body.querySelectorAll('[data-stock]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openStock(products.find(p=>p.id===b.dataset.stock));}));
 body.querySelectorAll('[data-reorder-product]').forEach(inp=>inp.addEventListener('change',e=>{e.stopPropagation();saveReorderPoint(inp.dataset.reorderProduct,inp.value);}));
}
function renderPricing(body){
 const typeCounts=['product','service','material','labor'].map(t=>({type:t,count:products.filter(p=>String(p.item_type||'product').toLowerCase()===t).length}));
 const q=searchTerm.trim().toLowerCase();
 const rows=products.filter(p=>!q||[p.ttt_sku,p.item_type,p.brand,p.name,p.model,p.category].some(v=>String(v||'').toLowerCase().includes(q))).map(p=>'<tr data-price-item="'+esc(p.id)+'"><td><strong>'+esc(p.ttt_sku||'Auto')+'</strong></td><td><span class="badge">'+esc(p.item_type||'product')+'</span></td><td><strong>'+esc(p.name||p.model||'Item')+'</strong><br><small>'+esc([p.brand,p.model,p.variant].filter(Boolean).join(' · '))+'</small></td><td>'+esc(p.unit||'—')+'</td><td>'+money(p.dealer_cost)+'</td><td>'+money(p.sell_price)+'</td><td><div class="pm-action-row"><button class="btn secondary compact" data-price-edit="'+esc(p.id)+'">Edit</button><button class="btn danger compact" data-price-delete="'+esc(p.id)+'">Delete</button></div></td></tr>').join('');
 const rules=pricingRules.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.scope_type)+(r.scope_value?' · '+esc(r.scope_value):'')+'</td><td>'+esc(r.rule_type)+'</td><td>'+Number(r.rule_value||0)+'</td><td>'+Number(r.priority||100)+'</td><td><span class="badge">'+(r.active?'Active':'Inactive')+'</span></td><td><div class="pm-action-row"><button class="btn secondary compact" data-rule-edit="'+esc(r.id)+'">Edit</button><button class="btn danger compact" data-rule-delete="'+esc(r.id)+'">Delete</button></div></td></tr>').join('');
 body.innerHTML='<div class="panel-head"><div><h3>Pricing master</h3><p class="muted">Products, services, materials and labor rates are editable directly in TTT OS. TTT SKUs are assigned automatically.</p></div><div class="pm-action-row"><button class="btn secondary compact" id="pmNewRule">+ Pricing rule</button><button class="btn primary compact" id="pmNewPriceItem">+ Pricing item</button></div></div>'+
 '<div class="pm-kpis">'+typeCounts.map(x=>'<div class="pm-kpi"><span>'+esc(x.type)+'</span><strong>'+x.count+'</strong></div>').join('')+'</div>'+
 '<div class="pm-toolbar"><input id="pmPriceSearch" placeholder="Search SKU, type, service, product, material or labor…" value="'+esc(searchTerm)+'"></div>'+
 '<div class="table-wrap"><table><thead><tr><th>TTT SKU</th><th>Type</th><th>Item</th><th>Unit</th><th>Cost</th><th>TTT Price / Rate</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="pm-empty">No pricing items yet.</td></tr>')+'</tbody></table></div>'+
 '<div class="panel-head" style="margin-top:18px"><div><h3>Pricing rules</h3><p class="muted">Reusable markup/markdown/fixed-price rules. Quotes can still be adjusted individually.</p></div><span class="badge">'+pricingRules.length+'</span></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Rule</th><th>Scope</th><th>Method</th><th>Value</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>'+(rules||'<tr><td colspan="7" class="pm-empty">No pricing rules configured yet.</td></tr>')+'</tbody></table></div>';
 document.getElementById('pmPriceSearch')?.addEventListener('input',e=>{searchTerm=e.target.value;renderPricing(body);});
 document.getElementById('pmNewPriceItem')?.addEventListener('click',()=>openProduct(null));
 document.getElementById('pmNewRule')?.addEventListener('click',()=>openPricingRule(null));
 body.querySelectorAll('[data-price-edit]').forEach(b=>b.onclick=()=>openProduct(products.find(x=>x.id===b.dataset.priceEdit)));
 body.querySelectorAll('[data-price-delete]').forEach(b=>b.onclick=()=>archiveProduct(b.dataset.priceDelete));
 body.querySelectorAll('[data-rule-edit]').forEach(b=>b.onclick=()=>openPricingRule(pricingRules.find(x=>x.id===b.dataset.ruleEdit)));
 body.querySelectorAll('[data-rule-delete]').forEach(b=>b.onclick=()=>archivePricingRule(b.dataset.ruleDelete));
}
async function saveReorderPoint(productId,value){
 const c=cloud(),p=products.find(x=>x.id===productId),rows=invRows(productId),current=rows[0]||null,point=num(value);
 if(!p||!c?.ready)return;
 let q;
 if(current)q=c.client.from('inventory_items').update({reorder_point:point,updated_by:c.userId,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',current.id);
 else q=c.client.from('inventory_items').insert({organization_id:c.organizationId,product_id:p.id,sku:p.ttt_sku||p.dealer_sku||null,location:'Main',quantity_on_hand:0,quantity_reserved:0,reorder_point:point,reorder_quantity:null,average_cost:p.dealer_cost||null,created_by:c.userId,updated_by:c.userId});
 const {error}=await q;if(error)return toast('Reorder point save failed: '+error.message);toast('Reorder point updated');await load();activeTab='inventory';render();
}
function openPricingRule(rule){
 selectedRule=rule||null;const panel=document.getElementById('pmPricingPanel');if(!panel)return;panel.classList.add('open');
 panel.innerHTML='<div class="panel-head"><h3>'+(rule?'Edit pricing rule':'New pricing rule')+'</h3><button class="link-btn" id="pmCloseRule">Close</button></div>'+
 '<form id="pmRuleForm"><div class="pm-grid"><label>Name<input name="name" required value="'+esc(rule?.name||'')+'"></label><label>Scope<select name="scope_type">'+['all','item_type','category','brand','sku'].map(x=>'<option '+(rule?.scope_type===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Scope value<input name="scope_value" value="'+esc(rule?.scope_value||'')+'" placeholder="e.g. Window Tint"></label><label>Rule type<select name="rule_type">'+['markup_percent','markdown_percent','fixed_price','margin_percent'].map(x=>'<option '+(rule?.rule_type===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Value<input name="rule_value" type="number" step=".01" value="'+esc(rule?.rule_value??0)+'"></label><label>Priority<input name="priority" type="number" step="1" value="'+esc(rule?.priority??100)+'"></label><label>Starts<input name="starts_on" type="date" value="'+esc(rule?.starts_on||'')+'"></label><label>Ends<input name="ends_on" type="date" value="'+esc(rule?.ends_on||'')+'"></label><label class="pm-span2">Notes<textarea name="notes">'+esc(rule?.notes||'')+'</textarea></label><label><input name="active" type="checkbox" '+(rule?.active!==false?'checked':'')+'> Active</label></div><div class="pm-actions"><button class="btn primary" type="submit">Save rule</button></div></form>';
 document.getElementById('pmCloseRule').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmRuleForm').onsubmit=savePricingRule;
}
async function savePricingRule(e){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),row={organization_id:c.organizationId,name:String(fd.get('name')||'').trim(),scope_type:String(fd.get('scope_type')||'all'),scope_value:String(fd.get('scope_value')||'').trim()||null,rule_type:String(fd.get('rule_type')||'markup_percent'),rule_value:Number(fd.get('rule_value')||0),priority:Number(fd.get('priority')||100),starts_on:String(fd.get('starts_on')||'')||null,ends_on:String(fd.get('ends_on')||'')||null,notes:String(fd.get('notes')||'').trim()||null,active:fd.get('active')==='on',updated_by:c.userId};
 let q;if(selectedRule)q=c.client.from('pricing_rules').update(row).eq('organization_id',c.organizationId).eq('id',selectedRule.id);else{row.created_by=c.userId;q=c.client.from('pricing_rules').insert(row);}
 const {error}=await q;if(error)return toast('Pricing rule save failed: '+error.message);document.getElementById('pmPricingPanel')?.classList.remove('open');toast('Pricing rule saved');await load();activeTab='pricing';render();
}
async function archivePricingRule(id){
 if(!confirm('Delete this pricing rule?'))return;const c=cloud(),{error}=await c.client.from('pricing_rules').update({archived_at:new Date().toISOString(),updated_by:c.userId}).eq('organization_id',c.organizationId).eq('id',id);if(error)return toast('Pricing rule delete failed: '+error.message);await load();activeTab='pricing';render();
}
async function archiveProduct(id){
 const p=products.find(x=>x.id===id);if(!p||!confirm('Delete '+(p.name||p.model||p.ttt_sku)+' from the active Pricing/Inventory master? Historical quote/job links will be preserved.'))return;
 const c=cloud(),{error}=await c.client.from('products_services').update({archived_at:new Date().toISOString(),active:false,updated_by:c.userId}).eq('organization_id',c.organizationId).eq('id',id);if(error)return toast('Item delete failed: '+error.message);toast('Item archived');await load();activeTab='pricing';render();
}

function renderReorder(body){
 const rows=reorderAlerts.map(a=>{const item=inventory.find(x=>x.id===a.inventory_item_id),p=products.find(x=>x.id===a.product_id||x.id===item?.product_id);
 return '<tr><td><strong>'+esc(productLabel(p?.id||a.product_id))+'</strong><br><small>'+esc(item?.location||'Main')+'</small></td><td>'+Number(a.available_quantity||0)+'</td><td>'+Number(a.reorder_point||0)+'</td><td><strong>'+Number(a.recommended_quantity||0)+'</strong></td><td>'+new Date(a.last_triggered_at).toLocaleString()+'</td><td><div class="pm-action-row"><button class="btn secondary compact" data-wish-alert="'+esc(a.id)+'">Add to Review</button><button class="btn secondary compact" data-ack-alert="'+esc(a.id)+'">'+(a.acknowledged_at?'Acknowledged':'Acknowledge')+'</button></div></td></tr>';}).join('');
 body.innerHTML='<div class="panel-head"><div><h3>Reorder alerts</h3><p class="muted">Automatically triggered whenever available stock (on hand − reserved) reaches or falls below the configured reorder point.</p></div><span class="badge">'+reorderAlerts.length+' open</span></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Available</th><th>Reorder point</th><th>Recommended qty</th><th>Last triggered</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="pm-empty-block">No reorder alerts. Set reorder points from a product’s Stock editor.</td></tr>')+'</tbody></table></div>';
 body.querySelectorAll('[data-ack-alert]').forEach(b=>b.onclick=()=>ackAlert(b.dataset.ackAlert));
 body.querySelectorAll('[data-wish-alert]').forEach(b=>b.onclick=()=>wishFromAlert(b.dataset.wishAlert));
}
function renderReview(body){
 const rows=wishlist.filter(x=>!x.archived_at).map(w=>'<tr><td><strong>'+esc(w.item_name)+'</strong><br><small>'+esc(w.product_id?productLabel(w.product_id):'Uncatalogued item')+'</small></td><td>'+Number(w.desired_quantity||1)+'</td><td><span class="pm-wish-priority '+esc(String(w.priority||'normal').toLowerCase())+'">'+esc(w.priority||'normal')+'</span></td><td>'+esc(w.needed_by||'—')+'</td><td>'+esc(companyLabel(w.preferred_vendor_company_id))+'</td><td>'+money(w.estimated_unit_cost)+'</td><td>'+esc(w.status||'wishlist')+'</td><td><div class="pm-action-row"><button class="btn secondary compact" data-wish-edit="'+esc(w.id)+'">Edit</button><button class="btn secondary compact" data-wish-status="'+esc(w.id)+'" data-status="purchased">Purchased</button></div></td></tr>').join('');
 body.innerHTML='<div class="panel-head"><div><h3>Review</h3><p class="muted">Keep track of tools, products, equipment and stock TTT wants or needs before they become a formal purchase order.</p></div><button class="btn primary compact" id="pmAddReview">+ Add Review item</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Priority</th><th>Needed by</th><th>Preferred vendor</th><th>Est. unit cost</th><th>Status</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="pm-empty-block">Review is empty.</td></tr>')+'</tbody></table></div>';
 document.getElementById('pmAddReview')?.addEventListener('click',()=>openReview(null));
 body.querySelectorAll('[data-wish-edit]').forEach(b=>b.onclick=()=>openReview(wishlist.find(x=>x.id===b.dataset.wishEdit)));
 body.querySelectorAll('[data-wish-status]').forEach(b=>b.onclick=()=>setReviewStatus(b.dataset.wishStatus,b.dataset.status));
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
function openReview(w){
 const panel=document.getElementById('pmReviewPanel');if(!panel)return;panel.classList.add('open');
 const productOpts='<option value="">Uncatalogued / free-text item</option>'+products.map(p=>'<option value="'+esc(p.id)+'" '+(w?.product_id===p.id?'selected':'')+'>'+esc(productLabel(p.id))+'</option>').join('');
 const vendors=companies.filter(x=>['vendor','supplier','distributor'].includes(String(x.primary_type||'').toLowerCase()));
 panel.innerHTML='<div class="panel-head"><h3>'+(w?'Edit Review item':'Add Review item')+'</h3><button class="link-btn" type="button" id="pmCloseReview">Close</button></div>'+
 '<form id="pmReviewForm"><div class="pm-grid"><label>Catalog product<select name="product_id">'+productOpts+'</select></label><label>Item name<input name="item_name" required value="'+esc(w?.item_name||'')+'"></label><label>Desired qty<input name="desired_quantity" type="number" min="0.01" step=".01" value="'+esc(w?.desired_quantity??1)+'"></label><label>Priority<select name="priority">'+['low','normal','high','urgent'].map(x=>'<option '+(w?.priority===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Needed by<input name="needed_by" type="date" value="'+esc(w?.needed_by||'')+'"></label><label>Preferred vendor<select name="preferred_vendor_company_id"><option value="">No preference</option>'+vendors.map(v=>'<option value="'+esc(v.id)+'" '+(w?.preferred_vendor_company_id===v.id?'selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></label><label>Estimated unit cost<input name="estimated_unit_cost" type="number" min="0" step=".01" value="'+esc(w?.estimated_unit_cost??'')+'"></label><label>Status<select name="status">'+['wishlist','researching','ready_to_buy','purchased','received','cancelled'].map(x=>'<option '+(w?.status===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label class="pm-span2">Reason<input name="reason" value="'+esc(w?.reason||'')+'"></label><label class="pm-span2">Notes<textarea name="notes">'+esc(w?.notes||'')+'</textarea></label></div><div class="pm-actions"><button class="btn primary" type="submit">Save Review item</button></div></form>';
 panel.querySelector('[name="product_id"]').onchange=e=>{if(!panel.querySelector('[name="item_name"]').value&&e.target.value)panel.querySelector('[name="item_name"]').value=productLabel(e.target.value);};
 document.getElementById('pmCloseReview').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmReviewForm').onsubmit=e=>saveReview(e,w);
}
async function saveReview(e,w){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),row={organization_id:c.organizationId,product_id:String(fd.get('product_id')||'')||null,item_name:String(fd.get('item_name')||'').trim(),desired_quantity:Number(fd.get('desired_quantity')||1),priority:String(fd.get('priority')||'normal'),needed_by:String(fd.get('needed_by')||'')||null,reason:String(fd.get('reason')||'').trim()||null,preferred_vendor_company_id:String(fd.get('preferred_vendor_company_id')||'')||null,estimated_unit_cost:num(fd.get('estimated_unit_cost')),status:String(fd.get('status')||'wishlist'),notes:String(fd.get('notes')||'').trim()||null,updated_by:c.userId};
 let q;if(w)q=c.client.from('inventory_wishlist').update(row).eq('organization_id',c.organizationId).eq('id',w.id).select('*').single();else{row.created_by=c.userId;q=c.client.from('inventory_wishlist').insert(row).select('*').single();}
 const {data,error}=await q;if(error)return toast('Review save failed: '+error.message);
 await c.audit?.('inventory_wishlist',data.id,w?'wishlist_updated':'wishlist_created',{product_id:data.product_id,priority:data.priority,status:data.status});
 document.getElementById('pmReviewPanel')?.classList.remove('open');toast('Review updated');await load();activeTab='review';render();
}
async function setReviewStatus(id,status){
 const c=cloud(),{error}=await c.client.from('inventory_wishlist').update({status,updated_by:c.userId,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id);
 if(error)return toast('Review update failed: '+error.message);await c.audit?.('inventory_wishlist',id,'wishlist_status_changed',{status});await load();activeTab='review';render();
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
 if(existing){activeTab='review';render();return toast('This product is already on the Review.');}
 const row={organization_id:c.organizationId,product_id:productId,item_name:name,desired_quantity:Number(a.recommended_quantity||1),priority:'high',reason:'Automatic reorder alert at '+Number(a.available_quantity||0)+' available; reorder point '+Number(a.reorder_point||0),status:'ready_to_buy',created_by:c.userId,updated_by:c.userId};
 const {data,error}=await c.client.from('inventory_wishlist').insert(row).select('*').single();if(error)return toast('Could not add reorder item to Review: '+error.message);
 await c.audit?.('inventory_wishlist',data.id,'created_from_reorder_alert',{reorder_alert_id:id,product_id:productId});toast('Reorder item added to Review.');await load();activeTab='review';render();
}
function openProduct(p){
 selected=p||null;const panel=document.getElementById('pmProductPanel');if(!panel)return;panel.classList.add('open');
 const type=String(p?.item_type||'product').toLowerCase();
 panel.innerHTML='<div class="panel-head"><h3>'+(p?'Edit pricing item':'New pricing item')+'</h3><button class="link-btn" type="button" id="pmCloseProduct">Close</button></div>'+
 '<form id="pmProductForm"><div class="pm-grid">'+
 '<label>Item type<select name="item_type">'+['product','service','material','labor'].map(x=>'<option '+(type===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>TTT SKU<input name="ttt_sku" value="'+esc(p?.ttt_sku||'Assigned automatically')+'" readonly></label>'+
 '<label>Dealer / vendor SKU<input name="dealer_sku" value="'+esc(p?.dealer_sku||'')+'"></label><label>Brand<input name="brand" value="'+esc(p?.brand||'')+'"></label><label>Model<input name="model" value="'+esc(p?.model||'')+'"></label>'+
 '<label>Variant<input name="variant" value="'+esc(p?.variant||'')+'"></label><label>Category<input name="category" value="'+esc(p?.category||'')+'"></label><label>Subcategory<input name="subcategory" value="'+esc(p?.subcategory||'')+'"></label>'+
 '<label>Name<input name="name" required value="'+esc(p?.name||p?.model||'')+'"></label><label>Unit<input name="unit" value="'+esc(p?.unit||((type==='labor')?'hour':'each'))+'" placeholder="each, hour, service…"></label>'+
 '<label>Dealer / unit cost<input name="dealer_cost" type="number" min="0" step=".01" value="'+esc(p?.dealer_cost??'')+'"></label><label>MAP<input name="map_price" type="number" min="0" step=".01" value="'+esc(p?.map_price??'')+'"></label>'+
 '<label>MSRP<input name="msrp" type="number" min="0" step=".01" value="'+esc(p?.msrp??'')+'"></label><label>TTT selling price / rate<input name="sell_price" type="number" min="0" step=".01" value="'+esc(p?.sell_price??'')+'"></label>'+
 '<label>MOQ<input name="moq" type="number" min="0" step="1" value="'+esc(p?.moq??'')+'"></label><label>Lead time (days)<input name="lead_time_days" type="number" min="0" step="1" value="'+esc(p?.lead_time_days??'')+'"></label>'+
 '<label><input name="taxable" type="checkbox" '+(p?.taxable!==false?'checked':'')+'> Taxable</label><label class="pm-span2">Source URL<input name="source_url" value="'+esc(p?.source_url||'')+'"></label><label class="pm-span2">Description<textarea name="description">'+esc(p?.description||'')+'</textarea></label>'+
 '</div><div class="pm-actions">'+(p?'<button class="btn danger" type="button" id="pmDeleteProduct">Delete</button>':'')+'<button class="btn secondary" type="button" id="pmCancelProduct">Cancel</button><button class="btn primary" type="submit">Save item</button></div></form>';
 document.getElementById('pmCloseProduct').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmCancelProduct').onclick=()=>panel.classList.remove('open');
 document.getElementById('pmDeleteProduct')?.addEventListener('click',()=>archiveProduct(p.id));
 document.getElementById('pmProductForm').onsubmit=saveProduct;
}
async function saveProduct(e){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),row={
  organization_id:c.organizationId,ttt_sku:selected?.ttt_sku||null,item_type:String(fd.get('item_type')||'product'),dealer_sku:String(fd.get('dealer_sku')||'').trim()||null,
  brand:String(fd.get('brand')||'').trim()||null,model:String(fd.get('model')||'').trim()||null,variant:String(fd.get('variant')||'').trim()||null,
  category:String(fd.get('category')||'').trim()||null,subcategory:String(fd.get('subcategory')||'').trim()||null,name:String(fd.get('name')||'').trim(),
  description:String(fd.get('description')||'').trim()||null,dealer_cost:num(fd.get('dealer_cost')),map_price:num(fd.get('map_price')),msrp:num(fd.get('msrp')),sell_price:num(fd.get('sell_price')),
  moq:num(fd.get('moq')),lead_time_days:num(fd.get('lead_time_days')),source_url:String(fd.get('source_url')||'').trim()||null,unit:String(fd.get('unit')||'').trim()||null,taxable:fd.get('taxable')==='on',
  active:true,updated_by:c.userId
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
 ['products_services','inventory_items','supplier_products','inventory_wishlist','inventory_reorder_alerts','purchase_orders','purchase_order_lines','pricing_rules'].forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+cloud().organizationId},()=>load()));
 channel.subscribe();
}
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();