(function(){
  'use strict';

  const PHONE_KEY=/(phone|mobile|telephone|cell|fax)$/i;
  const PHONE_HINT=/(phone|mobile|telephone|cell|fax)/i;
  let wrappedSave=false;
  let migrating=false;

  function digits(value){return String(value||'').replace(/\D/g,'');}
  function hasPlus(value){return /^\s*\+/.test(String(value||''));}

  function toE164(value,defaultCountry='US'){
    const raw=String(value||'').trim();
    if(!raw)return '';
    let d=digits(raw);
    if(!hasPlus(raw)){
      if(defaultCountry==='US' || defaultCountry==='CA'){
        if(d.length===10)d='1'+d;
        else if(d.length===11&&d[0]==='1'){}
        else return '';
      }else return '';
    }
    if(d.length<8||d.length>15)return '';
    return '+'+d;
  }

  function groupGeneric(national){
    if(national.length<=4)return national;
    const out=[];
    let i=0;
    while(national.length-i>4){out.push(national.slice(i,i+3));i+=3;}
    out.push(national.slice(i));
    return out.join(' ');
  }

  function formatE164(e164){
    if(!e164)return '';
    const d=digits(e164);
    if(d.length===11&&d[0]==='1'){
      return '+1 ('+d.slice(1,4)+') '+d.slice(4,7)+'-'+d.slice(7);
    }
    if(d.startsWith('65')&&d.length===10){
      return '+65 '+d.slice(2,6)+' '+d.slice(6);
    }
    if(d.startsWith('966')&&d.length===12){
      return '+966 '+d.slice(3,5)+' '+d.slice(5,8)+' '+d.slice(8);
    }
    if(d.startsWith('44')&&d.length>=11&&d.length<=12){
      const n=d.slice(2); return '+44 '+groupGeneric(n);
    }
    if(d.startsWith('52')&&d.length===12){
      return '+52 '+d.slice(2,5)+' '+d.slice(5,8)+' '+d.slice(8);
    }
    if(d.startsWith('61')&&d.length===11){
      return '+61 '+d.slice(2,3)+' '+d.slice(3,7)+' '+d.slice(7);
    }
    const common3=['211','212','213','216','218','220','221','222','223','224','225','226','227','228','229','230','231','232','233','234','235','236','237','238','239','240','241','242','243','244','245','246','248','249','250','251','252','253','254','255','256','257','258','260','261','262','263','264','265','266','267','268','269','290','291','297','298','299','350','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','378','380','381','382','383','385','386','387','389','420','421','423','500','501','502','503','504','505','506','507','508','509','590','591','592','593','594','595','596','597','598','599','670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687','688','689','690','691','692','850','852','853','855','856','880','886','960','961','962','963','964','965','967','968','970','971','972','973','974','975','976','977','992','993','994','995','996','998'];
    const common2=['20','27','30','31','32','33','34','36','39','40','41','43','45','46','47','48','49','51','53','54','55','56','57','58','60','62','63','64','66','81','82','84','86','90','91','92','93','94','95','98'];
    let ccLen=1;
    if(common3.includes(d.slice(0,3)))ccLen=3;
    else if(common2.includes(d.slice(0,2)))ccLen=2;
    const cc=d.slice(0,ccLen), national=d.slice(ccLen);
    return '+'+cc+(national?' '+groupGeneric(national):'');
  }

  function normalize(value,defaultCountry='US'){
    const raw=String(value||'').trim();
    if(!raw)return '';
    const e164=toE164(raw,defaultCountry);
    return e164?formatE164(e164):raw;
  }

  function isValid(value,defaultCountry='US'){
    if(!String(value||'').trim())return true;
    return !!toE164(value,defaultCountry);
  }

  function isPhoneInput(el){
    if(!(el instanceof HTMLInputElement))return false;
    const hay=[el.name,el.id,el.type,el.getAttribute('aria-label'),el.placeholder].filter(Boolean).join(' ');
    return el.type==='tel'||PHONE_HINT.test(hay);
  }

  function enhance(el){
    if(!isPhoneInput(el)||el.dataset.tttPhoneEnhanced==='1')return;
    el.dataset.tttPhoneEnhanced='1';
    el.type='tel';
    el.inputMode='tel';
    if(!el.autocomplete)el.autocomplete='tel';
    if(!el.placeholder||/^\(?555|^\(555|phone/i.test(el.placeholder))el.placeholder='+1 (713) 555-0123';
    el.title='Include country code and area/national code, e.g. +1 (713) 555-0123';
    if(el.value)el.value=normalize(el.value);
  }

  function enhanceAll(root=document){
    root.querySelectorAll('input').forEach(enhance);
  }

  function normalizeInput(el){
    if(!isPhoneInput(el))return true;
    const value=String(el.value||'').trim();
    if(!value){el.setCustomValidity('');return true;}
    const formatted=normalize(value);
    if(!isValid(value)){
      el.setCustomValidity('Enter a complete international phone number with country code, e.g. +1 (713) 555-0123.');
      return false;
    }
    el.value=formatted;
    el.setCustomValidity('');
    return true;
  }

  function normalizeObject(obj,seen=new WeakSet()){
    if(!obj||typeof obj!=='object'||seen.has(obj))return false;
    seen.add(obj);
    let changed=false;
    if(Array.isArray(obj)){
      obj.forEach(v=>{if(v&&typeof v==='object'&&normalizeObject(v,seen))changed=true;});
      return changed;
    }
    Object.keys(obj).forEach(key=>{
      const value=obj[key];
      if(typeof value==='string'&&PHONE_KEY.test(key)&&value.trim()){
        const next=normalize(value);
        if(next!==value&&isValid(value)){obj[key]=next;changed=true;}
      }else if(value&&typeof value==='object'&&normalizeObject(value,seen))changed=true;
    });
    return changed;
  }

  function wrapSave(){
    if(wrappedSave||typeof window.save!=='function')return;
    const previous=window.save;
    window.save=function(){
      try{if(typeof window.db!=='undefined')normalizeObject(window.db);}catch(err){console.warn('TTT phone normalization skipped',err);}
      return previous.apply(this,arguments);
    };
    try{save=window.save;}catch{}
    wrappedSave=true;
  }

  function migrateCurrentState(){
    if(migrating)return;
    try{
      if(typeof window.db==='undefined'||typeof window.save!=='function')return;
      migrating=true;
      if(normalizeObject(window.db))window.save();
    }finally{migrating=false;}
  }

  function init(){
    enhanceAll();
    wrapSave();
    migrateCurrentState();

    document.addEventListener('focusin',e=>{if(e.target instanceof HTMLInputElement)enhance(e.target);},true);
    document.addEventListener('focusout',e=>{if(e.target instanceof HTMLInputElement&&isPhoneInput(e.target))normalizeInput(e.target);},true);
    document.addEventListener('input',e=>{if(e.target instanceof HTMLInputElement&&isPhoneInput(e.target))e.target.setCustomValidity('');},true);
    document.addEventListener('submit',e=>{
      const form=e.target;
      if(!(form instanceof HTMLFormElement))return;
      const phones=[...form.querySelectorAll('input')].filter(isPhoneInput);
      for(const input of phones){
        if(!normalizeInput(input)){
          e.preventDefault();
          e.stopPropagation();
          input.reportValidity();
          input.focus();
          return;
        }
      }
    },true);

    const observer=new MutationObserver(mutations=>{
      mutations.forEach(m=>m.addedNodes.forEach(node=>{
        if(!(node instanceof Element))return;
        if(node.matches?.('input'))enhance(node);
        enhanceAll(node);
      }));
    });
    observer.observe(document.body,{childList:true,subtree:true});

    window.addEventListener('ttt:cloud-state-applied',()=>{wrapSave();migrateCurrentState();enhanceAll();});
  }

  window.TTTPhone={normalize,toE164,formatE164,isValid,enhanceAll,normalizeObject};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();