// TTT OS v0.6 — service-aware product catalog + smart window tint configurator
// Loaded last so it can enhance New Job without disturbing the existing quote/check-in/work-order flow.
(function(){
  const serviceRowsEl=document.getElementById('serviceRows');
  const addBtn=document.getElementById('addServiceBtn');
  const form=document.getElementById('jobForm');
  if(!serviceRowsEl||!addBtn||!form) return;

  const CATALOG={
    'Car stereo installation':{
      'Alpine':['Custom / Other','iLX-F511 Halo11','iLX-507'],
      'JL Audio':['Custom / Other','VX1000/5i','XD600/1v2','C3-650'],
      'Kicker':['Custom / Other','KEY 200.4','CXA800.1','KS Series'],
      'Kenwood':['Custom / Other','DMX958XR','DMX1057XR'],
      'Sony':['Custom / Other','XAV-9500ES','Mobile ES'],
      'Other / Customer supplied':['Custom / Other']
    },
    'Marine audio':{
      'JL Audio':['Custom / Other'],'Kicker':['Custom / Other'],'Kenwood':['Custom / Other'],'Sony':['Custom / Other'],'Other / Customer supplied':['Custom / Other']
    },
    'Car alarms':{
      'Viper':['Custom / Other','DS4+','5706V','SmartStart'],'Compustar':['Custom / Other','CM-X','T13','DroneMobile'],'Other / Customer supplied':['Custom / Other']
    },
    'Radar detectors':{
      'Escort':['Custom / Other','MAX 360c MKII','Redline Ci 360c'],'Uniden':['Custom / Other','R8','R7','R4'],'Other / Customer supplied':['Custom / Other']
    },
    'Dash cams':{
      'Thinkware':['Custom / Other','U3000','Q1000'],'BlackVue':['Custom / Other','DR970X','DR770X'],'Other / Customer supplied':['Custom / Other']
    },
    'Paint protection':{
      'XPEL':['Custom / Other','ULTIMATE PLUS','STEALTH'],'3M':['Custom / Other','Scotchgard PPF'],'LLumar':['Custom / Other','Platinum PPF'],'Other / Customer supplied':['Custom / Other']
    },
    'Window tint':{
      'XPEL':['Custom / Other','PRIME XR PLUS'],'3M':['Custom / Other','Crystalline','Ceramic IR'],'LLumar':['Custom / Other','IRX','CTX'],'Other / Customer supplied':['Custom / Other']
    },
    'GPS trackers':{
      'Compustar':['Custom / Other','DroneMobile'],'Viper':['Custom / Other','SmartStart'],'Other / Customer supplied':['Custom / Other']
    },
    'Interior lighting':{'Other / Customer supplied':['Custom / Other']},
    'Exterior lighting':{'Other / Customer supplied':['Custom / Other']},
    'Truck accessories':{'Other / Customer supplied':['Custom / Other']},
    'Other':{'Other / Customer supplied':['Custom / Other']}
  };

  const PRODUCT_TECH={'PRIME XR PLUS':'IR Ceramic','Crystalline':'Multilayer Optical','Ceramic IR':'Ceramic','IRX':'IR Ceramic','CTX':'Ceramic'};
  const TECH_MULT={'Dyed':0.75,'Carbon':1,'Ceramic':1.35,'IR Ceramic':1.65,'Multilayer Optical':1.8,'Other':1};
  const VLTS=['5%','15%','20%','25%','30%','35%','40%','50%','55%','70%','80%','Custom'];
  const WINDOWS={
    windshield:{label:'Windshield',material:85,labor:125},
    brow:{label:'Windshield brow / strip',material:12,labor:33},
    front_left:{label:'Driver front window',material:28,labor:52},
    front_right:{label:'Passenger front window',material:28,labor:52},
    rear_left:{label:'Left rear door',material:25,labor:45},
    rear_right:{label:'Right rear door',material:25,labor:45},
    quarter_left:{label:'Left quarter glass',material:12,labor:28},
    quarter_right:{label:'Right quarter glass',material:12,labor:28},
    rear_glass:{label:'Rear windshield',material:45,labor:75},
    sunroof:{label:'Sunroof',material:35,labor:65},
    panoramic:{label:'Panoramic roof',material:65,labor:105}
  };
  const PRESETS={
    'Front 2':['front_left','front_right'],
    'Rear section':['rear_left','rear_right','quarter_left','quarter_right','rear_glass'],
    'Full vehicle':['front_left','front_right','rear_left','rear_right','quarter_left','quarter_right','rear_glass'],
    'Full + windshield':['windshield','front_left','front_right','rear_left','rear_right','quarter_left','quarter_right','rear_glass'],
    'Windshield only':['windshield']
  };

  function injectStyles(){
    if(document.getElementById('tttTintV06Styles')) return;
    const style=document.createElement('style');
    style.id='tttTintV06Styles';
    style.textContent=`
      .equipment-row.v06-smart-row{grid-template-columns:1.15fr 1fr 1.15fr 80px 1.4fr 38px;align-items:end}
      .v06-tint-config{grid-column:1/-1;border:1px solid #d9e6f6;background:#f8fbff;border-radius:12px;padding:14px;margin:4px 0 10px;display:grid;gap:12px}
      .v06-tint-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
      .v06-tint-head>div{display:grid;gap:3px}.v06-tint-head span:not(.badge){font-size:12px;color:#718197}
      .v06-tint-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .v06-tint-grid label{display:grid;gap:5px;color:#536176;font-size:11px;font-weight:700}
      .v06-tint-presets{display:flex;flex-wrap:wrap;gap:7px}
      .v06-tint-preset{border:1px solid #cad8e9;background:#fff;color:#35506f;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:750;cursor:pointer}
      .v06-tint-preset:hover{border-color:#7da6dc;background:#f2f7fe}
      .v06-tint-windows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .v06-tint-window{display:grid!important;grid-template-columns:1fr 92px;align-items:center;gap:8px!important;border:1px solid #e1e8f1;background:#fff;border-radius:9px;padding:8px 9px;color:#405069!important}
      .v06-tint-window>span{display:flex;align-items:center;gap:7px;font-size:12px}.v06-tint-window input{width:auto}
      .v06-tint-window select{padding:7px 8px;font-size:12px}
      .v06-tint-estimate{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:10px;align-items:end;background:#edf5ff;border:1px solid #d4e5fb;border-radius:10px;padding:11px}
      .v06-tint-estimate>div{display:grid;gap:3px}.v06-tint-estimate span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718197;font-weight:800}.v06-tint-estimate strong{font-size:15px;color:#193657}
      .v06-tint-disclaimer{margin:0;color:#7b899d;font-size:10px;line-height:1.45}
      .v06-tint-empty{font-size:12px;color:#7b899d;padding:8px 0}
      @media(max-width:1000px){.equipment-row.v06-smart-row{grid-template-columns:1fr 1fr}.v06-tint-grid{grid-template-columns:1fr 1fr}.v06-tint-estimate{grid-template-columns:1fr 1fr}.v06-tint-estimate .btn{width:100%}}
      @media(max-width:680px){.equipment-row.v06-smart-row,.v06-tint-grid,.v06-tint-windows,.v06-tint-estimate{grid-template-columns:1fr}.v06-tint-head{flex-direction:column}.v06-tint-window{grid-template-columns:1fr 100px}}
    `;
    document.head.appendChild(style);
  }

  const option=(text,selected=false)=>`<option ${selected?'selected':''}>${esc(text)}</option>`;
  function windowMarkup(){
    return Object.entries(WINDOWS).map(([key,w])=>`<label class="v06-tint-window"><span><input type="checkbox" data-tint-window="${key}"> ${esc(w.label)}</span><select data-tint-vlt="${key}">${VLTS.map(v=>option(v,v==='35%')).join('')}</select></label>`).join('');
  }

  function catalogFor(service){return CATALOG[service]||{'Other / Customer supplied':['Custom / Other']};}

  function smartAddServiceRow(values={}){
    const row=document.createElement('div');
    row.className='equipment-row v06-smart-row';
    row.innerHTML=`
      <label>Service<select data-eq="category"><option value="">Select service</option>${SERVICES.map(s=>`<option ${values.category===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Brand<select data-eq="brand" disabled><option value="">Select service first</option></select></label>
      <label>Product / model<select data-eq="model" disabled><option value="">Select brand first</option></select></label>
      <label>Qty<input data-eq="qty" type="number" min="1" value="${Number(values.qty||1)}"></label>
      <label class="equipment-note">Line notes<input data-eq="note" value="${esc(values.note||'')}" placeholder="Variant, location, customer-supplied..."></label>
      <button type="button" class="remove-equipment">×</button>
      <div class="v06-tint-config hidden" data-tint-config>
        <div class="v06-tint-head"><div><strong>Window tint configuration</strong><span>Select glass, film technology and VLT. The estimate below is an internal starting point.</span></div><span class="badge">Smart estimate</span></div>
        <div class="v06-tint-grid">
          <label>Film technology<select data-tint="technology"><option>Dyed</option><option>Carbon</option><option selected>Ceramic</option><option>IR Ceramic</option><option>Multilayer Optical</option><option>Other</option></select></label>
          <label>Default VLT<select data-tint="defaultVlt">${VLTS.map(v=>option(v,v==='35%')).join('')}</select></label>
          <label>Existing tint removal<select data-tint="removal"><option value="none">None</option><option value="selected">Needed on selected glass</option><option value="unknown">Unknown / inspect</option></select></label>
        </div>
        <div class="v06-tint-presets">${Object.keys(PRESETS).map(p=>`<button type="button" class="v06-tint-preset" data-tint-preset="${esc(p)}">${esc(p)}</button>`).join('')}<button type="button" class="v06-tint-preset" data-tint-preset="Clear">Clear</button></div>
        <div class="v06-tint-windows">${windowMarkup()}</div>
        <div class="v06-tint-estimate">
          <div><span>Estimated materials</span><strong data-tint-estimate="parts">$0.00</strong></div>
          <div><span>Estimated labor</span><strong data-tint-estimate="labor">$0.00</strong></div>
          <div><span>Suggested range</span><strong data-tint-estimate="range">$0.00 – $0.00</strong></div>
          <button type="button" class="btn secondary compact" data-tint-apply>Apply estimate to draft</button>
        </div>
        <p class="v06-tint-disclaimer">Starter estimator only. The rule table is intentionally isolated so TTT's validated film costs, labor standards, dealer tiers, vehicle complexity and market pricing can replace these seed values later.</p>
      </div>`;
    serviceRowsEl.appendChild(row);

    const category=row.querySelector('[data-eq="category"]');
    const brand=row.querySelector('[data-eq="brand"]');
    const model=row.querySelector('[data-eq="model"]');
    const tint=row.querySelector('[data-tint-config]');

    function refreshModels(preferred=''){
      const models=(catalogFor(category.value)[brand.value]||[]);
      model.disabled=!brand.value;
      model.innerHTML=`<option value="">${brand.value?'Select model':'Select brand first'}</option>`+models.map(x=>option(x,x===preferred)).join('');
      if(category.value==='Window tint'&&PRODUCT_TECH[model.value]) row.querySelector('[data-tint="technology"]').value=PRODUCT_TECH[model.value];
      updateTint(row);
    }
    function refreshBrands(preferred=''){
      const brands=Object.keys(catalogFor(category.value));
      brand.disabled=!category.value;
      brand.innerHTML=`<option value="">${category.value?'Select brand':'Select service first'}</option>`+brands.map(x=>option(x,x===preferred)).join('');
      tint.classList.toggle('hidden',category.value!=='Window tint');
      refreshModels(values.model||'');
    }

    category.onchange=()=>refreshBrands();
    brand.onchange=()=>refreshModels();
    model.onchange=()=>{if(category.value==='Window tint'&&PRODUCT_TECH[model.value]) row.querySelector('[data-tint="technology"]').value=PRODUCT_TECH[model.value];updateTint(row);};
    row.querySelector('[data-tint="defaultVlt"]').onchange=e=>{
      row.querySelectorAll('[data-tint-window]:checked').forEach(cb=>{const s=row.querySelector(`[data-tint-vlt="${cb.dataset.tintWindow}"]`);if(s)s.value=e.target.value;});
      updateTint(row);
    };
    row.querySelectorAll('[data-tint-window],[data-tint-vlt],[data-tint]').forEach(el=>el.addEventListener('change',()=>updateTint(row)));
    row.querySelectorAll('[data-tint-preset]').forEach(btn=>btn.onclick=()=>{
      const keys=PRESETS[btn.dataset.tintPreset]||[];
      row.querySelectorAll('[data-tint-window]').forEach(cb=>cb.checked=keys.includes(cb.dataset.tintWindow));
      const vlt=row.querySelector('[data-tint="defaultVlt"]').value;
      row.querySelectorAll('[data-tint-window]:checked').forEach(cb=>{const s=row.querySelector(`[data-tint-vlt="${cb.dataset.tintWindow}"]`);if(s)s.value=vlt;});
      updateTint(row);
    });
    row.querySelector('[data-tint-apply]').onclick=()=>{
      const q=calculate(row);
      form.elements.parts.value=q.parts.toFixed(2);
      form.elements.labor.value=q.labor.toFixed(2);
      updateTotal();
      toast('Tint estimate applied to draft pricing');
    };
    row.querySelector('.remove-equipment').onclick=()=>row.remove();
    refreshBrands(values.brand||'');
    if(values.category==='Window tint'&&values.tintConfig) restore(row,values.tintConfig);
    return row;
  }

  function calculate(row){
    const tech=row.querySelector('[data-tint="technology"]')?.value||'Other';
    const techMult=TECH_MULT[tech]||1;
    const type=document.getElementById('vehicleTypeSelect')?.value||'Sedan';
    const laborMult={Sedan:1,Coupe:1.05,SUV:1.12,Truck:1.08,Van:1.2,Marine:1.25,Other:1}[type]||1;
    const removal=row.querySelector('[data-tint="removal"]')?.value||'none';
    let parts=0,labor=0,count=0;
    row.querySelectorAll('[data-tint-window]:checked').forEach(cb=>{
      const w=WINDOWS[cb.dataset.tintWindow];if(!w)return;
      count++;parts+=w.material*techMult;labor+=w.labor*laborMult;
    });
    if(removal==='selected') labor+=count*25;
    const total=parts+labor;
    return{parts:Math.round(parts),labor:Math.round(labor),total:Math.round(total),low:Math.round(total*.9),high:Math.round(total*1.1)};
  }

  function readConfig(row){
    if(row.querySelector('[data-eq="category"]')?.value!=='Window tint') return null;
    const windows=[...row.querySelectorAll('[data-tint-window]:checked')].map(cb=>({
      key:cb.dataset.tintWindow,
      label:WINDOWS[cb.dataset.tintWindow]?.label||cb.dataset.tintWindow,
      vlt:row.querySelector(`[data-tint-vlt="${cb.dataset.tintWindow}"]`)?.value||''
    }));
    return{
      technology:row.querySelector('[data-tint="technology"]')?.value||'',
      defaultVlt:row.querySelector('[data-tint="defaultVlt"]')?.value||'',
      removal:row.querySelector('[data-tint="removal"]')?.value||'none',
      windows,
      estimate:calculate(row)
    };
  }

  function restore(row,cfg){
    if(cfg.technology) row.querySelector('[data-tint="technology"]').value=cfg.technology;
    if(cfg.defaultVlt) row.querySelector('[data-tint="defaultVlt"]').value=cfg.defaultVlt;
    if(cfg.removal) row.querySelector('[data-tint="removal"]').value=cfg.removal;
    (cfg.windows||[]).forEach(w=>{
      const cb=row.querySelector(`[data-tint-window="${w.key}"]`),sel=row.querySelector(`[data-tint-vlt="${w.key}"]`);
      if(cb)cb.checked=true;if(sel&&w.vlt)sel.value=w.vlt;
    });
    updateTint(row);
  }

  function updateTint(row){
    if(row.querySelector('[data-eq="category"]')?.value!=='Window tint') return;
    const q=calculate(row),cfg=readConfig(row);
    row.querySelector('[data-tint-estimate="parts"]').textContent=money(q.parts);
    row.querySelector('[data-tint-estimate="labor"]').textContent=money(q.labor);
    row.querySelector('[data-tint-estimate="range"]').textContent=`${money(q.low)} – ${money(q.high)}`;
    const note=row.querySelector('[data-eq="note"]');
    if(note&&cfg.windows.length){
      const film=[row.querySelector('[data-eq="brand"]').value,row.querySelector('[data-eq="model"]').value,cfg.technology].filter(Boolean).join(' · ');
      const glass=cfg.windows.map(w=>`${w.label} ${w.vlt}`).join(', ');
      note.value=(film?film+' | ':'')+glass+(cfg.removal==='selected'?' | Remove existing tint':'')+(cfg.removal==='unknown'?' | Existing tint TBD':'');
    }
  }

  function replaceInitialRow(){serviceRowsEl.innerHTML='';smartAddServiceRow();}
  injectStyles();
  addBtn.onclick=()=>smartAddServiceRow();
  replaceInitialRow();
  document.getElementById('vehicleTypeSelect')?.addEventListener('change',()=>document.querySelectorAll('.v06-smart-row').forEach(updateTint));

  // Preserve the existing job-creation workflow. Capture the tint configuration before it runs,
  // then attach the structured data to the newly-created job and queue the normal sync path.
  const previousSubmit=form.onsubmit;
  form.onsubmit=function(e){
    const rows=[...serviceRowsEl.querySelectorAll('.v06-smart-row')];
    rows.forEach(updateTint); // keeps the human-readable line note in the existing quote snapshot.
    const activeRows=rows.filter(r=>{
      const category=r.querySelector('[data-eq="category"]')?.value;
      const brand=r.querySelector('[data-eq="brand"]')?.value;
      const model=r.querySelector('[data-eq="model"]')?.value;
      return category||brand||model;
    });
    const configs=activeRows.map(readConfig);
    const before=new Set((db.jobs||[]).map(j=>j.id));
    const result=previousSubmit?previousSubmit.call(this,e):undefined;
    const created=(db.jobs||[]).find(j=>!before.has(j.id));
    if(created){
      (created.equipment||[]).forEach((eq,i)=>{if(configs[i])eq.tintConfig=configs[i];});
      created.updatedAt=new Date().toISOString();
      save();
      if(window.TTTSync?.queueJob) window.TTTSync.queueJob(created);
    }
    // app.js resets the builder after save; restore the v0.6 smart row for the next job.
    serviceRowsEl.innerHTML='';
    smartAddServiceRow();
    addBtn.onclick=()=>smartAddServiceRow();
    return result;
  };
})();

// Load the v0.7 business controls without changing the existing document/script order.
(function(){
  if(document.querySelector('script[data-ttt-v07]'))return;
  const s=document.createElement('script');s.src='business-data-v07.js';s.dataset.tttV07='1';document.body.appendChild(s);
})();