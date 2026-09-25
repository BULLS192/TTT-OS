// TTT Expenses refinement v02
(function(){
 const KEY='ttt-os-expenses-v1',DB='ttt-os-v0.2';
 const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch{return d}};
 const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
 function os(){return read(DB,{jobs:[],customers:[],vehicles:[]})}
 function ctx(id){const d=os(),j=d.jobs.find(x=>x.id===id);if(!j)return null;return {j,c:d.customers.find(x=>x.id===j.customerId),v:d.vehicles.find(x=>x.id===j.vehicleId)}}
 function suggest(s){s=s.toLowerCase();if(/restaurant|grill|cafe|coffee|steak|pizza|burger|kitchen|tavern|bistro/.test(s))return ['Business meal','Business Meal'];if(/shell|exxon|chevron|valero|mobil|fuel|gasoline/.test(s))return [null,'Fuel'];if(/home depot|lowe|harbor freight/.test(s))return [null,'Tools & Equipment'];if(/vercel|google|microsoft|adobe|github|software/.test(s))return [null,'Software & Subscriptions'];if(/fedex|ups|usps/.test(s))return [null,'Shipping'];return []}
 function duplicate(form,id){const st=read(KEY,{expenses:[]}),o=Object.fromEntries(new FormData(form).entries());return st.expenses.find(x=>x.id!==id&&String(x.merchant||'').toLowerCase()===String(o.merchant||'').toLowerCase()&&x.date===o.date&&Math.abs((+x.total||0)-(+o.total||0))<.01)}
 function enhance(){
  const form=document.getElementById('exForm');if(!form||form.dataset.v2)return;form.dataset.v2='1';
  const job=form.elements.jobRef,merchant=form.elements.merchant,cat=form.elements.category,type=form.elements.type,box=document.getElementById('exChecks');
  if(job&&job.tagName==='SELECT'){
   const info=document.createElement('div');info.className='ex-rule info';info.style.marginTop='6px';job.parentElement.appendChild(info);
   const update=()=>{const x=ctx(job.value);info.style.display=x?'block':'none';info.innerHTML=x?'<strong>Linked record</strong><br>'+esc([x.j.id,x.c?.name,[x.v?.year,x.v?.make,x.v?.model].filter(Boolean).join(' '),x.j.workOrderId||'',x.j.status].filter(Boolean).join(' · ')):''};job.addEventListener('change',update);update();
  }
  const review=()=>{if(!box)return;const d=duplicate(form,form.closest('.ex-dialog')?.querySelector('.eyebrow')?.textContent);const parts=[];if(d)parts.push('<div class="ex-rule warn"><strong>Possible duplicate</strong><br>Matches '+esc(d.id)+' by merchant, date and total.</div>');const x=ctx(job?.value);if(x)parts.push('<div class="ex-rule info"><strong>Expense allocation</strong><br>This expense will retain links to '+esc(x.j.id)+(x.j.workOrderId?' / '+esc(x.j.workOrderId):'')+', '+esc(x.c?.name||'customer')+' and the vehicle record.</div>');box.innerHTML=parts.join('')};
  [merchant,form.elements.date,form.elements.total,job].filter(Boolean).forEach(x=>x.addEventListener('input',review));
  merchant?.addEventListener('change',()=>{const a=suggest(merchant.value);if(a[0]&&type.value==='Business expense'){type.value=a[0];type.dispatchEvent(new Event('change'))}if(a[1]&&!cat.value)cat.value=a[1]});
  ['subtotal','tax','tip'].forEach(n=>form.elements[n]?.addEventListener('input',()=>{const sub=+form.elements.subtotal.value||0,tax=+form.elements.tax.value||0,tip=+form.elements.tip.value||0;if(sub)form.elements.total.value=(sub+tax+tip).toFixed(2)}));
  form.addEventListener('submit',()=>{const st=read(KEY,{expenses:[]});setTimeout(()=>{const latest=st.expenses[st.expenses.length-1];const x=ctx(job?.value);if(latest&&x){latest.customerId=x.j.customerId;latest.vehicleId=x.j.vehicleId;latest.workOrderId=x.j.workOrderId||'';latest.jobSnapshot={jobId:x.j.id,customer:x.c?.name||'',vehicle:[x.v?.year,x.v?.make,x.v?.model].filter(Boolean).join(' '),status:x.j.status};localStorage.setItem(KEY,JSON.stringify(st));window.TTTExpenseCloud?.queueFromLocal()}},0)},true);
  review();
 }
 const obs=new MutationObserver(()=>enhance());obs.observe(document.documentElement,{childList:true,subtree:true});enhance();
})();