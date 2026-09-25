// TTT OS ERP live cockpit v1.4 — Supabase-native catalog, inventory, vendors and purchasing.
(function(){
  'use strict';
  const state={loaded:false,loading:false,products:[],inventory:[],companies:[],vendors:[],purchaseOrders:[],poLines:[]};
  let client=null,orgId=null,profile=null,channel=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function money(v){return v==null||v===''||Number.isNaN(Number(v))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));}
  function num(v){const n=Number(v);return v==null||v===''||Number.isNaN(n)?null:n;}
  function today(){return new Date().toISOString().slice(0,10);}
  function companyName(id){return state.companies.find(x=>x.id===id)?.name||id||'—';}
  function productName(id){const p=state.products.find(x=>x.id===id);return p?[p.brand,p.model||p.name,p.variant].filter(Boolean).join(' '):id||'—';}
  function invFor(productId){return state.inventory.find(x=>x.product_id===productId)||null;}
  function available(x){return Number(x?.quantity_on_hand||0)-Number(x?.quantity_reserved||0);}
  function margin(p){const c=Number(p.dealer_cost),s=Number(p.sell_price);return Number.isFinite(c)&&Number.isFinite(s)&&s>0?(s-c)/s*100:null;}
  function audit(entityType,entityId,action,metadata){return window.TTTCloud?.audit?.(entityType,entityId,action,metadata||{});}

  function injectStyles(){
    if(document.getElementById('tttErpLiveStyles'))return;
    const s=document.createElement('style');s.id='tttErpLiveStyles';s.textContent=`
      .erp-tabs,.erp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.erp-tabs{margin:14px 0}.erp-tab{border:1px solid #d7e0eb;background:#fff;color:#4b5d73;border-radius:999px;padding:8px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.erp-tab.active{background:#0b1220;color:#fff;border-color:#0b1220}.erp-pane{display:none}.erp-pane.active{display:block}
      .erp-filter{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:12px}.erp-filter input,.erp-filter select,.erp-form input,.erp-form select,.erp-form textarea{width:100%;box-sizing:border-box;border:1px solid #d6deea;border-radius:9px;padding:9px 10px;font:inherit;background:#fff}.erp-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.erp-form label{font-size:11px;font-weight:750;color:#334155}.erp-form label span{display:block;margin-bottom:5px}.erp-span-2{grid-column:span 2}.erp-span-4{grid-column:span 4}.erp-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.erp-table-actions{display:flex;gap:5px;flex-wrap:wrap}.erp-dialog{width:min(820px,94vw);border:0;border-radius:15px;padding:0;box-shadow:0 24px 70px rgba(0,0,0,.28)}.erp-dialog::backdrop{background:rgba(4,10,20,.58)}.erp-dialog-card{padding:20px}.erp-dialog-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.erp-dialog-head h3{margin:0}.erp-po-line{display:grid;grid-template-columns:2fr .7fr .9fr 36px;gap:8px;align-items:end;padding:8px 0;border-top:1px solid #edf1f5}.erp-po-line:first-child{border-top:0}.erp-empty{padding:22px;text-align:center;color:#64748b}.erp-kpi-note{font-size:10px;color:#7b889b;margin-top:4px}.erp-low{color:#b54708;font-weight:800}
      @media(max-width:850px){.erp-form{grid-template-columns:1fr 1fr}.erp-span-4{grid-column:span 2}.erp-filter{grid-template-columns:1fr 1fr}.erp-filter input{grid-column:1/-1}.erp-po-line{grid-template-columns:1fr 1fr}.erp-po-line label:first-child{grid-column:1/-1}}
      @media(max-width:580px){.erp-form,.erp-filter{grid-template-columns:1fr}.erp-span-2,.erp-span-4{grid-column:span 1}.erp-po-line{grid-template-columns:1fr}.erp-po-line label:first-child{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  function inject(){
    injectStyles();
    const nav=document.querySelector('.sidebar nav');
    if(nav&&!nav.querySelector('[data-view="erp"]')){
      const b=document.createElement('button');b.className='nav-item';b.dataset.view='erp';b.textContent='Inventory & Purchasing';
      const warranty=nav.querySelector('[data-view="warranty"]'),settings=nav.querySelector('[data-view="settings"]');
      nav.insertBefore(b,warranty||settings||null);b.addEventListener('click',()=>{show('erp');load(true);});
    }
    const main=document.querySelector('main.main');
    if(main&&!document.getElementById('erp')){
      const sec=document.createElement('section');sec.id='erp';sec.className='view';
      sec.innerHTML=`
        <div class="section-head"><div><p class="eyebrow">ERP / STOCK CONTROL</p><h2>Inventory & Purchasing</h2><p class="muted">Live Supabase catalog, stock, vendor and purchase-order control.</p></div><div class="erp-actions"><button class="btn secondary" id="erpRefresh">Refresh</button><button class="btn secondary" id="erpNewProduct">+ Product</button><button class="btn secondary" id="erpNewVendor">+ Vendor</button><button class="btn primary" id="erpNewPO">+ Purchase order</button></div></div>
        <div class="stats" id="erpStats"></div>
        <div class="erp-tabs"><button class="erp-tab active" data-erp-tab="inventory">Inventory</button><button class="erp-tab" data-erp-tab="purchase">Purchase Orders</button><button class="erp-tab" data-erp-tab="vendors">Vendors</button></div>
        <div id="erpLoading" class="panel erp-empty">Loading ERP data…</div>
        <div id="erpBody" style="display:none">
          <div class="erp-pane active" data-erp-pane="inventory"><div class="panel"><div class="erp-filter"><input id="erpInvSearch" placeholder="Search brand, model, SKU"><select id="erpInvBrand"><option value="">All brands</option></select><select id="erpInvStatus"><option value="">All stock</option><option value="low">At / below reorder point</option><option value="out">Out of stock</option><option value="available">Available</option></select></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Dealer SKU</th><th>TTT SKU</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder</th><th>Cost</th><th>Sell</th><th>Margin</th><th></th></tr></thead><tbody id="erpInventoryBody"></tbody></table></div></div></div>
          <div class="erp-pane" data-erp-pane="purchase"><div id="erpPurchaseBody"></div></div>
          <div class="erp-pane" data-erp-pane="vendors"><div id="erpVendorBody"></div></div>
        </div>
      `;
      const settings=document.getElementById('settings');main.insertBefore(sec,settings||null);
      addDialogs();bind();
    }
  }

  function addDialogs(){
    if(!document.getElementById('erpProductDialog'))document.body.insertAdjacentHTML('beforeend',`
      <dialog class="erp-dialog" id="erpProductDialog"><div class="erp-dialog-card"><div class="erp-dialog-head"><h3 id="erpProductTitle">Product</h3><button class="link-btn" type="button" data-close-dialog="erpProductDialog">Close</button></div>
      <form id="erpProductForm" class="erp-form"><input type="hidden" name="id">
        <label><span>Brand</span><input name="brand" required></label><label><span>Model</span><input name="model"></label><label><span>Variant</span><input name="variant"></label><label><span>Category</span><input name="category"></label>
        <label><span>Dealer SKU</span><input name="dealer_sku"></label><label><span>TTT SKU</span><input name="ttt_sku" placeholder="Auto-generated if blank"></label><label><span>Dealer cost</span><input name="dealer_cost" type="number" min="0" step=".01"></label><label><span>Sell price</span><input name="sell_price" type="number" min="0" step=".01"></label>
        <label><span>MSRP</span><input name="msrp" type="number" min="0" step=".01"></label><label><span>MOQ</span><input name="moq" type="number" min="0" step=".01"></label><label><span>Lead time days</span><input name="lead_time_days" type="number" min="0" step="1"></label><label><span>Source file</span><input name="source_file"></label>
        <label class="erp-span-4"><span>Description</span><textarea name="description"></textarea></label>
        <div class="erp-span-4 erp-inline"><button class="btn primary" type="submit">Save product</button></div>
      </form></div></dialog>`);
    if(!document.getElementById('erpInventoryDialog'))document.body.insertAdjacentHTML('beforeend',`
      <dialog class="erp-dialog" id="erpInventoryDialog"><div class="erp-dialog-card"><div class="erp-dialog-head"><h3>Inventory adjustment</h3><button class="link-btn" type="button" data-close-dialog="erpInventoryDialog">Close</button></div>
      <form id="erpInventoryForm" class="erp-form"><input type="hidden" name="product_id"><input type="hidden" name="inventory_id">
        <div class="erp-span-4 workflow-note" id="erpInventoryProduct"></div>
        <label><span>Location</span><input name="location" value="Main Shop"></label><label><span>On hand</span><input name="quantity_on_hand" type="number" step=".01" min="0"></label><label><span>Reserved</span><input name="quantity_reserved" type="number" step=".01" min="0"></label><label><span>Average cost</span><input name="average_cost" type="number" step=".01" min="0"></label>
        <label><span>Reorder point</span><input name="reorder_point" type="number" step=".01" min="0"></label><label><span>Reorder quantity</span><input name="reorder_quantity" type="number" step=".01" min="0"></label><label class="erp-span-2"><span>Notes</span><input name="notes"></label>
        <div class="erp-span-4 erp-inline"><button class="btn primary" type="submit">Save inventory</button></div>
      </form></div></dialog>`);
    if(!document.getElementById('erpVendorDialog'))document.body.insertAdjacentHTML('beforeend',`
      <dialog class="erp-dialog" id="erpVendorDialog"><div class="erp-dialog-card"><div class="erp-dialog-head"><h3 id="erpVendorTitle">Vendor</h3><button class="link-btn" type="button" data-close-dialog="erpVendorDialog">Close</button></div>
      <form id="erpVendorForm" class="erp-form"><input type="hidden" name="company_id">
        <label class="erp-span-2"><span>Company name</span><input name="company_name" required></label><label><span>Status</span><select name="vendor_status"><option>prospect</option><option>approved</option><option>active</option><option>inactive</option><option>blocked</option></select></label><label><span>Minimum order</span><input name="minimum_order" type="number" min="0" step=".01"></label>
        <label><span>Payment terms</span><input name="payment_terms"></label><label><span>Shipping terms</span><input name="shipping_terms"></label><label class="erp-span-2"><span>Brands represented</span><input name="brands_represented" placeholder="BlackVue, JL Audio"></label>
        <label class="erp-span-4"><span>Dealer requirements</span><textarea name="dealer_requirements"></textarea></label>
        <div class="erp-span-4 erp-inline"><button class="btn primary" type="submit">Save vendor</button></div>
      </form></div></dialog>`);
    if(!document.getElementById('erpPODialog'))document.body.insertAdjacentHTML('beforeend',`
      <dialog class="erp-dialog" id="erpPODialog"><div class="erp-dialog-card"><div class="erp-dialog-head"><h3>Create purchase order</h3><button class="link-btn" type="button" data-close-dialog="erpPODialog">Close</button></div>
      <form id="erpPOForm"><div class="erp-form"><label class="erp-span-2"><span>Vendor</span><select name="vendor_company_id" required></select></label><label><span>Job</span><select name="job_id"><option value="">General stock</option></select></label><label><span>Expected date</span><input name="expected_date" type="date"></label><label class="erp-span-4"><span>Notes</span><input name="notes"></label></div>
      <div class="panel top-gap"><div class="panel-head"><h3>PO lines</h3><button class="btn secondary compact" type="button" id="erpAddPOLine">+ Line</button></div><div id="erpPOLines"></div><div class="erp-inline" style="justify-content:flex-end"><strong id="erpPOTotal">$0.00</strong></div></div>
      <div class="top-gap"><button class="btn primary" type="submit">Create PO</button></div></form></div></dialog>`);
    document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.closeDialog)?.close());
  }

  function bind(){
    document.getElementById('erpRefresh').onclick=()=>load(true);
    document.getElementById('erpNewProduct').onclick=()=>openProduct();
    document.getElementById('erpNewVendor').onclick=()=>openVendor();
    document.getElementById('erpNewPO').onclick=openPO;
    document.querySelectorAll('[data-erp-tab]').forEach(btn=>btn.onclick=()=>{
      document.querySelectorAll('[data-erp-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('[data-erp-pane]').forEach(x=>x.classList.toggle('active',x.dataset.erpPane===btn.dataset.erpTab));
    });
    ['erpInvSearch','erpInvBrand','erpInvStatus'].forEach(id=>document.getElementById(id)?.addEventListener(id==='erpInvSearch'?'input':'change',renderInventory));
    document.getElementById('erpProductForm').addEventListener('submit',saveProduct);
    document.getElementById('erpInventoryForm').addEventListener('submit',saveInventory);
    document.getElementById('erpVendorForm').addEventListener('submit',saveVendor);
    document.getElementById('erpPOForm').addEventListener('submit',savePO);
    document.getElementById('erpAddPOLine').onclick=()=>addPOLine();
    document.getElementById('erpInventoryBody').addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit-product]'),adj=e.target.closest('[data-adjust-inventory]');
      if(edit)openProduct(edit.dataset.editProduct);if(adj)openInventory(adj.dataset.adjustInventory);
    });
    document.getElementById('erpPurchaseBody').addEventListener('click',e=>{const b=e.target.closest('[data-receive-po]');if(b)receivePO(b.dataset.receivePo);});
    document.getElementById('erpVendorBody').addEventListener('click',e=>{const b=e.target.closest('[data-edit-vendor]');if(b)openVendor(b.dataset.editVendor);});
  }

  async function load(force){
    if(state.loading)return;if(state.loaded&&!force){render();return;}
    const cloud=window.TTTCloud;if(!cloud?.ready||!cloud.client||!cloud.organizationId)return;
    client=cloud.client;orgId=cloud.organizationId;profile=cloud.profile;state.loading=true;
    const loading=document.getElementById('erpLoading');if(loading){loading.style.display='block';loading.textContent='Loading ERP data…';}
    document.getElementById('erpBody').style.display='none';
    try{
      const specs=[
        ['products','products_services','id,item_type,brand,category,subcategory,model,dealer_sku,ttt_sku,variant,name,description,dealer_cost,map_price,msrp,sell_price,moq,lead_time_days,serialized,warranty_summary,source_file,source_url,active,updated_at'],
        ['inventory','inventory_items','id,product_id,sku,location,quantity_on_hand,quantity_reserved,reorder_point,reorder_quantity,average_cost,last_counted_at,notes,updated_at'],
        ['companies','companies','id,name,primary_type,status,main_phone,general_email,updated_at'],
        ['vendors','vendors','company_id,vendor_status,dealer_requirements,minimum_order,payment_terms,shipping_terms,warranty_returns,primary_categories,brands_represented,overall_score,last_reviewed_at,updated_at'],
        ['purchaseOrders','purchase_orders','id,vendor_company_id,job_id,status,order_date,expected_date,received_date,subtotal,shipping_total,tax_total,total,vendor_reference,notes,updated_at'],
        ['poLines','purchase_order_lines','id,purchase_order_id,product_id,description,quantity,unit_cost,line_total,received_quantity,sort_order,updated_at']
      ];
      const results=await Promise.all(specs.map(s=>client.from(s[1]).select(s[2]).eq('organization_id',orgId).is('archived_at',null).limit(2500)));
      for(let i=0;i<results.length;i++){if(results[i].error)throw new Error(specs[i][1]+': '+results[i].error.message);state[specs[i][0]]=results[i].data||[];}
      state.loaded=true;render();subscribe();
      loading.style.display='none';document.getElementById('erpBody').style.display='block';
    }catch(err){console.error('TTT ERP load failed',err);loading.textContent='ERP could not load: '+String(err.message||err);}
    finally{state.loading=false;}
  }

  function render(){
    const stockValue=state.inventory.reduce((s,x)=>s+Number(x.quantity_on_hand||0)*Number(x.average_cost||0),0);
    const low=state.inventory.filter(x=>x.reorder_point!=null&&available(x)<=Number(x.reorder_point||0)).length;
    const openPO=state.purchaseOrders.filter(x=>!['received','cancelled','closed'].includes(String(x.status||'').toLowerCase()));
    const openPOValue=openPO.reduce((s,x)=>s+Number(x.total||0),0);
    document.getElementById('erpStats').innerHTML=
      '<div class="stat"><span>Catalog items</span><strong>'+state.products.length+'</strong></div>'+
      '<div class="stat"><span>Inventory value</span><strong>'+money(stockValue)+'</strong></div>'+
      '<div class="stat"><span>Reorder attention</span><strong>'+low+'</strong></div>'+
      '<div class="stat"><span>Open POs</span><strong>'+openPO.length+'</strong><div class="erp-kpi-note">'+money(openPOValue)+'</div></div>';
    const brand=document.getElementById('erpInvBrand'),cur=brand.value;
    brand.innerHTML='<option value="">All brands</option>'+[...new Set(state.products.map(p=>p.brand).filter(Boolean))].sort().map(x=>'<option '+(x===cur?'selected':'')+'>'+esc(x)+'</option>').join('');
    renderInventory();renderPOs();renderVendors();
  }

  function renderInventory(){
    const body=document.getElementById('erpInventoryBody');if(!body)return;
    const q=String(document.getElementById('erpInvSearch').value||'').toLowerCase(),brand=document.getElementById('erpInvBrand').value,status=document.getElementById('erpInvStatus').value;
    const rows=state.products.filter(p=>p.item_type!=='service').filter(p=>{
      const inv=invFor(p.id),av=available(inv),rp=Number(inv?.reorder_point||0);
      if(brand&&p.brand!==brand)return false;
      if(q&&![p.brand,p.model,p.name,p.dealer_sku,p.ttt_sku,p.description].join(' ').toLowerCase().includes(q))return false;
      if(status==='low'&&!(inv?.reorder_point!=null&&av<=rp))return false;
      if(status==='out'&&av>0)return false;
      if(status==='available'&&av<=0)return false;
      return true;
    });
    body.innerHTML=rows.slice(0,800).map(p=>{
      const inv=invFor(p.id),av=available(inv),rp=inv?.reorder_point,m=margin(p),isLow=rp!=null&&av<=Number(rp||0);
      return '<tr><td><strong>'+esc([p.brand,p.model||p.name].filter(Boolean).join(' '))+'</strong><br><small>'+esc(p.variant||p.category||'')+'</small></td><td>'+esc(p.dealer_sku||'—')+'</td><td>'+esc(p.ttt_sku||'—')+'</td><td>'+esc(inv?.quantity_on_hand??0)+'</td><td>'+esc(inv?.quantity_reserved??0)+'</td><td class="'+(isLow?'erp-low':'')+'">'+av+'</td><td>'+esc(rp??'—')+'</td><td>'+money(p.dealer_cost)+'</td><td>'+money(p.sell_price)+'</td><td>'+(m==null?'—':m.toFixed(1)+'%')+'</td><td><div class="erp-table-actions"><button class="link-btn" data-edit-product="'+esc(p.id)+'">Edit</button><button class="link-btn" data-adjust-inventory="'+esc(p.id)+'">Stock</button></div></td></tr>';
    }).join('')||'<tr><td colspan="11" class="erp-empty">No matching inventory items.</td></tr>';
  }

  function renderPOs(){
    const body=document.getElementById('erpPurchaseBody');if(!body)return;
    const rows=state.purchaseOrders.slice().sort((a,b)=>String(b.order_date||'').localeCompare(String(a.order_date||''))).map(po=>{
      const lines=state.poLines.filter(x=>x.purchase_order_id===po.id);
      const canReceive=!['received','cancelled','closed'].includes(String(po.status||'').toLowerCase())&&lines.length;
      return '<tr><td><strong>'+esc(po.id)+'</strong><br><small>'+esc(po.order_date||'')+'</small></td><td>'+esc(companyName(po.vendor_company_id))+'</td><td><span class="badge">'+esc(po.status)+'</span></td><td>'+lines.length+'</td><td>'+money(po.total)+'</td><td>'+esc(po.expected_date||'—')+'</td><td>'+esc(po.job_id||'Stock')+'</td><td>'+(canReceive?'<button class="link-btn" data-receive-po="'+esc(po.id)+'">Receive</button>':'—')+'</td></tr>';
    }).join('');
    body.innerHTML='<div class="panel"><div class="panel-head"><h3>Purchase orders</h3><span class="badge">'+state.purchaseOrders.length+'</span></div><div class="table-wrap"><table><thead><tr><th>PO</th><th>Vendor</th><th>Status</th><th>Lines</th><th>Total</th><th>Expected</th><th>Job</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="erp-empty">No purchase orders yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderVendors(){
    const body=document.getElementById('erpVendorBody');if(!body)return;
    const rows=state.vendors.map(v=>'<tr><td><strong>'+esc(companyName(v.company_id))+'</strong></td><td><span class="badge">'+esc(v.vendor_status)+'</span></td><td>'+esc((v.brands_represented||[]).join(', ')||'—')+'</td><td>'+money(v.minimum_order)+'</td><td>'+esc(v.payment_terms||'—')+'</td><td>'+esc(v.shipping_terms||'—')+'</td><td><button class="link-btn" data-edit-vendor="'+esc(v.company_id)+'">Edit</button></td></tr>').join('');
    body.innerHTML='<div class="panel"><div class="panel-head"><h3>Vendor master</h3><span class="badge">'+state.vendors.length+'</span></div><div class="table-wrap"><table><thead><tr><th>Company</th><th>Status</th><th>Brands</th><th>MOQ</th><th>Payment</th><th>Shipping</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="erp-empty">No vendors yet.</td></tr>')+'</tbody></table></div></div>';
  }

  function openProduct(id){
    const f=document.getElementById('erpProductForm');f.reset();
    const p=state.products.find(x=>x.id===id);
    document.getElementById('erpProductTitle').textContent=p?'Edit product':'New product';
    for(const name of ['id','brand','model','variant','category','dealer_sku','ttt_sku','dealer_cost','sell_price','msrp','moq','lead_time_days','source_file','description'])if(f.elements[name])f.elements[name].value=p?.[name]??'';
    document.getElementById('erpProductDialog').showModal();
  }
  async function saveProduct(e){
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),id=String(fd.get('id')||'').trim();
    const brand=String(fd.get('brand')||'').trim(),model=String(fd.get('model')||'').trim();
    const row={organization_id:orgId,item_type:'product',brand,model:model||null,variant:String(fd.get('variant')||'').trim()||null,category:String(fd.get('category')||'').trim()||null,dealer_sku:String(fd.get('dealer_sku')||'').trim()||null,sku:String(fd.get('dealer_sku')||'').trim()||null,ttt_sku:String(fd.get('ttt_sku')||'').trim()||('TTT-CUS-'+Date.now().toString(36).toUpperCase()),name:[brand,model].filter(Boolean).join(' ')||brand,description:String(fd.get('description')||'').trim()||null,dealer_cost:num(fd.get('dealer_cost')),sell_price:num(fd.get('sell_price')),msrp:num(fd.get('msrp')),moq:num(fd.get('moq')),lead_time_days:num(fd.get('lead_time_days')),source_file:String(fd.get('source_file')||'').trim()||null,active:true,updated_by:window.TTTCloud?.userId||null};
    let result;
    if(id)result=await client.from('products_services').update(row).eq('organization_id',orgId).eq('id',id).select('*').single();
    else result=await client.from('products_services').insert({...row,created_by:window.TTTCloud?.userId||null}).select('*').single();
    if(result.error)return toast('Product save failed: '+result.error.message);
    await audit('product',result.data.id,id?'product_updated':'product_created',{ttt_sku:result.data.ttt_sku});
    document.getElementById('erpProductDialog').close();await load(true);window.TTTCatalogCloud?.reload?.();
  }

  function openInventory(productId){
    const p=state.products.find(x=>x.id===productId),inv=invFor(productId),f=document.getElementById('erpInventoryForm');f.reset();
    f.elements.product_id.value=productId;f.elements.inventory_id.value=inv?.id||'';
    f.elements.location.value=inv?.location||'Main Shop';f.elements.quantity_on_hand.value=inv?.quantity_on_hand??0;f.elements.quantity_reserved.value=inv?.quantity_reserved??0;f.elements.average_cost.value=inv?.average_cost??p?.dealer_cost??'';f.elements.reorder_point.value=inv?.reorder_point??'';f.elements.reorder_quantity.value=inv?.reorder_quantity??'';f.elements.notes.value=inv?.notes||'';
    document.getElementById('erpInventoryProduct').innerHTML='<strong>'+esc(productName(productId))+'</strong><br><small>'+esc(p?.ttt_sku||'')+'</small>';
    document.getElementById('erpInventoryDialog').showModal();
  }
  async function saveInventory(e){
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),pid=String(fd.get('product_id')),iid=String(fd.get('inventory_id')||'');
    const p=state.products.find(x=>x.id===pid),row={organization_id:orgId,product_id:pid,sku:p?.ttt_sku||null,location:String(fd.get('location')||'Main Shop'),quantity_on_hand:num(fd.get('quantity_on_hand'))||0,quantity_reserved:num(fd.get('quantity_reserved'))||0,average_cost:num(fd.get('average_cost')),reorder_point:num(fd.get('reorder_point')),reorder_quantity:num(fd.get('reorder_quantity')),notes:String(fd.get('notes')||'').trim()||null,last_counted_at:new Date().toISOString(),updated_by:window.TTTCloud?.userId||null};
    const result=iid?await client.from('inventory_items').update(row).eq('organization_id',orgId).eq('id',iid).select('*').single():await client.from('inventory_items').insert({...row,created_by:window.TTTCloud?.userId||null}).select('*').single();
    if(result.error)return toast('Inventory save failed: '+result.error.message);
    await audit('inventory',result.data.id,'inventory_adjusted',{product_id:pid,quantity_on_hand:row.quantity_on_hand,quantity_reserved:row.quantity_reserved});
    document.getElementById('erpInventoryDialog').close();await load(true);window.TTTCatalogCloud?.reload?.();
  }

  function openVendor(companyId){
    const f=document.getElementById('erpVendorForm');f.reset();const v=state.vendors.find(x=>x.company_id===companyId),c=state.companies.find(x=>x.id===companyId);
    document.getElementById('erpVendorTitle').textContent=v?'Edit vendor':'New vendor';
    f.elements.company_id.value=companyId||'';f.elements.company_name.value=c?.name||'';f.elements.vendor_status.value=v?.vendor_status||'prospect';f.elements.minimum_order.value=v?.minimum_order??'';f.elements.payment_terms.value=v?.payment_terms||'';f.elements.shipping_terms.value=v?.shipping_terms||'';f.elements.brands_represented.value=(v?.brands_represented||[]).join(', ');f.elements.dealer_requirements.value=v?.dealer_requirements||'';
    document.getElementById('erpVendorDialog').showModal();
  }
  async function saveVendor(e){
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),existingId=String(fd.get('company_id')||''),name=String(fd.get('company_name')||'').trim();let cid=existingId;
    if(!cid){
      const cr=await client.from('companies').insert({organization_id:orgId,name,primary_type:'vendor',status:'active',source:'TTT OS ERP',owner_person_id:profile?.person_id||null,created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null}).select('*').single();
      if(cr.error)return toast('Vendor company save failed: '+cr.error.message);cid=cr.data.id;
    }else{
      const cr=await client.from('companies').update({name,updated_by:window.TTTCloud?.userId||null}).eq('organization_id',orgId).eq('id',cid);
      if(cr.error)return toast('Vendor company save failed: '+cr.error.message);
    }
    const row={organization_id:orgId,company_id:cid,vendor_status:String(fd.get('vendor_status')||'prospect'),minimum_order:num(fd.get('minimum_order')),payment_terms:String(fd.get('payment_terms')||'').trim()||null,shipping_terms:String(fd.get('shipping_terms')||'').trim()||null,brands_represented:String(fd.get('brands_represented')||'').split(',').map(x=>x.trim()).filter(Boolean),dealer_requirements:String(fd.get('dealer_requirements')||'').trim()||null,updated_by:window.TTTCloud?.userId||null};
    const vr=await client.from('vendors').upsert({...row,created_by:window.TTTCloud?.userId||null},{onConflict:'organization_id,company_id'}).select('*').single();
    if(vr.error)return toast('Vendor save failed: '+vr.error.message);
    await audit('vendor',cid,existingId?'vendor_updated':'vendor_created',{status:row.vendor_status});
    document.getElementById('erpVendorDialog').close();await load(true);
  }

  function productOptions(selected=''){return state.products.filter(p=>p.item_type!=='service').map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc([p.ttt_sku,p.brand,p.model||p.name].filter(Boolean).join(' · '))+'</option>').join('');}
  function addPOLine(item={}){
    const box=document.getElementById('erpPOLines'),row=document.createElement('div');row.className='erp-po-line';
    row.innerHTML='<label><span>Product</span><select data-po="product"><option value="">Select product</option>'+productOptions(item.product_id||'')+'</select></label><label><span>Qty</span><input data-po="qty" type="number" min=".01" step=".01" value="'+esc(item.quantity||1)+'"></label><label><span>Unit cost</span><input data-po="cost" type="number" min="0" step=".01" value="'+esc(item.unit_cost||'')+'"></label><button type="button" class="link-btn" data-remove-line>×</button>';
    box.appendChild(row);
    const product=row.querySelector('[data-po="product"]'),cost=row.querySelector('[data-po="cost"]');
    product.onchange=()=>{const p=state.products.find(x=>x.id===product.value);if(p&&cost.value==='')cost.value=p.dealer_cost??'';calcPOTotal();};
    row.querySelector('[data-po="qty"]').oninput=calcPOTotal;cost.oninput=calcPOTotal;
    row.querySelector('[data-remove-line]').onclick=()=>{row.remove();if(!box.children.length)addPOLine();calcPOTotal();};
    calcPOTotal();
  }
  function calcPOTotal(){let total=0;document.querySelectorAll('#erpPOLines .erp-po-line').forEach(r=>{total+=(Number(r.querySelector('[data-po="qty"]').value)||0)*(Number(r.querySelector('[data-po="cost"]').value)||0);});document.getElementById('erpPOTotal').textContent=money(total);return total;}
  function openPO(){
    const f=document.getElementById('erpPOForm');f.reset();
    f.elements.vendor_company_id.innerHTML='<option value="">Select vendor</option>'+state.vendors.map(v=>'<option value="'+esc(v.company_id)+'">'+esc(companyName(v.company_id))+'</option>').join('');
    f.elements.job_id.innerHTML='<option value="">General stock</option>'+(window.db?.jobs||[]).map(j=>'<option value="'+esc(j.id)+'">'+esc([j.id,j.workOrderId,j.status].filter(Boolean).join(' · '))+'</option>').join('');
    document.getElementById('erpPOLines').innerHTML='';addPOLine();document.getElementById('erpPODialog').showModal();
  }
  async function savePO(e){
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),lines=[...document.querySelectorAll('#erpPOLines .erp-po-line')].map((r,i)=>{const pid=r.querySelector('[data-po="product"]').value,p=state.products.find(x=>x.id===pid),qty=Number(r.querySelector('[data-po="qty"]').value)||0,cost=Number(r.querySelector('[data-po="cost"]').value)||0;return{product_id:pid,description:productName(pid),quantity:qty,unit_cost:cost,line_total:qty*cost,sort_order:i};}).filter(x=>x.product_id&&x.quantity>0);
    if(!lines.length)return toast('Add at least one PO line.');
    const subtotal=lines.reduce((s,x)=>s+x.line_total,0);
    const po=await client.from('purchase_orders').insert({organization_id:orgId,vendor_company_id:String(fd.get('vendor_company_id')),job_id:String(fd.get('job_id')||'')||null,status:'draft',order_date:today(),expected_date:String(fd.get('expected_date')||'')||null,subtotal,total:subtotal,notes:String(fd.get('notes')||'').trim()||null,created_by:window.TTTCloud?.userId||null,updated_by:window.TTTCloud?.userId||null}).select('*').single();
    if(po.error)return toast('PO creation failed: '+po.error.message);
    const payload=lines.map(x=>({...x,organization_id:orgId,purchase_order_id:po.data.id}));
    const lr=await client.from('purchase_order_lines').insert(payload);
    if(lr.error){toast('PO created but lines failed: '+lr.error.message);return;}
    await audit('purchase_order',po.data.id,'purchase_order_created',{vendor_company_id:po.data.vendor_company_id,total:subtotal,line_count:lines.length});
    document.getElementById('erpPODialog').close();await load(true);toast('Purchase order '+po.data.id+' created');
  }
  async function receivePO(id){
    if(!confirm('Receive all remaining quantities on '+id+' into Main Shop inventory?'))return;
    const {error}=await client.rpc('receive_purchase_order',{p_organization_id:orgId,p_purchase_order_id:id});
    if(error)return toast('PO receipt failed: '+error.message);
    await audit('purchase_order',id,'purchase_order_received',{});await load(true);window.TTTCatalogCloud?.reload?.();toast(id+' received');
  }

  function subscribe(){
    if(channel||!client||!orgId)return;
    channel=client.channel('ttt-erp-'+orgId);
    ['products_services','inventory_items','companies','vendors','purchase_orders','purchase_order_lines'].forEach(table=>{
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'organization_id=eq.'+orgId},()=>{state.loaded=false;load(true);});
    });
    channel.subscribe();
  }

  async function init(){
    inject();let tries=0;
    while(tries++<160){
      if(window.TTTCloud?.ready&&window.TTTCloud.client&&window.TTTCloud.organizationId){
        client=window.TTTCloud.client;orgId=window.TTTCloud.organizationId;profile=window.TTTCloud.profile;await load(true);return;
      }
      await new Promise(r=>setTimeout(r,125));
    }
  }
  window.TTTERP={state,load:()=>load(true),openProduct,openVendor,openPO};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
