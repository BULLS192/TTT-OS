(function(){
  'use strict';

  const PAGE_TITLES={
    dashboard:'Command Center',
    crm:'CRM',
    jobs:'Jobs',
    vehicles:'Vehicles',
    vehicledetail:'Vehicle Details',
    warranty:'Service & Warranty',
    customers:'Customers',
    newjob:'New Job',
    jobdetail:'Job Details',
    people:'People',
    myaccount:'My Account',
    settings:'Settings & Admin',
    scheduling:'Schedule',
    operations:'Operations / Work Orders',
    expenses:'Expenses',
    catalog:'Supplier Catalog',
    vendors:'Vendors',
    'pricing-catalog':'Products & Inventory',
    'module-review':'Module Review',
    'job-costing':'Job Costing'
  };

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function safeToast(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}
  function cloudRole(){return window.TTTCloud?.profile?.role||'';}

  function injectStyles(){
    if(document.getElementById('tttShellV2Styles'))return;
    const s=document.createElement('style');
    s.id='tttShellV2Styles';
    s.textContent=`
      #tttCloudBar{display:none!important}
      #seedBtn{display:none!important}
      .nav-placeholder{display:none!important}
      .nav-group[hidden]{display:block!important}
      .nav-coming-soon{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;background:transparent;color:#78879a;padding:8px 10px 8px 16px;font-size:11px;text-align:left;cursor:default}
      .nav-soon-badge{font-size:8px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;border:1px solid #34445d;border-radius:999px;padding:2px 5px;color:#8293aa}
      .nav-review-badge{font-size:8px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;border:1px solid #355174;border-radius:999px;padding:2px 5px;color:#9eb5d2}
      .module-review-card{max-width:980px}.module-review-status{display:inline-flex;border-radius:999px;padding:5px 9px;background:#eef4fd;color:#245b9f;font-size:10px;font-weight:800;margin-bottom:10px}.module-review-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.module-review-grid .panel{margin:0}
      @media(max-width:720px){.module-review-grid{grid-template-columns:1fr}}
      .nav-group-items .nav-item{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .nav-group-items .nav-item.active{background:#162338;color:#fff}
      .shell-kbd{margin-left:auto;border:1px solid #34445d;border-radius:5px;padding:1px 5px;color:#8293aa;font-size:9px;font-weight:700}
      .shell-overlay{position:fixed;inset:0;z-index:1200;background:rgba(4,10,20,.52);display:flex;align-items:flex-start;justify-content:center;padding:11vh 18px 24px}
      .shell-overlay[hidden]{display:none}
      .shell-dialog{width:min(720px,100%);background:#fff;border:1px solid #dce3ec;border-radius:16px;box-shadow:0 28px 80px rgba(0,0,0,.26);overflow:hidden;color:#142033}
      .shell-search-head{display:flex;align-items:center;gap:11px;padding:14px 16px;border-bottom:1px solid #e8edf3}
      .shell-search-head>span{font-size:20px;color:#75849a}
      .shell-search-head input{border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;padding:7px 0!important;font-size:16px;min-width:0;flex:1}
      .shell-search-head kbd{font:inherit;font-size:10px;background:#f1f4f8;color:#67768b;border:1px solid #dde4ed;border-radius:6px;padding:4px 6px}
      .shell-results{max-height:min(62vh,560px);overflow:auto;padding:8px}
      .shell-result{width:100%;border:0;background:transparent;border-radius:10px;padding:10px 11px;text-align:left;display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;cursor:pointer;color:inherit}
      .shell-result:hover,.shell-result.active{background:#eff5fd}
      .shell-result-type{font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;color:#6680a3}
      .shell-result-copy{min-width:0}.shell-result-copy strong,.shell-result-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shell-result-copy strong{font-size:13px}.shell-result-copy small{color:#75849a;margin-top:2px;font-size:11px}
      .shell-result-arrow{color:#9ba8b8}
      .shell-empty{padding:26px;text-align:center;color:#748297;font-size:13px}
      .shell-quick{padding:10px 14px 4px;color:#8491a3;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
      .shell-new-menu{position:fixed;z-index:1150;width:260px;background:#fff;border:1px solid #dde4ed;border-radius:13px;box-shadow:0 18px 50px rgba(9,19,35,.24);padding:7px;color:#142033}
      .shell-new-menu[hidden]{display:none}
      .shell-new-menu button{width:100%;border:0;background:transparent;border-radius:8px;padding:10px 11px;text-align:left;display:grid;grid-template-columns:30px 1fr;gap:9px;align-items:center;cursor:pointer;color:inherit}
      .shell-new-menu button:hover{background:#f1f5fa}
      .shell-new-menu button span:first-child{width:28px;height:28px;border-radius:8px;background:#eef4fd;color:#1557c0;display:grid;place-items:center;font-weight:800}
      .shell-new-menu strong,.shell-new-menu small{display:block}.shell-new-menu strong{font-size:12px}.shell-new-menu small{font-size:10px;color:#7c899b;margin-top:2px}
      @media(max-width:1000px) and (min-width:681px){
        .sidebar{width:220px!important;padding:18px 12px!important}
        .main{margin-left:220px!important;padding:22px 22px 70px!important}
        .brand{padding:0 6px 18px!important}.brand>div{display:block!important}
        .sidebar .os-nav{overflow-y:auto!important;overflow-x:hidden!important}
        .nav-group-toggle{display:flex!important}
        .nav-group-items{display:none!important}.nav-group.open .nav-group-items{display:grid!important}
        .nav-group-items .nav-item{font-size:11px!important;padding:8px 10px 8px 16px!important}
        .nav-create span:last-child,.nav-search span:last-child,.nav-settings span:last-child,.nav-home span:last-child{display:inline!important}
        .nav-create,.nav-search,.nav-settings,.nav-home{justify-content:flex-start!important;padding:10px 11px!important;font-size:12px!important}
        .nav-item.nav-home:after,.nav-item.nav-settings:after{content:none!important}
        .sidebar-user-copy{display:block!important}
      }
      @media(max-width:820px) and (min-width:681px){.sidebar{width:196px!important}.main{margin-left:196px!important;padding:20px 18px 64px!important}}
      @media(max-width:680px){
        .sidebar-user{display:block;margin-top:8px;padding-top:8px;max-width:320px}
        .shell-dialog{border-radius:12px}
        .shell-overlay{padding:8vh 10px 12px}
        .shell-result{grid-template-columns:72px minmax(0,1fr) auto}
      }
    `;
    document.head.appendChild(s);
  }

  function groupByTitle(title){
    return [...document.querySelectorAll('.nav-group')].find(g=>g.querySelector('.nav-group-toggle')?.textContent.includes(title));
  }
  function bindSimpleNav(container){
    container?.querySelectorAll('[data-shell-view]').forEach(btn=>btn.addEventListener('click',ev=>{
      ev.preventDefault();ev.stopPropagation();
      const view=btn.dataset.shellView;
      if(view==='scheduling'||view==='operations'){
        if(window.TTTSchedulingUI?.openView)window.TTTSchedulingUI.openView(view);
        else if(typeof show==='function')show(view);
      }else if(view==='pricing-catalog'){
        if(typeof show==='function')show(view);
        Promise.resolve(window.TTTProductMaster?.reload?.()).then(()=>window.TTTProductMaster?.openTab?.(btn.dataset.erpTab||'inventory'));
      }else if(view==='job-costing'){
        if(typeof show==='function')show(view);window.TTTFinanceOps?.reload?.();
      }else if(typeof show==='function')show(view);
      markShellActive(btn);
    }));
  }
  function markShellActive(btn){
    document.querySelectorAll('.os-nav .nav-item').forEach(x=>x.classList.remove('active'));
    btn?.classList.add('active');
  }
  function removeLegacyStandaloneNav(){
    const known=new Set(['expenses','catalog','vendors','scheduling','operations','people','pricing-catalog']);
    [...document.querySelectorAll('.os-nav > .nav-item')].forEach(el=>{
      if(known.has(el.dataset.view))el.remove();
    });
  }
  function ensureShellViews(){
    const main=document.querySelector('main.main'),settings=document.getElementById('settings');if(!main)return;
    if(!document.getElementById('pricing-catalog')){
      const s=document.createElement('section');s.id='pricing-catalog';s.className='view';
      s.innerHTML='<div class="panel"><p class="muted">Loading Product Master…</p></div>';
      main.insertBefore(s,settings||null);
    }
    if(!document.getElementById('module-review')){
      const s=document.createElement('section');s.id='module-review';s.className='view';
      s.innerHTML='<div id="moduleReviewBody"></div>';main.insertBefore(s,settings||null);
    }
  }
  const REVIEW_MODULES={
    purchasing:{
      eyebrow:'ERP & INVENTORY',title:'Purchasing',status:'Foundation exists — workflow needs consolidation',
      summary:'Products, supplier relationships, inventory quantities, MOQ and lead-time data already exist. What is not yet consolidated is the buyer workflow that turns stock needs into purchasing actions.',
      exists:['Supabase Product Master','Supplier product relationships','MOQ and lead-time fields','Inventory on-hand / reserved quantities','Vendor directory'],
      next:['Purchase requisitions','Vendor comparison / preferred source','Convert requisition to PO','Approval states','Expected delivery tracking']
    },
    purchase_orders:{
      eyebrow:'ERP & INVENTORY',title:'Purchase Orders',status:'Data model direction defined — standalone workspace not consolidated',
      summary:'TTT has the product, supplier and inventory foundations needed for POs. This review section is visible so we can define the final PO lifecycle before building it into daily operations.',
      exists:['Vendor/company master','Product and supplier SKUs','Dealer cost / TTT price','MOQ / lead time','Inventory quantities'],
      next:['PO header + line items','Draft → Approved → Ordered → Partial → Received','Vendor documents','Job-specific purchasing','Audit / approval trail']
    },
    receiving:{
      eyebrow:'ERP & INVENTORY',title:'Receiving',status:'Inventory foundation exists — receiving workflow needs consolidation',
      summary:'Inventory can track quantities, but there is not yet a dedicated receiving screen tying delivered items back to POs, discrepancies and stock locations.',
      exists:['Inventory items','Stock quantity controls','Product SKUs','Supplier relationships','Job / operations context'],
      next:['Receive against PO','Partial receiving','Damage / shortage exceptions','Serial numbers where applicable','Stock-location updates']
    },
    invoices:{
      eyebrow:'FINANCE',title:'Invoices',status:'Relational support exists — standalone finance workspace needs consolidation',
      summary:'Invoice records and links already exist in the CRM/operational data model, but TTT-OS does not yet present a complete invoice register as a dedicated Finance screen.',
      exists:['Quotes and quote lines','Customer / Opportunity / Job links','Invoice relationship fields','Document relationships','Job estimate values'],
      next:['Invoice register','Generate from approved work / job','Tax and discount handling','Invoice status / due date','PDF / Workspace delivery']
    },
    payments:{
      eyebrow:'FINANCE',title:'Payments',status:'Review stage — payment workflow is not yet consolidated',
      summary:'Payments are the remaining step needed to close the Quote → Job → Invoice → Payment lifecycle cleanly in TTT-OS.',
      exists:['Customers','Jobs','Quotes','Invoice relationship foundation','Expense ledger'],
      next:['Payment records','Deposit / partial / final payment','Payment method','Balance due','Refunds / credits and reconciliation']
    },
    job_costing:{
      eyebrow:'FINANCE',title:'Job Costing',status:'Inputs exist — roll-up needs consolidation',
      summary:'TTT already captures estimated revenue, products/materials, labor planning and job-linked expenses. The missing piece is one authoritative profitability view per Job.',
      exists:['Job estimate / quote value','Product dealer cost','Inventory cost foundation','Expense allocations by Job','Scheduled technician operations'],
      next:['Actual material cost','Actual labor cost','Allocated expenses','Gross profit / margin','Estimate vs actual variance']
    }
  };
  function openModuleReview(key){
    ensureShellViews();const cfg=REVIEW_MODULES[key];if(!cfg)return;
    if(typeof show==='function')show('module-review');
    const body=document.getElementById('moduleReviewBody');if(!body)return;
    body.innerHTML='<div class="section-head"><div><p class="eyebrow">'+esc(cfg.eyebrow)+'</p><h2>'+esc(cfg.title)+'</h2><p class="muted">'+esc(cfg.summary)+'</p></div></div>'+
      '<div class="module-review-card"><span class="module-review-status">'+esc(cfg.status)+'</span><div class="module-review-grid">'+
      '<article class="panel"><h3>What already exists</h3><div class="checklist">'+cfg.exists.map(x=>'<div>✓ '+esc(x)+'</div>').join('')+'</div></article>'+
      '<article class="panel"><h3>What we should review next</h3><div class="checklist">'+cfg.next.map(x=>'<div>→ '+esc(x)+'</div>').join('')+'</div></article></div></div>';
    const h=document.getElementById('pageTitle');if(h)h.textContent=cfg.title;
  }

  function salesGroup(){return groupByTitle('SALES & CRM');}

  function buildSalesNav(){
    const group=salesGroup(),items=group?.querySelector('.nav-group-items');
    if(!items)return;
    document.querySelectorAll('.nav-item[data-view="crm"]').forEach(el=>{if(!el.closest('.nav-group-items'))el.remove();});
    items.innerHTML=`
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="dashboard">Overview</button>
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="leads">Leads</button>
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="opportunities">Opportunities</button>
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="contacts">Contacts</button>
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="companies">Companies</button>
      <button class="nav-item sales-customer-nav" type="button" data-view="customers">Customers</button>
      <button class="nav-item crm-shell-nav" type="button" data-view="crm" data-crm-tab="activity">Activities</button>
    `;
    group.classList.add('open');
    items.querySelector('.sales-customer-nav')?.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(typeof show==='function')show('customers');});
    items.querySelectorAll('[data-crm-tab]').forEach(btn=>btn.addEventListener('click',ev=>{
      ev.preventDefault();ev.stopPropagation();
      if(typeof show==='function')show('crm');
      const tab=btn.dataset.crmTab;
      window.TTTCRM?.activateTab?.(tab);
      window.TTTCRM?.load?.();
      setCrmNavActive(tab);
    }));
  }

  function buildOperationsNav(){
    const group=groupByTitle('JOBS & OPERATIONS'),items=group?.querySelector('.nav-group-items');if(!items)return;
    items.innerHTML=`
      <button class="nav-item" type="button" data-shell-view="jobs">Jobs</button>
      <button class="nav-item" type="button" data-shell-view="scheduling">Schedule</button>
      <button class="nav-item" type="button" data-shell-view="operations">Operations / Work Orders</button>
      <button class="nav-item" type="button" data-shell-view="vehicles">Vehicles</button>
      <button class="nav-item" type="button" data-shell-view="warranty">Service & Warranty</button>
    `;
    group.hidden=false;bindSimpleNav(items);
  }
  function buildErpNav(){
    const group=groupByTitle('ERP & INVENTORY'),items=group?.querySelector('.nav-group-items');if(!items)return;
    items.innerHTML=`
      <button class="nav-item" type="button" data-shell-view="pricing-catalog" data-erp-tab="inventory">Products & Catalog</button>
      <button class="nav-item" type="button" data-shell-view="pricing-catalog" data-erp-tab="inventory">Inventory</button>
      <button class="nav-item" type="button" data-shell-view="pricing-catalog" data-erp-tab="reorder">Reorder Alerts</button>
      <button class="nav-item" type="button" data-shell-view="pricing-catalog" data-erp-tab="wishlist">Wishlist</button>
      <button class="nav-item" type="button" data-shell-view="catalog">Supplier Catalog</button>
      <button class="nav-item" type="button" data-shell-view="vendors">Vendors</button>
      <button class="nav-item shell-review-nav" type="button" data-review-key="purchasing">Purchasing <span class="nav-review-badge">Review</span></button>
      <button class="nav-item" type="button" data-shell-view="pricing-catalog" data-erp-tab="purchase-orders">Purchase Orders</button>
      <button class="nav-item shell-review-nav" type="button" data-review-key="receiving">Receiving <span class="nav-review-badge">Review</span></button>
    `;
    group.hidden=false;bindSimpleNav(items);
    items.querySelectorAll('[data-review-key]').forEach(btn=>btn.addEventListener('click',()=>{openModuleReview(btn.dataset.reviewKey);markShellActive(btn);}));
  }
  function buildFinanceNav(){
    const group=groupByTitle('FINANCE'),items=group?.querySelector('.nav-group-items');if(!items)return;
    items.innerHTML=`
      <button class="nav-item finance-quotes-nav" type="button">Quotes & Estimates</button>
      <button class="nav-item shell-review-nav" type="button" data-review-key="invoices">Invoices <span class="nav-review-badge">Review</span></button>
      <button class="nav-item shell-review-nav" type="button" data-review-key="payments">Payments <span class="nav-review-badge">Review</span></button>
      <button class="nav-item" type="button" data-shell-view="expenses">Expenses</button>
      <button class="nav-item" type="button" data-shell-view="job-costing">Job Costing</button>
    `;
    group.hidden=false;bindSimpleNav(items);
    items.querySelector('.finance-quotes-nav')?.addEventListener('click',()=>{
      if(typeof show==='function')show('crm');window.TTTCRM?.activateTab?.('opportunities');window.TTTCRM?.load?.();
      markShellActive(items.querySelector('.finance-quotes-nav'));
      const h=document.getElementById('pageTitle');if(h)h.textContent='Quotes & Estimates';
    });
    items.querySelectorAll('[data-review-key]').forEach(btn=>btn.addEventListener('click',()=>{openModuleReview(btn.dataset.reviewKey);markShellActive(btn);}));
  }
  function buildInsightsNav(){
    const group=groupByTitle('INSIGHTS'),items=group?.querySelector('.nav-group-items');if(!items)return;
    items.innerHTML=`<div class="nav-coming-soon"><span>Analytics, Reports & Compliance</span><span class="nav-soon-badge">Coming Soon</span></div>`;
    group.hidden=false;
  }
  function restoreNavigation(){
    ensureShellViews();removeLegacyStandaloneNav();
    buildSalesNav();buildOperationsNav();buildErpNav();buildFinanceNav();buildInsightsNav();
    const people=groupByTitle('PEOPLE');if(people)people.hidden=false;
  }

  function setCrmNavActive(tab){
    document.querySelectorAll('.crm-shell-nav').forEach(x=>x.classList.toggle('active',x.dataset.crmTab===tab));
    const title={dashboard:'CRM Overview',leads:'Leads',opportunities:'Opportunities',contacts:'Contacts',companies:'Companies',activity:'CRM Activities'}[tab]||'CRM';
    const h=document.getElementById('pageTitle');if(h)h.textContent=title;
  }

  function cleanGroups(){
    document.querySelectorAll('.nav-group').forEach(group=>group.hidden=false);
    const settings=document.querySelector('.nav-settings');
    if(settings)settings.style.display=cloudRole()==='owner_admin'?'':'none';
  }

  function injectSearch(){
    if(document.getElementById('shellSearchOverlay'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="shell-overlay" id="shellSearchOverlay" hidden>
        <div class="shell-dialog" role="dialog" aria-modal="true" aria-label="Search TTT OS">
          <div class="shell-search-head"><span>⌕</span><input id="shellSearchInput" autocomplete="off" placeholder="Search jobs, customers, vehicles, leads, contacts, companies…"><kbd>Esc</kbd></div>
          <div class="shell-results" id="shellSearchResults"></div>
        </div>
      </div>
    `);
    const overlay=document.getElementById('shellSearchOverlay'),input=document.getElementById('shellSearchInput');
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)closeSearch();});
    input.addEventListener('input',()=>renderSearch(input.value));
    input.addEventListener('keydown',e=>{
      const rows=[...document.querySelectorAll('.shell-result')];
      let i=rows.findIndex(x=>x.classList.contains('active'));
      if(e.key==='ArrowDown'){e.preventDefault();i=Math.min(rows.length-1,i+1);selectResult(rows,i);}
      if(e.key==='ArrowUp'){e.preventDefault();i=Math.max(0,i<0?0:i-1);selectResult(rows,i);}
      if(e.key==='Enter'&&rows.length){e.preventDefault();(rows[i>=0?i:0])?.click();}
      if(e.key==='Escape')closeSearch();
    });
  }

  function selectResult(rows,index){rows.forEach((r,i)=>r.classList.toggle('active',i===index));rows[index]?.scrollIntoView({block:'nearest'});}

  function openSearch(){
    injectSearch();
    const o=document.getElementById('shellSearchOverlay'),i=document.getElementById('shellSearchInput');
    o.hidden=false;i.value='';renderSearch('');setTimeout(()=>i.focus(),0);
    if(window.TTTCRM&&!window.TTTCRM.state?.loaded){
      Promise.resolve(window.TTTCRM.load?.()).then(()=>{if(!o.hidden)renderSearch(i.value);}).catch(()=>{});
    }
  }
  function closeSearch(){const o=document.getElementById('shellSearchOverlay');if(o)o.hidden=true;}

  function result(type,title,subtitle,action,keywords){
    return {type,title,subtitle,action,hay:(title+' '+subtitle+' '+(keywords||'')).toLowerCase()};
  }

  function allResults(){
    const rows=[],core=(typeof db!=='undefined'&&db)||{};
    const customers=Array.isArray(core.customers)?core.customers:[];
    const vehicles=Array.isArray(core.vehicles)?core.vehicles:[];
    const jobs=Array.isArray(core.jobs)?core.jobs:[];
    const people=Array.isArray(core.personnel)?core.personnel:[];
    const customerById=id=>customers.find(x=>x.id===id);
    const vehicleById=id=>vehicles.find(x=>x.id===id);

    jobs.forEach(j=>{
      const c=customerById(j.customerId),v=vehicleById(j.vehicleId);
      const vehicle=[v?.year,v?.make,v?.model,v?.trim].filter(Boolean).join(' ');
      rows.push(result('Job',j.id,(c?.name||c?.displayName||'Unknown customer')+(vehicle?' · '+vehicle:''),()=>{closeSearch();if(typeof openJob==='function')openJob(j.id);},[j.status,(j.services||[]).join(' '),v?.vin].join(' ')));
    });
    customers.forEach(c=>rows.push(result('Customer',c.name||c.displayName||c.id,[c.phone,c.email].filter(Boolean).join(' · '),()=>{closeSearch();if(typeof show==='function')show('customers');},[c.id,c.city,c.state].join(' '))));
    vehicles.forEach(v=>rows.push(result('Vehicle',[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ')||v.id,[v.vin,customerById(v.customerId)?.name].filter(Boolean).join(' · '),()=>{closeSearch();if(typeof show==='function')show('vehicles');},[v.id,v.plate,v.color].join(' '))));
    people.forEach(p=>rows.push(result('Person',p.displayName||p.id,[p.jobTitle,p.department,p.phone].filter(Boolean).join(' · '),()=>{closeSearch();if(typeof show==='function')show('people');},[p.email,(p.skills||[]).map(s=>s.name).join(' ')].join(' '))));

    const crm=window.TTTCRM?.state;
    if(crm){
      const contactName=id=>{const c=crm.contacts?.find(x=>x.id===id);return c?.display_name||[c?.first_name,c?.last_name].filter(Boolean).join(' ')||'Unknown contact';};
      const companyName=id=>crm.companies?.find(x=>x.id===id)?.name||'';
      (crm.leads||[]).filter(x=>!x.archived_at).forEach(l=>rows.push(result('Lead',contactName(l.contact_id),[l.status,l.service_interest,companyName(l.company_id)].filter(Boolean).join(' · '),()=>{closeSearch();show('crm');window.TTTCRM?.activateTab?.('leads');window.TTTCRM?.openLead?.(l.id);},[l.id,l.source,l.next_action].join(' '))));
      (crm.opportunities||[]).filter(x=>!x.archived_at).forEach(o=>rows.push(result('Opportunity',o.title||o.id,[o.stage,o.related_service,companyName(o.company_id)].filter(Boolean).join(' · '),()=>{closeSearch();show('crm');window.TTTCRM?.activateTab?.('opportunities');window.TTTCRM?.openOpportunity?.(o.id);},[o.id,o.next_step].join(' '))));
      (crm.contacts||[]).filter(x=>!x.archived_at).forEach(c=>rows.push(result('Contact',c.display_name||[c.first_name,c.last_name].filter(Boolean).join(' ')||c.id,[c.contact_type,companyName(c.company_id),c.email,c.mobile].filter(Boolean).join(' · '),()=>{closeSearch();show('crm');window.TTTCRM?.activateTab?.('contacts');window.TTTCRM?.openContact?.(c.id);},[c.office_phone,c.title].join(' '))));
      (crm.companies||[]).filter(x=>!x.archived_at).forEach(c=>rows.push(result('Company',c.name||c.id,[c.primary_type,c.city,c.state,c.main_phone].filter(Boolean).join(' · '),()=>{closeSearch();show('crm');window.TTTCRM?.activateTab?.('companies');window.TTTCRM?.openCompany?.(c.id);},[c.general_email,c.website].join(' '))));
    }
    return rows;
  }

  function renderSearch(query){
    const box=document.getElementById('shellSearchResults');if(!box)return;
    const q=String(query||'').trim().toLowerCase();
    if(!q){
      const quick=[
        result('Quick action','Create lead','Start a new sales lead',()=>{closeSearch();window.TTTCRM?.newLead?.();}),
        result('Quick action','Create contact','Add a CRM contact',()=>{closeSearch();window.TTTCRM?.newContact?.();}),
        result('Quick action','Create company','Add a CRM company',()=>{closeSearch();window.TTTCRM?.newCompany?.();}),
        result('Quick action','Create job','Open the new job intake',()=>{closeSearch();if(typeof show==='function')show('newjob');})
      ];
      box.innerHTML='<div class="shell-quick">Quick actions</div>'+quick.map((r,i)=>resultHtml(r,i)).join('');
      bindResultActions(quick);return;
    }
    const terms=q.split(/\s+/).filter(Boolean);
    const rows=allResults().map(r=>({r,score:terms.reduce((s,t)=>s+(r.hay.startsWith(t)?8:r.hay.includes(t)?2:-100),0)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.r.title.localeCompare(b.r.title)).slice(0,30).map(x=>x.r);
    box.innerHTML=rows.length?rows.map((r,i)=>resultHtml(r,i)).join(''):'<div class="shell-empty">No TTT OS records matched that search.</div>';
    bindResultActions(rows);
  }

  function resultHtml(r,i){return '<button class="shell-result '+(i===0?'active':'')+'" type="button" data-shell-result="'+i+'"><span class="shell-result-type">'+esc(r.type)+'</span><span class="shell-result-copy"><strong>'+esc(r.title)+'</strong><small>'+esc(r.subtitle||'')+'</small></span><span class="shell-result-arrow">→</span></button>';}
  let currentSearchActions=[];
  function bindResultActions(rows){currentSearchActions=rows;document.querySelectorAll('[data-shell-result]').forEach(b=>b.onclick=()=>currentSearchActions[Number(b.dataset.shellResult)]?.action?.());}

  function injectNewMenu(){
    if(document.getElementById('shellNewMenu'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="shell-new-menu" id="shellNewMenu" hidden>
        <button type="button" data-new-action="lead"><span>◎</span><span><strong>Lead</strong><small>New inquiry or prospect</small></span></button>
        <button type="button" data-new-action="contact"><span>☺</span><span><strong>Contact</strong><small>Customer, prospect, vendor or partner</small></span></button>
        <button type="button" data-new-action="company"><span>▦</span><span><strong>Company</strong><small>Dealership, fleet, supplier or account</small></span></button>
        <button type="button" data-new-action="job"><span>◆</span><span><strong>Job</strong><small>New customer vehicle request</small></span></button>
      </div>
    `);
    document.querySelectorAll('[data-new-action]').forEach(b=>b.addEventListener('click',()=>{
      const a=b.dataset.newAction;closeNewMenu();
      if(a==='job'){if(typeof show==='function')show('newjob');return;}
      const fn=a==='lead'?'newLead':a==='contact'?'newContact':'newCompany';
      if(window.TTTCRM?.[fn])window.TTTCRM[fn]();else safeToast('CRM is still loading. Try again in a moment.');
    }));
    document.addEventListener('mousedown',e=>{const menu=document.getElementById('shellNewMenu'),btn=document.querySelector('.nav-create');if(!menu?.hidden&&!menu.contains(e.target)&&!btn?.contains(e.target))closeNewMenu();});
  }

  function openNewMenu(){
    injectNewMenu();
    const menu=document.getElementById('shellNewMenu'),btn=document.querySelector('.nav-create');if(!menu||!btn)return;
    const r=btn.getBoundingClientRect();
    menu.style.left=Math.min(window.innerWidth-272,Math.max(8,r.right+8))+'px';
    menu.style.top=Math.min(window.innerHeight-250,Math.max(8,r.top))+'px';
    if(window.innerWidth<=680){menu.style.left='12px';menu.style.top=(r.bottom+6)+'px';}
    menu.hidden=false;
  }
  function closeNewMenu(){const m=document.getElementById('shellNewMenu');if(m)m.hidden=true;}

  function bindBaseNav(){
    document.querySelectorAll('.nav-group-toggle').forEach(btn=>{
      if(btn.dataset.shellBound)return;btn.dataset.shellBound='1';
      btn.addEventListener('click',()=>btn.closest('.nav-group')?.classList.toggle('open'));
    });
    const create=document.querySelector('.nav-create');
    if(create){create.onclick=e=>{e.preventDefault();openNewMenu();};}
    const search=document.getElementById('globalSearchBtn');
    if(search){search.onclick=e=>{e.preventDefault();openSearch();};const k=document.createElement('span');k.className='shell-kbd';k.textContent='⌘K';search.appendChild(k);}
    document.addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}
      if(e.key==='Escape'){closeNewMenu();if(!document.getElementById('shellSearchOverlay')?.hidden)closeSearch();}
    });
  }

  function refreshShell(){
    restoreNavigation();cleanGroups();
    if(document.getElementById('crm')?.classList.contains('active')){
      const active=document.querySelector('[data-crm-tab].active')?.dataset.crmTab||'dashboard';
      setCrmNavActive(active);
    }
  }

  function init(){
    injectStyles();injectSearch();injectNewMenu();restoreNavigation();bindBaseNav();
    setTimeout(refreshShell,100);
    setTimeout(refreshShell,800);
    window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(refreshShell,0));
    window.addEventListener('ttt:crm-tab-changed',e=>setCrmNavActive(e.detail?.tab||'dashboard'));
    window.TTTPageTitles=Object.assign(window.TTTPageTitles||{},PAGE_TITLES);
    window.TTTShell={openSearch,openNewMenu,refresh:refreshShell,setCrmNavActive,openModuleReview};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();