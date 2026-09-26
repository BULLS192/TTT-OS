(function(){
  'use strict';

  const PAGE_TITLES={
    dashboard:'Command Center',
    crm:'CRM',
    jobs:'Jobs',
    vehicles:'Vehicles',
    warranty:'Service & Warranty',
    customers:'Customers',
    newjob:'New Job',
    jobdetail:'Job Details',
    people:'People',
    myaccount:'My Account',
    settings:'Settings & Admin'
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
      .nav-group[hidden]{display:none!important}
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

  function salesGroup(){
    return [...document.querySelectorAll('.nav-group')].find(g=>g.querySelector('.nav-group-toggle')?.textContent.includes('SALES & CRM'));
  }

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

  function setCrmNavActive(tab){
    document.querySelectorAll('.crm-shell-nav').forEach(x=>x.classList.toggle('active',x.dataset.crmTab===tab));
    const title={dashboard:'CRM Overview',leads:'Leads',opportunities:'Opportunities',contacts:'Contacts',companies:'Companies',activity:'CRM Activities'}[tab]||'CRM';
    const h=document.getElementById('pageTitle');if(h)h.textContent=title;
  }

  function cleanGroups(){
    document.querySelectorAll('.nav-group').forEach(group=>{
      const functional=[...group.querySelectorAll('.nav-group-items .nav-item')].filter(x=>!x.classList.contains('nav-placeholder'));
      group.hidden=functional.length===0;
    });
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
    buildSalesNav();cleanGroups();
    if(document.getElementById('crm')?.classList.contains('active')){
      const active=document.querySelector('[data-crm-tab].active')?.dataset.crmTab||'dashboard';
      setCrmNavActive(active);
    }
  }

  function init(){
    injectStyles();injectSearch();injectNewMenu();buildSalesNav();bindBaseNav();
    setTimeout(refreshShell,100);
    setTimeout(refreshShell,800);
    window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(refreshShell,0));
    window.addEventListener('ttt:crm-tab-changed',e=>setCrmNavActive(e.detail?.tab||'dashboard'));
    window.TTTPageTitles=Object.assign(window.TTTPageTitles||{},PAGE_TITLES);
    window.TTTShell={openSearch,openNewMenu,refresh:refreshShell,setCrmNavActive};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();