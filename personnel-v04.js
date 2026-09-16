// TTT Personnel v0.4 — interaction stability + safe delete support.
(function(){
  'use strict';
  const VERSION='0.4';
  let editingLock=false;
  let observer=null;

  function peopleRoot(){return document.getElementById('people');}
  function peopleActive(){return !!peopleRoot()?.classList.contains('active');}
  function personForm(){return document.getElementById('personForm');}
  function inPersonForm(node){return !!node?.closest?.('#personForm');}

  function addStyles(){
    if(document.getElementById('ttt-personnel-v04-style'))return;
    const style=document.createElement('style');
    style.id='ttt-personnel-v04-style';
    style.textContent=`
      #people .person-editor{position:static!important;top:auto!important;}
      #people select,#people input,#people textarea{pointer-events:auto!important;}
      #people .person-delete-btn{margin-right:auto;border-color:#efc6c6;color:#9b2f2f;background:#fff7f7;}
      #people .person-delete-btn:hover{background:#fff0f0;border-color:#dfaaaa;}
    `;
    document.head.appendChild(style);
  }

  function installRenderGuard(){
    if(window.__TTTPersonnelRenderGuardInstalled)return;
    if(typeof render!=='function'){setTimeout(installRenderGuard,50);return;}
    const inheritedRender=render;
    render=function(){
      const root=peopleRoot();
      const shouldProtect=!!(root?.classList.contains('active')&&editingLock&&personForm());
      if(!shouldProtect)return inheritedRender();
      root.classList.remove('active');
      try{return inheritedRender();}
      finally{root.classList.add('active');}
    };
    window.__TTTPersonnelRenderGuardInstalled=true;
  }

  function referencesPerson(record,p){
    if(!record||!p)return false;
    let text='';
    try{text=JSON.stringify(record);}catch{return false;}
    return [p.id,p.userId,p.schedulingId].filter(Boolean).some(ref=>text.includes(String(ref)));
  }

  function linkedJobCount(p){
    return Array.isArray(db?.jobs)?db.jobs.filter(j=>referencesPerson(j,p)).length:0;
  }

  function removeSchedulingIdentity(p,keepHistory){
    if(!window.TTTSchedulingCore)return;
    const scheduling=window.TTTSchedulingCore.ensureModel(db);
    if(!Array.isArray(scheduling?.technicians))return;
    const matches=t=>t?.personId===p.id||t?.id===p.schedulingId||String(t?.name||'').toLowerCase()===String(p.displayName||'').toLowerCase();
    if(keepHistory){
      scheduling.technicians.forEach(t=>{if(matches(t)){t.active=false;t.personId=null;}});
    }else{
      scheduling.technicians=scheduling.technicians.filter(t=>!matches(t));
    }
  }

  function deleteSelectedPerson(){
    const form=personForm();
    const id=form?.dataset.personId;
    const p=Array.isArray(db?.personnel)?db.personnel.find(x=>x.id===id):null;
    if(!p)return;
    const linked=linkedJobCount(p);
    const name=p.displayName||[p.firstName,p.lastName].filter(Boolean).join(' ')||'this person';
    const warning=linked
      ? `${name} is referenced by ${linked} job record${linked===1?'':'s'}. Delete the personnel profile? Historical job references will be preserved and the system identity will be disabled.`
      : `Delete ${name} from TTT personnel? This removes the personnel profile and its unused system/scheduling identity. This cannot be undone.`;
    if(!window.confirm(warning))return;

    db.personnel=db.personnel.filter(x=>x.id!==p.id);
    if(Array.isArray(db.users)){
      const user=db.users.find(u=>u.id===p.userId||u.personId===p.id);
      if(linked&&user){user.active=false;user.personId=null;user.deletedPersonnelProfile=true;}
      else db.users=db.users.filter(u=>u.id!==p.userId&&u.personId!==p.id);
    }
    removeSchedulingIdentity(p,linked>0);
    if(typeof save==='function')save();
    editingLock=false;
    window.TTTPersonnel?.render?.();
    if(typeof toast==='function')toast(`${name} deleted`);
  }

  function ensureDeleteButton(){
    const form=personForm();
    if(!form||form.querySelector('#deletePersonBtn'))return;
    const actions=form.querySelector('.person-form-actions');
    if(!actions)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.id='deletePersonBtn';
    btn.className='btn secondary person-delete-btn';
    btn.textContent='Delete person';
    btn.addEventListener('click',deleteSelectedPerson);
    actions.insertBefore(btn,actions.firstChild);
  }

  function observePeople(){
    const root=peopleRoot();
    if(!root){setTimeout(observePeople,60);return;}
    observer?.disconnect();
    observer=new MutationObserver(()=>{
      if(personForm())requestAnimationFrame(ensureDeleteButton);
      else editingLock=false;
    });
    observer.observe(root,{childList:true,subtree:true});
    ensureDeleteButton();
  }

  function installPublicRenderGuard(){
    if(!window.TTTPersonnel?.render||window.__TTTPersonnelPublicRenderGuardInstalled)return;
    const inheritedPeopleRender=window.TTTPersonnel.render;
    window.TTTPersonnel.render=function(){
      if(peopleActive()&&editingLock&&personForm())return;
      return inheritedPeopleRender.apply(this,arguments);
    };
    window.__TTTPersonnelPublicRenderGuardInstalled=true;
  }

  function installInteractionTracking(){
    document.addEventListener('pointerdown',ev=>{if(inPersonForm(ev.target))editingLock=true;},true);
    document.addEventListener('focusin',ev=>{if(inPersonForm(ev.target))editingLock=true;},true);
    document.addEventListener('input',ev=>{if(inPersonForm(ev.target))editingLock=true;},true);
    document.addEventListener('change',ev=>{if(inPersonForm(ev.target))editingLock=true;},true);
    document.addEventListener('submit',ev=>{if(ev.target?.id==='personForm')editingLock=false;},true);
    document.addEventListener('click',ev=>{
      if(ev.target?.closest?.('#closePersonBtn,[data-person-id],#addPersonBtn,[data-people-filter]'))editingLock=false;
    },true);
  }

  function install(){
    addStyles();
    installRenderGuard();
    installPublicRenderGuard();
    installInteractionTracking();
    observePeople();
    window.TTTPersonnelInteraction={VERSION,get editing(){return editingLock;},ensureDeleteButton};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
