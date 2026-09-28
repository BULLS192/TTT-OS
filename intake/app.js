(function publicCustomerIntake(){
  'use strict';
  const cfg=window.TTTSupabaseConfig;
  const form=document.getElementById('customerIntakeForm');
  const alertBox=document.getElementById('intakeAlert');
  const submitBtn=document.getElementById('submitIntakeBtn');
  const success=document.getElementById('intakeSuccess');
  const reference=document.getElementById('intakeReference');
  const startedAt=Date.now();
  const params=new URLSearchParams(location.search);
  const rawSource=(params.get('source')||'shop-qr').toLowerCase();
  const source=/^[a-z0-9_-]{1,40}$/.test(rawSource)?rawSource:'other';
  const rawSession=params.get('session')||'';
  const session=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawSession)?rawSession:null;
  const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
  const stateSelect=document.getElementById('stateSelect');
  states.forEach(s=>stateSelect.insertAdjacentHTML('beforeend','<option>'+s+'</option>'));
  const vin=document.getElementById('vinInput');
  vin.addEventListener('input',()=>{vin.value=String(vin.value||'').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,17);});

  if(!cfg||!window.supabase){
    showError('Customer check-in is temporarily unavailable. Please speak with a TTT team member.');
    submitBtn.disabled=true;
    return;
  }

  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'ttt-public-intake'}
  });

  function showError(message){
    alertBox.textContent=message;
    alertBox.hidden=false;
    alertBox.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function clearError(){alertBox.hidden=true;alertBox.textContent='';}
  function value(fd,name){return String(fd.get(name)||'').trim();}
  function selectedServices(){return [...form.querySelectorAll('input[name="services"]:checked')].map(el=>el.value);}

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    clearError();
    if(!form.reportValidity())return;
    if(value(new FormData(form),'companyWebsite'))return;
    if(Date.now()-startedAt<1200){
      showError('Please review the form and try again.');
      return;
    }

    const fd=new FormData(form);
    const services=selectedServices();
    const requestNotes=value(fd,'requestNotes');
    if(!services.length&&!requestNotes){
      showError('Please select at least one service or describe what you need.');
      return;
    }

    const payload={
      firstName:value(fd,'firstName'),
      lastName:value(fd,'lastName'),
      phone:value(fd,'phone'),
      email:value(fd,'email'),
      address1:value(fd,'address1'),
      city:value(fd,'city'),
      state:value(fd,'state'),
      postalCode:value(fd,'postalCode'),
      country:value(fd,'country')||'US',
      customerNotes:value(fd,'customerNotes'),
      vehicleYear:value(fd,'vehicleYear'),
      vehicleMake:value(fd,'vehicleMake'),
      vehicleModel:value(fd,'vehicleModel'),
      vehicleTrim:value(fd,'vehicleTrim'),
      vehicleColor:value(fd,'vehicleColor'),
      vehicleType:value(fd,'vehicleType'),
      plate:value(fd,'plate'),
      vin:value(fd,'vin'),
      services,
      requestNotes,
      referralSource:value(fd,'referralSource'),
      contactConsent:fd.get('contactConsent')==='on'
    };

    submitBtn.disabled=true;
    submitBtn.textContent='Sending to TTT…';
    try{
      const {data,error}=await client.rpc('submit_customer_intake',{
        p_payload:payload,
        p_source:source,
        p_session_token:session
      });
      if(error)throw error;
      reference.textContent=data?.intake_code||'Received';
      form.hidden=true;
      success.hidden=false;
      success.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      console.warn('TTT customer intake submission failed',error?.message||error);
      showError('We could not send your information. Please try again, or speak with a TTT team member.');
      submitBtn.disabled=false;
      submitBtn.textContent='Submit to TTT';
    }
  });
})();