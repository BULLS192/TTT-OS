(function customerIntakeManager(){
  'use strict';
  const SERVICE_MAP={
    'Window Tint':'Window tint',
    'Audio / Stereo':'Car stereo installation',
    'GPS / Tracking':'GPS trackers',
    'Kill Switch / Security':'Car alarms',
    'Dash Cam':'Dash cams',
    'SignalTrace Diagnostics':'Other',
    'Custom Fabrication':'Other',
    'Interior Lighting':'Interior lighting',
    'Exterior Lighting':'Exterior lighting',
    'Truck Accessories':'Truck accessories',
    'Marine Audio':'Marine audio',
    'Other':'Other'
  };
  let initialized=false;
  let selectedIntake=null;
  let intakes=[];
  let channel=null;
  let activeSessionToken=null;
  let sessionIntake=null;
  let managerRows=[];
  let selectedManagerIds=new Set();

  function esc(value=''){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function cloud(){return window.TTTCloud;}
  function isAdmin(){
    const profile=cloud()?.profile;
    return profile?.role==='owner_admin'||(Array.isArray(profile?.roles)&&profile.roles.includes('owner_admin'));
  }
  function normPhone(value){return String(value||'').replace(/\D/g,'').slice(-10);}
  function when(value){if(!value)return '—';try{return new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return '—';}}
  function vehicleLabel(row){return [row.vehicle_year,row.vehicle_make,row.vehicle_model,row.vehicle_trim].filter(Boolean).join(' ')||'Vehicle not entered';}
  function sourceLabel(source){
    const map={'shop-qr':'Shop QR','new-job':'New Job QR','website':'Website','text-link':'Text Link','business-card':'Business Card'};
    return map[source]||String(source||'QR').replace(/[-_]/g,' ');
  }
  function existingCustomer(row){
    try{
      if(typeof db==='undefined'||!Array.isArray(db?.customers))return null;
      const email=String(row.email||'').trim().toLowerCase();
      const phone=normPhone(row.phone);
      return db.customers.find(c=>(email&&String(c.email||'').trim().toLowerCase()===email)||(phone&&normPhone(c.phone)===phone))||null;
    }catch{return null;}
  }
  function injectCss(){
    if(document.getElementById('customerIntakeManagerCss'))return;
    const link=document.createElement('link');
    link.id='customerIntakeManagerCss';
    link.rel='stylesheet';
    link.href='/customer-intakes-v01.css?v=20260928-1';
    document.head.appendChild(link);
  }
  function ensurePanel(){
    const section=document.getElementById('newjob');
    if(!section||document.getElementById('customerIntakeManager'))return;
    const panel=document.createElement('article');
    panel.id='customerIntakeManager';
    panel.className='panel customer-intake-manager';
    panel.innerHTML=
      '<div class="intake-manager-head">'+
        '<div class="intake-manager-copy"><p class="eyebrow">CUSTOMER SELF CHECK-IN</p><h3>QR Customer Intake</h3><p>Let the customer enter their own contact, vehicle and service-request details on their phone, then import the submission into this New Job form.</p></div>'+
        '<div class="intake-manager-actions">'+
          '<button class="btn secondary compact" type="button" id="permanentIntakeQrBtn">Shop QR</button>'+
          '<button class="btn primary compact" type="button" id="newJobIntakeQrBtn">Generate Customer QR</button>'+
          '<button class="btn secondary compact" type="button" id="manageIntakesBtn">Manage Intakes</button>'+
          '<button class="btn secondary compact" type="button" id="refreshIntakesBtn">Refresh</button>'+
        '</div>'+
      '</div>'+
      '<div id="intakeManagerStatus" class="intake-manager-status"></div>'+
      '<div id="intakeImportBanner"></div>'+
      '<div class="intake-queue-head"><strong>Pending customer intakes</strong><span class="intake-count" id="intakeCount">0</span></div>'+
      '<div id="intakeQueue" class="intake-queue"><div class="intake-empty">Loading customer intakes…</div></div>';
    const note=section.querySelector('.workflow-note');
    if(note)note.insertAdjacentElement('afterend',panel);
    else section.insertBefore(panel,section.querySelector('#jobForm'));

    document.getElementById('refreshIntakesBtn').addEventListener('click',refreshQueue);
    document.getElementById('manageIntakesBtn').addEventListener('click',openManager);
    document.getElementById('permanentIntakeQrBtn').addEventListener('click',()=>openQr('Permanent Shop QR',location.origin+'/intake/?source=shop-qr',null));
    document.getElementById('newJobIntakeQrBtn').addEventListener('click',()=>{
      activeSessionToken=crypto.randomUUID();
      sessionIntake=null;
      openQr('Customer QR for This New Job',location.origin+'/intake/?source=new-job&session='+encodeURIComponent(activeSessionToken),activeSessionToken);
    });
    ensureModal();
    ensureManageModal();
  }
  function ensureModal(){
    if(document.getElementById('intakeQrBackdrop'))return;
    const el=document.createElement('div');
    el.id='intakeQrBackdrop';
    el.className='intake-qr-backdrop';
    el.hidden=true;
    el.innerHTML=
      '<div class="intake-qr-modal intake-qr-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="intakeQrTitle">'+
        '<button class="intake-qr-close" type="button" id="intakeQrClose" aria-label="Close">×</button>'+
        '<h3 id="intakeQrTitle">Customer QR</h3>'+
        '<p id="intakeQrHelp">Ask the customer to scan this QR code with their phone.</p>'+
        '<div id="intakeQrBox" class="intake-qr-box"></div>'+
        '<code id="intakeQrUrl" class="intake-qr-url"></code>'+
        '<p id="intakeQrStatus" class="intake-qr-status">Waiting for customer submission…</p>'+
        '<div class="intake-qr-actions">'+
          '<button class="btn secondary compact" type="button" id="copyIntakeLinkBtn">Copy link</button>'+
          '<button class="btn secondary compact" type="button" id="printIntakeQrBtn">Print QR</button>'+
          '<button class="btn primary compact" type="button" id="useSessionIntakeBtn" hidden>Use this intake</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click',event=>{if(event.target===el)closeQr();});
    document.getElementById('intakeQrClose').addEventListener('click',closeQr);
    document.getElementById('copyIntakeLinkBtn').addEventListener('click',async()=>{
      const url=document.getElementById('intakeQrUrl').textContent;
      try{await navigator.clipboard.writeText(url);status('Intake link copied.');}catch{status('Copy failed. You can select the link in the QR window.');}
    });
    document.getElementById('printIntakeQrBtn').addEventListener('click',printQr);
    document.getElementById('useSessionIntakeBtn').addEventListener('click',()=>{if(sessionIntake){prefill(sessionIntake);closeQr();}});
  }

  function ensureManageModal(){
    if(document.getElementById('intakeManageBackdrop'))return;
    const el=document.createElement('div');
    el.id='intakeManageBackdrop';
    el.className='intake-manage-backdrop';
    el.hidden=true;
    el.innerHTML=
      '<div class="intake-manage-modal" role="dialog" aria-modal="true" aria-labelledby="intakeManageTitle">'+
        '<div class="intake-manage-titlebar">'+
          '<div><p class="eyebrow">CUSTOMER INTAKES</p><h3 id="intakeManageTitle">Manage Intakes</h3><p>Review submissions, find duplicates and keep the intake queue clean without touching Supabase directly.</p></div>'+
          '<button class="intake-qr-close" type="button" id="intakeManageClose" aria-label="Close">×</button>'+
        '</div>'+
        '<div class="intake-manage-summary" id="intakeManageSummary"></div>'+
        '<div class="intake-manage-toolbar">'+
          '<input id="intakeManageSearch" type="search" placeholder="Search name, phone, email, vehicle, plate, intake or job…">'+
          '<select id="intakeManageStatus"><option value="all">All statuses</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="converted">Converted</option><option value="archived">Archived</option></select>'+
          '<button class="btn secondary compact" type="button" id="intakeManageRefresh">Refresh</button>'+
        '</div>'+
        '<div class="intake-cleanup-controls" id="intakeCleanupControls">'+
          '<span>Admin cleanup</span>'+
          '<select id="intakeCleanupAge"><option value="30">30+ days</option><option value="60">60+ days</option><option value="90" selected>90+ days</option></select>'+
          '<button class="btn secondary compact" type="button" id="archiveOldIntakesBtn">Archive old unconverted</button>'+
        '</div>'+
        '<div class="intake-bulk-controls" id="intakeBulkControls">'+
          '<label class="intake-select-all"><input type="checkbox" id="selectVisibleIntakes"> <span>Select all visible</span></label>'+
          '<span class="intake-selected-count" id="intakeSelectedCount">0 selected</span>'+
          '<div class="intake-bulk-actions">'+
            '<button class="btn secondary compact" type="button" id="clearIntakeSelectionBtn">Clear</button>'+
            '<button class="btn secondary compact" type="button" id="archiveSelectedIntakesBtn" disabled>Archive Selected</button>'+
            '<button class="btn danger compact" type="button" id="deleteSelectedIntakesBtn" disabled>Delete Selected</button>'+
          '</div>'+
        '</div>'+
        '<div class="intake-admin-note" id="intakeManagerRoleNote"></div>'+
        '<div class="intake-manage-list" id="intakeManageList"><div class="intake-empty">Loading customer intakes…</div></div>'+
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click',event=>{if(event.target===el)closeManager();});
    document.getElementById('intakeManageClose').addEventListener('click',closeManager);
    document.getElementById('intakeManageRefresh').addEventListener('click',loadManagerRows);
    document.getElementById('intakeManageSearch').addEventListener('input',renderManagerRows);
    document.getElementById('intakeManageStatus').addEventListener('change',renderManagerRows);
    document.getElementById('archiveOldIntakesBtn').addEventListener('click',archiveOldIntakes);
    document.getElementById('selectVisibleIntakes').addEventListener('change',event=>toggleSelectVisible(event.target.checked));
    document.getElementById('clearIntakeSelectionBtn').addEventListener('click',()=>{selectedManagerIds.clear();renderManagerRows();});
    document.getElementById('archiveSelectedIntakesBtn').addEventListener('click',archiveSelectedIntakes);
    document.getElementById('deleteSelectedIntakesBtn').addEventListener('click',deleteSelectedIntakes);
  }

  function closeQr(){
    const el=document.getElementById('intakeQrBackdrop');
    if(el)el.hidden=true;
  }
  function openQr(title,url,sessionToken){
    ensureModal();
    sessionIntake=null;
    const backdrop=document.getElementById('intakeQrBackdrop');
    const box=document.getElementById('intakeQrBox');
    document.getElementById('intakeQrTitle').textContent=title;
    document.getElementById('intakeQrUrl').textContent=url;
    document.getElementById('useSessionIntakeBtn').hidden=true;
    const qrStatus=document.getElementById('intakeQrStatus');
    qrStatus.className='intake-qr-status';
    qrStatus.textContent=sessionToken?'Waiting for customer submission…':'Permanent QR ready for a counter sign, sticker or printed handout.';
    box.innerHTML='';
    if(window.QRCode){
      new window.QRCode(box,{text:url,width:248,height:248,colorDark:'#07111f',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    }else{
      box.innerHTML='<div style="color:#07111f">QR renderer unavailable. Use the link below.</div>';
    }
    backdrop.hidden=false;
  }
  function printQr(){
    const box=document.getElementById('intakeQrBox');
    const canvas=box?.querySelector('canvas');
    const img=box?.querySelector('img');
    const src=canvas?.toDataURL?.('image/png')||img?.src;
    const url=document.getElementById('intakeQrUrl').textContent;
    if(!src)return;
    const w=window.open('','_blank','width=620,height=760');
    if(!w)return;
    w.document.write('<!doctype html><html><head><title>TTT Customer Check-In QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:48px;color:#0a1220}img{width:340px;height:340px}h1{font-size:26px;margin-bottom:4px}p{color:#42546b}.url{font-size:11px;word-break:break-all;margin-top:20px}</style></head><body><h1>TTT Customer Check-In</h1><p>Scan to enter your contact, vehicle and service request information.</p><img src="'+src+'" alt="TTT customer intake QR"><p class="url">'+esc(url)+'</p><script>window.onload=()=>window.print();<\/script></body></html>');
    w.document.close();
  }
  function status(message){
    const el=document.getElementById('intakeManagerStatus');
    if(el)el.textContent=message||'';
  }

  function closeManager(){
    const el=document.getElementById('intakeManageBackdrop');
    if(el)el.hidden=true;
  }
  async function openManager(){
    ensureManageModal();
    const cleanup=document.getElementById('intakeCleanupControls');
    const bulk=document.getElementById('intakeBulkControls');
    const roleNote=document.getElementById('intakeManagerRoleNote');
    if(cleanup)cleanup.hidden=!isAdmin();
    if(bulk)bulk.hidden=!isAdmin();
    if(roleNote)roleNote.textContent=isAdmin()
      ?'Archive is reversible. Permanent delete is only available for already-archived, unconverted intakes.'
      :'You can review and import intakes. Archive and permanent-delete controls are restricted to the TTT administrator.';
    document.getElementById('intakeManageBackdrop').hidden=false;
    await loadManagerRows();
  }
  function statusLabel(value){
    return ({new:'New',reviewed:'Reviewed',converted:'Converted',archived:'Archived'})[value]||String(value||'Unknown');
  }
  function duplicateKeys(row){
    const keys=[];
    const email=String(row.email||'').trim().toLowerCase();
    const phone=normPhone(row.phone);
    if(email)keys.push('e:'+email);
    if(phone)keys.push('p:'+phone);
    return keys;
  }
  function duplicateCountMap(){
    const counts=new Map();
    managerRows.filter(row=>row.status!=='archived').forEach(row=>{
      duplicateKeys(row).forEach(key=>counts.set(key,(counts.get(key)||0)+1));
    });
    return counts;
  }
  function isDuplicate(row,counts){
    return duplicateKeys(row).some(key=>(counts.get(key)||0)>1);
  }
  async function loadManagerRows(){
    const c=cloud();
    const list=document.getElementById('intakeManageList');
    if(!c?.ready||!c.client||!c.organizationId)return;
    if(list)list.innerHTML='<div class="intake-empty">Loading customer intakes…</div>';
    const {data,error}=await c.client.from('customer_intakes')
      .select('*')
      .eq('organization_id',c.organizationId)
      .order('created_at',{ascending:false})
      .limit(500);
    if(error){
      console.warn('TTT intake manager load failed',error);
      if(list)list.innerHTML='<div class="intake-empty">Could not load customer intakes.</div>';
      return;
    }
    managerRows=data||[];
    selectedManagerIds=new Set([...selectedManagerIds].filter(id=>managerRows.some(row=>row.id===id&&row.status!=='converted')));
    renderManagerRows();
  }

  function filteredManagerRows(){
    const search=String(document.getElementById('intakeManageSearch')?.value||'').trim().toLowerCase();
    const selectedStatus=document.getElementById('intakeManageStatus')?.value||'all';
    return managerRows.filter(row=>{
      if(selectedStatus!=='all'&&row.status!==selectedStatus)return false;
      if(!search)return true;
      const hay=[
        row.intake_code,row.first_name,row.middle_name,row.last_name,row.phone,row.email,
        row.vehicle_year,row.vehicle_make,row.vehicle_model,row.vehicle_trim,row.vehicle_color,
        row.plate,row.plate_state,row.vin,row.converted_job_id,
        ...(Array.isArray(row.requested_services)?row.requested_services:[])
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  function selectedManagerRows(){
    return managerRows.filter(row=>selectedManagerIds.has(row.id)&&row.status!=='converted');
  }
  function updateBulkControls(filtered=filteredManagerRows()){
    const controls=document.getElementById('intakeBulkControls');
    if(!controls||!isAdmin())return;
    const eligibleVisible=filtered.filter(row=>row.status!=='converted');
    const selected=selectedManagerRows();
    const archivable=selected.filter(row=>row.status==='new'||row.status==='reviewed');
    const deletable=selected.filter(row=>row.status==='archived'&&!row.converted_job_id);
    const selectAll=document.getElementById('selectVisibleIntakes');
    if(selectAll){
      const selectedVisible=eligibleVisible.filter(row=>selectedManagerIds.has(row.id)).length;
      selectAll.checked=eligibleVisible.length>0&&selectedVisible===eligibleVisible.length;
      selectAll.indeterminate=selectedVisible>0&&selectedVisible<eligibleVisible.length;
      selectAll.disabled=!eligibleVisible.length;
    }
    const count=document.getElementById('intakeSelectedCount');
    if(count)count.textContent=selected.length+' selected · '+archivable.length+' archivable · '+deletable.length+' deletable';
    const archiveBtn=document.getElementById('archiveSelectedIntakesBtn');
    if(archiveBtn){archiveBtn.disabled=!archivable.length;archiveBtn.textContent=archivable.length?'Archive Selected ('+archivable.length+')':'Archive Selected';}
    const deleteBtn=document.getElementById('deleteSelectedIntakesBtn');
    if(deleteBtn){deleteBtn.disabled=!deletable.length;deleteBtn.textContent=deletable.length?'Delete Selected ('+deletable.length+')':'Delete Selected';}
    const clearBtn=document.getElementById('clearIntakeSelectionBtn');
    if(clearBtn)clearBtn.disabled=!selected.length;
  }
  function toggleSelectVisible(checked){
    if(!isAdmin())return;
    filteredManagerRows().filter(row=>row.status!=='converted').forEach(row=>{
      if(checked)selectedManagerIds.add(row.id);
      else selectedManagerIds.delete(row.id);
    });
    renderManagerRows();
  }

  function renderManagerRows(){
    const list=document.getElementById('intakeManageList');
    const summary=document.getElementById('intakeManageSummary');
    if(!list||!summary)return;

    const counts={new:0,reviewed:0,converted:0,archived:0};
    managerRows.forEach(row=>{if(Object.prototype.hasOwnProperty.call(counts,row.status))counts[row.status]++;});
    summary.innerHTML=['new','reviewed','converted','archived'].map(key=>
      '<div><strong>'+counts[key]+'</strong><span>'+statusLabel(key)+'</span></div>'
    ).join('');

    const duplicateCounts=duplicateCountMap();
    const filtered=filteredManagerRows();

    if(!filtered.length){
      list.innerHTML='<div class="intake-empty">No customer intakes match these filters.</div>';
      updateBulkControls(filtered);
      return;
    }

    list.innerHTML=filtered.map(row=>{
      const duplicate=isDuplicate(row,duplicateCounts);
      const services=(row.requested_services||[]).join(', ')||'No service selected';
      const plate=[row.plate,row.plate_state].filter(Boolean).join(' · ');
      const canUse=row.status==='new'||row.status==='reviewed';
      const admin=isAdmin();
      const selectable=admin&&row.status!=='converted';
      const selectBox=selectable?'<label class="intake-row-select" title="Select intake"><input type="checkbox" data-select-intake="'+esc(row.id)+'" '+(selectedManagerIds.has(row.id)?'checked':'')+'><span>Select</span></label>':'';
      let actions='';
      if(canUse)actions+='<button class="btn primary compact" type="button" data-manage-use="'+esc(row.id)+'">Use Intake</button>';
      if(admin&&(row.status==='new'||row.status==='reviewed'))actions+='<button class="btn secondary compact" type="button" data-manage-archive="'+esc(row.id)+'">Archive</button>';
      if(admin&&row.status==='archived'){
        actions+='<button class="btn secondary compact" type="button" data-manage-restore="'+esc(row.id)+'">Restore</button>';
        if(!row.converted_job_id)actions+='<button class="btn danger compact" type="button" data-manage-delete="'+esc(row.id)+'">Delete permanently</button>';
      }
      return '<article class="intake-manage-card '+(selectedManagerIds.has(row.id)?'is-selected':'')+'">'+
        '<div class="intake-manage-card-head"><div class="intake-card-identity">'+selectBox+'<div><strong>'+esc(row.first_name+' '+row.last_name)+'</strong><small>'+esc(row.intake_code||'')+' · '+esc(when(row.created_at))+'</small></div></div>'+
        '<div class="intake-badges"><span class="intake-status status-'+esc(row.status)+'">'+esc(statusLabel(row.status))+'</span>'+(duplicate?'<span class="intake-duplicate">Possible duplicate</span>':'')+'</div></div>'+
        '<div class="intake-manage-grid">'+
          '<div><span>Contact</span><strong>'+esc(row.phone||'—')+'</strong><small>'+esc(row.email||'No email')+'</small></div>'+
          '<div><span>Vehicle</span><strong>'+esc(vehicleLabel(row))+'</strong><small>'+esc(plate||'No plate')+(row.vin?' · VIN '+esc(row.vin):'')+'</small></div>'+
          '<div><span>Request</span><strong>'+esc(services)+'</strong><small>'+esc(row.request_notes||'No notes')+'</small></div>'+
          '<div><span>Source / Result</span><strong>'+esc(sourceLabel(row.source))+'</strong><small>'+(row.converted_job_id?'Job '+esc(row.converted_job_id):row.archived_reason?esc(row.archived_reason):'Not converted')+'</small></div>'+
        '</div>'+
        '<div class="intake-manage-actions">'+actions+'</div>'+
      '</article>';
    }).join('');

    list.querySelectorAll('[data-select-intake]').forEach(box=>box.addEventListener('change',()=>{
      if(box.checked)selectedManagerIds.add(box.dataset.selectIntake);
      else selectedManagerIds.delete(box.dataset.selectIntake);
      renderManagerRows();
    }));
    updateBulkControls(filtered);
    list.querySelectorAll('[data-manage-use]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=managerRows.find(x=>x.id===btn.dataset.manageUse);
      if(row){prefill(row);closeManager();}
    }));
    list.querySelectorAll('[data-manage-archive]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=managerRows.find(x=>x.id===btn.dataset.manageArchive);if(row)archiveIntake(row);
    }));
    list.querySelectorAll('[data-manage-restore]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=managerRows.find(x=>x.id===btn.dataset.manageRestore);if(row)restoreIntake(row);
    }));
    list.querySelectorAll('[data-manage-delete]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=managerRows.find(x=>x.id===btn.dataset.manageDelete);if(row)deleteIntake(row);
    }));
  }

  async function archiveSelectedIntakes(){
    if(!isAdmin())return;
    const rows=selectedManagerRows().filter(row=>row.status==='new'||row.status==='reviewed');
    if(!rows.length)return;
    const reason=window.prompt('Archive reason for '+rows.length+' selected intake'+(rows.length===1?'':'s')+':','Bulk selected cleanup');
    if(reason===null)return;
    const c=cloud(),now=new Date().toISOString(),ids=rows.map(row=>row.id);
    const {error}=await c.client.from('customer_intakes').update({
      status:'archived',archived_at:now,archived_by:c.userId,
      archived_reason:String(reason||'Bulk selected cleanup').trim().slice(0,500),
      updated_at:now
    }).eq('organization_id',c.organizationId)
      .in('id',ids)
      .in('status',['new','reviewed'])
      .is('converted_job_id',null);
    if(error){console.warn('TTT selected intake archive failed',error);status('Selected intakes could not be archived.');return;}
    await c.audit?.('customer_intake',null,'intake_bulk_selected_archived',{
      count:rows.length,intake_codes:rows.map(row=>row.intake_code),reason:reason||null
    });
    const filter=document.getElementById('intakeManageStatus');
    if(filter)filter.value='archived';
    status(rows.length+' selected intake'+(rows.length===1?'':'s')+' archived. Review them before permanent deletion.');
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }
  async function deleteSelectedIntakes(){
    if(!isAdmin())return;
    const rows=selectedManagerRows().filter(row=>row.status==='archived'&&!row.converted_job_id);
    if(!rows.length)return;
    if(!window.confirm('Permanently delete '+rows.length+' selected archived intake'+(rows.length===1?'':'s')+'? This cannot be undone.'))return;
    const c=cloud(),ids=rows.map(row=>row.id);
    const {error}=await c.client.from('customer_intakes').delete()
      .eq('organization_id',c.organizationId)
      .in('id',ids)
      .eq('status','archived')
      .is('converted_job_id',null);
    if(error){console.warn('TTT selected intake permanent delete failed',error);status('Selected intakes could not be permanently deleted.');return;}
    await c.audit?.('customer_intake',null,'intake_bulk_selected_deleted',{
      count:rows.length,intake_codes:rows.map(row=>row.intake_code)
    });
    ids.forEach(id=>selectedManagerIds.delete(id));
    status(rows.length+' archived intake'+(rows.length===1?'':'s')+' permanently deleted.');
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }

  async function archiveIntake(row){
    if(!isAdmin()||!row||!['new','reviewed'].includes(row.status))return;
    const reason=window.prompt('Archive reason (optional):','Duplicate / incorrect / obsolete submission');
    if(reason===null)return;
    const c=cloud(),now=new Date().toISOString();
    const {error}=await c.client.from('customer_intakes').update({
      status:'archived',archived_at:now,archived_by:c.userId,
      archived_reason:String(reason||'Archived by admin').trim().slice(0,500),
      updated_at:now
    }).eq('organization_id',c.organizationId).eq('id',row.id);
    if(error){console.warn('TTT intake archive failed',error);status('Intake could not be archived.');return;}
    await c.audit?.('customer_intake',row.id,'intake_archived',{intake_code:row.intake_code,reason:reason||null});
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }
  async function restoreIntake(row){
    if(!isAdmin()||!row||row.status!=='archived')return;
    const c=cloud(),now=new Date().toISOString();
    const {error}=await c.client.from('customer_intakes').update({
      status:'reviewed',archived_at:null,archived_by:null,archived_reason:null,
      reviewed_at:row.reviewed_at||now,reviewed_by:row.reviewed_by||c.userId,updated_at:now
    }).eq('organization_id',c.organizationId).eq('id',row.id);
    if(error){console.warn('TTT intake restore failed',error);status('Intake could not be restored.');return;}
    await c.audit?.('customer_intake',row.id,'intake_restored',{intake_code:row.intake_code});
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }
  async function deleteIntake(row){
    if(!isAdmin()||!row||row.status!=='archived'||row.converted_job_id)return;
    if(!window.confirm('Permanently delete '+(row.intake_code||'this intake')+'? This cannot be undone.'))return;
    const c=cloud();
    const {error}=await c.client.from('customer_intakes').delete()
      .eq('organization_id',c.organizationId)
      .eq('id',row.id)
      .eq('status','archived')
      .is('converted_job_id',null);
    if(error){console.warn('TTT intake permanent delete failed',error);status('Intake could not be permanently deleted.');return;}
    await c.audit?.('customer_intake',row.id,'intake_deleted_permanently',{
      intake_code:row.intake_code,name:[row.first_name,row.last_name].filter(Boolean).join(' '),
      archived_reason:row.archived_reason||null
    });
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }
  async function archiveOldIntakes(){
    if(!isAdmin())return;
    const c=cloud();
    const days=Number(document.getElementById('intakeCleanupAge')?.value||90);
    const cutoff=new Date(Date.now()-days*86400000).toISOString();
    const {data,error}=await c.client.from('customer_intakes')
      .select('id,intake_code')
      .eq('organization_id',c.organizationId)
      .in('status',['new','reviewed'])
      .is('converted_job_id',null)
      .lt('created_at',cutoff);
    if(error){console.warn('TTT intake cleanup scan failed',error);return;}
    const rows=data||[];
    if(!rows.length){status('No unconverted intakes are older than '+days+' days.');return;}
    if(!window.confirm('Archive '+rows.length+' unconverted intake'+(rows.length===1?'':'s')+' older than '+days+' days?'))return;
    const now=new Date().toISOString();
    const {error:updateError}=await c.client.from('customer_intakes').update({
      status:'archived',archived_at:now,archived_by:c.userId,
      archived_reason:'Bulk cleanup: older than '+days+' days',updated_at:now
    }).eq('organization_id',c.organizationId)
      .in('id',rows.map(x=>x.id))
      .in('status',['new','reviewed'])
      .is('converted_job_id',null);
    if(updateError){console.warn('TTT intake bulk archive failed',updateError);status('Old intakes could not be archived.');return;}
    await c.audit?.('customer_intake',null,'intake_bulk_archived',{count:rows.length,older_than_days:days});
    status(rows.length+' old intake'+(rows.length===1?'':'s')+' archived.');
    await Promise.all([refreshQueue(),loadManagerRows()]);
  }

  function renderQueue(){
    const queue=document.getElementById('intakeQueue');
    const count=document.getElementById('intakeCount');
    if(!queue||!count)return;
    count.textContent=String(intakes.length);
    if(!intakes.length){
      queue.innerHTML='<div class="intake-empty">No pending customer intakes. New QR submissions will appear here automatically.</div>';
      return;
    }
    queue.innerHTML=intakes.map(row=>{
      const match=existingCustomer(row);
      const services=(row.requested_services||[]).join(', ')||'Service details in notes';
      return '<div class="intake-row" data-intake-id="'+esc(row.id)+'">'+
        '<div class="intake-row-name"><strong>'+esc(row.first_name+' '+row.last_name)+'</strong><small>'+esc(row.phone)+(row.email?' · '+esc(row.email):'')+'</small>'+(match?'<small class="intake-match">Existing customer: '+esc(match.name||match.email||match.phone)+'</small>':'')+'</div>'+
        '<div class="intake-row-meta"><span>'+esc(vehicleLabel(row))+'</span><small>'+esc(services)+'</small><small><span class="intake-source-pill">'+esc(sourceLabel(row.source))+'</span> · '+esc(when(row.created_at))+'</small></div>'+
        '<button class="btn primary compact" type="button" data-import-intake="'+esc(row.id)+'">Use Intake</button>'+
      '</div>';
    }).join('');
    queue.querySelectorAll('[data-import-intake]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=intakes.find(x=>x.id===btn.dataset.importIntake);
      if(row)prefill(row);
    }));
  }
  async function refreshQueue(){
    const c=cloud();
    if(!c?.ready||!c.client||!c.organizationId)return;
    status('Refreshing customer intake queue…');
    const {data,error}=await c.client.from('customer_intakes')
      .select('*')
      .eq('organization_id',c.organizationId)
      .in('status',['new','reviewed'])
      .order('created_at',{ascending:false})
      .limit(30);
    if(error){
      console.warn('TTT customer intake queue failed',error);
      status('Customer intake queue could not be refreshed.');
      return;
    }
    intakes=data||[];
    renderQueue();
    status(intakes.length?intakes.length+' pending intake'+(intakes.length===1?'':'s')+' ready to review.':'Customer intake queue is up to date.');
  }
  function setValue(form,name,value){
    const el=form.elements[name];
    if(!el||value==null)return;
    el.value=String(value);
  }
  function setSelectValue(form,name,otherName,value,dispatch){
    if(!value)return;
    const select=form.elements[name];
    if(!select)return;
    const wanted=String(value);
    const option=[...select.options].find(o=>String(o.value).toLowerCase()===wanted.toLowerCase()||String(o.textContent).toLowerCase()===wanted.toLowerCase());
    if(option)select.value=option.value;
    else if(otherName&&[...select.options].some(o=>o.value==='__other')){
      select.value='__other';
      const other=form.elements[otherName];
      if(other){other.value=wanted;other.classList.remove('hidden');}
    }else{
      const opt=document.createElement('option');
      opt.value=wanted;opt.textContent=wanted;select.appendChild(opt);select.value=wanted;
    }
    if(dispatch)select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function prefill(row){
    const form=document.getElementById('jobForm');
    if(!form)return;
    if(typeof window.show==='function')window.show('newjob');
    setValue(form,'firstName',row.first_name);
    setValue(form,'middleName',row.middle_name);
    setValue(form,'lastName',row.last_name);
    setValue(form,'phone',row.phone);
    setValue(form,'email',row.email);
    setValue(form,'address1',row.address1);
    setValue(form,'address2',row.address2);
    setValue(form,'city',row.city);
    setSelectValue(form,'state',null,row.state,false);
    setValue(form,'postalCode',row.postal_code);
    setSelectValue(form,'country',null,row.country||'US',false);
    setValue(form,'customerNotes',[row.customer_notes,row.referral_source?'How they heard about TTT: '+row.referral_source:''].filter(Boolean).join('\n'));
    setValue(form,'vin',row.vin);
    setSelectValue(form,'year','yearOther',row.vehicle_year,true);
    setSelectValue(form,'make','makeOther',row.vehicle_make,true);
    setSelectValue(form,'model','modelOther',row.vehicle_model,true);
    setValue(form,'trim',row.vehicle_trim);
    setSelectValue(form,'color','colorOther',row.vehicle_color,false);
    setSelectValue(form,'vehicleType',null,row.vehicle_type,false);
    setValue(form,'plate',row.plate);
    setSelectValue(form,'plateState',null,row.plate_state,false);

    const requested=Array.isArray(row.requested_services)?row.requested_services:[];
    const mapped=[...new Set(requested.map(s=>SERVICE_MAP[s]||'Other'))];
    const rows=document.getElementById('serviceRows');
    if(rows&&typeof window.addServiceRow==='function'){
      rows.innerHTML='';
      (mapped.length?mapped:['Other']).forEach(category=>window.addServiceRow({category}));
    }
    const serviceSummary=requested.length?'Customer QR intake services: '+requested.join(', '):'';
    setValue(form,'requestNotes',[serviceSummary,row.request_notes].filter(Boolean).join('\n\n')||'Customer QR intake');
    selectedIntake=row;
    renderImportBanner(row);
    markReviewed(row);
    form.querySelector('[name="firstName"]')?.focus({preventScroll:true});
    document.getElementById('customerIntakeManager')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderImportBanner(row){
    const el=document.getElementById('intakeImportBanner');
    if(!el)return;
    el.innerHTML='<div class="intake-import-banner"><div><strong>'+esc(row.intake_code)+'</strong> imported for '+esc(row.first_name+' '+row.last_name)+'. Review the details below, then create the Job normally.</div><button type="button" class="btn secondary compact" id="clearImportedIntakeBtn">Clear</button></div>';
    document.getElementById('clearImportedIntakeBtn').addEventListener('click',()=>{
      selectedIntake=null;
      el.innerHTML='';
      status('Imported intake link cleared. Form entries were left unchanged.');
    });
  }
  async function markReviewed(row){
    const c=cloud();
    if(!c?.ready||row.status!=='new')return;
    const now=new Date().toISOString();
    const {error}=await c.client.from('customer_intakes').update({
      status:'reviewed',reviewed_at:now,reviewed_by:c.userId,updated_at:now
    }).eq('organization_id',c.organizationId).eq('id',row.id);
    if(!error){row.status='reviewed';row.reviewed_at=now;row.reviewed_by=c.userId;}
  }
  async function markConverted(row,jobId){
    const c=cloud();
    if(!c?.ready||!row?.id||!jobId)return;
    const now=new Date().toISOString();
    const {error}=await c.client.from('customer_intakes').update({
      status:'converted',converted_at:now,converted_by:c.userId,converted_job_id:jobId,updated_at:now
    }).eq('organization_id',c.organizationId).eq('id',row.id);
    if(error){
      console.warn('TTT intake conversion status failed',error);
      status('Job created, but the intake status could not be updated.');
      return;
    }
    selectedIntake=null;
    const banner=document.getElementById('intakeImportBanner');
    if(banner)banner.innerHTML='';
    status(row.intake_code+' converted to '+jobId+'.');
    await refreshQueue();
  }
  function wrapJobSubmit(){
    const form=document.getElementById('jobForm');
    if(!form||form.dataset.customerIntakeWrapped==='true'||typeof form.onsubmit!=='function')return;
    const original=form.onsubmit;
    form.onsubmit=async function(event){
      const intakeAtSubmit=selectedIntake;
      const before=typeof currentJobId!=='undefined'?currentJobId:null;
      const result=await original.call(this,event);
      const after=typeof currentJobId!=='undefined'?currentJobId:null;
      if(intakeAtSubmit&&after&&after!==before)await markConverted(intakeAtSubmit,after);
      return result;
    };
    form.dataset.customerIntakeWrapped='true';
  }
  function handleRealtime(payload){
    refreshQueue();
    if(document.getElementById('intakeManageBackdrop')&&!document.getElementById('intakeManageBackdrop').hidden)loadManagerRows();
    const row=payload?.new;
    if(!row||!activeSessionToken||row.session_token!==activeSessionToken)return;
    sessionIntake=row;
    const statusEl=document.getElementById('intakeQrStatus');
    if(statusEl){
      statusEl.className='intake-qr-status received';
      statusEl.textContent='✓ Received from '+row.first_name+' '+row.last_name+' — '+vehicleLabel(row);
    }
    const useBtn=document.getElementById('useSessionIntakeBtn');
    if(useBtn)useBtn.hidden=false;
  }
  function subscribe(){
    const c=cloud();
    if(channel||!c?.ready||!c.organizationId)return;
    channel=c.client.channel('ttt-customer-intakes-'+c.organizationId)
      .on('postgres_changes',{event:'*',schema:'public',table:'customer_intakes',filter:'organization_id=eq.'+c.organizationId},handleRealtime)
      .subscribe();
  }
  function init(){
    if(initialized)return;
    const c=cloud();
    if(!c?.ready||!c.organizationId)return;
    initialized=true;
    injectCss();
    ensurePanel();
    wrapJobSubmit();
    refreshQueue();
    subscribe();
  }
  const timer=setInterval(()=>{if(cloud()?.ready){clearInterval(timer);init();}},250);
  window.addEventListener('ttt:cloud-state-applied',()=>setTimeout(init,50));
  window.TTTCustomerIntake={refresh:refreshQueue,manage:openManager};
})();