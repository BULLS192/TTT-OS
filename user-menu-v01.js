(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const cloud=()=>window.TTTCloud;
  function initials(name){return (String(name||'TTT User').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'TT');}
  function fallback(name){return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#1557c0"/><text x="48" y="60" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="white">'+initials(name)+'</text></svg>');}
  async function refresh(){
    const c=cloud(), p=c?.profile, user=c?.user;
    if(!p||!user)return false;
    const meta=user.user_metadata||{}, name=meta.display_name||p.display_name||user.email||'TTT User';
    byId('sidebarUserName').textContent=name;
    byId('sidebarUserRole').textContent=p.role==='owner_admin'?'Administrator':(p.role||'User').replaceAll('_',' ');
    const person=(typeof db!=='undefined'&&Array.isArray(db?.personnel)&&p.person_id)?db.personnel.find(x=>x.id===p.person_id):null;
    let src=window.TTTAvatar?await window.TTTAvatar.resolve(person,name):(person?.profilePhotoData||fallback(name));
    if(!window.TTTAvatar&&meta.avatar_path){
      const {data}=await c.client.storage.from('avatars').createSignedUrl(meta.avatar_path,3600);
      if(data?.signedUrl)src=data.signedUrl;
    }
    byId('sidebarUserAvatar').src=src;
    return true;
  }
  function close(){
    const root=byId('sidebarUser'),menu=byId('sidebarUserMenu'),btn=byId('sidebarUserButton');
    root?.classList.remove('open'); if(menu)menu.hidden=true; btn?.setAttribute('aria-expanded','false');
  }
  function toggle(){
    const root=byId('sidebarUser'),menu=byId('sidebarUserMenu'),btn=byId('sidebarUserButton');
    if(!menu)return; const open=menu.hidden; menu.hidden=!open; root?.classList.toggle('open',open); btn?.setAttribute('aria-expanded',String(open));
  }
  function openAccount(){
    close();
    if(typeof window.show==='function')window.show('myaccount');
    else document.querySelector('.nav-item[data-view="myaccount"]')?.click();
  }
  async function signOut(){
    const c=cloud(); if(!c?.client)return;
    byId('sidebarSignOut').disabled=true;
    await c.client.auth.signOut();
    location.reload();
  }
  function syncStatus(){
    const source=byId('tttCloudStatus'),target=byId('sidebarSyncLabel'),dot=byId('sidebarUserMenu')?.querySelector('.status-dot');
    if(!source||!target)return;
    target.textContent=source.textContent||'Cloud status';
    if(dot){
      const state=source.dataset.state||'';
      dot.style.background=state==='ok'?'#32d583':state==='busy'?'#fdb022':state==='error'?'#f04438':'#8fa1bd';
    }
  }
  function init(){
    byId('sidebarUserButton')?.addEventListener('click',e=>{e.stopPropagation();toggle();});
    byId('sidebarMyAccount')?.addEventListener('click',openAccount);
    byId('sidebarSignOut')?.addEventListener('click',signOut);
    document.addEventListener('click',e=>{if(!byId('sidebarUser')?.contains(e.target))close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    window.addEventListener('ttt:cloud-state-applied',()=>{refresh();syncStatus();});
    window.addEventListener('ttt:account-updated',refresh);
    const observer=new MutationObserver(syncStatus);
    let tries=0; const timer=setInterval(async()=>{tries++; const s=byId('tttCloudStatus'); if(s){observer.observe(s,{attributes:true,childList:true,subtree:true});syncStatus();} if(await refresh()||tries>80)clearInterval(timer);},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();