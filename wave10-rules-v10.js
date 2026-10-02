(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TTTWave10Rules=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const lower=v=>String(v??'').toLowerCase();
  const rank={Lead:10,Estimate:20,'Awaiting Approval':30,Scheduled:40,'Ready for Check-In':50,'Checked In':60,'Awaiting Final Authorization':70,'In Progress':80,QC:90,'Ready for Pickup':100,Delivered:110,Closed:120};

  function serviceText(job){
    return [
      ...(job?.services||[]),
      ...((job?.equipment||[]).flatMap(x=>[x?.category,x?.brand,x?.model,x?.note])),
      job?.request_notes,job?.requestNotes,job?.parts_status,job?.partsStatus,job?.account_name,job?.accountName
    ].filter(Boolean).join(' ').toLowerCase();
  }
  function flags(job){
    const s=serviceText(job);
    return {
      diagnostic:/signaltrace|diagnostic|troubleshoot|electrical|no[- ]?start|parasitic|can bus|module communication|fault/.test(s),
      tint:/tint|window film|ceramic film/.test(s),
      connected:/gps|tracking|tracker|dash ?cam|blackvue|cellular|lte|subscription|telematics/.test(s),
      security:/alarm|immobilizer|kill switch|security|remote start/.test(s),
      customerSupplied:/customer.?supplied/.test(s),
      commercial:/dealer|fleet|commercial|b2b/.test(s)
    };
  }
  function atLeast(status,target){return (rank[status]||0)>=(rank[target]||0);}
  function serviceDocumentCodes(job){
    const f=flags(job),out=[];
    if(f.diagnostic)out.push('DIA','DFR');
    if(f.tint)out.push('TINT');
    if(f.customerSupplied)out.push('CSE');
    if(f.connected)out.push('DEV','SUB');
    if(f.security)out.push('SEC');
    if(f.commercial)out.push('FWA','DRO');
    return out;
  }
  function requiredForStage(job){
    const out=['Q'],f=flags(job);
    if(atLeast(job?.status,'Checked In'))out.push('CHK','AUTH');
    if(atLeast(job?.status,'In Progress'))out.push('WO');
    if(atLeast(job?.status,'QC'))out.push('QC');
    if(atLeast(job?.status,'Ready for Pickup'))out.push('INV','COMP');
    if(atLeast(job?.status,'Delivered'))out.push('RCPT','WAR');
    if(f.diagnostic){out.push('DIA');if(atLeast(job?.status,'QC'))out.push('DFR');}
    if(f.customerSupplied)out.push('CSE');
    if(f.tint&&atLeast(job?.status,'Checked In'))out.push('TINT');
    if(f.connected&&atLeast(job?.status,'Ready for Pickup'))out.push('DEV','SUB');
    if(f.security&&atLeast(job?.status,'Ready for Pickup'))out.push('SEC');
    if(f.commercial&&atLeast(job?.status,'Scheduled'))out.push('FWA','DRO');
    return [...new Set(out)];
  }
  function financialSummary(invoice,payments=[]){
    const total=Number(invoice?.total||0);
    const paid=payments.filter(x=>!x.archived_at&&['received','settled','paid'].includes(lower(x.status))).reduce((n,x)=>n+Number(x.amount||0),0);
    return {total,paid,balance:Math.max(total-paid,0),isPaid:total>0&&paid>=total};
  }
  function scenario(name){
    const n=lower(name);
    if(n==='retail')return {services:['Window tint','Audio'],status:'Delivered'};
    if(n==='diagnostic')return {services:['SignalTrace diagnostic','Electrical repair'],status:'Delivered'};
    if(n==='fleet')return {services:['Fleet GPS tracking','Kill switch'],account_name:'Commercial fleet dealer',status:'Delivered'};
    return {services:[],status:'Lead'};
  }
  return {rank,flags,atLeast,serviceDocumentCodes,requiredForStage,financialSummary,scenario};
});