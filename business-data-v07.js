// TTT OS v0.7 — pricing configurator + inventory control center
// Google Sheets remains the source of truth; this module gives operators a clean in-OS management layer.
(function(){
  const MASTER='https://docs.google.com/spreadsheets/d/1WJp-FC97yB35p8SGAtkOEBKtjS6-rrB5yn6igo7Ej_E/edit';
  const OPS='https://drive.google.com/drive/folders/14tX3xOze04Z-Gwt82UWSqK9__HxTbZq1';
  const INV_FOLDER='https://drive.google.com/drive/folders/1-Hnwq1cqghy70ALZB3qEzbo8EE-NJPm5';
  const links={
    services:MASTER+'#gid=1007', products:MASTER+'#gid=1015', labor:MASTER+'#gid=1040', pricing:MASTER+'#gid=1041',
    inventory:MASTER+'#gid=1016', transactions:MASTER+'#gid=1017', serials:MASTER+'#gid=1018', vendors:MASTER+'#gid=1019', purchaseOrders:MASTER+'#gid=1020', poLines:MASTER+'#gid=1021'
  };
  const services=[
    ['Window Tint','Vehicle film, removal and glass-specific configuration'],['Car Stereo Installation','Head units, amplifiers, speakers and DSP'],['Car Alarms','Vehicle alarm and security systems'],['Radar Detectors','Portable and integrated detector installation'],['Dash Cams','Single, dual and multi-channel camera systems'],['Paint Protection','Paint protection film and related exterior protection'],['GPS Trackers','Tracking and connected vehicle hardware'],['Interior Lighting','Interior accent and functional lighting'],['Exterior Lighting','Exterior accessory and functional lighting'],['Truck Accessories','Truck-specific accessories and installation'],['Marine Audio','Marine audio equipment and installation']
  ];
  const products=[
    ['XPEL','PRIME XR PLUS','Window tint'],['3M','Crystalline','Window tint'],['3M','Ceramic IR','Window tint'],['LLumar','IRX','Window tint'],['LLumar','CTX','Window tint'],
    ['Alpine','iLX-F511 Halo11','Car stereo installation'],['Alpine','iLX-507','Car stereo installation'],['JL Audio','VX1000/5i','Car stereo installation'],['JL Audio','XD600/1v2','Car stereo installation'],['JL Audio','C3-650','Car stereo installation'],
    ['Kicker','KEY 200.4','Car stereo installation'],['Kicker','CXA800.1','Car stereo installation'],['Kicker','KS Series','Car stereo installation'],['Kenwood','DMX958XR','Car stereo installation'],['Kenwood','DMX1057XR','Car stereo installation'],['Sony','XAV-9500ES','Car stereo installation'],['Viper','DS4+','Car alarms'],['Compustar','T13','Car alarms'],['Thinkware','U3000','Dash cams'],['BlackVue','DR970X','Dash cams']
  ];
  const labor=[
    ['General Installation','Rate to be approved'],['Window Tint','Rate to be approved'],['Audio & Electrical','Rate to be approved'],['Security & Tracking','Rate to be approved'],['Custom Fabrication','Rate to be approved']
  ];
  const rules=[
    ['Window tint','Material multiplier','Dyed film','0.75×','Seed'],['Window tint','Material multiplier','Carbon film','1.00×','Seed'],['Window tint','Material multiplier','Ceramic film','1.35×','Seed'],['Window tint','Material multiplier','IR Ceramic','1.65×','Seed'],['Window tint','Material multiplier','Multilayer Optical','1.80×','Seed'],['Window tint','Labor adder','Existing tint removal','$25 / pane','Seed'],['Window tint','Labor multiplier','Coupe complexity','1.05×','Seed'],['Window tint','Labor multiplier','SUV complexity','1.12×','Seed'],['Window tint','Labor multiplier','Truck complexity','1.08×','Seed'],['Window tint','Labor multiplier','Van complexity','1.20×','Seed'],['Window tint','Quote range','Suggested draft range','±10%','Seed']
  ];
  const inventory=[
    ['XPEL','PRIME XR PLUS','Main Shop','Count required'],['3M','Crystalline','Main Shop','Count required'],['3M','Ceramic IR','Main Shop','Count required'],['LLumar','IRX','Main Shop','Count required'],['LLumar','CTX','Main Shop','Count required']
  ];

  function a(url,label,primary=false){return `<a class="btn ${primary?'primary':'secondary'} compact v07-link" target="_blank" rel="noopener" href="${url}">${label}</a>`;}
  function injectStyles(){
    if(document.getElementById('tttBizV07Styles'))return;
    const s=document.createElement('style');s.id='tttBizV07Styles';s.textContent=`
      .v07-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:14px}.v07-head h2{margin:3px 0 6px;font-size:30px}.v07-actions{display:flex;gap:8px;flex-wrap:wrap}.v07-link{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
      .v07-source{background:#edf5ff;border:1px solid #cfe2fb;border-radius:12px;padding:13px 15px;margin-bottom:14px;display:flex;justify-content:space-between;gap:14px;align-items:center}.v07-source p{margin:2px 0 0;color:#62748a;font-size:12px}.v07-source strong{display:block}
      .v07-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.v07-kpi{background:#fff;border:1px solid #e0e6ef;border-radius:12px;padding:15px}.v07-kpi span{display:block;color:#748297;font-size:11px;font-weight:750}.v07-kpi strong{display:block;font-size:24px;margin-top:6px}.v07-kpi small{display:block;color:#8a97a9;margin-top:4px}
      .v07-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.v07-card{background:#fff;border:1px solid #e0e6ef;border-radius:14px;padding:18px;min-width:0}.v07-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.v07-card-head h3{margin:0 0 3px}.v07-card-head p{margin:0;color:#7a889b;font-size:12px}.v07-table-wrap{overflow:auto}.v07-table{width:100%;border-collapse:collapse;font-size:12px}.v07-table th{text-align:left;padding:8px 7px;color:#79889c;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e7edf4}.v07-table td{padding:9px 7px;border-bottom:1px solid #edf1f5;vertical-align:top}.v07-table tr:last-child td{border-bottom:0}.v07-muted{color:#8290a3}.v07-status{display:inline-block;border-radius:999px;padding:4px 7px;background:#f2f5f8;color:#607086;font-size:10px;font-weight:800}.v07-status.warn{background:#fff6df;color:#8b6400}
      .v07-module-list{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v07-module{border:1px solid #e2e8f0;border-radius:10px;padding:11px;display:flex;justify-content:space-between;gap:10px;align-items:center}.v07-module div{min-width:0}.v07-module strong{display:block;font-size:12px}.v07-module span{display:block;color:#8592a4;font-size:10px;margin-top:3px}.v07-note{margin-top:14px;background:#fff8e8;border:1px solid #f0dfae;border-radius:10px;padding:11px 13px;color:#725b20;font-size:11px;line-height:1.5}
      @media(max-width:1000px){.v07-kpis{grid-template-columns:1fr 1fr}.v07-grid{grid-template-columns:1fr}.v07-head,.v07-source{flex-direction:column;align-items:stretch}}
      @media(max-width:680px){.v07-kpis,.v07-module-list{grid-template-columns:1fr}.v07-actions{width:100%}.v07-actions .btn{flex:1}.v07-head h2{font-size:26px}}
    `;document.head.appendChild(s);
  }

  function pricingHTML(){
    const serviceRows=services.map(x=>`<tr><td><strong>${esc(x[0])}</strong></td><td class="v07-muted">${esc(x[1])}</td></tr>`).join('');
    const productRows=products.slice(0,10).map(x=>`<tr><td>${esc(x[0])}</td><td><strong>${esc(x[1])}</strong></td><td>${esc(x[2])}</td><td><span class="v07-status warn">Price needed</span></td></tr>`).join('');
    const laborRows=labor.map(x=>`<tr><td><strong>${esc(x[0])}</strong></td><td><span class="v07-status warn">${esc(x[1])}</span></td></tr>`).join('');
    const ruleRows=rules.map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td><strong>${esc(x[2])}</strong></td><td>${esc(x[3])}</td><td><span class="v07-status">${esc(x[4])}</span></td></tr>`).join('');
    return `<div class="v07-head"><div><p class="eyebrow">COMMERCIAL CONTROL</p><h2>Pricing Configurator</h2><p class="muted">Manage service pricing, product/material costs, labor standards and pricing rules from one place.</p></div><div class="v07-actions">${a(MASTER,'Open Master Database',true)}${a(OPS,'Open TTT Operations Drive')}</div></div>
      <div class="v07-source"><div><strong>Google Sheets is the pricing source of truth</strong><p>The OS uses the same Services, Products, Labor Rates and Pricing Rules structure as the Master Database. Prices can be filled in progressively without hard-coding them into the job form.</p></div><span class="badge">Google-linked foundation</span></div>
      <div class="v07-kpis"><div class="v07-kpi"><span>Active services</span><strong>${services.length}</strong><small>Configured service categories</small></div><div class="v07-kpi"><span>Catalog products</span><strong>${products.length}</strong><small>Seed product records</small></div><div class="v07-kpi"><span>Labor categories</span><strong>${labor.length}</strong><small>Rates awaiting approval</small></div><div class="v07-kpi"><span>Pricing rules</span><strong>${rules.length}</strong><small>Tint seed rules today</small></div></div>
      <div class="v07-grid">
        <article class="v07-card"><div class="v07-card-head"><div><h3>Services</h3><p>What TTT sells and the default labor/pricing framework.</p></div>${a(links.services,'Edit sheet')}</div><div class="v07-table-wrap"><table class="v07-table"><thead><tr><th>Service</th><th>Description</th></tr></thead><tbody>${serviceRows}</tbody></table></div></article>
        <article class="v07-card"><div class="v07-card-head"><div><h3>Products & materials</h3><p>Brand, product, cost, retail price and stock targets.</p></div>${a(links.products,'Edit sheet')}</div><div class="v07-table-wrap"><table class="v07-table"><thead><tr><th>Brand</th><th>Product</th><th>Service</th><th>Pricing</th></tr></thead><tbody>${productRows}</tbody></table></div><p class="muted" style="font-size:11px;margin:10px 0 0">Showing 10 of ${products.length} seeded products. Google Sheets holds the complete catalog.</p></article>
        <article class="v07-card"><div class="v07-card-head"><div><h3>Labor rates</h3><p>Central rate card for estimating and profitability.</p></div>${a(links.labor,'Edit sheet')}</div><div class="v07-table-wrap"><table class="v07-table"><thead><tr><th>Labor category</th><th>Current rate</th></tr></thead><tbody>${laborRows}</tbody></table></div><div class="v07-note">Labor rates are intentionally not invented. Once TTT approves its hourly/flat-rate standards, these become inputs to job estimates and margin calculations.</div></article>
        <article class="v07-card"><div class="v07-card-head"><div><h3>Pricing rules</h3><p>Multipliers, adders, package rules and complexity logic.</p></div>${a(links.pricing,'Edit sheet')}</div><div class="v07-table-wrap"><table class="v07-table"><thead><tr><th>Service</th><th>Rule type</th><th>Rule</th><th>Value</th><th>Status</th></tr></thead><tbody>${ruleRows}</tbody></table></div></article>
      </div>`;
  }

  function inventoryHTML(){
    const rows=inventory.map(x=>`<tr><td>${esc(x[0])}</td><td><strong>${esc(x[1])}</strong></td><td>${esc(x[2])}</td><td><span class="v07-status warn">${esc(x[3])}</span></td></tr>`).join('');
    const modules=[
      ['Stock on hand','Quantity, allocation, availability and reorder points',links.inventory],['Inventory transactions','Receipts, usage, returns and adjustments',links.transactions],['Serial numbers','Serialized equipment history and installation traceability',links.serials],['Vendors','Supplier master and purchasing source',links.vendors],['Purchase orders','Purchasing status and expected receipts',links.purchaseOrders],['PO lines','Item-level purchasing detail',links.poLines]
    ].map(x=>`<div class="v07-module"><div><strong>${esc(x[0])}</strong><span>${esc(x[1])}</span></div>${a(x[2],'Open')}</div>`).join('');
    return `<div class="v07-head"><div><p class="eyebrow">STOCK & PURCHASING</p><h2>Inventory</h2><p class="muted">Track what TTT owns, what is allocated to jobs, what needs ordering and where every serialized item went.</p></div><div class="v07-actions">${a(links.inventory,'Open Inventory Sheet',true)}${a(INV_FOLDER,'Open Inventory Drive')}</div></div>
      <div class="v07-source"><div><strong>Inventory is tied to the same product catalog used for quoting</strong><p>Product IDs link purchasing, stock, job scope, work-order parts and future margin reporting. That prevents separate disconnected product lists.</p></div><span class="badge">Single catalog</span></div>
      <div class="v07-kpis"><div class="v07-kpi"><span>Inventory records</span><strong>${inventory.length}</strong><small>Tint records seeded first</small></div><div class="v07-kpi"><span>Physical counts</span><strong>0</strong><small>Initial counts still required</small></div><div class="v07-kpi"><span>Allocated units</span><strong>—</strong><small>Begins as jobs reserve stock</small></div><div class="v07-kpi"><span>Purchase orders</span><strong>0</strong><small>No POs recorded yet</small></div></div>
      <div class="v07-grid"><article class="v07-card"><div class="v07-card-head"><div><h3>Initial tint inventory</h3><p>Seed records are ready for a first physical count.</p></div>${a(links.inventory,'Count in sheet')}</div><div class="v07-table-wrap"><table class="v07-table"><thead><tr><th>Brand</th><th>Product</th><th>Location</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div><div class="v07-note">No quantities were invented. Enter the first physical count in Google Sheets; after that, receipts, allocations and usage can drive live availability.</div></article><article class="v07-card"><div class="v07-card-head"><div><h3>Inventory modules</h3><p>The Master Database already has the full purchasing and traceability structure.</p></div></div><div class="v07-module-list">${modules}</div></article></div>`;
  }

  function addNav(){
    const nav=document.querySelector('.sidebar nav');if(!nav||nav.querySelector('[data-view="pricing"]'))return;
    const warranty=nav.querySelector('[data-view="warranty"]');
    const pricing=document.createElement('button');pricing.className='nav-item';pricing.dataset.view='pricing';pricing.textContent='Pricing';pricing.onclick=()=>show('pricing');
    const inventoryBtn=document.createElement('button');inventoryBtn.className='nav-item';inventoryBtn.dataset.view='inventory';inventoryBtn.textContent='Inventory';inventoryBtn.onclick=()=>show('inventory');
    nav.insertBefore(pricing,warranty);nav.insertBefore(inventoryBtn,warranty);
  }
  function addViews(){
    const main=document.querySelector('main.main');if(!main)return;
    const warranty=document.getElementById('warranty');
    if(!document.getElementById('pricing')){const s=document.createElement('section');s.id='pricing';s.className='view';s.innerHTML=pricingHTML();main.insertBefore(s,warranty);}
    if(!document.getElementById('inventory')){const s=document.createElement('section');s.id='inventory';s.className='view';s.innerHTML=inventoryHTML();main.insertBefore(s,warranty);}
  }
  function upgradeVersion(){document.querySelectorAll('#settings .panel').forEach(p=>{const h=p.querySelector('h3');if(h&&/^v0\.5 workflow$/i.test(h.textContent))h.textContent='v0.7 operating system';});}

  injectStyles();addNav();addViews();upgradeVersion();
  window.TTTBusinessData={links,services,products,labor,rules,inventory,masterUrl:MASTER,operationsUrl:OPS,inventoryFolderUrl:INV_FOLDER};
})();