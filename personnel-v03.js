// TTT Personnel v0.3 — seed Amjad Kharoof at Derek Thompson's operational/access level.
(function(){
  'use strict';
  const VERSION='0.3';

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function now(){return new Date().toISOString();}

  function install(){
    if(typeof db==='undefined'||typeof save!=='function'){setTimeout(install,80);return;}
    if(!Array.isArray(db.personnel))db.personnel=[];
    if(!Array.isArray(db.users))db.users=[];

    const derek=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='derek thompson');
    if(!derek){setTimeout(install,120);return;}

    let amjad=db.personnel.find(p=>String(p.displayName||'').toLowerCase()==='amjad kharoof');
    const base={
      relationship:'Partner',
      jobTitle:'Partner / Lead Technician',
      department:derek.department||'Operations',
      status:'Active',
      schedulingEligible:true,
      roles:clone(derek.roles||['owner_admin','manager','technician']),
      skills:clone(derek.skills||[]),
      certifications:[],
      availability:clone(derek.availability||{start:'08:00',end:'18:00',maxWeeklyHours:50}),
      startDate:'',
      notes:'',
      schedulingId:'tech_amjad'
    };

    if(!amjad){
      amjad={
        id:'per_amjad',userId:'usr_amjad',displayName:'Amjad Kharoof',firstName:'Amjad',lastName:'Kharoof',
        email:'',phone:'',createdAt:now(),updatedAt:now(),...base
      };
      db.personnel.push(amjad);
    }else{
      amjad.firstName=amjad.firstName||'Amjad';
      amjad.lastName=amjad.lastName||'Kharoof';
      amjad.displayName='Amjad Kharoof';
      amjad.relationship=base.relationship;
      amjad.jobTitle=base.jobTitle;
      amjad.department=base.department;
      amjad.status='Active';
      amjad.schedulingEligible=true;
      amjad.roles=clone(base.roles);
      amjad.skills=clone(base.skills);
      amjad.availability=clone(base.availability);
      amjad.schedulingId='tech_amjad';
      amjad.updatedAt=now();
    }

    let user=db.users.find(u=>u.id===amjad.userId||String(u.name||'').toLowerCase()==='amjad kharoof');
    if(!user){
      user={id:amjad.userId||'usr_amjad',name:'Amjad Kharoof',email:amjad.email||'',role:amjad.roles[0]||'owner_admin',roles:clone(amjad.roles),active:true,personId:amjad.id,created_at:amjad.createdAt||now()};
      db.users.push(user);
    }else{
      amjad.userId=user.id;
      user.name='Amjad Kharoof';
      user.role=amjad.roles[0]||'owner_admin';
      user.roles=clone(amjad.roles);
      user.active=true;
      user.personId=amjad.id;
    }

    if(window.TTTPersonnel?.syncScheduling)window.TTTPersonnel.syncScheduling(false);
    save();
    if(document.getElementById('people')?.classList.contains('active')&&window.TTTPersonnel?.render)window.TTTPersonnel.render();
    window.TTTPersonnelSeed={VERSION,amjadId:amjad.id};
  }

  install();
})();
