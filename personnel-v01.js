(function(){
  'use strict';

  const VERSION='0.1';
  const RELATIONSHIPS=['Owner','Partner','Employee','Contractor','Advisor'];
  const DEPARTMENTS=['Executive','Operations','Installation','Diagnostics','Sales','Administration','Marketing','Finance','Other'];
  const STATUSES=['Active','Onboarding','Leave','Inactive'];
  const ROLE_OPTIONS=[
    ['owner_admin','Owner / Administrator'],
    ['partner_admin','Partner / Administrator'],
    ['manager','Manager'],
    ['technician','Technician'],
    ['service_advisor','Service Advisor'],
    ['sales','Sales'],
    ['office','Office / Administration'],
    ['read_only','Read only']
  ];
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

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function now(){return new Date().toISOString();}
  function personUid(){return 'per_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function userUid(){return 'usr_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function certUid(){return 'cert_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function e(v=''){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function ensurePeopleModel(){
    if(!Array.isArray(db.users))db.users=[];
    if(!Array.isArray(db.personnel))db.personnel=[];

    let derek=db.personnel.find(p=>p.userId==='usr_derek'||String(p.displayName||'').toLowerCase()==='derek thompson');
    if(!derek){
      derek={
        id:'per_derek',userId:'usr_derek',displayName:'Derek Thompson',firstName:'Derek',lastName:'Thompson',
        relationship:'Owner',jobTitle:'Owner / Lead Technician',department:'Operations',status:'Active',email:'',phone:'',
        schedulingEligible:true,roles:['owner_admin','manager','technician'],
        skills:[
          {name:'General technician',level:5},{name:'Tint installer',level:5},{name:'Audio technician',level:5},
          {name:'Electronics',level:5},{name:'Film installer',level:4},{name:'Vehicle diagnostics',level:5},{name:'12V wiring',level:5}
        ],
        certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:50},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:'tech_derek'
      };
      db.personnel.push(derek);
    }

    let kevin=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='kevin yap');
    if(!kevin){
      const existingUser=db.users.find(u=>String(u.name||'').toLowerCase()==='kevin yap');
      kevin={
        id:'per_kevin',userId:existingUser?.id||'usr_kevin',displayName:'Kevin Yap',firstName:'Kevin',lastName:'Yap',
        relationship:'Partner',jobTitle:'Partner',department:'Executive',status:'Active',email:'',phone:'',
        schedulingEligible:false,roles:['partner_admin'],
        skills:[{name:'Business development',level:5},{name:'Sales',level:5},{name:'Project management',level:4}],
        certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:40},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:'tech_kevin'
      };
      db.personnel.push(kevin);
    }

    db.personnel.forEach(p=>{
      if(!p.id)p.id=personUid();
      if(!p.userId)p.userId=userUid();
      if(!Array.isArray(p.roles))p.roles=[];
      if(!Array.isArray(p.skills))p.skills=[];
      if(!Array.isArray(p.certifications))p.certifications=[];
      if(!p.availability)p.availability={start:'08:00',end:'18:00',maxWeeklyHours:40};
      if(typeof p.schedulingEligible!=='boolean')p.schedulingEligible=false;
      const u=db.users.find(x=>x.id===p.userId);
      if(!u)db.users.push({id:p.userId,name:p.displayName,email:p.email||'',role:p.roles[0]||'read_only',roles:clone(p.roles),active:p.status==='Active',personId:p.id,created_at:p.createdAt||now()});
      else{
        u.name=p.displayName;u.email=p.email||u.email||'';u.role=p.roles[0]||u.role||'read_only';u.roles=clone(p.roles);u.active=p.status==='Active';u.personId=p.id;
      }
    });
    syncScheduling(false);
    save();
  }

  function syncScheduling(shouldSave=true){
    if(!window.TTTSchedulingCore)return;
    const scheduling=window.TTTSchedulingCore.ensureModel(db);
    db.personnel.forEach(p=>{
      const id=p.schedulingId||('tech_'+p.id.replace(/^per_/,''));
      p.schedulingId=id;
      let tech=scheduling.technicians.find(t=>t.id===id||String(t.name||'').toLowerCase()===String(p.displayName||'').toLowerCase());
      const skillNames=(p.skills||[]).filter(s=>Number(s.level||0)>=SCHEDULING_LEVEL).map(s=>s.name);
      const payload={id,name:p.displayName,active:p.status==='Active'&&p.schedulingEligible,skills:skillNames,workingHours:{start:p.availability?.start||'08:00',end:p.availability?.end||'18:00'},personId:p.id};
      if(tech)Object.assign(tech,payload);else if(p.schedulingEligible)scheduling.technicians.push(payload);
    });
    scheduling.technicians.forEach(t=>{
      if(t.personId&&!db.personnel.some(p=>p.id===t.personId&&p.status==='Active'&&p.schedulingEligible))t.active=false;
    });
    if(shouldSave)save();
  }

  function injectShell(){
    if(!document.querySelector('link[data-ttt-personnel]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='/personnel-v01.css?v=20260916-personnel-v1';link.dataset.tttPersonnel='1';document.head.appendChild(link);
    }
    if(!document.querySelector('.nav-item[data-view="people"]')){
      const btn=document.createElement('button');btn.className='nav-item';btn.dataset.view='people';btn.textContent='People';btn.onclick=()=>show('people');
      const warranty=document.querySelector('.nav-item[data-view="warranty"]');
      (warranty?.parentNode||document.querySelector('.sidebar nav'))?.insertBefore(btn,warranty||null);
    }
    if(!document.getElementById('people')){
      const section=document.createElement('section');section.id='people';section.className='view';
      const settings=document.getElementById('settings');
      (settings?.parentNode||document.querySelector('main.main'))?.insertBefore(section,settings||null);
    }
  }

  function activePeople(){return db.personnel.filter(p=>p.status==='Active');}
  function certExpiring(p,days=90){
    const limit=Date.now()+days*86400000;
    return (p.certifications||[]).some(c=>c.expires&&new Date(c.expires).getTime()>=Date.now()&&new Date(c.expires).getTime()<=limit);
  }
  function displayRole(p){return p.jobTitle||p.relationship||'Team member';}
  function initials(p){return (p.displayName||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();}
  function coverageCount(){
    const covered=new Set();
    activePeople().filter(p=>p.schedulingEligible).forEach(p=>(p.skills||[]).filter(s=>Number(s.level)>=SCHEDULING_LEVEL).forEach(s=>covered.add(s.name)));
    return covered.size;
  }

  function filteredPeople(){
    return db.personnel.filter(p=>{
      if(peopleFilter!=='All'&&p.status!==peopleFilter)return false;
      const q=searchTerm.trim().toLowerCase();
      if(!q)return true;
      return [p.displayName,p.jobTitle,p.department,p.relationship,...(p.skills||[]).map(s=>s.name)].join(' ').toLowerCase().includes(q);
    });
  }

  function renderPeople(){
    const root=document.getElementById('people');if(!root)return;
    ensurePeopleModel();
    const active=activePeople();
    const schedule=active.filter(p=>p.schedulingEligible).length;
    const expiring=db.personnel.filter(p=>certExpiring(p)).length;
    root.innerHTML=`
      <div class="section-head people-head"><div><p class="eyebrow">TEAM & CAPABILITY</p><h2>People</h2><p class="muted">Personnel, roles, skills, certifications and scheduling eligibility in one place.</p></div><button class="btn primary" id="addPersonBtn">+ Add person</button></div>
      <div class="people-stats">
        <div class="stat"><span>Active people</span><strong>${active.length}</strong></div>
        <div class="stat"><span>Schedule eligible</span><strong>${schedule}</strong></div>
        <div class="stat"><span>Operational skills covered</span><strong>${coverageCount()}</strong></div>
        <div class="stat"><span>Certifications expiring ≤90d</span><strong>${expiring}</strong></div>
      </div>
      <div class="people-toolbar panel">
        <div class="status-filters" id="peopleFilters">${['All',...STATUSES].map(x=>`<button class="filter ${peopleFilter===x?'active':''}" data-people-filter="${e(x)}">${e(x)}</button>`).join('')}</div>
        <input id="peopleSearch" class="people-search" placeholder="Search people, roles or skills…" value="${e(searchTerm)}">
      </div>
      <div class="people-layout">
        <article class="panel people-directory">
          <div class="panel-head"><div><h3>Directory</h3><p class="muted">${filteredPeople().length} record${filteredPeople().length===1?'':'s'}</p></div><button class="link-btn" id="skillsMatrixBtn">Skills matrix</button></div>
          <div id="peopleList">${directoryHtml()}</div>
        </article>
        <aside id="personPanel">${selectedPersonId?personEditorHtml(db.personnel.find(p=>p.id===selectedPersonId)):overviewHtml()}</aside>
      </div>
      <div id="skillsMatrix" class="panel skills-matrix-panel hidden">${skillsMatrixHtml()}</div>`;
    bindPeopleEvents();
  }

  function directoryHtml(){
    const rows=filteredPeople();
    if(!rows.length)return '<div class="people-empty">No personnel match this view.</div>';
    return rows.map(p=>{
      const operational=(p.skills||[]).filter(s=>Number(s.level)>=SCHEDULING_LEVEL).slice(0,4);
      return `<button class="person-card ${selectedPersonId===p.id?'selected':''}" data-person-id="${e(p.id)}">
        <span class="person-avatar">${e(initials(p))}</span>
        <span class="person-main"><strong>${e(p.displayName)}</strong><small>${e(displayRole(p))} · ${e(p.department||'Unassigned')}</small><span class="person-skills">${operational.map(s=>`<em>${e(s.name)}</em>`).join('')||'<em>No operational skills set</em>'}</span></span>
        <span class="person-meta"><span class="badge ${p.status==='Active'?'person-active':''}">${e(p.status)}</span>${p.schedulingEligible?'<small>Scheduling ✓</small>':'<small>Not scheduled</small>'}</span>
      </button>`;
    }).join('');
  }

  function overviewHtml(){
    return `<article class="panel people-overview"><h3>Personnel system</h3><p class="muted">Select a person to edit their HR/operations profile.</p>
      <div class="people-rule"><strong>Skills drive scheduling</strong><span>Skills rated Working or higher are synced to Operations & Scheduling when “Scheduling eligible” is enabled.</span></div>
      <div class="people-rule"><strong>Roles drive access</strong><span>Roles are stored separately from job title so permissions can grow into proper role-based access control.</span></div>
      <div class="people-rule"><strong>Private HR data</strong><span>Keep SSNs, banking, I-9s and other sensitive documents out of this browser prototype until authenticated secure storage is added.</span></div>
    </article>`;
  }

  function personEditorHtml(p){
    if(!p)return overviewHtml();
    return `<article class="panel person-editor">
      <div class="person-editor-head"><div class="person-avatar large">${e(initials(p))}</div><div><p class="eyebrow">PERSONNEL PROFILE</p><h3>${e(p.displayName)}</h3><span>${e(p.relationship)} · ${e(p.status)}</span></div></div>
      <form id="personForm" data-person-id="${e(p.id)}">
        <div class="person-form-grid">
          <label>First name<input name="firstName" required value="${e(p.firstName||'')}"></label>
          <label>Last name<input name="lastName" required value="${e(p.lastName||'')}"></label>
          <label>Relationship<select name="relationship">${RELATIONSHIPS.map(x=>`<option ${x===p.relationship?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label>Status<select name="status">${STATUSES.map(x=>`<option ${x===p.status?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label class="span-2">Job title<input name="jobTitle" value="${e(p.jobTitle||'')}"></label>
          <label>Department<select name="department">${DEPARTMENTS.map(x=>`<option ${x===p.department?'selected':''}>${e(x)}</option>`).join('')}</select></label>
          <label>Start date<input type="date" name="startDate" value="${e(p.startDate||'')}"></label>
          <label>Email<input type="email" name="email" value="${e(p.email||'')}"></label>
          <label>Phone<input name="phone" value="${e(p.phone||'')}"></label>
        </div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>System roles</strong><span>Access model, independent of job title.</span></div></div>
          <div class="role-checks">${ROLE_OPTIONS.map(([id,label])=>`<label><input type="checkbox" name="roles" value="${e(id)}" ${(p.roles||[]).includes(id)?'checked':''}> ${e(label)}</label>`).join('')}</div>
        </div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Operations & scheduling</strong><span>Controls whether this person can be assigned shop operations.</span></div></div>
          <label class="schedule-toggle"><input type="checkbox" name="schedulingEligible" ${p.schedulingEligible?'checked':''}> <span><strong>Scheduling eligible</strong><small>Only skills at Working (3) or above become scheduling capabilities.</small></span></label>
          <div class="person-form-grid compact-grid"><label>Standard start<input type="time" name="workStart" value="${e(p.availability?.start||'08:00')}"></label><label>Standard end<input type="time" name="workEnd" value="${e(p.availability?.end||'18:00')}"></label><label>Max weekly hours<input type="number" min="0" max="100" name="maxWeeklyHours" value="${e(p.availability?.maxWeeklyHours??40)}"></label></div>
        </div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Skills</strong><span>Capability matrix used by Operations.</span></div><button type="button" class="btn secondary compact" id="addCustomSkillBtn">+ Custom skill</button></div>
          <div class="skill-editor" id="skillEditor">${skillEditorHtml(p)}</div>
        </div>
        <div class="person-subsection"><div class="subsection-title"><div><strong>Certifications & licenses</strong><span>Track expirations before work is assigned.</span></div><button type="button" class="btn secondary compact" id="addCertBtn">+ Add</button></div><div id="certEditor">${certEditorHtml(p)}</div></div>
        <label class="person-notes">Notes<textarea name="notes" placeholder="Responsibilities, onboarding notes, operating restrictions, etc.">${e(p.notes||'')}</textarea></label>
        <div class="person-form-actions"><button type="button" class="btn secondary" id="closePersonBtn">Close</button><button type="submit" class="btn primary">Save profile</button></div>
      </form>
    </article>`;
  }

  function skillEditorHtml(p){
    const byName=new Map((p.skills||[]).map(s=>[s.name,s]));
    const names=[...SKILL_CATALOG.map(s=>s.name),...(p.skills||[]).map(s=>s.name).filter(n=>!SKILL_CATALOG.some(x=>x.name===n))];
    return names.map(name=>{const s=byName.get(name);return `<div class="skill-row"><label><input type="checkbox" data-skill-enabled="${e(name)}" ${s?'checked':''}> <span>${e(name)}</span></label><select data-skill-level="${e(name)}" ${s?'':'disabled'}>${Object.entries(LEVELS).map(([v,l])=>`<option value="${v}" ${Number(s?.level||3)===Number(v)?'selected':''}>${v} · ${e(l)}</option>`).join('')}</select></div>`;}).join('');
  }

  function certEditorHtml(p){
    if(!(p.certifications||[]).length)return '<div class="mini-empty">No certifications recorded.</div>';
    return p.certifications.map(c=>`<div class="cert-row" data-cert-id="${e(c.id)}"><input data-cert-name placeholder="Certification / license" value="${e(c.name||'')}"><input data-cert-issuer placeholder="Issuer" value="${e(c.issuer||'')}"><input data-cert-expires type="date" value="${e(c.expires||'')}"><button type="button" class="link-btn danger" data-remove-cert="${e(c.id)}">Remove</button></div>`).join('');
  }

  function skillsMatrixHtml(){
    const people=activePeople();
    return `<div class="panel-head"><div><h3>Skills matrix</h3><p class="muted">1 Awareness · 2 Basic · 3 Working · 4 Advanced · 5 Expert. Scheduling uses level 3+.</p></div><button class="link-btn" id="closeSkillsMatrixBtn">Close</button></div>
      <div class="table-wrap"><table class="skills-table"><thead><tr><th>Skill</th>${people.map(p=>`<th>${e(p.displayName)}</th>`).join('')}</tr></thead><tbody>${SKILL_CATALOG.map(s=>`<tr><td><strong>${e(s.name)}</strong><small>${e(s.category)}</small></td>${people.map(p=>{const x=(p.skills||[]).find(k=>k.name===s.name);return `<td>${x?`<span class="skill-level level-${Number(x.level||0)}">${Number(x.level||0)}</span>`:'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function bindPeopleEvents(){
    document.getElementById('addPersonBtn')?.addEventListener('click',()=>{const p=createBlankPerson();db.personnel.push(p);save();selectedPersonId=p.id;renderPeople();});
    document.querySelectorAll('[data-people-filter]').forEach(b=>b.addEventListener('click',()=>{peopleFilter=b.dataset.peopleFilter;renderPeople();}));
    const search=document.getElementById('peopleSearch');if(search)search.addEventListener('input',()=>{searchTerm=search.value;const list=document.getElementById('peopleList');if(list)list.innerHTML=directoryHtml();bindDirectoryOnly();});
    bindDirectoryOnly();
    document.getElementById('skillsMatrixBtn')?.addEventListener('click',()=>document.getElementById('skillsMatrix')?.classList.remove('hidden'));
    document.getElementById('closeSkillsMatrixBtn')?.addEventListener('click',()=>document.getElementById('skillsMatrix')?.classList.add('hidden'));
    bindEditorEvents();
  }
  function bindDirectoryOnly(){document.querySelectorAll('[data-person-id]').forEach(b=>b.addEventListener('click',()=>{selectedPersonId=b.dataset.personId;renderPeople();}));}
  function bindEditorEvents(){
    const form=document.getElementById('personForm');if(!form)return;
    form.addEventListener('submit',savePersonForm);
    document.getElementById('closePersonBtn')?.addEventListener('click',()=>{selectedPersonId=null;renderPeople();});
    document.querySelectorAll('[data-skill-enabled]').forEach(cb=>cb.addEventListener('change',()=>{const sel=document.querySelector(`[data-skill-level="${cssEscape(cb.dataset.skillEnabled)}"]`);if(sel)sel.disabled=!cb.checked;}));
    document.getElementById('addCustomSkillBtn')?.addEventListener('click',()=>{
      const name=window.prompt('Custom skill name');if(!name?.trim())return;const p=db.personnel.find(x=>x.id===selectedPersonId);if(!p)return;if(!(p.skills||[]).some(s=>s.name.toLowerCase()===name.trim().toLowerCase()))p.skills.push({name:name.trim(),level:3});save();renderPeople();
    });
    document.getElementById('addCertBtn')?.addEventListener('click',()=>{const p=db.personnel.find(x=>x.id===selectedPersonId);if(!p)return;p.certifications.push({id:certUid(),name:'',issuer:'',expires:''});save();renderPeople();});
    document.querySelectorAll('[data-remove-cert]').forEach(b=>b.addEventListener('click',()=>{const p=db.personnel.find(x=>x.id===selectedPersonId);if(!p)return;p.certifications=p.certifications.filter(c=>c.id!==b.dataset.removeCert);save();renderPeople();}));
  }
  function cssEscape(v){return window.CSS&&CSS.escape?CSS.escape(v):String(v).replace(/["\\]/g,'\\$&');}

  function savePersonForm(ev){
    ev.preventDefault();const form=ev.currentTarget;const p=db.personnel.find(x=>x.id===form.dataset.personId);if(!p)return;
    const fd=new FormData(form);
    p.firstName=String(fd.get('firstName')||'').trim();p.lastName=String(fd.get('lastName')||'').trim();p.displayName=[p.firstName,p.lastName].filter(Boolean).join(' ');
    p.relationship=fd.get('relationship');p.status=fd.get('status');p.jobTitle=String(fd.get('jobTitle')||'').trim();p.department=fd.get('department');p.startDate=fd.get('startDate')||'';
    p.email=String(fd.get('email')||'').trim();p.phone=String(fd.get('phone')||'').trim();p.roles=fd.getAll('roles');p.schedulingEligible=fd.get('schedulingEligible')==='on';
    p.availability={start:fd.get('workStart')||'08:00',end:fd.get('workEnd')||'18:00',maxWeeklyHours:Number(fd.get('maxWeeklyHours')||40)};
    p.notes=String(fd.get('notes')||'').trim();p.updatedAt=now();
    p.skills=[];document.querySelectorAll('[data-skill-enabled]').forEach(cb=>{if(!cb.checked)return;const name=cb.dataset.skillEnabled;const sel=document.querySelector(`[data-skill-level="${cssEscape(name)}"]`);p.skills.push({name,level:Number(sel?.value||3)});});
    p.certifications=(p.certifications||[]).map(c=>{const row=document.querySelector(`[data-cert-id="${cssEscape(c.id)}"]`);return row?{id:c.id,name:row.querySelector('[data-cert-name]')?.value.trim()||'',issuer:row.querySelector('[data-cert-issuer]')?.value.trim()||'',expires:row.querySelector('[data-cert-expires]')?.value||''}:c;}).filter(c=>c.name||c.issuer||c.expires);
    const u=db.users.find(x=>x.id===p.userId);if(u){u.name=p.displayName;u.email=p.email;u.role=p.roles[0]||'read_only';u.roles=clone(p.roles);u.active=p.status==='Active';u.personId=p.id;}
    syncScheduling(false);save();renderPeople();if(typeof toast==='function')toast('Personnel profile saved');
  }

  function createBlankPerson(){return {id:personUid(),userId:userUid(),displayName:'New Person',firstName:'',lastName:'',relationship:'Employee',jobTitle:'',department:'Operations',status:'Onboarding',email:'',phone:'',schedulingEligible:false,roles:[],skills:[],certifications:[],availability:{start:'08:00',end:'18:00',maxWeeklyHours:40},startDate:'',notes:'',createdAt:now(),updatedAt:now(),schedulingId:''};}

  function install(){
    if(typeof db==='undefined'||typeof save!=='function'||typeof show!=='function'){setTimeout(install,50);return;}
    injectShell();ensurePeopleModel();
    const baseRender=render;
    render=function(){baseRender();if(document.getElementById('people')?.classList.contains('active'))renderPeople();};
    const nav=document.querySelector('.nav-item[data-view="people"]');if(nav)nav.onclick=()=>{show('people');renderPeople();};
    window.TTTPersonnel={VERSION,render:renderPeople,syncScheduling,ensureModel:ensurePeopleModel};
  }
  install();
})();
