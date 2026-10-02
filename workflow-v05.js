// TTT OS v0.5.1 — DOM-integrated Final Authorization / Work Execution / Change Orders
// Designed to load after workflow-v03.js and the document center.
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
    j.audit=j.audit||[];
    j.audit.push({at,actor:window.TTTCloud?.profile?.person_id||window.TTTCloud?.userId||'system',action,...extra});
    // Persist the local compatibility cache; Supabase adapters remain authoritative.
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    window.dispatchEvent(new CustomEvent('ttt:job-operational-change',{detail:{jobId:j.id,action,...extra}}));
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

  function conditionPhotoHTML(j){
    const photos=j.checkIn?.photos||[];
    const cards=photos.map((p,i)=>{
      const label=p.area||p.category||p.fileName||('Condition photo '+(i+1));
      const meta=[p.group,p.capturedAt?new Date(p.capturedAt).toLocaleString():null].filter(Boolean).join(' · ');
      const image=p.storagePath
        ? `<img data-job-media-img="${safe(p.storagePath)}" alt="${safe(label)}">`
        : '<div style="height:115px;background:#eaf0f6;display:grid;place-items:center;font-size:10px;color:#748297">Stored image unavailable</div>';
      return `<div class="auth-condition-photo">${image}<div><strong>${safe(label)}</strong><small>${safe(meta||p.fileName||'Check-In evidence')}</small></div></div>`;
    }).join('');
    return `<section class="auth-condition-review">
      <h4>VEHICLE CONDITION PHOTOS</h4>
      <p>The ${photos.length} photograph${photos.length===1?'':'s'} below are the stored check-in condition record that the customer is acknowledging before work begins.</p>
      <div class="auth-condition-photo-grid">${cards||'<div class="docsys-gate">No stored check-in photos are available. Authorization is blocked until condition photos are captured.</div>'}</div>
    </section>`;
  }

  function bindSignaturePad(){
    const canvas=document.getElementById('v05FinalAuthSignature');if(!canvas||canvas.dataset.bound==='1')return;
    canvas.dataset.bound='1';canvas.dataset.hasInk='0';
    const ctx=canvas.getContext('2d');
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111827';ctx.lineWidth=3;
    let drawing=false;
    const point=e=>{
      const r=canvas.getBoundingClientRect();
      return {x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)};
    };
    canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture?.(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();canvas.dataset.hasInk='1';e.preventDefault();});
    const end=e=>{drawing=false;try{canvas.releasePointerCapture?.(e.pointerId);}catch{}};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',e=>{if(e.buttons===0)drawing=false;});
    document.getElementById('v05ClearSignature')?.addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.hasInk='0';});
  }

  function finalAuthHTML(j){
    const photos=j.checkIn?.photos||[];
    const termsVersion=window.TTTDocumentSystem?.currentTermsVersion?.()||'v0.1';
    const termsUrl=window.TTTDocumentSystem?.template?.('TNC')?.template_url||'';
    if(j.finalAuthorization){
      const a=j.finalAuthorization;
      return `<article class="panel detail-section v05-card" id="v05FinalAuthorization">
        <div class="panel-head">
          <div><p class="eyebrow">CUSTOMER AUTHORIZATION</p><h3>${safe(a.id||'Authorized')}</h3><p class="muted">Signed authorization includes the check-in condition photo record.</p></div>
          <span class="badge">Authorized</span>
        </div>
        ${totalStrip(j)}
        <dl class="detail-list two-col">
          <dt>Authorized by</dt><dd>${safe(a.name||'—')}</dd>
          <dt>Authorized</dt><dd>${safe(a.at?new Date(a.at).toLocaleString():'—')}</dd>
          <dt>Method</dt><dd>${safe(a.method||'—')}</dd>
          <dt>Terms</dt><dd>${safe(a.termsVersion||termsVersion)}</dd>
          <dt>Condition photos acknowledged</dt><dd>${safe(a.conditionPhotoCount??photos.length)} photo${(a.conditionPhotoCount??photos.length)===1?'':'s'}</dd>
          <dt>Inspection findings</dt><dd>${safe(a.inspectionFindings||'None noted')}</dd>
          <dt>Final scope notes</dt><dd>${safe(a.finalScopeNotes||'No additional notes')}</dd>
        </dl>
        ${conditionPhotoHTML(j)}
        <section class="doc-sign"><div><h4>CUSTOMER SIGNATURE</h4><p>${safe(a.name||'Customer')} · ${safe(a.at?new Date(a.at).toLocaleString():'')}</p></div><div class="doc-signature">${a.approvalMark?`<img src="${a.approvalMark}" alt="Customer signature"><small>Customer authorization signature</small>`:'<small>Signature record unavailable</small>'}</div></section>
      </article>`;
    }

    if(j.status!=='Awaiting Final Authorization') return '';

    return `<article class="panel detail-section v05-card" id="v05FinalAuthorization">
      <div class="panel-head">
        <div>
          <p class="eyebrow">CUSTOMER AUTHORIZATION</p>
          <h3>Review condition, scope and authorize work</h3>
          <p class="muted">The customer must review the stored check-in photographs and sign before the Work Order is created.</p>
        </div>
        <span class="badge">Customer signature required</span>
      </div>
      ${totalStrip(j)}
      ${conditionPhotoHTML(j)}
      <label class="v05-check">
        <input type="checkbox" id="v05ConditionPhotosCheck">
        <span>I acknowledge that the ${photos.length} check-in photograph${photos.length===1?'':'s'} displayed above document the visible pre-work vehicle condition, including any recorded exceptions.</span>
      </label>
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
            <option>Printed signature captured digitally</option>
            <option>Remote approval with digital signature</option>
          </select>
        </label>
      </div>
      <label class="v05-check">
        <input type="checkbox" id="v05FinalAuthCheck">
        <span>I authorize TTT to perform the final scope shown above for the current authorized amount. I acknowledge TTT Terms & Conditions ${safe(termsVersion)}${termsUrl?' referenced in the document register':''}. Any later material scope, price or schedule change requires a separate approved Change Order.</span>
      </label>
      <div class="auth-signature-wrap">
        <h4>CUSTOMER SIGNATURE</h4>
        <div class="auth-signature-pad">
          <canvas id="v05FinalAuthSignature" width="900" height="220" aria-label="Customer signature pad"></canvas>
          <div class="auth-signature-tools"><small>Sign above using finger, stylus or mouse.</small><button class="btn secondary compact" type="button" id="v05ClearSignature">Clear</button></div>
        </div>
      </div>
      <div class="v05-actions"><button class="btn primary" id="v05AuthorizeBtn" ${photos.length?'':'disabled'}>Sign, Authorize & Create Work Order</button></div>
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
    if(j.finalAuthorization){ toast('Customer authorization is already recorded'); return; }
    if(!j.checkIn){ toast('Complete vehicle Check-In first'); return; }
    const photos=j.checkIn?.photos||[];
    if(!photos.length){ toast('Capture and store check-in condition photos before customer authorization'); return; }
    const conditionOk=document.getElementById('v05ConditionPhotosCheck')?.checked;
    const scopeOk=document.getElementById('v05FinalAuthCheck')?.checked;
    const name=document.getElementById('v05FinalAuthName')?.value.trim();
    const canvas=document.getElementById('v05FinalAuthSignature');
    const signed=canvas?.dataset.hasInk==='1';
    if(!conditionOk){ toast('Customer must acknowledge the displayed condition photographs'); return; }
    if(!scopeOk||!name){ toast('Customer scope authorization and signer name are required'); return; }
    if(!signed){ toast('Customer signature is required'); return; }

    const at=now();
    j.finalAuthorization={
      id:nextId('APR'),
      name,
      at,
      method:document.getElementById('v05FinalAuthMethod')?.value||'In-person digital authorization',
      termsVersion:window.TTTDocumentSystem?.currentTermsVersion?.()||'v0.1',
      inspectionFindings:document.getElementById('v05InspectionFindings')?.value.trim()||'',
      finalScopeNotes:document.getElementById('v05FinalScopeNotes')?.value.trim()||'',
      quotedTotal:originalTotal(j),
      conditionPhotosAcknowledged:true,
      conditionPhotoCount:photos.length,
      conditionPhotoIds:photos.map(p=>p.id||p.storagePath||p.fileName).filter(Boolean),
      conditionPhotosCapturedAt:j.checkIn?.capturedAt||null,
      approvalMark:canvas.toDataURL('image/png')
    };
    j.workOrderId=j.workOrderId||nextWorkOrderId();
    ensureExecution(j).startedAt=at;
    j.status='In Progress';
    mark(j,'final_authorization_and_work_order_created',{approvalId:j.finalAuthorization.id,workOrderId:j.workOrderId,conditionPhotoCount:photos.length});
    render();
    toast(j.workOrderId+' created · signed authorization recorded');
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
    bindSignaturePad();
    window.TTTMedia?.hydrateSignedImages?.(document.getElementById('v05FinalAuthorization'));
    window.TTTDocumentSystem?.injectJobPanel?.();
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
