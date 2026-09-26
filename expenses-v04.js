// TTT Expenses v04 — normalized multi-job and work-order allocation
(function(){
  const EXP_KEY='ttt-os-expenses-v1', OS_KEY='ttt-os-v0.2';
  const CATS=['Installation Materials','Window Tint Materials','Audio & Electronics','Tools & Equipment','Shop Supplies','Software & Subscriptions','Fuel','Parking & Tolls','Travel','Business Meal','Marketing','Professional Services','Shipping','Other / Needs Classification'];
  const TYPES=['Existing Job','General TTT Expense','Inventory / Stock','Capital Asset','Personal / Non-reimbursable'];
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(+n||0);
  function os(){return read(OS_KEY,{jobs:[],customers:[],vehicles:[]})}
  function expenseState(){return read(EXP_KEY,{expenses:[]})}
  function jobLabel(j,d){const c=(d.customers||[]).find(x=>x.id===j.customerId),v=(d.vehicles||[]).find(x=>x.id===j.vehicleId);return [j.id,c?.name,[v?.year,v?.make,v?.model].filter(Boolean).join(' '),j.status].filter(Boolean).join(' · ')}
  function jobOptions(selected=''){const d=os();return (d.jobs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(j=>'<option value="'+esc(j.id)+'" '+(selected===j.id?'selected':'')+'>'+esc(jobLabel(j,d))+'</option>').join('')}
  function workOrderOptions(jobId='',selected=''){
    const d=os(),rows=(d.jobs||[]).filter(j=>j.workOrderId&&(!jobId||j.id===jobId));
    return rows.map(j=>'<option value="'+esc(j.workOrderId)+'" data-job-id="'+esc(j.id)+'" '+(selected===j.workOrderId?'selected':'')+'>'+esc(j.workOrderId+' · '+jobLabel(j,d))+'</option>').join('');
  }
  function currentExpense(){const id=document.querySelector('.ex-dialog .eyebrow')?.textContent?.trim();return expenseState().expenses.find(x=>x.id===id)}
  function parseItems(exp){try{return Array.isArray(exp?.lineItems)?exp.lineItems:JSON.parse(exp?.lineItemsJson||'[]')}catch{return []}}
  function makeId(){return 'LI-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6)}
  function rowHTML(item={}){
    const allocation=item.allocationType||'Existing Job';
    return '<div class="ex-li-row" data-li-id="'+esc(item.id||makeId())+'">'+
      '<label class="ex-li-desc">Item / description<input data-li="description" value="'+esc(item.description||'')+'" placeholder="e.g. 12/2 wire, heat gun, trim clips"></label>'+
      '<label>Qty<input data-li="qty" type="number" min="0" step=".01" value="'+esc(item.qty||1)+'"></label>'+
      '<label>Line total ($)<input data-li="amount" type="number" min="0" step=".01" value="'+esc(item.amount||'')+'"></label>'+
      '<label>Allocation<select data-li="allocationType">'+TYPES.map(x=>'<option '+(allocation===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label class="ex-li-job">Job<select data-li="jobId"><option value="">Select job</option>'+jobOptions(item.jobId||'')+'</select></label>'+
      '<label class="ex-li-workorder">Work Order<select data-li="workOrderId"><option value="">Optional work order</option>'+workOrderOptions(item.jobId||'',item.workOrderId||'')+'</select></label>'+
      '<label>Category<select data-li="category"><option value="">Use receipt category</option>'+CATS.map(x=>'<option '+(item.category===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label class="ex-li-note">Note<input data-li="note" value="'+esc(item.note||'')+'" placeholder="Optional allocation note"></label>'+
      '<button type="button" class="ex-li-remove" title="Remove line">×</button>'+
    '</div>';
  }
  function collect(section){
    return [...section.querySelectorAll('.ex-li-row')].map(r=>({
      id:r.dataset.liId,
      description:r.querySelector('[data-li="description"]').value.trim(),
      qty:+r.querySelector('[data-li="qty"]').value||1,
      amount:+r.querySelector('[data-li="amount"]').value||0,
      allocationType:r.querySelector('[data-li="allocationType"]').value,
      jobId:r.querySelector('[data-li="jobId"]').value,
      workOrderId:r.querySelector('[data-li="workOrderId"]').value,
      category:r.querySelector('[data-li="category"]').value,
      note:r.querySelector('[data-li="note"]').value.trim()
    })).filter(x=>x.description||x.amount);
  }
  function enhance(){
    const form=document.getElementById('exForm'); if(!form||form.dataset.linesV3)return; form.dataset.linesV3='1';
    const anchor=document.getElementById('exMeal')||form.querySelector('.ex-span');
    const exp=currentExpense(),items=parseItems(exp);
    const section=document.createElement('div');section.className='ex-lineitems ex-span';section.innerHTML=
      '<div class="ex-li-head"><div><strong>Receipt line items & allocations</strong><span>Split one receipt across jobs, stock, assets or general expenses.</span></div><div><button type="button" class="btn secondary compact" id="exExtractItems">Extract line items</button> <button type="button" class="btn secondary compact" id="exAddLine">+ Add item</button></div></div>'+
      '<div id="exLineRows">'+(items.length?items.map(rowHTML).join(''):rowHTML()).concat('</div>')+
      '<input type="hidden" name="lineItemsJson" id="exLineItemsJson">'+
      '<div class="ex-li-summary"><span>Receipt total: <strong id="exReceiptTotal">$0.00</strong></span><span>Allocated: <strong id="exAllocated">$0.00</strong></span><span>Difference: <strong id="exDifference">$0.00</strong></span></div>'+
      '<div id="exLineWarning" class="ex-ocr"></div>';
    form.insertBefore(section,anchor);
    if(!document.getElementById('exLineStyle')){const s=document.createElement('style');s.id='exLineStyle';s.textContent=
      '.ex-lineitems{background:#fff;border:1px solid #dce4ee;border-radius:13px;padding:14px}.ex-li-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.ex-li-head span{display:block;color:#7a889b;font-size:10px;margin-top:3px}.ex-li-row{display:grid;grid-template-columns:2fr .55fr .8fr 1.05fr 1.35fr 1.45fr 1.15fr 1.35fr 32px;gap:8px;align-items:end;padding:10px 0;border-top:1px solid #edf1f5}.ex-li-row:first-child{border-top:0}.ex-li-row label{min-width:0}.ex-li-remove{height:36px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-size:18px}.ex-li-summary{display:flex;gap:18px;justify-content:flex-end;border-top:1px solid #e5eaf0;padding-top:10px;margin-top:8px;font-size:11px}.ex-li-summary strong{margin-left:4px}.ex-li-job.hidden{display:none}.ex-li-summary .bad{color:#a35d00}@media(max-width:1050px){.ex-li-row{grid-template-columns:2fr .6fr 1fr 1.3fr}.ex-li-note,.ex-li-job,.ex-li-workorder{grid-column:span 2}.ex-li-remove{grid-column:4}}@media(max-width:680px){.ex-li-head{align-items:stretch;flex-direction:column}.ex-li-row{grid-template-columns:1fr 1fr}.ex-li-desc,.ex-li-job,.ex-li-workorder,.ex-li-note{grid-column:1/-1}.ex-li-remove{grid-column:2}.ex-li-summary{flex-direction:column;gap:4px}}';document.head.appendChild(s)}
    const rows=section.querySelector('#exLineRows'),hidden=section.querySelector('#exLineItemsJson'),warn=section.querySelector('#exLineWarning');
    function update(){
      [...rows.querySelectorAll('.ex-li-row')].forEach(r=>{
        const t=r.querySelector('[data-li="allocationType"]').value,j=r.querySelector('.ex-li-job'),w=r.querySelector('.ex-li-workorder');
        const linked=t==='Existing Job';j.classList.toggle('hidden',!linked);w.classList.toggle('hidden',!linked);
      });
      const data=collect(section);hidden.value=JSON.stringify(data);
      const allocated=data.reduce((a,x)=>a+(+x.amount||0),0),total=+form.elements.total.value||0,diff=total-allocated;
      section.querySelector('#exReceiptTotal').textContent=money(total);section.querySelector('#exAllocated').textContent=money(allocated);section.querySelector('#exDifference').textContent=money(diff);
      section.querySelector('#exDifference').classList.toggle('bad',Math.abs(diff)>.01);
      const badJobs=data.filter(x=>x.allocationType==='Existing Job'&&!x.jobId&&!x.workOrderId).length;
      warn.textContent=badJobs?badJobs+' linked item(s) still need a Job or Work Order selected.':(data.length&&Math.abs(diff)>.01?'Line items do not yet reconcile to the receipt total. Tax/tip can remain at receipt level, so a difference is allowed but should be reviewed.':'');
    }
    function bindRow(r){
      const job=r.querySelector('[data-li="jobId"]'),wo=r.querySelector('[data-li="workOrderId"]');
      job?.addEventListener('change',()=>{
        const selected=wo.value;wo.innerHTML='<option value="">Optional work order</option>'+workOrderOptions(job.value,selected);
        if(selected&&![...wo.options].some(o=>o.value===selected))wo.value='';
        update();
      });
      wo?.addEventListener('change',()=>{
        const opt=wo.selectedOptions?.[0],owner=opt?.dataset?.jobId;
        if(owner&&job.value!==owner)job.value=owner;
        update();
      });
      r.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',update));
      r.querySelector('.ex-li-remove').onclick=()=>{r.remove();if(!rows.children.length)rows.insertAdjacentHTML('beforeend',rowHTML());[...rows.children].forEach(bindRow);update()};
    }
    [...rows.children].forEach(bindRow);
    section.querySelector('#exAddLine').onclick=()=>{rows.insertAdjacentHTML('beforeend',rowHTML());bindRow(rows.lastElementChild);update()};
    section.querySelector('#exExtractItems').onclick=async()=>{
      const file=form.querySelector('#exReceipt')?.files?.[0];if(!file||!file.type.startsWith('image/')){warn.textContent='Choose a receipt photo first, then extract line items.';return}
      if(!window.Tesseract){warn.textContent='Receipt OCR is unavailable.';return}
      warn.textContent='Reading item lines from receipt…';
      try{
        const r=await Tesseract.recognize(file,'eng');const lines=String(r.data.text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
        const parsed=[];for(const line of lines){if(/subtotal|sales tax|\btax\b|total|balance|amount due|tip|gratuity|change|cash|visa|mastercard|amex/i.test(line))continue;const m=line.match(/^(.*?)[\s$]+(\d{1,5}[.,]\d{2})\s*$/);if(!m)continue;const desc=m[1].replace(/^\d+\s*[xX@]\s*/,'').trim();const amount=+m[2].replace(',','.');if(desc.length<2||!amount)continue;parsed.push({description:desc,amount,qty:1,allocationType:'Existing Job'})}
        if(!parsed.length){warn.textContent='No confident item lines found. Add them manually or try a clearer photo.';return}
        rows.innerHTML=parsed.slice(0,40).map(rowHTML).join('');[...rows.children].forEach(bindRow);update();warn.textContent='✓ Extracted '+parsed.slice(0,40).length+' possible line items. Verify descriptions, amounts and allocations.';
      }catch(e){warn.textContent='Line-item extraction failed. Manual line entry remains available.'}
    };
    form.elements.total?.addEventListener('input',update);
    const receiptJob=form.elements.jobRef; if(receiptJob)receiptJob.addEventListener('change',()=>{[...rows.querySelectorAll('.ex-li-row')].forEach(r=>{const j=r.querySelector('[data-li="jobId"]');if(!j.value&&receiptJob.value)j.value=receiptJob.value});update()});
    form.addEventListener('submit',()=>{update();const id=document.querySelector('.ex-dialog .eyebrow')?.textContent?.trim(),snapshot=hidden.value;setTimeout(()=>{const st=expenseState(),e=st.expenses.find(x=>x.id===id)||st.expenses[st.expenses.length-1];if(!e)return;try{e.lineItems=JSON.parse(snapshot||'[]')}catch{e.lineItems=[]}e.allocationSummary=e.lineItems.reduce((a,x)=>{const k=x.allocationType==='Existing Job'?([x.jobId,x.workOrderId].filter(Boolean).join(' / ')||'Unassigned Work'):x.allocationType;a[k]=(a[k]||0)+(+x.amount||0);return a},{});localStorage.setItem(EXP_KEY,JSON.stringify(st));window.TTTExpenseCloud?.queueFromLocal();window.TTTExpenses?.render?.()},0)},true);
    update();
  }
  const observer=new MutationObserver(enhance);observer.observe(document.documentElement,{childList:true,subtree:true});enhance();
})();