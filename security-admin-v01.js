(function(){
  'use strict';
  const state={rows:[],range:'7',user:'all',search:''};
  const byId=id=>document.getElementById(id);
  const cloud=()=>window.TTTCloud;
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function deviceId(){
    const key='ttt_security_device_id_v1';
    let id=localStorage.getItem(key);
    if(!id){id=(crypto?.randomUUID?.()||('dev-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(key,id);}
    return id;
  }
  function sessionKey(session){
    try{
      const p=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return p.session_id||p.sid||session.user?.id+':'+session.expires_at;
    }catch{return session.user?.id+':'+session.expires_at;}
  }
  async function recordSession(session,eventType){
    if(!session?.access_token)return;
    const sk='ttt_security_recorded_'+eventType+'_'+sessionKey(session);
    if(eventType==='login'&&localStorage.getItem(sk))return;
    try{
      const response=await fetch('/api/security-event',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({
          eventType:eventType||'login',
          clientDeviceId:deviceId(),
          language:navigator.language||'',
          screen:(window.screen?.width||'')+'x'+(window.screen?.height||''),
          clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||''
        })
      });
      if(response.ok){
        if(eventType==='login')localStorage.setItem(sk,new Date().toISOString());
        window.dispatchEvent(new CustomEvent('ttt:security-event-recorded'));
      }
    }catch(err){console.warn('TTT Security event capture failed',err);}
  }
  function injectStyles(){
    if(byId('tttSecurityStyles'))return;
    const s=document.createElement('style');s.id='tttSecurityStyles';s.textContent=`
      .security-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.security-head h2{margin:2px 0 6px}.security-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px}.security-stat{padding:16px}.security-stat strong{display:block;font-size:25px;color:#142033;margin-top:5px}.security-stat span{font-size:11px;color:#68788c;text-transform:uppercase;letter-spacing:.06em;font-weight:800}.security-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:14px}.security-toolbar label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#53657a}.security-toolbar select,.security-toolbar input{min-height:38px;border:1px solid #d6deea;border-radius:9px;padding:7px 10px;background:#fff;color:#142033}.security-toolbar .security-search{min-width:250px}.security-table td{vertical-align:top}.security-user strong,.security-place strong{display:block}.security-sub{display:block;color:#718198;font-size:11px;margin-top:3px}.security-ip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.security-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:850}.security-badge.ok{background:#ecfdf3;color:#027a48}.security-badge.review{background:#fff7ed;color:#c2410c}.security-badge.high{background:#fef2f2;color:#b42318}.security-note{margin-top:12px;padding:12px 14px;border:1px solid #dde6f0;border-radius:11px;background:#f8fafc;color:#5d6d80;font-size:12px;line-height:1.5}.security-empty{padding:34px;text-align:center;color:#6c7b8f}.security-refreshing{opacity:.6}.security-architecture{margin-top:16px}.security-architecture .checklist div{margin-bottom:7px}
      @media(max-width:950px){.security-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.security-grid{grid-template-columns:1fr}.security-toolbar>*{width:100%}.security-toolbar .security-search{min-width:0}.security-head{display:block}}
    `;document.head.appendChild(s);
  }
  function formatTime(row){
    const d=new Date(row.occurred_at);
    const zone=row.timezone||undefined;
    try{return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(d)+(zone?' · '+zone:'');}
    catch{return d.toLocaleString();}
  }
  function locationText(row){
    const parts=[row.city,row.region,row.country_code].filter(Boolean);
    return [...new Set(parts)].join(', ')||'Location unavailable';
  }
  function ensureView(){
    const section=byId('settings');if(!section||cloud()?.profile?.role!=='owner_admin')return;
    if(byId('securityAdminRoot'))return;
    section.innerHTML=`
      <div id="securityAdminRoot">
        <div class="security-head">
          <div><p class="eyebrow">ADMINISTRATION</p><h2>Security Center</h2><p class="muted">Login activity for TTT-OS accounts. Location is approximate and derived from the public IP address.</p></div>
          <button class="btn secondary" type="button" id="securityRefresh">Refresh</button>
        </div>
        <div class="security-grid">
          <article class="panel security-stat"><span>Successful logins</span><strong id="securityLoginCount">—</strong></article>
          <article class="panel security-stat"><span>Users active</span><strong id="securityUserCount">—</strong></article>
          <article class="panel security-stat"><span>Unique IPs</span><strong id="securityIpCount">—</strong></article>
          <article class="panel security-stat"><span>Needs review</span><strong id="securityReviewCount">—</strong></article>
        </div>
        <article class="panel">
          <div class="panel-head"><div><h3>Login Activity</h3><p class="muted">Historical data starts with the available Supabase authentication logs from September 25, 2026.</p></div></div>
          <div class="security-toolbar">
            <label>Period<select id="securityRange"><option value="1">Last 24 hours</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option><option value="all">All retained</option></select></label>
            <label>User<select id="securityUser"><option value="all">All users</option></select></label>
            <label class="security-search">Search<input id="securitySearch" placeholder="IP, city, device, email…"></label>
          </div>
          <div class="table-wrap"><table class="security-table"><thead><tr><th>Date / time</th><th>User</th><th>Result</th><th>Approx. location</th><th>IP address</th><th>Device</th><th>Network</th><th>Risk</th></tr></thead><tbody id="securityBody"></tbody></table></div>
          <div class="security-note">IP geolocation can be affected by VPNs, mobile carriers and ISP routing. A location change is a review signal, not proof of unauthorized access.</div>
        </article>
        <article class="panel security-architecture">
          <div class="panel-head"><div><h3>Security controls</h3><p class="muted">TTT-OS login events are retained separately from temporary platform logs.</p></div></div>
          <div class="checklist"><div>✓ Admin-only organization-wide login history</div><div>✓ IP address, approximate location, timestamp and browser/device capture</div><div>✓ New-country / new-device review signals for future sign-ins</div><div>✓ Row-level security prevents Derek or Amjad from reading other users' activity</div><div>✓ Supabase remains the authentication authority; no passwords are stored in this ledger</div></div>
        </article>
      </div>`;
    byId('securityRefresh')?.addEventListener('click',load);
    byId('securityRange')?.addEventListener('change',e=>{state.range=e.target.value;load();});
    byId('securityUser')?.addEventListener('change',e=>{state.user=e.target.value;render();});
    byId('securitySearch')?.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();render();});
    load();
  }
  async function load(){
    const c=cloud();if(!c?.client||c.profile?.role!=='owner_admin')return;
    const root=byId('securityAdminRoot');if(root)root.classList.add('security-refreshing');
    let q=c.client.from('login_activity').select('id,user_id,user_email,display_name,event_type,result,occurred_at,ip_address,city,region,country_code,timezone,user_agent,device_label,network,client_device_id,source,risk_level,risk_reason').order('occurred_at',{ascending:false}).limit(500);
    if(state.range!=='all'){
      const days=Number(state.range||7);
      q=q.gte('occurred_at',new Date(Date.now()-days*86400000).toISOString());
    }
    const {data,error}=await q;
    if(root)root.classList.remove('security-refreshing');
    if(error){
      const body=byId('securityBody');if(body)body.innerHTML='<tr><td colspan="8" class="security-empty">Could not load security activity: '+esc(error.message)+'</td></tr>';
      return;
    }
    state.rows=data||[];
    rebuildUserFilter();
    render();
  }
  function rebuildUserFilter(){
    const sel=byId('securityUser');if(!sel)return;
    const current=state.user;
    const users=[...new Map(state.rows.map(r=>[r.user_id,{id:r.user_id,name:r.display_name||r.user_email,email:r.user_email}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
    sel.innerHTML='<option value="all">All users</option>'+users.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('');
    if(users.some(u=>u.id===current))sel.value=current;else{state.user='all';sel.value='all';}
  }
  function filtered(){
    const term=state.search;
    return state.rows.filter(r=>{
      if(state.user!=='all'&&r.user_id!==state.user)return false;
      if(!term)return true;
      return [r.display_name,r.user_email,r.ip_address,r.city,r.region,r.country_code,r.device_label,r.network,r.risk_reason].some(v=>String(v||'').toLowerCase().includes(term));
    });
  }
  function render(){
    const rows=filtered();
    const all=state.rows;
    if(byId('securityLoginCount'))byId('securityLoginCount').textContent=all.filter(r=>r.event_type==='login'&&r.result==='success').length;
    if(byId('securityUserCount'))byId('securityUserCount').textContent=new Set(all.map(r=>r.user_id)).size;
    if(byId('securityIpCount'))byId('securityIpCount').textContent=new Set(all.map(r=>r.ip_address).filter(Boolean)).size;
    if(byId('securityReviewCount'))byId('securityReviewCount').textContent=all.filter(r=>r.risk_level!=='normal').length;
    const body=byId('securityBody');if(!body)return;
    if(!rows.length){body.innerHTML='<tr><td colspan="8" class="security-empty">No login activity matches these filters.</td></tr>';return;}
    body.innerHTML=rows.map(r=>{
      const risk=r.risk_level||'normal';
      return '<tr>'+
        '<td><strong>'+esc(formatTime(r))+'</strong><span class="security-sub">'+esc(new Date(r.occurred_at).toISOString())+'</span></td>'+
        '<td class="security-user"><strong>'+esc(r.display_name||r.user_email)+'</strong><span class="security-sub">'+esc(r.user_email)+'</span></td>'+
        '<td><span class="security-badge ok">'+esc(r.result==='success'?'Successful':'Failed')+'</span><span class="security-sub">'+esc(r.event_type.replaceAll('_',' '))+'</span></td>'+
        '<td class="security-place"><strong>'+esc(locationText(r))+'</strong><span class="security-sub">'+esc(r.timezone||'')+'</span></td>'+
        '<td><span class="security-ip">'+esc(r.ip_address||'Unavailable')+'</span></td>'+
        '<td title="'+esc(r.user_agent||'')+'"><strong>'+esc(r.device_label||'Unknown')+'</strong></td>'+
        '<td>'+esc(r.network||'—')+'</td>'+
        '<td><span class="security-badge '+(risk==='normal'?'ok':risk==='high'?'high':'review')+'">'+esc(risk==='normal'?'Normal':risk==='high'?'High':'Review')+'</span><span class="security-sub">'+esc(r.risk_reason||'')+'</span></td>'+
      '</tr>';
    }).join('');
  }
  function bindAuth(){
    const c=cloud();if(!c?.client)return false;
    if(window.__tttSecurityAuthBound)return true;
    window.__tttSecurityAuthBound=true;
    c.client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_IN'&&session)setTimeout(()=>recordSession(session,'login'),0);
    });
    return true;
  }
  function init(){
    injectStyles();ensureView();bindAuth();
    window.addEventListener('ttt:cloud-state-applied',()=>{ensureView();bindAuth();});
    window.addEventListener('ttt:security-event-recorded',()=>{if(byId('securityAdminRoot'))load();});
    let tries=0;const timer=setInterval(()=>{tries++;ensureView();if(bindAuth()&&cloud()?.profile){clearInterval(timer);}else if(tries>80)clearInterval(timer);},250);
  }
  window.TTTSecurity={load,recordLogin:session=>recordSession(session,'login')};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();