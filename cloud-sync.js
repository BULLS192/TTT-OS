(function cloudSyncBootstrap(){
  'use strict';

  const cfg=window.TTTSupabaseConfig;
  if(!cfg||!window.supabase){
    console.error('TTT Cloud: Supabase client/config unavailable.');
    return;
  }

  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const originalSave=typeof save==='function'?save:null;
  let currentUser=null;
  let profile=null;
  let organizationId=null;
  let revision=0;
  let ready=false;
  let applyingRemote=false;
  let pushTimer=null;
  let channel=null;
  let relationalCoreLoaded=false;
  const CORE_KEYS=['customers','vehicles','jobs','personnel'];

  injectStyles();

  if(originalSave){
    save=function(){
      originalSave();
      if(ready&&!applyingRemote)queuePush();
    };
  }

  function deepClone(value){return JSON.parse(JSON.stringify(value));}
  function coreFromRows(rows){
    const out={};
    CORE_KEYS.forEach(key=>{
      out[key]=(rows[key]||[])
        .filter(row=>!row.archived_at)
        .map(row=>Object.assign({},row.source_json||{},{id:row.id}));
    });
    return out;
  }
  async function loadRelationalCore(){
    const requests=CORE_KEYS.map(key=>client.from(key)
      .select('id,source_json,archived_at')
      .eq('organization_id',organizationId)
      .is('archived_at',null));
    const results=await Promise.all(requests);
    const bag={};
    for(let i=0;i<results.length;i++){
      if(results[i].error){
        console.error('TTT Cloud relational core load error',CORE_KEYS[i],results[i].error);
        return null;
      }
      bag[CORE_KEYS[i]]=results[i].data||[];
    }
    return coreFromRows(bag);
  }
  function byId(id){return document.getElementById(id);}
  function setSyncStatus(label,state){
    const el=byId('tttCloudStatus');
    if(!el)return;
    el.textContent=label;
    el.dataset.state=state||'';
  }
  function counts(){
    return {
      jobs:Array.isArray(db?.jobs)?db.jobs.length:0,
      customers:Array.isArray(db?.customers)?db.customers.length:0,
      vehicles:Array.isArray(db?.vehicles)?db.vehicles.length:0,
      people:Array.isArray(db?.personnel)?db.personnel.length:0
    };
  }

  function injectStyles(){
    if(byId('tttCloudStyles'))return;
    const style=document.createElement('style');
    style.id='tttCloudStyles';
    style.textContent=`
      .ttt-auth-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,10,20,.96);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .ttt-auth-card{width:min(460px,100%);background:#fff;border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.38);padding:28px;color:#142033}
      .ttt-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}.ttt-auth-brand img{width:52px;height:52px;object-fit:contain}.ttt-auth-brand strong{display:block;font-size:20px}.ttt-auth-brand span{display:block;color:#65758b;font-size:13px;margin-top:3px}
      .ttt-auth-card h2{margin:0 0 8px;font-size:24px}.ttt-auth-card p{color:#65758b;line-height:1.5;margin:0 0 20px}
      .ttt-auth-form{display:grid;gap:14px}.ttt-auth-form label{font-size:13px;font-weight:700;color:#334155}.ttt-auth-form input{width:100%;margin-top:6px;border:1px solid #d6deea;border-radius:10px;padding:12px 13px;font:inherit}
      .ttt-auth-actions{display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap}.ttt-auth-actions button{min-height:42px}.ttt-auth-error{color:#b42318!important;background:#fef3f2;border:1px solid #fecdca;border-radius:10px;padding:10px 12px;margin:0!important;display:none}
      .ttt-auth-meta{margin-top:18px!important;font-size:12px}.ttt-cloud-init{background:#f6f9fd;border:1px solid #dce6f2;border-radius:12px;padding:14px;margin-bottom:18px}.ttt-cloud-init strong{display:block;margin-bottom:8px}.ttt-cloud-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ttt-cloud-counts span{background:#fff;border:1px solid #e5ebf3;border-radius:9px;padding:9px;text-align:center;font-size:11px;color:#65758b}.ttt-cloud-counts b{display:block;color:#142033;font-size:17px}
      #tttCloudBar{position:fixed;right:18px;bottom:18px;z-index:80;display:flex;align-items:center;gap:9px;background:#0b1220;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:12px}
      #tttCloudStatus:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#8fa1bd;margin-right:7px}#tttCloudStatus[data-state="ok"]:before{background:#32d583}#tttCloudStatus[data-state="busy"]:before{background:#fdb022}#tttCloudStatus[data-state="error"]:before{background:#f04438}
      #tttCloudUser{color:#c7d2e3}#tttCloudLogout{border:0;background:transparent;color:#8fc0ff;font:inherit;cursor:pointer;padding:2px 4px}
      @media(max-width:700px){#tttCloudBar{left:12px;right:12px;bottom:12px;justify-content:center}.ttt-cloud-counts{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function ensureBar(){
    if(byId('tttCloudBar'))return;
    const bar=document.createElement('div');
    bar.id='tttCloudBar';
    bar.innerHTML='<span id="tttCloudStatus" data-state="">Cloud offline</span><span id="tttCloudUser"></span><button id="tttCloudLogout" type="button">Log out</button>';
    document.body.appendChild(bar);
    byId('tttCloudLogout').addEventListener('click',async()=>{
      await client.auth.signOut();
      location.reload();
    });
  }

  function showOverlay(html){
    let overlay=byId('tttAuthOverlay');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='tttAuthOverlay';
      overlay.className='ttt-auth-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML='<div class="ttt-auth-card"><div class="ttt-auth-brand"><img src="/ttt-logo.png" alt="TTT"><div><strong>TTT OS</strong><span>Thompson Transportation Technologies</span></div></div>'+html+'</div>';
    overlay.style.display='flex';
  }
  function hideOverlay(){const el=byId('tttAuthOverlay');if(el)el.style.display='none';}

  function showLogin(message){
    ready=false;
    showOverlay(`
      <h2>Sign in</h2>
      <p>Use your TTT OS account to access the shared company database.</p>
      <form id="tttLoginForm" class="ttt-auth-form">
        <label>Email<input id="tttLoginEmail" type="email" autocomplete="username" required></label>
        <label>Password<input id="tttLoginPassword" type="password" autocomplete="current-password" required></label>
        <p id="tttLoginError" class="ttt-auth-error"></p>
        <div class="ttt-auth-actions"><button class="btn primary" type="submit">Sign in</button><button class="btn secondary" id="tttResetPassword" type="button">Reset password</button></div>
      </form>
      <p class="ttt-auth-meta">${message||'Accounts are provisioned by a TTT administrator.'}</p>
    `);
    const form=byId('tttLoginForm');
    form.addEventListener('submit',async(e)=>{
      e.preventDefault();
      const errorEl=byId('tttLoginError');errorEl.style.display='none';
      const email=byId('tttLoginEmail').value.trim();
      const password=byId('tttLoginPassword').value;
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error){errorEl.textContent=error.message;errorEl.style.display='block';}
    });
    byId('tttResetPassword').addEventListener('click',async()=>{
      const email=byId('tttLoginEmail').value.trim();
      const errorEl=byId('tttLoginError');
      if(!email){errorEl.textContent='Enter your email address first.';errorEl.style.display='block';return;}
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      errorEl.textContent=error?'Password reset could not be sent: '+error.message:'Password reset email sent.';
      errorEl.style.display='block';
    });
  }

  function showPending(email){
    ready=false;
    showOverlay(`
      <h2>Account awaiting access</h2>
      <p>Your login is valid, but this account has not yet been activated for TTT OS.</p>
      <div class="ttt-cloud-init"><strong>${email||'Signed-in user'}</strong><span>A TTT administrator must link this login to a personnel record and assign an access role.</span></div>
      <div class="ttt-auth-actions"><button class="btn secondary" id="tttPendingLogout" type="button">Log out</button></div>
    `);
    byId('tttPendingLogout').addEventListener('click',async()=>{await client.auth.signOut();location.reload();});
  }

  function showCloudUnavailable(){
    ready=false;
    showOverlay(`
      <h2>Shared database unavailable</h2>
      <p>TTT OS could not load the shared Supabase database. Local browser data will not be used as a replacement.</p>
      <p class="ttt-auth-meta">Please contact the TTT OS administrator before making changes.</p>
      <div class="ttt-auth-actions"><button class="btn secondary" id="tttCloudUnavailableLogout" type="button">Log out</button></div>
    `);
    byId('tttCloudUnavailableLogout').addEventListener('click',async()=>{await client.auth.signOut();location.reload();});
  }

  async function bootstrap(user){
    currentUser=user;
    ensureBar();
    setSyncStatus('Connecting…','busy');
    const {data:p,error}=await client.from('profiles')
      .select('user_id,organization_id,person_id,display_name,email,role,roles,active')
      .eq('user_id',user.id)
      .maybeSingle();
    if(error){console.error('TTT Cloud profile error',error);showLogin('Unable to load account profile.');setSyncStatus('Access error','error');return;}
    if(!p||!p.active){showPending(user.email);setSyncStatus('Pending access','error');return;}
    profile=p;organizationId=p.organization_id;
    const userEl=byId('tttCloudUser');if(userEl)userEl.textContent=p.display_name||user.email||'TTT user';

    const {data:state,error:stateError}=await client.from('app_state')
      .select('*')
      .eq('organization_id',organizationId)
      .maybeSingle();
    if(stateError){console.error('TTT Cloud state error',stateError);setSyncStatus('Sync error','error');return;}
    if(!state||state.state===null){
      revision=Number(state?.revision||0);
      showCloudUnavailable();
      setSyncStatus('Cloud unavailable','error');
      return;
    }
    const core=await loadRelationalCore();
    if(!core){
      showCloudUnavailable();
      setSyncStatus('Core database unavailable','error');
      return;
    }
    applyRemote(state,core);
    ready=true;
    hideOverlay();
    subscribe();
  }

  function applyRemote(row,coreOverride){
    if(!row||row.state===null)return;
    applyingRemote=true;
    try{
      const preserved=relationalCoreLoaded?Object.fromEntries(CORE_KEYS.map(key=>[key,deepClone(db?.[key]||[])])):null;
      const next=deepClone(row.state);
      if(coreOverride){
        CORE_KEYS.forEach(key=>{next[key]=deepClone(coreOverride[key]||[]);});
        relationalCoreLoaded=true;
      }else if(preserved){
        CORE_KEYS.forEach(key=>{next[key]=preserved[key];});
      }
      db=next;
      revision=Number(row.revision||0);
      if(originalSave)originalSave();
      if(typeof render==='function')render();
      window.dispatchEvent(new CustomEvent('ttt:cloud-state-applied',{detail:{revision,relationalCore:relationalCoreLoaded}}));
      setSyncStatus('Synced','ok');
    }finally{applyingRemote=false;}
  }

  function queuePush(){
    clearTimeout(pushTimer);
    pushTimer=setTimeout(pushCloud,450);
  }

  async function pushCloud(){
    if(!ready||!organizationId||!currentUser||applyingRemote)return;
    const expected=revision;
    const next=expected+1;
    const snapshot=deepClone(db);
    setSyncStatus('Saving…','busy');
    const {data,error}=await client.from('app_state')
      .update({state:snapshot,revision:next,updated_at:new Date().toISOString(),updated_by:currentUser.id})
      .eq('organization_id',organizationId)
      .eq('revision',expected)
      .select('revision,updated_at,updated_by')
      .maybeSingle();
    if(error){console.error('TTT Cloud save error',error);setSyncStatus('Sync error','error');return;}
    if(!data){await reloadRemote('A newer change was found from another device. TTT OS reloaded the shared version.');return;}
    revision=Number(data.revision||next);
    setSyncStatus('Synced','ok');
  }

  async function reloadRemote(message){
    if(!organizationId)return;
    const {data,error}=await client.from('app_state').select('*').eq('organization_id',organizationId).maybeSingle();
    if(error){console.error('TTT Cloud reload error',error);setSyncStatus('Sync error','error');return;}
    if(data&&data.state!==null){
      applyRemote(data);
      if(typeof toast==='function'&&message)toast(message);
      hideOverlay();
      ready=true;
      subscribe();
    }
  }

  async function writeAudit(entityType,entityId,action,metadata){
    if(!organizationId||!currentUser)return;
    const {error}=await client.from('audit_events').insert({
      organization_id:organizationId,
      actor_user_id:currentUser.id,
      entity_type:entityType,
      entity_id:entityId||null,
      action,
      metadata:metadata||{}
    });
    if(error)console.warn('TTT Cloud audit write failed',error);
  }

  function subscribe(){
    if(!organizationId||channel)return;
    channel=client.channel('ttt-os-state-'+organizationId)
      .on('postgres_changes',{
        event:'UPDATE',schema:'public',table:'app_state',filter:'organization_id=eq.'+organizationId
      },payload=>{
        const row=payload.new;
        if(!row||Number(row.revision||0)<=revision)return;
        if(row.updated_by===currentUser?.id){
          revision=Number(row.revision||revision);
          setSyncStatus('Synced','ok');
          return;
        }
        applyRemote(row);
        if(typeof toast==='function')toast('TTT OS updated from another device.');
      })
      .subscribe(status=>{
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setSyncStatus('Realtime reconnecting','busy');
      });
  }

  async function init(){
    ensureBar();
    const {data,error}=await client.auth.getSession();
    if(error)console.warn('TTT Cloud session error',error);
    if(data?.session?.user)await bootstrap(data.session.user);
    else showLogin();

    client.auth.onAuthStateChange(async(event,session)=>{
      if(event==='SIGNED_OUT'){ready=false;currentUser=null;profile=null;organizationId=null;showLogin();setSyncStatus('Signed out','');return;}
      if(session?.user&&(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')){
        if(currentUser?.id!==session.user.id||!ready)await bootstrap(session.user);
      }
    });
  }

  window.TTTCloud={
    client,
    get ready(){return ready;},
    get revision(){return revision;},
    get profile(){return profile;},
    get organizationId(){return organizationId;},
    get userId(){return currentUser?.id||null;},
    get relationalCoreLoaded(){return relationalCoreLoaded;},
    syncNow:pushCloud,
    reload:reloadRemote,
    audit:writeAudit
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
