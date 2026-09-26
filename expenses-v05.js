// TTT OS Expenses v0.5 — receipt exceptions, personnel purchasers and compliance
(function(){
  const KEY='ttt-os-expenses-v1';
  const CATS=['Installation Materials','Window Tint Materials','Audio & Electronics','Tools & Equipment','Shop Supplies','Software & Subscriptions','Fuel','Parking & Tolls','Travel','Business Meal','Marketing','Professional Services','Shipping','Other / Needs Classification'];
  const TYPES=['Business expense','Business meal','Mileage','Refund / credit','Other'];
  const IRS='https://www.irs.gov/publications/p463';
  const RECORDS='https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping';
  const TEXAS='https://comptroller.texas.gov/taxes/sales/faq/records.php';
  let state=load();
  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY))||{expenses:[],policies:{alcoholPct:30,receiptThreshold:75}};
      s.policies=Object.assign({alcoholPct:30,receiptThreshold:75},s.policies||{});
      (s.expenses||[]).forEach(e=>{
        if(e.type==='No receipt'){
          e.type='Other';e.noReceipt=true;e.receiptStatus='missing_declared';
          e.missingReceiptReason=e.missingReceiptReason||'Legacy record migrated from the former "No receipt" expense type';
        }
      });
      return s;
    }catch(e){return {expenses:[],policies:{alcoholPct:30,receiptThreshold:75}}}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));window.TTTExpenseCloud?.queueSave(state)}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0)}
  function id(){const d=new Date();return 'EXP-'+d.getFullYear()+'-'+d.toISOString().slice(5,10).replace('-','')+'-'+d.toTimeString().slice(0,8).replaceAll(':','')+'-'+Math.random().toString(36).slice(2,4).toUpperCase()}
  function osDB(){
    try{
      const local=JSON.parse(localStorage.getItem('ttt-os-v0.2'))||{};
      return Object.assign({jobs:[],customers:[],vehicles:[],personnel:[]},local,{personnel:Array.isArray(window.db?.personnel)?window.db.personnel:(local.personnel||[])});
    }catch(e){return {jobs:[],customers:[],vehicles:[],personnel:Array.isArray(window.db?.personnel)?window.db.personnel:[]}}
  }
  function personnelOptions(selected=''){
    const people=(osDB().personnel||[]).filter(p=>!p.archivedAt&&!p.archived_at).slice().sort((a,b)=>String(a.displayName||'').localeCompare(String(b.displayName||'')));
    const names=new Set(people.map(p=>String(p.displayName||'').trim()).filter(Boolean));
    let out=people.map(p=>'<option value="'+esc(p.displayName||'')+'" '+(selected===p.displayName?'selected':'')+'>'+esc(p.displayName||'Unnamed person')+(p.status&&p.status!=='Active'?' · '+esc(p.status):'')+'</option>').join('');
    if(selected&&!names.has(String(selected).trim()))out='<option value="'+esc(selected)+'" selected>'+esc(selected)+' · Legacy</option>'+out;
    if(!out)out='<option value="">No personnel available</option>';
    return out;
  }
  function defaultPurchaser(){
    const people=osDB().personnel||[],personId=window.TTTCloud?.profile?.person_id;
    return people.find(p=>p.id===personId)?.displayName||window.TTTCloud?.user?.user_metadata?.display_name||people[0]?.displayName||'';
  }
  function receiptRequired(e){return Number(e.total||0)>=Number(state.policies.receiptThreshold||75);}
  function hasReceipt(e){return !!(e.receiptName||e.receiptPath);}
  function jobOptions(selected=''){const d=osDB();return (d.jobs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(j=>{const cu=(d.customers||[]).find(x=>x.id===j.customerId),v=(d.vehicles||[]).find(x=>x.id===j.vehicleId);const label=[j.id,cu?.name,[v?.year,v?.make,v?.model].filter(Boolean).join(' '),j.status].filter(Boolean).join(' · ');return '<option value="'+esc(j.id)+'" '+(selected===j.id?'selected':'')+'>'+esc(label)+'</option>'}).join('')}
  function parseReceiptText(text){
    const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    const amounts=[];lines.forEach((line,i)=>{const ms=[...line.matchAll(/(?:\$\s*)?(\d{1,5}[.,]\d{2})\b/g)];ms.forEach(m=>amounts.push({i,line,val:+m[1].replace(',','.')||0}))});
    const totalHit=[...amounts].reverse().find(x=>/\b(total|amount due|balance due|grand total)\b/i.test(x.line));
    const taxHit=[...amounts].reverse().find(x=>/\b(tax|sales tax)\b/i.test(x.line));
    const subHit=[...amounts].reverse().find(x=>/\b(subtotal|sub total)\b/i.test(x.line));
    const tipHit=[...amounts].reverse().find(x=>/\b(tip|gratuity)\b/i.test(x.line));
    const dateMatch=String(text).match(/\b(20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.](?:20)?\d{2})\b/);
    let date='';if(dateMatch){const p=dateMatch[1].replace(/[.]/g,'/').split(/[\/-]/);if(p[0].length===4)date=[p[0],p[1].padStart(2,'0'),p[2].padStart(2,'0')].join('-');else{let y=p[2];if(y.length===2)y='20'+y;date=[y,p[0].padStart(2,'0'),p[1].padStart(2,'0')].join('-')}}
    const merchant=lines.find(x=>x.length>=3&&x.length<=60&&!/receipt|invoice|thank|welcome|www\.|http|tel[: ]|phone|date|time|cashier/i.test(x)&&!/^\W*[\d$]/.test(x))||'';
    return {merchant,date,subtotal:subHit?.val||'',tax:taxHit?.val||'',tip:tipHit?.val||'',total:totalHit?.val||(amounts.length?Math.max(...amounts.map(x=>x.val)):'')};
  }
  function setIfBlank(form,name,val){const el=form.elements[name];if(el&&val!==''&&val!=null&&!el.value)el.value=val}
  async function runOCR(file,form,statusEl){
    if(!file||!file.type.startsWith('image/')){statusEl.textContent='OCR currently reads receipt photos/images. PDFs remain attached for manual entry.';return}
    if(!window.Tesseract){statusEl.textContent='Receipt reader is unavailable. You can still enter the fields manually.';return}
    statusEl.textContent='Reading receipt…';statusEl.className='ex-ocr working';
    try{const r=await Tesseract.recognize(file,'eng',{logger:m=>{if(m.status==='recognizing text')statusEl.textContent='Reading receipt… '+Math.round((m.progress||0)*100)+'%'}});const parsed=parseReceiptText(r.data.text);setIfBlank(form,'merchant',parsed.merchant);setIfBlank(form,'date',parsed.date);setIfBlank(form,'subtotal',parsed.subtotal);setIfBlank(form,'tax',parsed.tax);setIfBlank(form,'tip',parsed.tip);setIfBlank(form,'total',parsed.total);statusEl.textContent='✓ Receipt read. Please verify every extracted field before saving.';statusEl.className='ex-ocr success'}catch(err){statusEl.textContent='Could not read this receipt confidently. Try a clearer photo or enter it manually.';statusEl.className='ex-ocr warn'}
  }
  function status(e){
    const missing=[];
    if(!e.merchant)missing.push('merchant');if(!e.date)missing.push('date');if(!e.total)missing.push('amount');if(!e.businessPurpose)missing.push('business purpose');if(!e.category)missing.push('category');if(!e.purchasedBy)missing.push('purchaser');
    if(e.type==='Business meal'&&!e.attendees)missing.push('attendees');
    if(e.noReceipt&&!String(e.missingReceiptReason||'').trim())missing.push('missing receipt explanation');
    if(receiptRequired(e)&&!hasReceipt(e)&&!e.noReceipt)missing.push('receipt or missing-receipt declaration');
    return missing.length?{label:'Needs Review',missing}:{label:e.noReceipt?'Receipt Exception':'Documentation Complete',missing:[]};
  }
  function compliance(e){
    const s=status(e), flags=[];
    if(e.noReceipt){
      flags.push({level:receiptRequired(e)?'policy':'warn',text:'Missing receipt declared'+(e.missingReceiptReason?': '+e.missingReceiptReason:'')});
      if(receiptRequired(e))flags.push({level:'policy',text:'Receipt exception is above the TTT receipt-review threshold of '+money(state.policies.receiptThreshold)+'. Manager/admin review is recommended.'});
    }else if(!hasReceipt(e)&&receiptRequired(e)) flags.push({level:'warn',text:'Receipt or missing-receipt declaration required by TTT policy threshold'});
    if(s.missing.length) flags.push({level:'warn',text:'Missing: '+s.missing.join(', ')});
    if(e.type==='Business meal'){
      const pre=(+e.food||0)+(+e.alcohol||0); const pct=pre?((+e.alcohol||0)/pre*100):0;
      if(pct>state.policies.alcoholPct) flags.push({level:'policy',text:'Alcohol is '+pct.toFixed(0)+'% of food + alcohol, above TTT internal '+state.policies.alcoholPct+'% review threshold'});
      flags.push({level:'info',text:'Business meals are flagged for accountant review; qualifying meals are generally subject to federal limitations.'});
    }
    if(e.paymentSource==='Personal') flags.push({level:'info',text:'Reimbursement due to '+(e.purchasedBy||'purchaser')});
    return flags;
  }
  function injectStyle(){if(document.getElementById('expenseStyle'))return;const s=document.createElement('style');s.id='expenseStyle';s.textContent=`
  .ex-head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.ex-actions{display:flex;gap:8px;flex-wrap:wrap}.ex-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.ex-kpi,.ex-card{background:#fff;border:1px solid #e0e6ef;border-radius:14px;padding:16px}.ex-kpi span{color:#748297;font-size:11px;font-weight:800}.ex-kpi strong{display:block;font-size:25px;margin-top:5px}.ex-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:14px}.ex-table{width:100%;border-collapse:collapse}.ex-table th,.ex-table td{text-align:left;padding:10px;border-bottom:1px solid #edf1f5;font-size:12px}.ex-table th{color:#7b899b;font-size:10px;text-transform:uppercase}.ex-pill{display:inline-block;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800;background:#edf5ff;color:#1557c0}.ex-pill.warn{background:#fff3d6;color:#8a6100}.ex-compliance{display:grid;gap:8px}.ex-rule{border:1px solid #e1e7ef;border-radius:10px;padding:10px;font-size:11px;line-height:1.45}.ex-rule.warn,.ex-rule.policy{background:#fff8e8;border-color:#f0dfae}.ex-rule.info{background:#edf5ff;border-color:#cfe2fb}.ex-modal{position:fixed;inset:0;background:#07101dcc;z-index:9999;display:grid;place-items:center;padding:18px}.ex-dialog{background:#f7f9fc;border-radius:16px;width:min(900px,100%);max-height:94vh;overflow:auto;padding:20px}.ex-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ex-form label{display:grid;gap:5px;font-size:11px;font-weight:750;color:#5e6d81}.ex-form input,.ex-form select,.ex-form textarea{width:100%;box-sizing:border-box}.ex-span{grid-column:1/-1}.ex-meal{grid-column:1/-1;background:#fff;border:1px solid #e0e6ef;border-radius:12px;padding:14px}.ex-meal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.ex-preview{max-width:180px;max-height:130px;border-radius:8px;margin-top:7px}.ex-foot{display:flex;justify-content:space-between;gap:10px;margin-top:16px}.ex-ref a{display:block;color:#1557c0;margin:7px 0;font-size:11px}.ex-empty{padding:28px;text-align:center;color:#8190a3}.ex-ocr{display:block;margin-top:6px;font-size:10px;color:#6f7f92}.ex-ocr.working{color:#1557c0}.ex-ocr.success{color:#287449}.ex-ocr.warn{color:#9a6800}.ex-receipt-box{border:1px solid #dce4ee;border-radius:12px;padding:12px;background:#fbfcfe}.ex-receipt-box>strong{display:block;margin-bottom:8px}.ex-receipt-check{display:flex!important;align-items:flex-start;gap:8px!important;margin-top:10px;color:#26364d!important}.ex-receipt-check input{width:auto!important;margin-top:2px!important}.ex-receipt-check span{display:block}.ex-receipt-check small{display:block;color:#7b8798;margin-top:2px}.ex-missing-receipt{margin-top:10px;padding:10px;border-radius:9px;background:#fff8e8;border:1px solid #f0dfae}.ex-missing-receipt[hidden]{display:none}.ex-receipt-status{display:inline-block;margin-top:7px;font-size:10px;font-weight:800}.ex-receipt-status.exception{color:#8a6100}
  @media(max-width:850px){.ex-kpis{grid-template-columns:1fr 1fr}.ex-grid{grid-template-columns:1fr}.ex-form,.ex-meal-grid{grid-template-columns:1fr}.ex-head{align-items:stretch;flex-direction:column}} @media(max-width:520px){.ex-kpis{grid-template-columns:1fr}.ex-dialog{padding:14px}.ex-foot{flex-direction:column}}
  `;document.head.appendChild(s)}
  function addNav(){/* Navigation is owned centrally by nav-shell-v03. */}
  function addView(){const main=document.querySelector('main.main');if(!main||document.getElementById('expenses'))return;const s=document.createElement('section');s.id='expenses';s.className='view';main.insertBefore(s,document.getElementById('warranty'));render()}
  function showView(){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));document.getElementById('expenses').classList.add('active');document.querySelector('[data-view="expenses"]').classList.add('active');const t=document.getElementById('pageTitle');if(t)t.textContent='Expenses';render()}
  function render(){
    const root=document.getElementById('expenses');if(!root)return;const total=state.expenses.reduce((a,e)=>a+(+e.total||0),0);const reimb=state.expenses.filter(e=>e.paymentSource==='Personal'&&!e.reimbursed).reduce((a,e)=>a+(+e.total||0),0);const review=state.expenses.filter(e=>status(e).missing.length||compliance(e).some(f=>f.level==='policy'||f.level==='warn')).length;
    const rows=state.expenses.slice().reverse().map(e=>{const st=status(e);return `<tr><td><strong>${esc(e.merchant||'Unspecified')}</strong><br><span class="muted">${esc(e.id)}</span></td><td>${esc(e.date||'')}</td><td>${esc(e.category||'')}</td><td>${esc(e.purchasedBy||'')}</td><td><strong>${money(e.total)}</strong></td><td><span class="ex-pill ${st.missing.length?'warn':''}">${st.label}</span></td><td><button class="link-btn ex-open" data-id="${e.id}">Open</button></td></tr>`}).join('');
    root.innerHTML=`<div class="ex-head"><div><p class="eyebrow">FINANCE & RECORDS</p><h2>Expenses</h2><p class="muted">Capture receipts, document business purpose, manage reimbursements and run compliance checks.</p></div><div class="ex-actions"><button class="btn secondary" id="exPolicy">Compliance</button><button class="btn primary" id="exAdd">+ Add Expense</button></div></div>
    <div class="ex-kpis"><div class="ex-kpi"><span>RECORDED SPEND</span><strong>${money(total)}</strong></div><div class="ex-kpi"><span>EXPENSES</span><strong>${state.expenses.length}</strong></div><div class="ex-kpi"><span>REIMBURSEMENTS DUE</span><strong>${money(reimb)}</strong></div><div class="ex-kpi"><span>NEEDS REVIEW</span><strong>${review}</strong></div></div>
    <div class="ex-grid"><article class="ex-card"><div class="panel-head"><h3>Expense ledger</h3></div>${rows?`<div class="table-wrap"><table class="ex-table"><thead><tr><th>Merchant</th><th>Date</th><th>Category</th><th>Purchased by</th><th>Total</th><th>Documentation</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="ex-empty">No expenses yet. Photograph a receipt or enter the first purchase manually.</div>'}</article>
    <article class="ex-card"><h3>Compliance layer</h3><p class="muted">The app separates government guidance, TTT internal policy and accountant determinations.</p><div class="ex-compliance"><div class="ex-rule info"><strong>Federal recordkeeping</strong><br>Capture amount, date, vendor, evidence and business purpose where applicable.</div><div class="ex-rule info"><strong>Business meals</strong><br>Capture attendees, business relationship/purpose and itemized food/beverage amounts.</div><div class="ex-rule policy"><strong>TTT alcohol review</strong><br>Internal review threshold: ${state.policies.alcoholPct}% of food + alcohol. This is a company policy, not represented as an IRS limit.</div><div class="ex-rule info"><strong>Texas records</strong><br>Preserve purchase and sales/use-tax support with the transaction record.</div></div></article></div>`;
    document.getElementById('exAdd').onclick=()=>openForm();document.getElementById('exPolicy').onclick=openPolicy;root.querySelectorAll('.ex-open').forEach(b=>b.onclick=()=>openForm(state.expenses.find(e=>e.id===b.dataset.id)));
  }
  function openForm(existing){
    const e=existing||{id:id(),type:'Business expense',date:new Date().toISOString().slice(0,10),purchasedBy:defaultPurchaser(),paymentSource:'TTT Company',category:'',merchant:'',subtotal:'',tax:'',tip:'',total:'',businessPurpose:'',notes:'',attendees:'',businessRelationship:'',food:'',alcohol:'',jobRef:'',receiptName:'',receiptData:'',receiptPath:'',noReceipt:false,missingReceiptReason:'',receiptStatus:'not_provided'};
    const m=document.createElement('div');m.className='ex-modal';m.innerHTML=`<div class="ex-dialog"><div class="ex-head"><div><p class="eyebrow">${esc(e.id)}</p><h2>${existing?'Expense Record':'Add Expense'}</h2></div><button class="btn secondary" id="exClose">Close</button></div><form id="exForm" class="ex-form">
    <label>Expense type<select name="type">${TYPES.map(x=>`<option ${e.type===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Date<input type="date" name="date" value="${esc(e.date)}" required></label>
    <label>Merchant / vendor<input name="merchant" value="${esc(e.merchant)}" placeholder="Home Depot, restaurant, supplier…"></label><label>Category<select name="category"><option value="">Select category</option>${CATS.map(x=>`<option ${e.category===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Purchased by<select name="purchasedBy" required>${personnelOptions(e.purchasedBy)}</select></label><label>Payment source<select name="paymentSource"><option ${e.paymentSource==='TTT Company'?'selected':''}>TTT Company</option><option ${e.paymentSource==='Personal'?'selected':''}>Personal</option><option ${e.paymentSource==='Cash'?'selected':''}>Cash</option><option ${e.paymentSource==='Other'?'selected':''}>Other</option></select></label>
    <label>Subtotal ($)<input type="number" step=".01" name="subtotal" value="${esc(e.subtotal)}"></label><label>Sales tax ($)<input type="number" step=".01" name="tax" value="${esc(e.tax)}"></label><label>Tip ($)<input type="number" step=".01" name="tip" value="${esc(e.tip)}"></label><label>Total ($)<input type="number" step=".01" name="total" value="${esc(e.total)}" required></label>
    <label class="ex-span">Business purpose<textarea name="businessPurpose" placeholder="Why was this purchase made for TTT?">${esc(e.businessPurpose)}</textarea></label>
    <label>Related existing job<select name="jobRef"><option value="">No job / general business expense</option>${jobOptions(e.jobRef)}</select></label>
    <div class="ex-receipt-box"><strong>Receipt / invoice</strong><label>Upload evidence<input id="exReceipt" type="file" accept="image/*,.pdf" capture="environment"><span id="exReceiptName">${esc(hasReceipt(e)?(e.receiptName||'Receipt attached'):'Take photo or upload file')}</span><span id="exOcrStatus" class="ex-ocr">Receipt photos will be read automatically; extracted fields remain editable.</span></label><label class="ex-receipt-check"><input id="exNoReceipt" type="checkbox" name="noReceipt" ${e.noReceipt?'checked':''} ${hasReceipt(e)?'disabled':''}><span><strong>No receipt available</strong><small>Use only when receipt/invoice evidence cannot be obtained. This creates a documented exception for review.</small></span></label><div class="ex-missing-receipt" id="exMissingReceipt" ${e.noReceipt?'':'hidden'}><label>Why is the receipt unavailable?<textarea name="missingReceiptReason" placeholder="Lost receipt, merchant did not issue one, cash purchase, etc.">${esc(e.missingReceiptReason||'')}</textarea></label><span class="ex-receipt-status exception">Missing-receipt declaration</span></div></div>
    <div class="ex-meal" id="exMeal"><strong>Business meal documentation</strong><div class="ex-meal-grid"><label>Food ($)<input type="number" step=".01" name="food" value="${esc(e.food)}"></label><label>Alcohol ($)<input type="number" step=".01" name="alcohol" value="${esc(e.alcohol)}"></label><label>Attendees<input name="attendees" value="${esc(e.attendees)}" placeholder="Names / CRM contacts"></label><label>Business relationship<input name="businessRelationship" value="${esc(e.businessRelationship)}" placeholder="Customer, prospect, vendor…"></label><label>Meal purpose<input name="mealPurpose" value="${esc(e.mealPurpose||'')}" placeholder="Meeting purpose"></label><label>Meal type<select name="mealType"><option>Client / prospect</option><option>Employee / team</option><option>Travel meal</option><option>Conference / event</option><option>Other</option></select></label></div></div>
    <label class="ex-span">Notes / comments<textarea name="notes">${esc(e.notes)}</textarea></label><div class="ex-span" id="exChecks"></div><div class="ex-span ex-foot"><button type="button" class="btn secondary" id="exDelete">${existing?'Delete':'Cancel'}</button><button class="btn primary" type="submit">Save Expense</button></div></form></div>`;document.body.appendChild(m);
    const type=m.querySelector('[name=type]'),meal=m.querySelector('#exMeal'),noReceipt=m.querySelector('#exNoReceipt'),missingReceipt=m.querySelector('#exMissingReceipt'),receipt=m.querySelector('#exReceipt');
    function mealVis(){meal.style.display=type.value==='Business meal'?'block':'none'}
    function receiptVis(){
      const checked=!!noReceipt?.checked;missingReceipt.hidden=!checked;
      if(receipt&&!hasReceipt(e))receipt.disabled=checked;
      const reason=m.querySelector('[name=missingReceiptReason]');if(reason)reason.required=checked;
    }
    type.onchange=mealVis;noReceipt?.addEventListener('change',receiptVis);mealVis();receiptVis();
    m.querySelector('#exClose').onclick=()=>m.remove();m.querySelector('#exDelete').onclick=()=>{if(existing){state.expenses=state.expenses.filter(x=>x.id!==e.id);save();render()}m.remove()};
    m.querySelector('#exReceipt').onchange=ev=>{const f=ev.target.files[0];if(!f)return;e.receiptName=f.name;e.noReceipt=false;e.missingReceiptReason='';m.querySelector('#exReceiptName').textContent=f.name;if(noReceipt){noReceipt.checked=false;noReceipt.disabled=true;}receiptVis();const r=new FileReader();r.onload=()=>{e.receiptData=r.result};r.readAsDataURL(f);runOCR(f,m.querySelector('#exForm'),m.querySelector('#exOcrStatus'))};
    m.querySelector('#exForm').onsubmit=ev=>{
      ev.preventDefault();const form=ev.target,o=Object.fromEntries(new FormData(form).entries());
      o.noReceipt=!!form.elements.noReceipt?.checked;o.missingReceiptReason=String(form.elements.missingReceiptReason?.value||'').trim();
      if(o.noReceipt&&!o.missingReceiptReason){form.elements.missingReceiptReason?.setCustomValidity('Explain why the receipt is unavailable.');form.elements.missingReceiptReason?.reportValidity();return;}
      form.elements.missingReceiptReason?.setCustomValidity('');
      if(o.noReceipt){o.receiptStatus='missing_declared';o.missingReceiptDeclaredAt=e.missingReceiptDeclaredAt||new Date().toISOString();o.missingReceiptDeclaredBy=window.TTTCloud?.userId||null;}
      else{o.receiptStatus=hasReceipt(e)?'attached':'not_provided';o.missingReceiptDeclaredAt='';o.missingReceiptDeclaredBy='';o.missingReceiptReason='';}
      Object.assign(e,o);if(existing){Object.assign(existing,e)}else state.expenses.push(e);save();m.remove();render()
    };
  }
  function openPolicy(){const admin=window.TTTCloud?.profile?.role==='owner_admin';const m=document.createElement('div');m.className='ex-modal';m.innerHTML=`<div class="ex-dialog"><div class="ex-head"><div><p class="eyebrow">COMPLIANCE CENTER</p><h2>Expense Rules & References</h2></div><button class="btn secondary" id="pc">Close</button></div><div class="ex-grid"><article class="ex-card"><h3>TTT Internal Policy</h3><label>Alcohol review threshold (% of food + alcohol)<input id="alc" type="number" min="0" max="100" value="${state.policies.alcoholPct}" ${admin?'':'disabled'}></label><p class="muted">${admin?'This threshold triggers internal review only. It is not presented as a federal or Texas statutory percentage.':'Only the TTT OS administrator can change internal expense policy.'}</p>${admin?'<button class="btn primary" id="ps">Save policy</button>':''}</article><article class="ex-card ex-ref"><h3>Official references</h3><a href="${RECORDS}" target="_blank" rel="noopener">IRS — Business Recordkeeping</a><a href="${IRS}" target="_blank" rel="noopener">IRS Publication 463 — Travel, Gift and Car Expenses</a><a href="${TEXAS}" target="_blank" rel="noopener">Texas Comptroller — Sales & Use Tax Records</a><p class="muted">Tax treatment is presented as guidance/review logic, not a final accountant determination.</p></article></div></div>`;document.body.appendChild(m);m.querySelector('#pc').onclick=()=>m.remove();const ps=m.querySelector('#ps');if(ps)ps.onclick=()=>{state.policies.alcoholPct=Math.max(0,Math.min(100,+m.querySelector('#alc').value||0));save();m.remove();render()}}
  injectStyle();addNav();addView();window.TTTExpenses={state,render,openForm};
})();