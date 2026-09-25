(function(){
  'use strict';
  function refresh(){
    const cloud=window.TTTCloud;
    const profile=cloud?.profile;
    if(!profile)return false;
    const name=profile.display_name||'TTT user';
    const first=String(name).split(/\s+/)[0]||'there';
    const hour=new Date().getHours();
    const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
    const hero=document.querySelector('#dashboard .hero-card h2');
    if(hero)hero.textContent=greeting+', '+first+'.';
    const nameEl=document.getElementById('currentOperatorName');
    if(nameEl)nameEl.textContent=name;
    const roleEl=document.getElementById('currentOperatorRole');
    if(roleEl)roleEl.textContent=profile.role==='owner_admin'?'Administrator':'Partner';
    const reset=document.getElementById('seedBtn');
    if(reset&&cloud.ready)reset.style.display='none';
    return true;
  }
  function start(){
    if(refresh())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(refresh()||attempts>120)clearInterval(timer);
    },250);
  }
  window.addEventListener('ttt:cloud-state-applied',refresh);
  document.addEventListener('DOMContentLoaded',start,{once:true});
})();
