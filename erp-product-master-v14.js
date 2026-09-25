// TTT OS authenticated Product Master / ERP catalog adapter.
(function(){
'use strict';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[], inventory=[], suppliers=[];
async function waitCloud(){for(let i=0;i<100;i++){if(window.TTTCloud?.ready&&window.TTTCloud.organizationId)return true;await new Promise(r=>setTimeout(r,100));}return false;}
async function load(){
 if(!await waitCloud()) return;
 const c=window.TTTCloud.client,o=window.TTTCloud.organizationId;
 const [p,i,s]=await Promise.all([
  c.from('products_services').select('id,ttt_sku,dealer_sku,brand,category,subcategory,model,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,source_file,source_url,effective_date,active').eq('organization_id',o).is('archived_at',null),
  c.from('inventory_items').select('product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost').eq('organization_id',o).is('archived_at',null),
  c.from('supplier_products').select('product_id,dealer_sku,dealer_cost,map_price,msrp,moq,lead_time_days,preferred,status,source_url').eq('organization_id',o).is('archived_at',null)
 ]);
 if(p.error||i.error||s.error){console.error('TTT ERP catalog load failed',p.error||i.error||s.error);return;}
 products=p.data||[];inventory=i.data||[];suppliers=s.data||[];
 window.TTTProductMaster={products,inventory,suppliers,reload:load,find:q=>products.filter(x=>JSON.stringify(x).toLowerCase().includes(String(q||'').toLowerCase()))};
 render();
 window.dispatchEvent(new CustomEvent('ttt:product-master-loaded',{detail:{products:products.length,inventory:inventory.length,supplierProducts:suppliers.length}}));
}
function invFor(id){return inventory.filter(x=>x.product_id===id).reduce((a,x)=>({on:a.on+Number(x.quantity_on_hand||0),res:a.res+Number(x.quantity_reserved||0)}),{on:0,res:0});}
function render(){
 const root=document.querySelector('[data-view="pricing-catalog"],#pricingCatalogView,#catalogView');
 if(!root)return;
 const rows=products.map(p=>{const inv=invFor(p.id),cost=Number(p.dealer_cost||0),sell=Number(p.sell_price||p.map_price||0),margin=sell?((sell-cost)/sell*100):null;
 return '<tr><td><b>'+esc(p.ttt_sku||'Pending')+'</b></td><td>'+esc(p.brand)+'</td><td>'+esc(p.model)+'</td><td>'+esc(p.variant)+'</td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+money(cost)+'</td><td>'+money(sell)+'</td><td>'+(margin==null?'—':margin.toFixed(1)+'%')+'</td><td>'+inv.on+'</td><td>'+(inv.on-inv.res)+'</td><td>'+esc(p.moq??'—')+'</td><td>'+esc(p.source_file||'—')+'</td></tr>'}).join('');
 root.innerHTML='<div class="card"><h2>Products & Pricing</h2><p class="muted">Supabase Product Master · authenticated ERP data</p><div class="table-wrap"><table><thead><tr><th>TTT SKU</th><th>Brand</th><th>Model</th><th>Variant</th><th>Dealer SKU</th><th>Dealer Cost</th><th>TTT Price</th><th>Margin</th><th>On Hand</th><th>Available</th><th>MOQ</th><th>Source</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();