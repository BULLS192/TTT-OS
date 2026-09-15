// TTT OS v1.1 — drag-to-resize detailed shop operations
(function(){
  'use strict';
  if(!window.TTTSchedulingCore||typeof db==='undefined')return;
  const Core=window.TTTSchedulingCore;
  const VERSION='20260914-scheduling-v11';
  const SLOT_MINUTES=15;
  const SLOT_WIDTH=32;
  const MIN_DURATION=15;
  let active=null;
  let bubble=null;
  let decorating=false;

  function ensure(){return Core.ensureModel(db);}
  function getOp(id){return ensure().operations.find(o=>o.id===id);}
  function getJob(id){return (db.jobs||[]).find(j=>j.id===id);}
  function notify(msg){if(typeof toast==='function')toast(msg);else console.log(msg);}
  function minsLabel(n){n=Number(n||0);const h=Math.floor(n/60),m=n%60;return h?(h+'h'+(m?' '+m+'m':'')):(m+'m');}
  function minutesSinceMidnight(v){const d=new Date(v);return d.getHours()*60+d.getMinutes();}
  function snapDuration(n){return Math.max(MIN_DURATION,Math.round(Number(n||MIN_DURATION)/SLOT_MINUTES)*SLOT_MINUTES);}

  function injectCss(){if(document.getElementById('ttt-scheduling-v11-css'))return;const l=document.createElement('link');l.id='ttt-scheduling-v11-css';l.rel='stylesheet';l.href='/scheduling-v11.css?v='+VERSION;document.head.appendChild(l);}
  function addHelp(){const h=document.querySelector('#schedulingBody .v10-help');if(h&&!h.querySelector('.v11-resize-tip'))h.insertAdjacentHTML('beforeend',' <span class="v11-resize-tip">↔ Drag the right edge of a shop task to resize it in 15-minute steps.</span>');}

  function validateResize(op,newDuration){
    const candidate=Object.assign({},op,{durationMinutes:snapDuration(newDuration)});
    const windowHours=Core.businessWindow(db,new Date(candidate.start));
    const end=Core.endOf(candidate);
    if(!windowHours||new Date(candidate.start)<windowHours.start||!end||end>windowHours.end)return{ok:false,message:'Ends outside configured shop hours.',candidate};
    const conflicts=Core.operationConflicts(db,candidate,op.id);
    if(conflicts.length)return{ok:false,message:conflicts.map(c=>c.message).join(' '),candidate};
    return{ok:true,message:'',candidate};
  }

  function visualSpan(op,duration){
    const startSlot=Math.max(0,Math.floor((minutesSinceMidnight(op.start)-480)/SLOT_MINUTES));
    const raw=Math.max(1,Math.ceil((Number(duration||0)+Number(op.bufferMinutes||0))/SLOT_MINUTES));
    return Math.max(1,Math.min(raw,40-startSlot));
  }

  function showBubble(x,y,text,invalid){
    if(!bubble){bubble=document.createElement('div');bubble.className='v11-resize-bubble';document.body.appendChild(bubble);}
    bubble.textContent=text;bubble.classList.toggle('invalid',!!invalid);bubble.style.left=(x+12)+'px';bubble.style.top=(y-34)+'px';
  }
  function hideBubble(){bubble?.remove();bubble=null;}

  function startResize(e,handle,eventEl){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    const op=getOp(eventEl.dataset.eventId);if(!op)return;
    const wrap=eventEl.parentElement;if(!wrap)return;
    const oldDuration=Number(op.durationMinutes||MIN_DURATION);
    const startX=e.clientX;
    active={op,eventEl,wrap,handle,startX,oldDuration,newDuration:oldDuration,oldGrid:wrap.style.gridColumn,valid:true,message:''};
    eventEl.draggable=false;eventEl.classList.add('v11-resizing');
    try{handle.setPointerCapture(e.pointerId)}catch{}
    showBubble(e.clientX,e.clientY,minsLabel(oldDuration),false);
  }

  function moveResize(e){
    if(!active)return;
    e.preventDefault();
    const slots=Math.round((e.clientX-active.startX)/SLOT_WIDTH);
    const proposed=snapDuration(active.oldDuration+slots*SLOT_MINUTES);
    const result=validateResize(active.op,proposed);
    active.newDuration=proposed;active.valid=result.ok;active.message=result.message;
    active.wrap.style.gridColumnEnd='span '+visualSpan(active.op,proposed);
    active.eventEl.classList.toggle('v11-resize-invalid',!result.ok);
    showBubble(e.clientX,e.clientY,minsLabel(proposed)+(result.ok?'':' · blocked'),!result.ok);
  }

  function finishResize(e,cancelled){
    if(!active)return;
    const a=active;active=null;
    try{a.handle.releasePointerCapture(e.pointerId)}catch{}
    a.eventEl.classList.remove('v11-resizing','v11-resize-invalid');
    a.eventEl.draggable=true;
    hideBubble();
    if(cancelled||a.newDuration===a.oldDuration){a.wrap.style.gridColumn=a.oldGrid;return;}
    const result=validateResize(a.op,a.newDuration);
    if(!result.ok){a.wrap.style.gridColumn=a.oldGrid;notify('Resize blocked · '+result.message);return;}
    const old=a.oldDuration;
    a.op.durationMinutes=result.candidate.durationMinutes;
    a.op.updatedAt=new Date().toISOString();
    const j=getJob(a.op.jobId);
    if(j){j.audit=j.audit||[];j.audit.push({at:a.op.updatedAt,actor:'usr_derek',action:'operation_duration_resized',operationId:a.op.id,fromMinutes:old,toMinutes:a.op.durationMinutes});}
    save();if(j&&window.TTTSync?.queueJob)TTTSync.queueJob(j);
    notify(a.op.service+' resized · '+minsLabel(old)+' → '+minsLabel(a.op.durationMinutes));
    setTimeout(()=>window.TTTSchedulerV10?.render?.(),0);
  }

  function decorate(){
    if(decorating)return;decorating=true;
    try{
      addHelp();
      document.querySelectorAll('#schedulingBody .v10-day-board .v10-event.op').forEach(eventEl=>{
        if(eventEl.querySelector('.v11-resize-handle'))return;
        eventEl.classList.add('v11-resizable');
        const handle=document.createElement('span');handle.className='v11-resize-handle';handle.title='Drag to resize in 15-minute steps';handle.setAttribute('role','slider');handle.setAttribute('aria-label','Resize operation duration');
        handle.addEventListener('pointerdown',e=>startResize(e,handle,eventEl));
        handle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
        eventEl.appendChild(handle);
      });
    }finally{decorating=false;}
  }

  function install(){
    injectCss();
    document.addEventListener('pointermove',moveResize,{passive:false});
    document.addEventListener('pointerup',e=>finishResize(e,false));
    document.addEventListener('pointercancel',e=>finishResize(e,true));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)finishResize({pointerId:-1},true);});
    const root=document.getElementById('schedulingBody');if(root){new MutationObserver(()=>setTimeout(decorate,0)).observe(root,{childList:true,subtree:true});}
    document.addEventListener('click',e=>{if(e.target.closest('[data-view="scheduling"],#opsGoSchedule,[data-range="day"],[data-lane]'))setTimeout(decorate,30);},true);
    setTimeout(decorate,50);
    window.TTTSchedulerResizeV11={decorate,validateResize,resizeOperation:function(id,newDuration){const op=getOp(id);if(!op)return{ok:false,message:'Operation not found'};const result=validateResize(op,newDuration);if(!result.ok)return result;const old=op.durationMinutes;op.durationMinutes=result.candidate.durationMinutes;save();const j=getJob(op.jobId);if(j&&window.TTTSync?.queueJob)TTTSync.queueJob(j);setTimeout(()=>window.TTTSchedulerV10?.render?.(),0);return{ok:true,from:old,to:op.durationMinutes};},version:'1.1'};
  }
  install();
})();