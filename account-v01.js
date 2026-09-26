(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const cloud=()=>window.TTTCloud;
  let pendingAvatarFile=null;
  function initials(name){return (String(name||'TTT User').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'TT');}
  function avatarSvg(name){
    const text=initials(name);
    return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" rx="90" fill="#1557c0"/><text x="90" y="108" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="700" fill="white">'+text+'</text></svg>');
  }
  function personnelAvatar(){
    const pid=cloud()?.profile?.person_id;
    if(!pid||typeof db==='undefined'||!Array.isArray(db?.personnel))return '';
    return db.personnel.find(x=>x.id===pid)?.profilePhotoData||'';
  }
  async function signedAvatar(path,name){
    if(!path)return personnelAvatar()||avatarSvg(name);
    const c=cloud();
    const {data,error}=await c.client.storage.from('avatars').createSignedUrl(path,3600);
    return error?(personnelAvatar()||avatarSvg(name)):(data?.signedUrl||personnelAvatar()||avatarSvg(name));
  }
  async function load(){
    const c=cloud(); if(!c?.client||!c?.userId)return false;
    const {data:{user}}=await c.client.auth.getUser();
    if(!user)return false;
    const p=c.profile||{}, meta=user.user_metadata||{};
    const name=meta.display_name||p.display_name||user.email||'TTT User';
    byId('accountDisplayName').value=name;
    byId('accountPhone').value=meta.phone||'';
    byId('accountJobTitle').value=meta.job_title||'';
    byId('accountTimezone').value=meta.timezone||'America/Chicago';
    byId('accountEmail').value=user.email||p.email||'';
    byId('accountDisplayHeading').textContent=name;
    byId('accountRoleLabel').textContent=p.role==='owner_admin'?'Administrator':(p.role||'User').replaceAll('_',' ');
    byId('accountEmailLabel').textContent=user.email||'';
    byId('accountAvatar').src=await signedAvatar(meta.avatar_path,name);
    return true;
  }
  function status(id,msg,ok){
    const el=byId(id); if(!el)return;
    el.textContent=msg; el.classList.remove('ok','error'); el.classList.add(ok?'ok':'error');
  }
  async function uploadAvatar(userId){
    if(!pendingAvatarFile)return null;
    const c=cloud();
    const ext=(pendingAvatarFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=userId+'/avatar.'+ext;
    const {error}=await c.client.storage.from('avatars').upload(path,pendingAvatarFile,{upsert:true,contentType:pendingAvatarFile.type,cacheControl:'3600'});
    if(error)throw error;
    pendingAvatarFile=null;
    return path;
  }
  async function saveProfile(e){
    e.preventDefault();
    const c=cloud(); if(!c?.client)return;
    const {data:{user}}=await c.client.auth.getUser();
    if(!user)return;
    const displayName=byId('accountDisplayName').value.trim();
    status('accountProfileStatus','Saving…',true);
    try{
      const avatarPath=await uploadAvatar(user.id);
      const existing=user.user_metadata||{};
      const metadata=Object.assign({},existing,{
        display_name:displayName,
        phone:byId('accountPhone').value.trim(),
        job_title:byId('accountJobTitle').value.trim(),
        timezone:byId('accountTimezone').value
      });
      if(avatarPath)metadata.avatar_path=avatarPath;
      delete metadata.avatar_data;
      const {error}=await c.client.auth.updateUser({data:metadata});
      if(error)throw error;
      if(c.profile)c.profile.display_name=displayName;
      status('accountProfileStatus','Profile saved.',true);
      byId('accountDisplayHeading').textContent=displayName;
      if(metadata.avatar_path)byId('accountAvatar').src=await signedAvatar(metadata.avatar_path,displayName);
      window.dispatchEvent(new CustomEvent('ttt:account-updated'));
      window.dispatchEvent(new CustomEvent('ttt:cloud-state-applied',{detail:{accountOnly:true}}));
    }catch(err){status('accountProfileStatus',err?.message||'Profile could not be saved.',false);}
  }
  async function saveEmail(e){
    e.preventDefault();
    const c=cloud(); if(!c?.client)return;
    const email=byId('accountEmail').value.trim();
    status('accountEmailStatus','Updating…',true);
    const {error}=await c.client.auth.updateUser({email});
    if(error){status('accountEmailStatus',error.message,false);return;}
    status('accountEmailStatus','Email update requested. Confirmation may be required.',true);
  }
  async function savePassword(e){
    e.preventDefault();
    const c=cloud(); if(!c?.client)return;
    const a=byId('accountPassword').value,b=byId('accountPasswordConfirm').value;
    if(a!==b){status('accountPasswordStatus','Passwords do not match.',false);return;}
    if(a.length<8){status('accountPasswordStatus','Use at least 8 characters.',false);return;}
    status('accountPasswordStatus','Updating…',true);
    const {error}=await c.client.auth.updateUser({password:a});
    if(error){status('accountPasswordStatus',error.message,false);return;}
    e.currentTarget.reset();
    status('accountPasswordStatus','Password changed successfully.',true);
  }
  function readAvatar(file){
    if(!file||!file.type.startsWith('image/'))return;
    if(file.size>2*1024*1024){status('accountProfileStatus','Profile image must be under 2 MB.',false);return;}
    pendingAvatarFile=file;
    const reader=new FileReader();
    reader.onload=()=>{byId('accountAvatar').src=String(reader.result);status('accountProfileStatus','Photo ready. Click Save profile.',true);};
    reader.readAsDataURL(file);
  }
  function init(){
    byId('accountProfileForm')?.addEventListener('submit',saveProfile);
    byId('accountEmailForm')?.addEventListener('submit',saveEmail);
    byId('accountPasswordForm')?.addEventListener('submit',savePassword);
    byId('accountAvatarInput')?.addEventListener('change',e=>readAvatar(e.target.files?.[0]));
    window.addEventListener('ttt:cloud-state-applied',load);
    let tries=0; const timer=setInterval(async()=>{tries++; if(await load()||tries>80)clearInterval(timer);},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();