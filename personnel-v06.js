(function(){
  'use strict';

  const VERSION='0.6';
  const SEED_VERSION=3;
  const RELATIONSHIPS=['Owner','Partner','Employee','Contractor','Advisor'];
  const DEPARTMENTS=['Executive','Operations','Installation','Diagnostics','Sales','Administration','Marketing','Finance','Other'];
  const STATUSES=['Active','Onboarding','Leave','Inactive'];
  const RESPONSIBILITY_OPTIONS=[
    ['manager','Management / Operations'],
    ['technician','Technician / Installation'],
    ['service_advisor','Service Advisor'],
    ['sales','Sales / Business Development'],
    ['office','Office / Administration']
  ];
  const ACCESS_LEVELS=[
    ['manager','Manager'],
    ['technician','Technician'],
    ['service_advisor','Sales / Service'],
    ['office','Office / Administration'],
    ['read_only','Read only']
  ];
  const ACCESS_LABELS={
    owner_admin:'Administrator',
    manager:'Manager',
    technician:'Technician',
    service_advisor:'Sales / Service',
    sales:'Sales / Service',
    office:'Office / Administration',
    read_only:'Read only',
    partner:'Partner / Manager (legacy)',
    partner_admin:'Administrator (legacy)'
  };
  const SKILL_CATALOG=[
    {name:'General technician',category:'Operations'},
    {name:'Tint installer',category:'Installation'},
    {name:'Audio technician',category:'Installation'},
    {name:'Electronics',category:'Diagnostics'},
    {name:'Film installer',category:'Installation'},
    {name:'Vehicle diagnostics',category:'Diagnostics'},
    {name:'12V wiring',category:'Diagnostics'},
    {name:'Fabrication',category:'Fabrication'},
    {name:'Additive manufacturing',category:'Fabrication'},
    {name:'Customer service',category:'Customer'},
    {name:'Sales',category:'Commercial'},
    {name:'Business development',category:'Commercial'},
    {name:'Project management',category:'Management'},
    {name:'Inventory & purchasing',category:'Operations'},
    {name:'Administration',category:'Administration'}
  ];
  const LEVELS={1:'Awareness',2:'Basic',3:'Working',4:'Advanced',5:'Expert'};
  const SCHEDULING_LEVEL=3;

  let selectedPersonId=null;
  let peopleFilter='All';
  let searchTerm='';
  let dirty=false;
  let peopleSection='personnel';
  let accountByPerson=new Map();
  let accountsLoaded=false;
  let accountsLoading=false;

  const clone=v=>JSON.parse(JSON.stringify(v));
  const now=()=>new Date().toISOString();
  const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const e=(v='')=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const cssEscape=v=>window.CSS&&CSS.escape?CSS.escape(v):String(v).replace(/["\\]/g,'\\$&');

  function ensureModel(){
    if(!Array.isArray(db.users))db.users=[];
    if(!Array.isArray(db.personnel))db.personnel=[];

    if(Number(db.personnelSeedVersion||0)<SEED_VERSION){
      let derek=db.personnel.find(p=>p.userId==='usr_derek'||String(p.displayName||'').toLowerCase()==='derek thompson');
      if(!derek){
        derek={id:'per_derek',userId:'usr_derek',displayName:'Derek Thompson',firstName:'Derek',lastName:'Thompson',relationship:'Owner',jobTitle:'Owner / Lead Technician',department:'Operations',status:'Active',email:'',phone:'',schedulingEligible:true,roles:['partner','manager','technician'],skills:[{name:'General technician',level:5},{name:'Tint installer',level:5},{name:'Audio technician',level:5},{name:'Electronics',level:5},{name:'Film installer',level:4},{name:'Vehicle diagnostics',level:5},{name:'12V wiring',level:5}],certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:50},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:'tech_derek'};
        db.personnel.push(derek);
      }

      if(!db.personnel.some(p=>String(p.displayName||'').toLowerCase()==='kevin yap')){
        const existingUser=db.users.find(u=>String(u.name||'').toLowerCase()==='kevin yap');
        db.personnel.push({id:'per_kevin',userId:existingUser?.id||'usr_kevin',displayName:'Kevin Yap',firstName:'Kevin',lastName:'Yap',relationship:'Partner',jobTitle:'Partner',department:'Executive',status:'Active',email:'',phone:'',schedulingEligible:false,roles:['owner_admin'],skills:[{name:'Business development',level:5},{name:'Sales',level:5},{name:'Project management',level:4}],certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:40},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:'tech_kevin'});
      }

      if(!db.personnel.some(p=>String(p.displayName||'').toLowerCase()==='amjad kharoof')){
        const baseDerek=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='derek thompson');
        db.personnel.push({id:'per_amjad',userId:'usr_amjad',displayName:'Amjad Kharoof',firstName:'Amjad',lastName:'Kharoof',relationship:'Partner',jobTitle:'Partner / Lead Technician',department:baseDerek?.department||'Operations',status:'Active',email:'',phone:'',schedulingEligible:true,roles:['partner','manager','technician'],skills:clone(baseDerek?.skills||[]),certifications:[],availability:clone(baseDerek?.availability||{start:'08:00',end:'18:00',maxWeeklyHours:50}),startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:'tech_amjad'});
      }
      const canonicalDerek=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='derek thompson');if(canonicalDerek)canonicalDerek.roles=['manager','technician'];
      const canonicalKevin=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='kevin yap');if(canonicalKevin)canonicalKevin.roles=['manager','sales','office'];
      const canonicalAmjad=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='amjad kharoof');if(canonicalAmjad)canonicalAmjad.roles=['manager','technician'];
      db.personnelSeedVersion=SEED_VERSION;
    }

    db.personnel.forEach(p=>{
      p.id=p.id||uid('per');
      p.userId=p.userId||uid('usr');
      p.displayName=p.displayName||[p.firstName,p.lastName].filter(Boolean).join(' ')||'Unnamed Person';
      p.status=p.status||'Onboarding';
      p.relationship=p.relationship||'Employee';
      p.department=p.department||'Operations';
      p.roles=Array.isArray(p.roles)?p.roles:[];
      p.skills=Array.isArray(p.skills)?p.skills:[];
      p.certifications=Array.isArray(p.certifications)?p.certifications:[];
      p.availability=p.availability||{start:'08:00',end:'18:00',maxWeeklyHours:40};
      if(typeof p.schedulingEligible!=='boolean')p.schedulingEligible=false;
      let u=db.users.find(x=>x.id===p.userId);
      if(!u){
        u={id:p.userId,name:p.displayName,email:p.email||'',role:p.roles[0]||'read_only',roles:clone(p.roles),active:p.status==='Active',personId:p.id,created_at:p.createdAt||now()};
        db.users.push(u);
      }else{
        u.name=p.displayName;u.email=p.email||'';u.role=p.roles[0]||'read_only';u.roles=clone(p.roles);u.active=p.status==='Active';u.personId=p.id;
      }
    });
    syncScheduling(false);
    save();
  }

  function syncScheduling(shouldSave=true){
    if(!window.TTTSchedulingCore)return;
    const scheduling=window.TTTSchedulingCore.ensureModel(db);
    if(!Array.isArray(scheduling.technicians))scheduling.technicians=[];
    db.personnel.forEach(p=>{
      const id=p.schedulingId||('tech_'+String(p.id).replace(/^per_/,''));
      p.schedulingId=id;
      let tech=scheduling.technicians.find(t=>t.id===id||t.personId===p.id);
      const payload={id,name:p.displayName,active:p.status==='Active'&&p.schedulingEligible,skills:(p.skills||[]).filter(s=>Number(s.level)>=SCHEDULING_LEVEL).map(s=>s.name),workingHours:{start:p.availability?.start||'08:00',end:p.availability?.end||'18:00'},personId:p.id};
      if(tech)Object.assign(tech,payload);
      else if(p.schedulingEligible)scheduling.technicians.push(payload);
    });
    scheduling.technicians.forEach(t=>{if(t.personId&&!db.personnel.some(p=>p.id===t.personId)){t.active=false;t.personId=null;}});
    if(shouldSave)save();
  }

  function injectShell(){
    if(!document.querySelector('link[data-ttt-personnel-v05]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='/personnel-v06.css?v=20260926-personnel-cleanup-v1';link.dataset.tttPersonnelV05='1';document.head.appendChild(link);
    }
    document.getElementById('people')?.remove();

    const group=[...document.querySelectorAll('.nav-group')].find(g=>g.querySelector('.nav-group-toggle')?.textContent.includes('PEOPLE'));
    const items=group?.querySelector('.nav-group-items');
    if(items){
      items.innerHTML=`
        <button class="nav-item people-nav" data-view="people" data-people-section="personnel">Personnel</button>
        <button class="nav-item people-nav" data-view="people" data-people-section="skills">Skills</button>
        <button class="nav-item people-nav" data-view="people" data-people-section="availability">Availability</button>`;
      group.classList.add('open');
      items.querySelectorAll('[data-people-section]').forEach(nav=>nav.addEventListener('click',()=>{peopleSection=nav.dataset.peopleSection;show('people');renderPeople();}));
    }

    const section=document.createElement('section');section.id='people';section.className='view';
    const settings=document.getElementById('settings');
    (settings?.parentNode||document.querySelector('main.main'))?.insertBefore(section,settings||null);
  }

  function isAdmin(){return window.TTTCloud?.profile?.role==='owner_admin';}
  function canEditPerson(p){return isAdmin()||window.TTTCloud?.profile?.person_id===p?.id;}
  function accessLabel(role){return ACCESS_LABELS[role]||String(role||'No access').replaceAll('_',' ');}
  function accountFor(p){
    if(!p)return null;
    if(accountByPerson.has(p.id))return accountByPerson.get(p.id);
    const own=window.TTTCloud?.profile;
    if(own?.person_id===p.id)return {user_id:own.user_id,person_id:own.person_id,display_name:own.display_name,email:own.email,role:own.role,roles:own.roles||[],active:own.active!==false};
    return null;
  }
  async function loadAccountLinks(force=false){
    if(accountsLoading||(!force&&accountsLoaded))return;
    const cloud=window.TTTCloud;if(!cloud?.ready||!cloud?.client||!cloud?.organizationId)return;
    accountsLoading=true;
    try{
      let rows=[];
      if(isAdmin()){
        const {data,error}=await cloud.client.from('profiles')
          .select('user_id,person_id,display_name,email,role,roles,active')
          .eq('organization_id',cloud.organizationId);
        if(error)throw error;
        rows=data||[];
      }else if(cloud.profile){
        rows=[cloud.profile];
      }
      accountByPerson=new Map(rows.filter(x=>x.person_id).map(x=>[x.person_id,x]));
      accountsLoaded=true;
      if(document.getElementById('people')?.classList.contains('active')&&!dirty){
        renderStats();renderDirectory();renderEditor();
      }
    }catch(err){console.warn('TTT Personnel account linkage unavailable',err);}
    finally{accountsLoading=false;}
  }
  function connectedAccounts(){return db.personnel.filter(p=>accountFor(p)?.active).length;}
  function responsibilityLabel(id){return RESPONSIBILITY_OPTIONS.find(x=>x[0]===id)?.[1]||id;}
  function activePeople(){return db.personnel.filter(p=>p.status==='Active');}
  function initials(p){return (p.displayName||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();}
  function personAvatarHtml(p,large=false){
    const cls='person-avatar'+(large?' large':'');
    return '<span class="'+cls+'" data-person-avatar-id="'+e(p.id)+'">'+e(initials(p))+'</span>';
  }
  async function hydratePersonAvatars(root=document){
    if(!window.TTTAvatar)return;
    const nodes=[...root.querySelectorAll('[data-person-avatar-id]')];
    await Promise.all(nodes.map(async node=>{
      const p=db.personnel.find(x=>x.id===node.dataset.personAvatarId);if(!p)return;
      const src=await window.TTTAvatar.resolve(p,p.displayName);
      if(!src)return;
      node.style.backgroundImage='url("'+String(src).replace(/"/g,'%22')+'")';
      node.style.backgroundSize='cover';
      node.style.backgroundPosition='center';
      node.textContent='';
      node.classList.add('has-photo');
    }));
  }
  function displayRole(p){return p.jobTitle||p.relationship||'Team member';}
  function certExpiring(p,days=90){const max=Date.now()+days*86400000;return (p.certifications||[]).some(c=>c.expires&&new Date(c.expires).getTime()>=Date.now()&&new Date(c.expires).getTime()<=max);}
  function coverageCount(){const s=new Set();activePeople().filter(p=>p.schedulingEligible).forEach(p=>(p.skills||[]).filter(x=>Number(x.level)>=SCHEDULING_LEVEL).forEach(x=>s.add(x.name)));return s.size;}
  function filteredPeople(){return db.personnel.filter(p=>{if(peopleFilter!=='All'&&p.status!==peopleFilter)return false;const q=searchTerm.trim().toLowerCase();if(!q)return true;return [p.displayName,p.jobTitle,p.department,p.relationship,...(p.skills||[]).map(s=>s.name)].join(' ').toLowerCase().includes(q);});}

  function renderPeople(){
    const root=document.getElementById('people');if(!root)return;
    dirty=false;
    document.querySelectorAll('.people-nav').forEach(n=>n.classList.toggle('active',n.dataset.peopleSection===peopleSection));
    if(peopleSection==='skills'){renderSkillsWorkspace(root);return;}
    if(peopleSection==='availability'){renderAvailabilityWorkspace(root);return;}
    root.innerHTML=`
      <div class="section-head people-head"><div><p class="eyebrow">TEAM DIRECTORY</p><h2>Personnel</h2><p class="muted">Team profiles, roles, certifications and operating responsibilities.</p></div>${isAdmin()?'<button class="btn primary" id="addPersonBtn">+ Add person</button>':''}</div>
      <div class="people-stats" id="peopleStats"></div>
      <div class="people-toolbar panel"><div class="status-filters" id="peopleFilters">${['All',...STATUSES].map(x=>`<button class="filter ${peopleFilter===x?'active':''}" data-people-filter="${e(x)}">${e(x)}</button>`).join('')}</div><input id="peopleSearch" class="people-search" placeholder="Search people, roles or skills…" value="${e(searchTerm)}"></div>
      <div class="people-layout"><article class="panel people-directory"><div class="panel-head"><div><h3>Directory</h3><p class="muted" id="peopleCount"></p></div><button class="link-btn" id="skillsMatrixBtn">View skills matrix</button></div><div id="peopleList"></div></article><aside id="personPanel"></aside></div>
      <div id="skillsMatrix" class="panel skills-matrix-panel hidden"></div>`;
    renderStats();renderDirectory();renderEditor();bindStaticEvents();loadAccountLinks();
  }

  function renderSkillsWorkspace(root){
    const people=activePeople();
    const custom=[...new Set(people.flatMap(p=>(p.skills||[]).map(s=>s.name)).filter(n=>!SKILL_CATALOG.some(s=>s.name===n)))];
    const skills=[...SKILL_CATALOG,...custom.map(name=>({name,category:'Custom'}))];
    root.innerHTML=`
      <div class="section-head people-head"><div><p class="eyebrow">TEAM CAPABILITY</p><h2>Skills</h2><p class="muted">See capability coverage across the team. Level 3+ is eligible for skill-based scheduling.</p></div></div>
      <div class="people-stats"><div class="stat"><span>Active people</span><strong>${people.length}</strong></div><div class="stat"><span>Skills covered</span><strong>${coverageCount()}</strong></div><div class="stat"><span>Schedule eligible</span><strong>${people.filter(p=>p.schedulingEligible).length}</strong></div><div class="stat"><span>Coverage gaps</span><strong>${skills.filter(s=>!people.some(p=>(p.skills||[]).some(x=>x.name===s.name&&Number(x.level)>=3))).length}</strong></div></div>
      <article class="panel skills-workspace"><div class="panel-head"><div><h3>Skills matrix</h3><p class="muted">1 Awareness · 2 Basic · 3 Working · 4 Advanced · 5 Expert</p></div></div><div class="table-wrap"><table class="skills-table"><thead><tr><th>Skill</th>${people.map(p=>`<th>${e(p.displayName)}</th>`).join('')}</tr></thead><tbody>${skills.map(s=>`<tr><td><strong>${e(s.name)}</strong><small>${e(s.category)}</small></td>${people.map(p=>{const x=(p.skills||[]).find(k=>k.name===s.name);return `<td>${x?`<span class="skill-level level-${Number(x.level||0)}">${Number(x.level||0)}</span>`:'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></article>`;
  }

  function renderAvailabilityWorkspace(root){
    const people=activePeople();
    root.innerHTML=`
      <div class="section-head people-head"><div><p class="eyebrow">WORKFORCE SCHEDULING</p><h2>Availability</h2><p class="muted">Standard working hours, weekly capacity and scheduling eligibility.</p></div></div>
      <div class="people-stats"><div class="stat"><span>Active people</span><strong>${people.length}</strong></div><div class="stat"><span>Schedule eligible</span><strong>${people.filter(p=>p.schedulingEligible).length}</strong></div><div class="stat"><span>Weekly capacity</span><strong>${people.filter(p=>p.schedulingEligible).reduce((n,p)=>n+Number(p.availability?.maxWeeklyHours||0),0)}h</strong></div><div class="stat"><span>Unavailable</span><strong>${people.filter(p=>!p.schedulingEligible).length}</strong></div></div>
      <article class="panel availability-panel"><div class="panel-head"><div><h3>Standard availability</h3><p class="muted">Edit hours from the person's Personnel profile. Job-specific scheduling will use these limits.</p></div></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Scheduling</th><th>Standard hours</th><th>Max / week</th><th>Assignable skills</th></tr></thead><tbody>${people.map(p=>`<tr><td><strong>${e(p.displayName)}</strong></td><td>${e(displayRole(p))}</td><td><span class="badge ${p.schedulingEligible?'person-active':''}">${p.schedulingEligible?'Eligible':'Not eligible'}</span></td><td>${e(p.availability?.start||'—')} – ${e(p.availability?.end||'—')}</td><td>${e(p.availability?.maxWeeklyHours??'—')}h</td><td><div class="availability-skills">${(p.skills||[]).filter(s=>Number(s.level)>=SCHEDULING_LEVEL).map(s=>`<span>${e(s.name)}</span>`).join('')||'—'}</div></td></tr>`).join('')}</tbody></table></div></article>`;
  }

  function renderStats(){
    const el=document.getElementById('peopleStats');if(!el)return;
    const active=activePeople();
    el.innerHTML=`<div class="stat"><span>Active people</span><strong>${active.length}</strong></div><div class="stat"><span>TTT OS accounts</span><strong>${connectedAccounts()}</strong></div><div class="stat"><span>Schedule eligible</span><strong>${active.filter(p=>p.schedulingEligible).length}</strong></div><div class="stat"><span>Certifications expiring ≤90d</span><strong>${db.personnel.filter(p=>certExpiring(p)).length}</strong></div>`;
  }

  function renderDirectory(){
    const list=document.getElementById('peopleList'),count=document.getElementById('peopleCount');if(!list)return;
    const rows=filteredPeople();if(count)count.textContent=`${rows.length} record${rows.length===1?'':'s'}`;
    list.innerHTML=rows.length?rows.map(p=>{const account=accountFor(p);return `<button type="button" class="person-card ${selectedPersonId===p.id?'selected':''}" data-person-id="${e(p.id)}">${personAvatarHtml(p)}<span class="person-main"><strong>${e(p.displayName)}</strong><small>${e(displayRole(p))} · ${e(p.department||'Unassigned')}</small><span class="person-skills">${(p.skills||[]).filter(s=>Number(s.level)>=SCHEDULING_LEVEL).slice(0,4).map(s=>`<em>${e(s.name)}</em>`).join('')||'<em>No operational skills set</em>'}</span></span><span class="person-meta"><span class="badge ${p.status==='Active'?'person-active':''}">${e(p.status)}</span>${account?'<small class="account-connected">TTT OS ✓</small>':'<small>No login</small>'}</span></button>`;}).join(''):'<div class="people-empty">No personnel match this view.</div>';
    list.querySelectorAll('[data-person-id]').forEach(b=>b.addEventListener('click',()=>selectPerson(b.dataset.personId)));
    hydratePersonAvatars(list);
  }

  function renderEditor(){
    const panel=document.getElementById('personPanel');if(!panel)return;
    const p=db.personnel.find(x=>x.id===selectedPersonId);
    if(!p){panel.innerHTML=`<article class="panel people-overview"><h3>Personnel system</h3><p class="muted">Select a person to edit their profile.</p><div class="people-rule"><strong>Stable editing</strong><span>The editor only refreshes on explicit actions such as Save, Add, Delete or selecting another person.</span></div><div class="people-rule"><strong>Skills drive scheduling</strong><span>Skills rated Working (3) or above become scheduling capabilities when Scheduling eligible is enabled.</span></div></article>`;return;}

    const editable=canEditPerson(p);
    panel.innerHTML=`<article class="panel person-editor"><div class="person-editor-head">${personAvatarHtml(p,true)}<div class="person-editor-identity"><p class="eyebrow">PERSONNEL PROFILE</p><h3>${e(p.displayName)}</h3><span>${e(p.relationship)} · ${e(p.status)}</span></div>${editable?'<label class="btn secondary compact person-photo-btn">Change photo<input id="personPhotoInput" type="file" accept="image/*" hidden></label>':''}</div>
      <form id="personForm" data-person-id="${e(p.id)}" autocomplete="off">
        <div class="person-form-grid">
          <label>First name<input name="firstName" required value="${e(p.firstName||'')}"></label><label>Last name<input name="lastName" required value="${e(p.lastName||'')}"></label>
          <label>Relationship<select name="relationship">${RELATIONSHIPS.map(x=>`<option value="${e(x)}" ${x===p.relationship?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label>Status<select name="status">${STATUSES.map(x=>`<option value="${e(x)}" ${x===p.status?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label class="span-2">Job title<input name="jobTitle" value="${e(p.jobTitle||'')}"></label>
          <label>Department<select name="department">${DEPARTMENTS.map(x=>`<option value="${e(x)}" ${x===p.department?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label>Start date<input type="date" name="startDate" value="${e(p.startDate||'')}"></label>
          <label>Email<input type="email" name="email" value="${e(p.email||'')}"></label><label>Phone<input name="phone" value="${e(p.phone||'')}"></label>
        </div>
        ${accountSectionHtml(p)}
        <div class="person-subsection"><div class="subsection-title"><div><strong>Work responsibilities</strong><span>Operational responsibilities are separate from login permissions and job title.</span></div></div><div class="role-checks responsibility-checks">${RESPONSIBILITY_OPTIONS.map(([id,label])=>`<label><input type="checkbox" name="roles" value="${e(id)}" ${(p.roles||[]).includes(id)?'checked':''} ${isAdmin()?'':'disabled'}> ${e(label)}</label>`).join('')}</div></div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Operations & scheduling</strong><span>Controls whether this person can be assigned shop operations.</span></div></div><label class="schedule-toggle"><input type="checkbox" name="schedulingEligible" ${p.schedulingEligible?'checked':''}><span><strong>Scheduling eligible</strong><small>Only skills at Working (3) or above become scheduling capabilities.</small></span></label><div class="person-form-grid compact-grid"><label>Standard start<input type="time" name="workStart" value="${e(p.availability?.start||'08:00')}"></label><label>Standard end<input type="time" name="workEnd" value="${e(p.availability?.end||'18:00')}"></label><label>Max weekly hours<input type="number" min="0" max="100" name="maxWeeklyHours" value="${e(p.availability?.maxWeeklyHours??40)}"></label></div></div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Skills</strong><span>Capability matrix used by Operations.</span></div><button type="button" class="btn secondary compact" id="addCustomSkillBtn">+ Custom skill</button></div><div class="skill-editor" id="skillEditor">${skillEditorHtml(p)}</div></div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Certifications & licenses</strong><span>Track expirations before work is assigned.</span></div><button type="button" class="btn secondary compact" id="addCertBtn">+ Add</button></div><div id="certEditor">${certEditorHtml(p)}</div></div>
        <label class="person-notes">Notes<textarea name="notes" placeholder="Responsibilities, onboarding notes, operating restrictions, etc.">${e(p.notes||'')}</textarea></label>
        <div class="person-form-actions">${isAdmin()?'<button type="button" class="btn secondary person-delete-btn" id="deletePersonBtn">Delete person</button>':''}<span class="form-spacer"></span><button type="button" class="btn secondary" id="closePersonBtn">Close</button><button type="submit" class="btn primary">Save profile</button></div>
      </form></article>`;
    const personForm=panel.querySelector('#personForm');
    if(personForm&&!editable){
      const note=document.createElement('div');
      note.className='people-rule';
      note.innerHTML='<strong>Read-only profile</strong><span>You can view this teammate’s skills and availability. Only that person or the TTT OS administrator can edit the profile.</span>';
      personForm.prepend(note);
      personForm.querySelectorAll('input,select,textarea,button').forEach(el=>{if(el.id!=='closePersonBtn')el.disabled=true;});
    }
    bindEditorEvents();
    hydratePersonAvatars(panel);
  }

  function accountSectionHtml(p){
    const account=accountFor(p);
    if(!account){
      return `<div class="person-subsection account-section"><div class="subsection-title"><div><strong>TTT OS account</strong><span>Login access is separate from this personnel record.</span></div><span class="account-state not-linked">No login linked</span></div><div class="account-summary empty"><div><strong>Personnel only</strong><span>This person can exist in scheduling and operations without a TTT OS login. Account provisioning is handled from Settings & Admin.</span></div></div></div>`;
    }
    const own=window.TTTCloud?.profile?.person_id===p.id;
    const canChange=isAdmin()&&!own;
    const accessOptions=ACCESS_LEVELS.map(([id,label])=>`<option value="${e(id)}" ${account.role===id?'selected':''}>${e(label)}</option>`).join('');
    const currentLegacy=!ACCESS_LEVELS.some(x=>x[0]===account.role)&&account.role!=='owner_admin'
      ? `<option value="${e(account.role)}" selected>${e(accessLabel(account.role))}</option>`:'';
    return `<div class="person-subsection account-section">
      <div class="subsection-title"><div><strong>TTT OS account</strong><span>Authentication and permissions. This does not change the person's job title or responsibilities.</span></div><span class="account-state ${account.active?'connected':'disabled'}">${account.active?'Connected':'Disabled'}</span></div>
      <div class="account-summary">
        <div><span>Login email</span><strong>${e(account.email||'—')}</strong></div>
        <div><span>Access level</span>${canChange?`<select name="accessRole">${currentLegacy}${accessOptions}</select>`:`<strong>${e(accessLabel(account.role))}</strong>`}</div>
        <div><span>Account owner</span><strong>${own?'You':'Linked user'}</strong></div>
      </div>
      ${account.role==='owner_admin'?'<p class="account-note">Administrator access includes system settings and user administration. It is intentionally separate from employment title.</p>':''}
    </div>`;
  }

  async function syncAccountAccess(p,form){
    if(!isAdmin())return true;
    const account=accountFor(p);if(!account)return true;
    const own=window.TTTCloud?.profile?.person_id===p.id;
    const select=form.querySelector('[name="accessRole"]');
    if(!select||own)return true;
    const role=String(select.value||account.role);
    if(role===account.role&&account.display_name===p.displayName)return true;
    const {data,error}=await window.TTTCloud.client.from('profiles')
      .update({role,roles:[role],display_name:p.displayName})
      .eq('organization_id',window.TTTCloud.organizationId)
      .eq('user_id',account.user_id)
      .select('user_id,person_id,display_name,email,role,roles,active')
      .maybeSingle();
    if(error){window.alert('TTT OS account access could not be updated: '+error.message);return false;}
    if(data)accountByPerson.set(p.id,data);
    return true;
  }

  function skillEditorHtml(p){
    const byName=new Map((p.skills||[]).map(s=>[s.name,s]));
    const names=[...SKILL_CATALOG.map(s=>s.name),...(p.skills||[]).map(s=>s.name).filter(n=>!SKILL_CATALOG.some(x=>x.name===n))];
    return [...new Set(names)].map(name=>{const s=byName.get(name);return `<div class="skill-row"><label><input type="checkbox" data-skill-enabled="${e(name)}" ${s?'checked':''}><span>${e(name)}</span></label><select data-skill-level="${e(name)}" ${s?'':'disabled'}>${Object.entries(LEVELS).map(([v,l])=>`<option value="${v}" ${Number(s?.level||3)===Number(v)?'selected':''}>${v} · ${e(l)}</option>`).join('')}</select></div>`;}).join('');
  }

  function certEditorHtml(p){return (p.certifications||[]).length?(p.certifications||[]).map(certRowHtml).join(''):'<div class="mini-empty">No certifications recorded.</div>';}
  function certRowHtml(c){return `<div class="cert-row" data-cert-id="${e(c.id)}"><input data-cert-name placeholder="Certification / license" value="${e(c.name||'')}"><input data-cert-issuer placeholder="Issuer" value="${e(c.issuer||'')}"><input data-cert-expires type="date" value="${e(c.expires||'')}"><button type="button" class="link-btn danger" data-remove-cert="${e(c.id)}">Remove</button></div>`;}

  function bindStaticEvents(){
    document.getElementById('addPersonBtn')?.addEventListener('click',addPerson);
    document.querySelectorAll('[data-people-filter]').forEach(b=>b.addEventListener('click',()=>{peopleFilter=b.dataset.peopleFilter;document.querySelectorAll('[data-people-filter]').forEach(x=>x.classList.toggle('active',x===b));renderDirectory();}));
    document.getElementById('peopleSearch')?.addEventListener('input',ev=>{searchTerm=ev.currentTarget.value;renderDirectory();});
    document.getElementById('skillsMatrixBtn')?.addEventListener('click',showSkillsMatrix);
  }

  function bindEditorEvents(){
    const form=document.getElementById('personForm');if(!form)return;
    form.addEventListener('input',()=>{dirty=true;});
    form.addEventListener('change',()=>{dirty=true;});
    form.addEventListener('submit',savePersonForm);
    document.getElementById('closePersonBtn')?.addEventListener('click',closeEditor);
    document.getElementById('deletePersonBtn')?.addEventListener('click',deleteSelectedPerson);
    document.querySelectorAll('[data-skill-enabled]').forEach(cb=>cb.addEventListener('change',()=>{const sel=form.querySelector(`[data-skill-level="${cssEscape(cb.dataset.skillEnabled)}"]`);if(sel)sel.disabled=!cb.checked;}));
    document.getElementById('personPhotoInput')?.addEventListener('change',ev=>setPersonPhoto(ev.target.files?.[0]));
    document.getElementById('addCustomSkillBtn')?.addEventListener('click',addCustomSkill);
    document.getElementById('addCertBtn')?.addEventListener('click',addCertificationRow);
    bindCertRemoveButtons();
  }

  function bindCertRemoveButtons(){document.querySelectorAll('[data-remove-cert]').forEach(b=>{b.onclick=()=>{b.closest('[data-cert-id]')?.remove();const editor=document.getElementById('certEditor');if(editor&&!editor.querySelector('[data-cert-id]'))editor.innerHTML='<div class="mini-empty">No certifications recorded.</div>';dirty=true;};});}

  function selectPerson(id){if(dirty&&!window.confirm('Discard unsaved changes to this profile?'))return;selectedPersonId=id;dirty=false;renderDirectory();renderEditor();}
  function closeEditor(){if(dirty&&!window.confirm('Discard unsaved changes?'))return;selectedPersonId=null;dirty=false;renderDirectory();renderEditor();}
  function addPerson(){if(!isAdmin()){if(typeof toast==='function')toast('Administrator access required');return;}if(dirty&&!window.confirm('Discard unsaved changes and create a new person?'))return;const p={id:uid('per'),userId:uid('usr'),displayName:'New Person',firstName:'',lastName:'',relationship:'Employee',jobTitle:'',department:'Operations',status:'Onboarding',email:'',phone:'',schedulingEligible:false,roles:[],skills:[],certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:40},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:''};db.personnel.push(p);save();selectedPersonId=p.id;dirty=false;renderStats();renderDirectory();renderEditor();requestAnimationFrame(()=>document.querySelector('#personForm input[name="firstName"]')?.focus());}

  async function setPersonPhoto(file){
    if(!file||!String(file.type||'').startsWith('image/'))return;
    const p=db.personnel.find(x=>x.id===selectedPersonId);if(!p)return;
    if(!window.TTTAvatar){window.alert('Profile photo service is not ready yet.');return;}
    try{
      const btn=document.querySelector('.person-photo-btn');
      if(btn)btn.classList.add('is-busy');
      if(typeof toast==='function')toast('Uploading profile photo…');
      await window.TTTAvatar.uploadForPerson(p,file);
      await hydratePersonAvatars(document.getElementById('people')||document);
      if(typeof toast==='function')toast('Profile photo updated');
    }catch(err){
      window.alert(err?.message||'Profile photo could not be updated.');
    }finally{
      document.querySelector('.person-photo-btn')?.classList.remove('is-busy');
    }
  }

  function addCustomSkill(){const name=window.prompt('Custom skill name');if(!name?.trim())return;const n=name.trim();const editor=document.getElementById('skillEditor');if(!editor)return;if([...editor.querySelectorAll('[data-skill-enabled]')].some(x=>String(x.dataset.skillEnabled).toLowerCase()===n.toLowerCase())){window.alert('That skill is already listed.');return;}const row=document.createElement('div');row.className='skill-row';row.innerHTML=`<label><input type="checkbox" data-skill-enabled="${e(n)}" checked><span>${e(n)}</span></label><select data-skill-level="${e(n)}">${Object.entries(LEVELS).map(([v,l])=>`<option value="${v}" ${v==='3'?'selected':''}>${v} · ${e(l)}</option>`).join('')}</select>`;editor.appendChild(row);const cb=row.querySelector('[data-skill-enabled]'),sel=row.querySelector('select');cb.addEventListener('change',()=>{sel.disabled=!cb.checked;dirty=true;});row.querySelectorAll('select,input').forEach(x=>{x.addEventListener('change',()=>dirty=true);x.addEventListener('input',()=>dirty=true);});dirty=true;}
  function addCertificationRow(){const editor=document.getElementById('certEditor');if(!editor)return;editor.querySelector('.mini-empty')?.remove();const wrap=document.createElement('div');wrap.innerHTML=certRowHtml({id:uid('cert'),name:'',issuer:'',expires:''});const row=wrap.firstElementChild;editor.appendChild(row);bindCertRemoveButtons();row.querySelector('[data-cert-name]')?.focus();dirty=true;}

  function readFormIntoPerson(p){
    const form=document.getElementById('personForm');if(!form||form.dataset.personId!==p.id)return false;
    const fd=new FormData(form);
    p.firstName=String(fd.get('firstName')||'').trim();p.lastName=String(fd.get('lastName')||'').trim();p.displayName=[p.firstName,p.lastName].filter(Boolean).join(' ')||'Unnamed Person';
    p.relationship=String(fd.get('relationship')||'Employee');p.status=String(fd.get('status')||'Onboarding');p.jobTitle=String(fd.get('jobTitle')||'').trim();p.department=String(fd.get('department')||'Operations');p.startDate=String(fd.get('startDate')||'');p.email=String(fd.get('email')||'').trim();p.phone=String(fd.get('phone')||'').trim();if(isAdmin())p.roles=fd.getAll('roles').map(String).filter(x=>RESPONSIBILITY_OPTIONS.some(r=>r[0]===x));p.schedulingEligible=fd.get('schedulingEligible')==='on';p.availability={start:String(fd.get('workStart')||'08:00'),end:String(fd.get('workEnd')||'18:00'),maxWeeklyHours:Number(fd.get('maxWeeklyHours')||40)};p.notes=String(fd.get('notes')||'').trim();p.updatedAt=now();
    p.skills=[];form.querySelectorAll('[data-skill-enabled]').forEach(cb=>{if(!cb.checked)return;const sel=form.querySelector(`[data-skill-level="${cssEscape(cb.dataset.skillEnabled)}"]`);p.skills.push({name:cb.dataset.skillEnabled,level:Number(sel?.value||3)});});
    p.certifications=[...form.querySelectorAll('[data-cert-id]')].map(row=>({id:row.dataset.certId,name:row.querySelector('[data-cert-name]')?.value.trim()||'',issuer:row.querySelector('[data-cert-issuer]')?.value.trim()||'',expires:row.querySelector('[data-cert-expires]')?.value||''})).filter(c=>c.name||c.issuer||c.expires);
    let u=db.users.find(x=>x.id===p.userId);if(!u){u={id:p.userId,name:p.displayName,email:p.email,role:p.roles[0]||'read_only',roles:clone(p.roles),active:p.status==='Active',personId:p.id,created_at:p.createdAt||now()};db.users.push(u);}else{u.name=p.displayName;u.email=p.email;u.role=p.roles[0]||'read_only';u.roles=clone(p.roles);u.active=p.status==='Active';u.personId=p.id;}
    return true;
  }

  async function savePersonForm(ev){
    ev.preventDefault();
    const form=ev.currentTarget,p=db.personnel.find(x=>x.id===form.dataset.personId);if(!p)return;
    if(!canEditPerson(p)){if(typeof toast==='function')toast('You can only edit your own profile');return;}
    if(!readFormIntoPerson(p))return;
    if(!await syncAccountAccess(p,form))return;
    syncScheduling(false);save();dirty=false;
    renderStats();renderDirectory();renderEditor();
    if(typeof toast==='function')toast('Personnel profile saved');
  }

  function referencesPerson(record,p){try{const text=JSON.stringify(record);return [p.id,p.userId,p.schedulingId].filter(Boolean).some(ref=>text.includes(String(ref)));}catch{return false;}}
  async function deleteSelectedPerson(){
    if(!isAdmin()){if(typeof toast==='function')toast('Administrator access required');return;}
    const p=db.personnel.find(x=>x.id===selectedPersonId);if(!p)return;
    const linked=Array.isArray(db.jobs)?db.jobs.filter(j=>referencesPerson(j,p)).length:0;
    const account=accountFor(p),name=p.displayName||'this person';
    const accountText=account?' Their TTT OS login will be disabled and unlinked.':'';
    const warning=linked?`${name} is referenced by ${linked} job record${linked===1?'':'s'}. Delete the personnel profile? Historical job references will be preserved.${accountText}`:`Delete ${name}? This removes the personnel profile.${accountText} This cannot be undone.`;
    if(!window.confirm(warning))return;
    if(account){
      const {error}=await window.TTTCloud.client.from('profiles')
        .update({active:false,person_id:null})
        .eq('organization_id',window.TTTCloud.organizationId)
        .eq('user_id',account.user_id);
      if(error){window.alert('The linked TTT OS account could not be disabled: '+error.message);return;}
      accountByPerson.delete(p.id);
    }
    db.personnel=db.personnel.filter(x=>x.id!==p.id);
    const user=db.users.find(u=>u.id===p.userId||u.personId===p.id);
    if(linked&&user){user.active=false;user.personId=null;user.deletedPersonnelProfile=true;}
    else db.users=db.users.filter(u=>u.id!==p.userId&&u.personId!==p.id);
    if(window.TTTSchedulingCore){
      const scheduling=window.TTTSchedulingCore.ensureModel(db);
      if(Array.isArray(scheduling.technicians)){
        const match=t=>t.id===p.schedulingId||t.personId===p.id;
        if(linked)scheduling.technicians.forEach(t=>{if(match(t)){t.active=false;t.personId=null;}});
        else scheduling.technicians=scheduling.technicians.filter(t=>!match(t));
      }
    }
    save();selectedPersonId=null;dirty=false;renderStats();renderDirectory();renderEditor();
    if(typeof toast==='function')toast(`${name} deleted`);
  }

  function showSkillsMatrix(){const box=document.getElementById('skillsMatrix');if(!box)return;const people=activePeople();box.innerHTML=`<div class="panel-head"><div><h3>Skills matrix</h3><p class="muted">1 Awareness · 2 Basic · 3 Working · 4 Advanced · 5 Expert. Scheduling uses level 3+.</p></div><button class="link-btn" id="closeSkillsMatrixBtn">Close</button></div><div class="table-wrap"><table class="skills-table"><thead><tr><th>Skill</th>${people.map(p=>`<th>${e(p.displayName)}</th>`).join('')}</tr></thead><tbody>${SKILL_CATALOG.map(s=>`<tr><td><strong>${e(s.name)}</strong><small>${e(s.category)}</small></td>${people.map(p=>{const x=(p.skills||[]).find(k=>k.name===s.name);return `<td>${x?`<span class="skill-level level-${Number(x.level||0)}">${Number(x.level||0)}</span>`:'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;box.classList.remove('hidden');document.getElementById('closeSkillsMatrixBtn')?.addEventListener('click',()=>box.classList.add('hidden'));}

  function install(){
    if(typeof db==='undefined'||typeof save!=='function'||typeof show!=='function'){setTimeout(install,40);return;}
    ensureModel();injectShell();loadAccountLinks();
    window.addEventListener('ttt:cloud-state-applied',()=>{accountsLoaded=false;loadAccountLinks(true);});
    window.addEventListener('ttt:account-updated',()=>{accountsLoaded=false;loadAccountLinks(true);});
    window.TTTPersonnel={VERSION,render:renderPeople,ensureModel,syncScheduling,loadAccountLinks,get dirty(){return dirty;}};
  }
  install();
})();