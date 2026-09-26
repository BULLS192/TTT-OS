// TTT OS v0.5.1 — DOM-integrated Final Authorization / Work Execution / Change Orders
// Designed to load after workflow-v03.js, google-sync-v02.js and document-preview-v04.js.
(function(){
  const now=()=>new Date().toISOString();
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const safe=v=>esc(v==null?'':v);

  function originalTotal(j){ return num(j.quote?.snapshot?.estimateTotal ?? j.estimateTotal); }
  function approvedChanges(j){
    return (j.changeOrders||[]).filter(x=>x.status==='Approved').reduce((s,x)=>s+num(x.totalDelta),0);
  }
  function authorizedTotal(j){ return originalTotal(j)+approvedChanges(j); }

  function nextId(prefix){
    let max=0;
    (db.jobs||[]).forEach(j=>{
      const ids=[
        j.finalAuthorization?.id,
        ...(j.changeOrders||[]).map(x=>x.id)
      ].filter(Boolean);
      ids.forEach(id=>{
        if(!String(id).startsWith(prefix+'-')) return;
        const m=String(id).match(/-(\d{4})$/);
        if(m) max=Math.max(max,+m[1]);
      });
    });
    return `${prefix}-${new Date().getFullYear()}-${String(max+1).padStart(4,'0')}`;
  }

  function nextWorkOrderId(){
    let max=0;
    (db.jobs||[]).forEach(j=>{
      const m=String(j.workOrderId||'').match(/WO-\d{6}-(\d{3,4})$/);
      if(m) max=Math.max(max,+m[1]);
    });
    const d=new Date();
    const stamp=String(d.getFullYear()).slice(2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    return `WO-${stamp}-${String(max+1).padStart(3,'0')}`;
  }

  function mark(j,action,extra={}){
    const at=now();
    j.updatedAt=at;
    j.syncState='pending';
    j.audit=j.audit||[];
    j.audit.push({at,actor:window.TTTCloud?.profile?.person_id||window.TTTCloud?.userId||'system',action,...extra});
    // Commit the complete local record before entering the replaceable sync path.
    // A failed local write must throw before a Google job can be queued.
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    if(window.TTTSync?.queueJob) window.TTTSync.queueJob(j);
    window.dispatchEvent(new CustomEvent('ttt:job-operational-change',{detail:{jobId:j.id,action}}));
  }

  function ensureExecution(j){
    if(j.workExecution?.lines?.length) return j.workExecution;
    const scope=j.quote?.snapshot||j;
    const source=(scope.equipment||[]).length
      ? scope.equipment
      : (scope.services||j.services||[]).map(x=>({category:x,qty:1}));
    j.workExecution={
      startedAt:'',
      completedAt:'',
      notes:'',
      lines:source.map((x,i)=>({
        id:`WL-${String(i+1).padStart(3,'0')}`,
        category:x.category||'Service',
        brand:x.brand||'',
        model:x.model||'',
        qty:num(x.qty)||1,
        status:'Not Started',
        serialNumber:'',
        installedLocation:'',
        laborHours:'',
        materialCost:'',
        laborCost:'',
        technicianNotes:'',
        completionNotes:''
      }))
    };
    return j.workExecution;
  }

  function totalStrip(j){
    return `<div class="v05-total-strip">
      <div><span>Original Quote</span><strong>${money(originalTotal(j))}</strong></div>
      <div><span>Approved Changes</span><strong>${money(approvedChanges(j))}</strong></div>
      <div><span>Authorized Total</span><strong>${money(authorizedTotal(j))}</strong></div>
      <div><span>Deposit Received</span><strong>${money(j.depositReceived||0)}</strong></div>
    </div>`;
  }

  function finalAuthHTML(j){
    if(j.finalAuthorization){
      const a=j.finalAuthorization;
      return `<article class="panel detail-section v05-card" id="v05FinalAuthorization">
        <div class="panel-head">
          <div><p class="eyebrow">FINAL WORK AUTHORIZATION</p><h3>${safe(a.id||'Authorized')}</h3></div>
          <span class="badge">Authorized</span>
        </div>
        ${totalStrip(j)}
        <dl class="detail-list two-col">
          <dt>Authorized by</dt><dd>${safe(a.name||'—')}</dd>
          <dt>Authorized</dt><dd>${safe(a.at?new Date(a.at).toLocaleString():'—')}</dd>
          <dt>Method</dt><dd>${safe(a.method||'—')}</dd>
          <dt>Terms</dt><dd>${safe(a.termsVersion||'0.5')}</dd>
          <dt>Inspection findings</dt><dd>${safe(a.inspectionFindings||'None noted')}</dd>
          <dt>Final scope notes</dt><dd>${safe(a.finalScopeNotes||'No additional notes')}</dd>
        </dl>
      </article>`;
    }

    if(j.status!=='Awaiting Final Authorization') return '';

    return `<article class="panel detail-section v05-card" id="v05FinalAuthorization">
      <div class="panel-head">
        <div>
          <p class="eyebrow">FINAL WORK AUTHORIZATION</p>
          <h3>Confirm post-inspection scope</h3>
          <p class="muted">The Work Order is created only after this authorization.</p>
        </div>
        <span class="badge">Customer approval</span>
      </div>
      ${totalStrip(j)}
      <div class="v05-form-grid">
        <label class="span2">Inspection findings
          <textarea id="v05InspectionFindings">${safe(j.checkIn?.conditionNotes||'')}</textarea>
        </label>
        <label class="span2">Final scope notes
          <textarea id="v05FinalScopeNotes">${safe(j.quote?.snapshot?.requestNotes||j.requestNotes||'')}</textarea>
        </label>
        <label>Customer authorized by
          <input id="v05FinalAuthName" value="${safe(customer(j.customerId)?.name||'')}">
        </label>
        <label>Approval method
          <select id="v05FinalAuthMethod">
            <option>In-person digital authorization</option>
            <option>Email confirmation</option>
            <option>Printed signed copy</option>
          </select>
        </label>
      </div>
      <label class="v05-check">
        <input type="checkbox" id="v05FinalAuthCheck">
        <span>Customer approves the inspected vehicle condition, final scope and current authorized amount. Any later material change requires a separate approved Change Order.</span>
      </label>
      <div class="v05-actions"><button class="btn primary" id="v05AuthorizeBtn">Authorize & Create Work Order</button></div>
    </article>`;
  }

  function executionHTML(j){
    if(!j.workOrderId) return '';
    const w=ensureExecution(j);
    const done=w.lines.filter(x=>x.status==='Complete').length;

    return `<article class="panel detail-section v05-card" id="v05WorkExecution">
      <div class="panel-head">
        <div>
          <p class="eyebrow">ACTIVE WORK ORDER</p>
          <h3>${safe(j.workOrderId)}</h3>
          <p class="muted">${done} of ${w.lines.length} work lines complete.</p>
        </div>
        <span class="badge">${safe(j.status)}</span>
      </div>
      ${totalStrip(j)}
      <div>
        ${w.lines.map((x,i)=>`
          <section class="v05-line" data-line-index="${i}">
            <div class="v05-line-head">
              <div><strong>${safe(x.category)}</strong><small>${safe([x.brand,x.model].filter(Boolean).join(' · ')||'Product details not entered')} · Qty ${safe(x.qty)}</small></div>
              <span class="badge">${safe(x.status)}</span>
            </div>
            <div class="v05-line-grid">
              <label>Status
                <select data-field="status">
                  ${['Not Started','In Progress','Waiting on Parts','Complete'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}
                </select>
              </label>
              <label>Brand<input data-field="brand" value="${safe(x.brand)}"></label>
              <label>Model<input data-field="model" value="${safe(x.model)}"></label>
              <label>Serial number<input data-field="serialNumber" value="${safe(x.serialNumber)}"></label>
              <label>Installed location<input data-field="installedLocation" value="${safe(x.installedLocation)}" placeholder="Dash, trunk, under seat..."></label>
              <label>Actual labor hours<input data-field="laborHours" type="number" min="0" step="0.25" value="${safe(x.laborHours)}"></label>
              <label>Actual material cost ($)<input data-field="materialCost" type="number" min="0" step="0.01" value="${safe(x.materialCost)}"></label>
              <label>Actual labor cost ($)<input data-field="laborCost" type="number" min="0" step="0.01" value="${safe(x.laborCost)}"></label>
              <label class="span2">Technician notes<textarea data-field="technicianNotes">${safe(x.technicianNotes)}</textarea></label>
              <label class="span2">Completion notes<textarea data-field="completionNotes">${safe(x.completionNotes)}</textarea></label>
            </div>
          </section>`).join('')}
      </div>
      <label>Overall work-order notes<textarea id="v05WorkNotes">${safe(w.notes||'')}</textarea></label>
      <div class="v05-actions">
        <button class="btn secondary" id="v05SaveWork">Save Work Progress</button>
        <button class="btn primary" id="v05SendQC" ${w.lines.length&&done===w.lines.length?'':'disabled'}>Complete Work & Send to QC</button>
      </div>
    </article>`;
  }

  function changesHTML(j){
    if(!j.workOrderId) return '';
    const orders=j.changeOrders||[];
    return `<article class="panel detail-section v05-card" id="v05ChangeOrders">
      <div class="panel-head">
        <div>
          <p class="eyebrow">SCOPE CONTROL</p>
          <h3>Change Orders</h3>
          <p class="muted">Original approvals remain unchanged. Only approved Change Orders modify the authorized total.</p>
        </div>
        <button class="btn primary compact" id="v05NewCO">+ Change Order</button>
      </div>
      ${orders.length?orders.map(co=>`
        <section class="v05-co">
          <div>
            <strong>${safe(co.id)} · ${safe(co.status)}</strong>
            <p>${safe(co.description||'')}</p>
            <small>${safe(co.reason||'Change Order')}${co.scheduleImpact?' · '+safe(co.scheduleImpact):''}</small>
          </div>
          <div class="v05-co-right">
            <strong>${num(co.totalDelta)>=0?'+':''}${money(co.totalDelta)}</strong>
            ${co.status==='Draft'?`<button class="btn secondary compact" data-approve-co="${safe(co.id)}">Approve</button>`:`<span class="badge">Approved</span>`}
          </div>
        </section>`).join(''):'<p class="muted">No Change Orders.</p>'}
    </article>`;
  }

  function authorize(j){
    if(j.finalAuthorization){ toast('Final authorization is already recorded'); return; }
    if(!j.checkIn){ toast('Complete vehicle Check-In first'); return; }
    const ok=document.getElementById('v05FinalAuthCheck')?.checked;
    const name=document.getElementById('v05FinalAuthName')?.value.trim();
    if(!ok||!name){ toast('Customer authorization and signer name are required'); return; }

    j.finalAuthorization={
      id:nextId('APR'),
      name,
      at:now(),
      method:document.getElementById('v05FinalAuthMethod')?.value||'In person',
      termsVersion:'0.5',
      inspectionFindings:document.getElementById('v05InspectionFindings')?.value.trim()||'',
      finalScopeNotes:document.getElementById('v05FinalScopeNotes')?.value.trim()||'',
      quotedTotal:originalTotal(j)
    };
    j.workOrderId=j.workOrderId||nextWorkOrderId();
    ensureExecution(j).startedAt=now();
    j.status='In Progress';
    mark(j,'final_authorization_and_work_order_created',{approvalId:j.finalAuthorization.id,workOrderId:j.workOrderId});
    render();
    toast(j.workOrderId+' created');
  }

  function saveWork(j){
    const w=ensureExecution(j);
    document.querySelectorAll('#v05WorkExecution [data-line-index]').forEach(row=>{
      const line=w.lines[+row.dataset.lineIndex];
      if(!line) return;
      row.querySelectorAll('[data-field]').forEach(el=>line[el.dataset.field]=el.value);
    });
    if(w.lines.some(x=>x.laborHours!=='' && (!Number.isFinite(Number(x.laborHours)) || Number(x.laborHours)<0))){
      toast('Labor hours must be zero or greater');
      return false;
    }
    if(w.lines.some(x=>['materialCost','laborCost'].some(k=>x[k]!==''&&(!Number.isFinite(Number(x[k]))||Number(x[k])<0)))){
      toast('Actual material and labor costs must be zero or greater');
      return false;
    }
    w.notes=document.getElementById('v05WorkNotes')?.value||'';
    if(!w.startedAt && w.lines.some(x=>x.status!=='Not Started')) w.startedAt=now();
    if(w.lines.length && w.lines.every(x=>x.status==='Complete')) w.completedAt=w.completedAt||now();
    else w.completedAt='';
    mark(j,'work_execution_saved');
    return true;
  }

  function createCOModal(j){
    document.getElementById('v05COModal')?.remove();
    document.body.insertAdjacentHTML('beforeend',`
      <div class="v05-modal" id="v05COModal">
        <div class="v05-backdrop" data-close-co></div>
        <div class="v05-modal-box">
          <div class="panel-head"><div><p class="eyebrow">CHANGE ORDER</p><h3>Document a scope change</h3></div><button class="btn secondary compact" data-close-co>Close</button></div>
          <div class="v05-form-grid">
            <label>Reason<select id="v05COReason"><option>Customer requested change</option><option>Hidden / concealed condition</option><option>Compatibility issue</option><option>Additional part required</option><option>Additional labor required</option><option>Other</option></select></label>
            <label>Schedule impact<input id="v05COSchedule" placeholder="None, +2 hours, +1 day..."></label>
            <label class="span2">Description<textarea id="v05CODescription"></textarea></label>
            <label>Parts adjustment ($)<input id="v05COParts" type="number" step="0.01" value="0"></label>
            <label>Labor adjustment ($)<input id="v05COLabor" type="number" step="0.01" value="0"></label>
            <label>Fees adjustment ($)<input id="v05COFees" type="number" step="0.01" value="0"></label>
            <label>Customer / approver<input id="v05COSigner" value="${safe(customer(j.customerId)?.name||'')}"></label>
          </div>
          <div class="v05-actions"><button class="btn primary" id="v05SaveCO">Create Draft</button></div>
        </div>
      </div>`);
    const modal=document.getElementById('v05COModal');
    modal.querySelectorAll('[data-close-co]').forEach(x=>x.onclick=()=>modal.remove());
    document.getElementById('v05SaveCO').onclick=()=>{
      const desc=document.getElementById('v05CODescription').value.trim();
      if(!desc){ toast('Change description is required'); return; }
      const co={
        id:nextId('CO'),
        status:'Draft',
        reason:document.getElementById('v05COReason').value,
        description:desc,
        scheduleImpact:document.getElementById('v05COSchedule').value.trim(),
        partsDelta:num(document.getElementById('v05COParts').value),
        laborDelta:num(document.getElementById('v05COLabor').value),
        feesDelta:num(document.getElementById('v05COFees').value),
        signerName:document.getElementById('v05COSigner').value.trim(),
        createdAt:now()
      };
      co.totalDelta=co.partsDelta+co.laborDelta+co.feesDelta;
      j.changeOrders=j.changeOrders||[];
      j.changeOrders.push(co);
      mark(j,'change_order_created',{changeOrderId:co.id,totalDelta:co.totalDelta});
      modal.remove();
      render();
      toast(co.id+' created');
    };
  }

  function approveCO(j,id){
    const co=(j.changeOrders||[]).find(x=>x.id===id);
    if(!co||co.status!=='Draft') return;
    const signer=prompt('Customer / approver name',co.signerName||customer(j.customerId)?.name||'');
    if(signer===null) return;
    if(!signer.trim()){ toast('Approver name is required'); return; }
    const previous=authorizedTotal(j);
    co.status='Approved';
    co.signerName=signer.trim();
    co.approvedAt=now();
    co.approvalMethod='Recorded in TTT OS';
    co.previousAuthorizedTotal=previous;
    co.revisedAuthorizedTotal=previous+num(co.totalDelta);

    const w=ensureExecution(j);
    w.lines.push({
      id:`WL-${co.id}`,
      changeOrderId:co.id,
      category:co.description,
      brand:'',
      model:'',
      qty:1,
      status:'Not Started',
      serialNumber:'',
      installedLocation:'',
      laborHours:'',
      technicianNotes:'',
      completionNotes:''
    });
    w.completedAt='';
    mark(j,'change_order_approved',{changeOrderId:co.id,revisedAuthorizedTotal:co.revisedAuthorizedTotal});
    render();
    toast(co.id+' approved');
  }

  function removeLegacyCards(root,j){
    // Hide old shell Work Order card.
    root.querySelectorAll('.workorder-card').forEach(el=>el.style.display='none');

    // Hide older Final Authorization card if present.
    root.querySelectorAll('.detail-section').forEach(el=>{
      if(el.id?.startsWith('v05')) return;
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(t.includes('Final Authorization') && (t.includes('Authorize & Create Work Order') || t.includes('Authorized by'))){
        el.style.display='none';
      }
    });
  }

  function inject(){
    const root=document.getElementById('jobDetailBody');
    const j=currentJobId?job(currentJobId):null;
    if(!root||!j) return;

    ['v05FinalAuthorization','v05WorkExecution','v05ChangeOrders'].forEach(id=>document.getElementById(id)?.remove());
    removeLegacyCards(root,j);

    const docCenter=root.querySelector('#documentCenter');

    const auth=finalAuthHTML(j);
    const work=executionHTML(j);
    const changes=changesHTML(j);

    const html=[auth,work,changes].filter(Boolean).join('');
    if(html){
      if(docCenter) docCenter.insertAdjacentHTML('beforebegin',html);
      else root.insertAdjacentHTML('beforeend',html);
    }

    document.getElementById('v05AuthorizeBtn')?.addEventListener('click',()=>authorize(j));
    document.getElementById('v05SaveWork')?.addEventListener('click',()=>{ if(saveWork(j)){ render(); toast('Work progress saved'); }});
    document.getElementById('v05SendQC')?.addEventListener('click',()=>{
      if(!saveWork(j)) return;
      const w=ensureExecution(j);
      if(!w.lines.length||w.lines.some(x=>x.status!=='Complete')){ toast('Complete every work line before QC'); return; }
      j.status='QC';
      w.completedAt=w.completedAt||now();
      mark(j,'work_completed_sent_to_qc');
      render();
      toast('Work complete · sent to QC');
    });
    document.getElementById('v05NewCO')?.addEventListener('click',()=>createCOModal(j));
    root.querySelectorAll('[data-approve-co]').forEach(b=>b.addEventListener('click',()=>approveCO(j,b.dataset.approveCo)));

    // Disable old "Send to QC" shortcut if work lines are incomplete.
    const oldNext=document.getElementById('nextActionBtn');
    if(oldNext && j.status==='In Progress'){
      const w=ensureExecution(j);
      if(!w.lines.length||w.lines.some(x=>x.status!=='Complete')){
        oldNext.disabled=true;
        oldNext.title='Complete all Work Order lines first';
      }
    }
  }

  // Patch the already-public render functions instead of trying to access private workflow-v03 functions.
  const baseRender=render;
  render=function(){
    baseRender();
    if(currentJobId) setTimeout(inject,0);
  };

  const baseOpenJob=window.openJob;
  window.openJob=function(id){
    baseOpenJob(id);
    setTimeout(inject,0);
  };

  window.TTTV05={
    inject,
    ensureExecution,
    originalTotal,
    approvedChanges,
    authorizedTotal
  };

  if(currentJobId) setTimeout(inject,0);
})();
