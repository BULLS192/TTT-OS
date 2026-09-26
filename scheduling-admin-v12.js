// TTT OS Scheduling Admin v1.2 — configurable shop resources and service-time templates.
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function canManage(){return ['owner_admin','manager'].includes(window.TTTCloud?.profile?.role);}
function model(){
  try{if(window.TTTSchedulingCore&&typeof db!=='undefined')return window.TTTSchedulingCore.ensureModel(db);}catch(e){}
  return null;
}
function notify(m){if(typeof toast==='function')toast(m);else console.log(m);}
function persist(msg){try{if(typeof save==='function')save();}catch(e){console.error(e);}window.TTTOperationalRelational?.syncNow?.();notify(msg);setTimeout(()=>{window.TTTSchedulerV10?.render?.();window.TTTSchedulingUI?.renderOperations?.();decorate();},120);}
function skillNames(){
  let out=new Set(['General technician','Tint installer','Audio technician','Electronics','Film installer']);
  try{(db.personnel||[]).forEach(p=>(p.skills||[]).forEach(s=>{if(s.name)out.add(s.name);}));}catch(e){}
  return [...out].sort();
}
function resourceTypes(){
  const s=model();let out=new Set(['tint','install','diagnostic','detail','lift','fabrication','general']);
  (s?.resources||[]).forEach(r=>{if(r.type)out.add(r.type);});
  return [...out].sort();
}
function css(){
 if(document.getElementById('ttt-schedule-admin-css'))return;
 const s=document.createElement('style');s.id='ttt-schedule-admin-css';s.textContent=
 '.sched-admin-actions{display:flex;gap:7px;flex-wrap:wrap}.sched-config-backdrop{position:fixed;inset:0;background:#07101dcc;z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:6vh 14px 24px}.sched-config-modal{width:min(980px,100%);max-height:88vh;overflow:auto;background:#f7f9fc;border-radius:16px;box-shadow:0 24px 70px #0005}.sched-config-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:15px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}.sched-config-body{padding:16px}.sched-config-grid{display:grid;gap:10px}.sched-config-row{background:#fff;border:1px solid #dfe6ee;border-radius:11px;padding:11px;display:grid;grid-template-columns:1.25fr .8fr 1.5fr 90px auto;gap:8px;align-items:end}.sched-config-row.template{grid-template-columns:1.35fr 90px 90px 1fr 1.1fr 90px auto}.sched-config-row label{font-size:10px;color:#64748b;font-weight:750}.sched-config-row input,.sched-config-row select{width:100%;box-sizing:border-box;margin-top:4px;padding:8px;border:1px solid #d5dee9;border-radius:8px;background:#fff}.sched-config-row .check{display:flex;gap:6px;align-items:center}.sched-config-row .check input{width:auto;margin:0}.sched-config-note{font-size:10px;color:#6d7b8e}.sched-config-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}@media(max-width:850px){.sched-config-row,.sched-config-row.template{grid-template-columns:1fr 1fr}.sched-config-row label:first-child{grid-column:1/-1}}';
 document.head.appendChild(s);
}
function close(){document.getElementById('schedConfigBackdrop')?.remove();}
function resourceRow(r={}){
 const types=resourceTypes(),caps=Array.isArray(r.capabilities)?r.capabilities.join(', '):(r.capabilities||''),eq=Array.isArray(r.equipment)?r.equipment.join(', '):(r.equipment||'');
 return '<div class="sched-config-row" data-resource-id="'+esc(r.id||uid('res'))+'"><label>Name<input data-r="name" value="'+esc(r.name||'')+'" placeholder="e.g. Tint Bay 2"></label><label>Type<select data-r="type">'+types.map(x=>'<option '+(r.type===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label>Capabilities<input data-r="capabilities" value="'+esc(caps)+'" placeholder="tint, audio, diagnostics…"></label><label>Equipment<input data-r="equipment" value="'+esc(eq)+'" placeholder="lift, tint rack…"></label><label class="check"><input data-r="active" type="checkbox" '+(r.active!==false?'checked':'')+'> Active</label><button class="btn danger compact" type="button" data-delete-resource>Delete</button></div>';
}
function templateRow(t={}){
 const types=resourceTypes(),skills=skillNames();
 return '<div class="sched-config-row template" data-template-id="'+esc(t.id||uid('svc'))+'"><label>Service<input data-t="service" value="'+esc(t.service||'')+'" placeholder="Service name"></label><label>Default min<input data-t="defaultMinutes" type="number" min="5" step="5" value="'+esc(t.defaultMinutes??60)+'"></label><label>Buffer min<input data-t="bufferMinutes" type="number" min="0" step="5" value="'+esc(t.bufferMinutes??10)+'"></label><label>Resource type<select data-t="resourceType"><option value="">Any</option>'+types.map(x=>'<option '+(t.resourceType===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label>Required skill<select data-t="skill"><option value="">None</option>'+skills.map(x=>'<option '+(t.skill===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label class="check"><input data-t="active" type="checkbox" '+(t.active!==false?'checked':'')+'> Active</label><button class="btn danger compact" type="button" data-delete-template>Delete</button></div>';
}
function openResources(){
 if(!canManage())return notify('Manager or Administrator access is required to configure shop resources.');
 const s=model();if(!s)return;
 close();const b=document.createElement('div');b.id='schedConfigBackdrop';b.className='sched-config-backdrop';b.innerHTML='<div class="sched-config-modal"><div class="sched-config-head"><div><p class="eyebrow">SHOP CONFIGURATION</p><h3 style="margin:2px 0">Bays & Resources</h3><p class="muted" style="margin:0">Define capacity, bay purpose and equipment. Capabilities are descriptive now and can drive smarter assignment rules later.</p></div><button class="btn secondary" data-close>Close</button></div><div class="sched-config-body"><div class="sched-config-toolbar"><span class="sched-config-note">Examples: tint bay, install bay, diagnostic area, lift bay, fabrication area.</span><button class="btn primary compact" type="button" id="schedAddResource">+ Resource</button></div><div id="schedResourceRows" class="sched-config-grid">'+s.resources.map(resourceRow).join('')+'</div><div class="sched-admin-actions" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="schedSaveResources">Save resources</button></div></div></div>';document.body.appendChild(b);
 b.querySelector('[data-close]').onclick=close;b.onclick=e=>{if(e.target===b)close();};
 const rows=b.querySelector('#schedResourceRows');
 b.querySelector('#schedAddResource').onclick=()=>{rows.insertAdjacentHTML('beforeend',resourceRow({name:'New Resource',type:'general',active:true}));bindDeleteResources(rows);};
 bindDeleteResources(rows);
 b.querySelector('#schedSaveResources').onclick=()=>{
   const next=[...rows.querySelectorAll('[data-resource-id]')].map(row=>({id:row.dataset.resourceId,name:row.querySelector('[data-r="name"]').value.trim(),type:row.querySelector('[data-r="type"]').value,capabilities:row.querySelector('[data-r="capabilities"]').value.split(',').map(x=>x.trim()).filter(Boolean),equipment:row.querySelector('[data-r="equipment"]').value.split(',').map(x=>x.trim()).filter(Boolean),active:row.querySelector('[data-r="active"]').checked})).filter(x=>x.name);
   s.resources.splice(0,s.resources.length,...next);persist('Shop resources updated');close();
 };
}
function bindDeleteResources(root){root.querySelectorAll('[data-delete-resource]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.onclick=()=>{const row=btn.closest('[data-resource-id]'),id=row.dataset.resourceId;let used=false;try{used=(model().operations||[]).some(o=>o.resourceId===id);}catch(e){}if(used&&!confirm('This resource has scheduled operations. Remove it from future scheduling anyway?'))return;row.remove();};});}
function openTemplates(){
 if(!canManage())return notify('Manager or Administrator access is required to configure service templates.');
 const s=model();if(!s)return;
 close();const b=document.createElement('div');b.id='schedConfigBackdrop';b.className='sched-config-backdrop';b.innerHTML='<div class="sched-config-modal"><div class="sched-config-head"><div><p class="eyebrow">OPERATIONS CONFIGURATION</p><h3 style="margin:2px 0">Service Time Templates</h3><p class="muted" style="margin:0">Default time, buffer, resource type and required skill used when Jobs are planned into Operations.</p></div><button class="btn secondary" data-close>Close</button></div><div class="sched-config-body"><div class="sched-config-toolbar"><span class="sched-config-note">Individual work operations can still override the default duration.</span><button class="btn primary compact" id="schedAddTemplate">+ Service template</button></div><div id="schedTemplateRows" class="sched-config-grid">'+s.serviceTemplates.map(templateRow).join('')+'</div><div class="sched-admin-actions" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="schedSaveTemplates">Save templates</button></div></div></div>';document.body.appendChild(b);
 b.querySelector('[data-close]').onclick=close;b.onclick=e=>{if(e.target===b)close();};
 const rows=b.querySelector('#schedTemplateRows');
 b.querySelector('#schedAddTemplate').onclick=()=>{rows.insertAdjacentHTML('beforeend',templateRow({service:'',defaultMinutes:60,bufferMinutes:10,resourceType:'general',skill:'General technician',active:true}));bindDeleteTemplates(rows);};
 bindDeleteTemplates(rows);
 b.querySelector('#schedSaveTemplates').onclick=()=>{
   const next=[...rows.querySelectorAll('[data-template-id]')].map(row=>({id:row.dataset.templateId,service:row.querySelector('[data-t="service"]').value.trim(),defaultMinutes:Math.max(5,Number(row.querySelector('[data-t="defaultMinutes"]').value||60)),bufferMinutes:Math.max(0,Number(row.querySelector('[data-t="bufferMinutes"]').value||0)),resourceType:row.querySelector('[data-t="resourceType"]').value,skill:row.querySelector('[data-t="skill"]').value,active:row.querySelector('[data-t="active"]').checked})).filter(x=>x.service);
   s.serviceTemplates.splice(0,s.serviceTemplates.length,...next);persist('Service time templates updated');close();
 };
}
function bindDeleteTemplates(root){root.querySelectorAll('[data-delete-template]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.onclick=()=>{const row=btn.closest('[data-template-id]'),id=row.dataset.templateId;let used=false;try{used=(model().operations||[]).some(o=>o.templateId===id);}catch(e){}if(used&&!confirm('This template has historical/scheduled operations. Remove the template from future planning? Existing operations will remain.'))return;row.remove();};});}
function decorate(){
 css();
 const sched=document.getElementById('schedulingBody');
 if(sched&&!sched.querySelector('[data-config-resources]')){
   const head=sched.querySelector('.v10-head');if(head){const wrap=document.createElement('div');wrap.className='sched-admin-actions';wrap.innerHTML='<button class="v10-chip-btn" type="button" data-config-resources>⚙ Bays & Resources</button>';head.appendChild(wrap);wrap.querySelector('[data-config-resources]').onclick=openResources;}
 }
 const ops=document.getElementById('operationsBody');
 if(ops&&!ops.querySelector('[data-config-templates]')){
   const head=ops.querySelector('.section-head');if(head){head.querySelector('h2')&&(head.querySelector('h2').textContent='Operations');const b=document.createElement('button');b.className='btn secondary';b.type='button';b.dataset.configTemplates='1';b.textContent='⚙ Service Templates';head.appendChild(b);b.onclick=openTemplates;}
 }
}
function install(){
 css();setInterval(decorate,900);document.addEventListener('click',e=>{if(e.target.closest('[data-shell-view="scheduling"],[data-shell-view="operations"]'))setTimeout(decorate,80);},true);setTimeout(decorate,250);
 window.TTTSchedulingAdmin={openResources,openTemplates,decorate};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();