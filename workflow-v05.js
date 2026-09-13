// TTT OS v0.5 patch scaffold
// Adds final authorization, work-order execution and change-order data contracts.
// This file is intentionally additive and is designed to load after document-preview-v04.js.
(function(){
  const stamp=()=>new Date().toISOString();
  const number=v=>(Number.isFinite(Number(v)) ? Number(v) : 0);
  const originalTotal=j=>number(j.quote?.snapshot?.estimateTotal??j.estimateTotal);
  const approvedChangeTotal=j=>(j.changeOrders||[]).filter(x=>x.status==='Approved').reduce((s,x)=>s+number(x.totalDelta),0);
  const authorizedTotal=j=>originalTotal(j)+approvedChangeTotal(j);

  function ensureWorkExecution(j){
    if(j.workExecution?.lines) return j.workExecution;
    const scope=j.quote?.snapshot||j;
    const source=(scope.equipment||[]).length?scope.equipment:(scope.services||[]).map(s=>({category:s,qty:1}));
    j.workExecution={
      startedAt:'', completedAt:'', notes:'',
      lines:source.map((x,i)=>({
        id:'WL-'+String(i+1).padStart(3,'0'),
        category:x.category||'Service', brand:x.brand||'', model:x.model||'', qty:number(x.qty)||1,
        status:'Not Started', serialNumber:'', installedLocation:'', laborHours:'',
        technicianNotes:'', completionNotes:''
      }))
    };
    return j.workExecution;
  }

  function ensureFinalAuthorization(j, payload){
    if(j.finalAuthorization) return j.finalAuthorization;
    j.finalAuthorization={
      id:payload.id,
      name:payload.name,
      at:payload.at||stamp(),
      method:payload.method||'In person',
      termsVersion:'0.5',
      inspectionFindings:payload.inspectionFindings||'',
      finalScopeNotes:payload.finalScopeNotes||'',
      quotedTotal:originalTotal(j)
    };
    ensureWorkExecution(j);
    return j.finalAuthorization;
  }

  function createChangeOrder(j, payload){
    j.changeOrders=j.changeOrders||[];
    const co={
      id:payload.id,
      status:'Draft',
      reason:payload.reason||'',
      description:payload.description||'',
      scheduleImpact:payload.scheduleImpact||'',
      partsDelta:number(payload.partsDelta),
      laborDelta:number(payload.laborDelta),
      feesDelta:number(payload.feesDelta),
      totalDelta:number(payload.partsDelta)+number(payload.laborDelta)+number(payload.feesDelta),
      signerName:payload.signerName||'',
      createdAt:stamp()
    };
    j.changeOrders.push(co);
    return co;
  }

  function approveChangeOrder(j, id, signerName){
    const co=(j.changeOrders||[]).find(x=>x.id===id);
    if(!co || co.status!=='Draft' || !String(signerName||'').trim()) return null;
    co.status='Approved';
    co.signerName=signerName||co.signerName||'';
    co.approvedAt=stamp();
    co.approvalMethod='Recorded in TTT OS';
    return co;
  }

  window.TTTV05Data={
    ensureWorkExecution,
    ensureFinalAuthorization,
    createChangeOrder,
    approveChangeOrder,
    originalTotal,
    approvedChangeTotal,
    authorizedTotal
  };
})();

// Integrate the prepared data contract without replacing the earlier render/sync layers.
(function(){
  const data=window.TTTV05Data;
  const statuses=['Not Started','In Progress','Waiting on Parts','Complete'];
  const closed=j=>['Delivered','Closed','Declined'].includes(j.status);
  const now=()=>new Date().toISOString();
  const field=(label,name,value='',type='text')=>`<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${type==='number'?'step="0.01"':''}></label>`;
  const notes=(label,name,value='')=>`<label>${esc(label)}<textarea name="${esc(name)}">${esc(value)}</textarea></label>`;
  function touch(j,action,extra={}){j.updatedAt=now();j.syncState='pending';(j.audit=j.audit||[]).push({at:j.updatedAt,actor:'usr_derek',action,...extra});save();render();}
  function totalStrip(j){return `<div class="v05-total-strip"><div><span>Original quote</span><strong>${money(data.originalTotal(j))}</strong></div><div><span>Approved changes</span><strong>${money(data.approvedChangeTotal(j))}</strong></div><div><span>Authorized total</span><strong>${money(data.authorizedTotal(j))}</strong></div><div><span>Deposit received</span><strong>${money(j.depositReceived)}</strong></div></div>`;}
  const oldAuth=authorizationBlock;
  authorizationBlock=function(j){
    if(j.finalAuthorization){const a=j.finalAuthorization;return `<article class="panel detail-section v05-card"><h3>Final Authorization</h3><p>Authorized by <strong>${esc(a.name)}</strong> · ${esc(a.at)} · ${esc(a.method||'Recorded in TTT OS')}</p><p>${esc(a.inspectionFindings||'')}</p><p>${esc(a.finalScopeNotes||'')}</p>${totalStrip(j)}</article>`;}
    if(j.status!=='Awaiting Final Authorization')return oldAuth(j);
    return `<article class="panel detail-section v05-card"><h3>Final Authorization</h3><p>Record customer approval of the inspected vehicle and quoted scope before starting work. Price changes require a separate approved change order.</p>${totalStrip(j)}<div class="v05-form-grid">${notes('Inspection findings','inspectionFindings',j.checkIn?.conditionNotes)}${notes('Final scope notes','finalScopeNotes',j.quote?.snapshot?.requestNotes||j.requestNotes)}<label>Approval method<select id="finalAuthMethod"><option>In person</option><option>Email confirmation</option><option>Printed signed copy</option></select></label><label>Customer authorized by<input id="finalAuthName"></label></div><label class="v05-check"><input type="checkbox" id="finalAuthCheck"> Customer approval has been obtained for the scope, quoted price and inspection findings.</label><button class="btn primary" id="authorizeBtn">Authorize & Create Work Order</button></article>`;
  };
  authorizeWork=function(j){
    if(j.finalAuthorization){toast('Final authorization is already recorded');return;}
    if(!j.checkIn||!j.quote?.approval){toast('Complete quote approval and vehicle check-in first');return;}
    const name=document.getElementById('finalAuthName')?.value.trim();
    if(!name||!document.getElementById('finalAuthCheck')?.checked){toast('Customer authorization and signer name are required');return;}
    data.ensureFinalAuthorization(j,{id:uid('APR'),name,method:document.getElementById('finalAuthMethod').value,inspectionFindings:document.querySelector('[name="inspectionFindings"]').value,finalScopeNotes:document.querySelector('[name="finalScopeNotes"]').value});
    j.workOrderId=j.workOrderId||uid('WO');j.status='In Progress';
    touch(j,'final_authorization_and_work_order_created',{workOrderId:j.workOrderId,approvalId:j.finalAuthorization.id});toast('Work order authorized');
  };
  workOrderBlock=function(j){
    // Display legacy lines without mutating saved records just by opening them.
    const execution=j.workExecution||data.ensureWorkExecution(JSON.parse(JSON.stringify(j)));
    return `<article class="panel detail-section v05-card" id="workExecutionCard"><h3>Active Work Order · ${esc(j.workOrderId)}</h3>${!j.finalAuthorization?'<p class="muted">Legacy work order: existing records retained. No customer authorization has been inferred.</p>':''}${totalStrip(j)}<form id="workExecutionForm"><fieldset ${closed(j)?'disabled':''}><legend>Installation progress</legend>${execution.lines.map((line,i)=>`<section class="v05-line"><div class="v05-line-head"><strong>${esc(line.category)}<small>${esc([line.brand,line.model].filter(Boolean).join(' · '))} · Qty ${esc(line.qty)}</small></strong><span>${esc(line.id)}</span></div><div class="v05-line-grid"><label>Status<select name="status-${i}">${statuses.map(s=>`<option ${line.status===s?'selected':''}>${s}</option>`).join('')}</select></label>${field('Serial number',`serialNumber-${i}`,line.serialNumber)}${field('Installed location',`installedLocation-${i}`,line.installedLocation)}${field('Labor hours',`laborHours-${i}`,line.laborHours,'number')}${notes('Technician notes',`technicianNotes-${i}`,line.technicianNotes)}${notes('Completion notes',`completionNotes-${i}`,line.completionNotes)}</div></section>`).join('')||'<p>No installation lines on this job.</p>'}${notes('Work order notes','executionNotes',execution.notes)}<button class="btn primary" type="submit">Save Work Progress</button></fieldset></form></article>
    <article class="panel detail-section v05-card"><h3>Change Orders</h3><p>Draft changes do not alter the authorized total. Record customer approval before carrying out additional work.</p>${(j.changeOrders||[]).map(co=>`<section class="v05-co"><div><strong>${esc(co.id)} · ${esc(co.status)}</strong><p>${esc(co.description)}</p><p>Reason: ${esc(co.reason)}<br>Schedule: ${esc(co.scheduleImpact||'No change noted')}</p></div><div class="v05-co-right"><strong>${money(co.totalDelta)}</strong>${co.status==='Draft'&&!closed(j)?`<form data-approve-co="${esc(co.id)}"><label>Customer signer<input name="signerName" required></label><label class="v05-check"><input type="checkbox" name="ack" required> Customer approved this change and price.</label><button class="btn secondary">Record Approval</button></form>`:`<small>${esc(co.signerName||'')} ${esc(co.approvedAt||'')}</small>`}</div></section>`).join('')||'<p>No change orders.</p>'}${!closed(j)?`<details><summary>Create change order draft</summary><form id="changeOrderForm"><div class="v05-form-grid">${notes('Reason','reason')}${notes('Additional / revised scope','description')}${field('Parts adjustment ($)','partsDelta',0,'number')}${field('Labor adjustment ($)','laborDelta',0,'number')}${field('Fees adjustment ($)','feesDelta',0,'number')}${field('Schedule impact','scheduleImpact')}</div><button class="btn primary">Save Change Order Draft</button></form></details>`:''}</article>`;
  };
  function bind(){const j=job(currentJobId);if(!j)return;
    const form=document.getElementById('workExecutionForm');if(form)form.onsubmit=e=>{e.preventDefault();if(closed(j))return;const fd=new FormData(form);const current=j.workExecution||data.ensureWorkExecution(JSON.parse(JSON.stringify(j)));const lines=current.lines.map((line,i)=>({...line,...Object.fromEntries(['status','serialNumber','installedLocation','laborHours','technicianNotes','completionNotes'].map(k=>[k,fd.get(`${k}-${i}`)??line[k]??'']))}));
      if(lines.some(l=>!Number.isFinite(Number(l.laborHours))||Number(l.laborHours)<0)){toast('Labor hours must be a non-negative number');return;}
      const started=lines.some(l=>l.status!=='Not Started'),complete=lines.length>0&&lines.every(l=>l.status==='Complete');
      j.workExecution={...current,lines,notes:fd.get('executionNotes'),startedAt:current.startedAt||(started?now():''),completedAt:complete?(current.completedAt||now()):''};touch(j,'work_execution_saved');toast('Work progress saved');};
    const coForm=document.getElementById('changeOrderForm');if(coForm)coForm.onsubmit=e=>{e.preventDefault();if(closed(j))return;const p=Object.fromEntries(new FormData(coForm));if(!p.reason.trim()||!p.description.trim()){toast('Reason and scope are required');return;}if(['partsDelta','laborDelta','feesDelta'].some(k=>!Number.isFinite(Number(p[k])))){toast('Enter valid price adjustments');return;}const co=data.createChangeOrder(j,{...p,id:uid('CO')});touch(j,'change_order_drafted',{changeOrderId:co.id});toast('Change order saved as draft');};
    document.querySelectorAll('[data-approve-co]').forEach(f=>f.onsubmit=e=>{e.preventDefault();if(closed(j))return;const fd=new FormData(f),name=String(fd.get('signerName')||'').trim(),co=(j.changeOrders||[]).find(c=>c.id===f.dataset.approveCo);if(!fd.get('ack')||!name||!co||co.status!=='Draft')return;if(data.authorizedTotal(j)+co.totalDelta<0){toast('Authorized total cannot be negative');return;}data.approveChangeOrder(j,co.id,name);const ex=data.ensureWorkExecution(j);ex.lines.push({id:'WL-'+co.id,changeOrderId:co.id,category:co.description,brand:'',model:'',qty:1,status:'Not Started',serialNumber:'',installedLocation:'',laborHours:'',technicianNotes:'',completionNotes:''});ex.completedAt='';touch(j,'change_order_approved',{changeOrderId:co.id,totalDelta:co.totalDelta});toast('Change approved and added to work order');});
  }
  const baseDetail=renderJobDetail;renderJobDetail=function(){baseDetail();bind();};
  const baseStatus=setStatus;setStatus=function(status){const j=job(currentJobId);if(!j)return;
    if(['In Progress','Waiting on Customer','Waiting on Parts','QC','Ready for Pickup','Delivered','Closed'].includes(status)&&!j.workOrderId){toast('Create an authorized work order first');return;}
    if(['QC','Ready for Pickup','Delivered','Closed'].includes(status)&&j.workExecution?.lines?.some(l=>l.status!=='Complete')){toast('Complete all work lines before QC or delivery');return;}
    baseStatus(status);
  };
  if(currentJobId)renderJobDetail();
})();
