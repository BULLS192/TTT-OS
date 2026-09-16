// TTT Personnel v0.3.1 — seed Amjad Kharoof once at Derek Thompson's operational/access level without overwriting later edits.
(function(){
  'use strict';
  const VERSION='0.3.1';

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function now(){return new Date().toISOString();}

  function install(){
    if(typeof db==='undefined'||typeof save!=='function'){setTimeout(install,80);return;}
    if(!Array.isArray(db.personnel))db.personnel=[];
    if(!Array.isArray(db.users))db.users=[];

    const derek=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='derek thompson');
    if(!derek){setTimeout(install,120);return;}

    let amjad=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='amjad kharoof');
    if(amjad){
      window.TTTPersonnelSeed={VERSION,amjadId:amjad.id};
      return;
    }

    amjad={
      id:'per_amjad',userId:'usr_amjad',displayName:'Amjad Kharoof',firstName:'Amjad',lastName:'Kharoof',
      relationship:'Partner',jobTitle:'Partner / Lead Technician',department:derek.department||'Operations',status:'Active',email:'',phone:'',
      schedulingEligible:true,roles:clone(derek.roles||['owner_admin','manager','technician']),skills:clone(derek.skills||[]),
      certifications:[],availability:clone(derek.availability||{start:'08:00',end:'18:00',maxWeeklyHours:50}),startDate:'',notes:'',
      createdAt:now(),updatedAt:now(),schedulingId:'tech_amjad'
    };
    db.personnel.push(amjad);

    const user={id:amjad.userId,name:'Amjad Kharoof',email:'',role:amjad.roles[0]||'owner_admin',roles:clone(amjad.roles),active:true,personId:amjad.id,created_at:amjad.createdAt};
    db.users.push(user);
    if(window.TTTPersonnel?.syncScheduling)window.TTTPersonnel.syncScheduling(false);
    save();
    if(document.getElementById('people')?.classList.contains('active')&&window.TTTPersonnel?.render)window.TTTPersonnel.render();
    window.TTTPersonnelSeed={VERSION,amjadId:amjad.id};
  }

  install();
})();
