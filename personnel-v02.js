// TTT Personnel v0.2 — render select menus in a top-level layer so sticky/overflow containers cannot clip or dismiss them.
(function(){
  'use strict';
  const VERSION='0.2';
  let openState=null;
  let enhanceQueued=false;

  function addStyles(){
    if(document.querySelector('link[data-ttt-personnel-v02]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/personnel-v02.css?v=20260916-personnel-v2';
    link.dataset.tttPersonnelV02='1';
    document.head.appendChild(link);
  }

  function selectedLabel(select){
    const option=select.options[select.selectedIndex];
    return option?option.textContent:String(select.value||'Select');
  }

  function syncControl(select){
    const wrap=select.closest('.ttt-select-wrap');
    const trigger=wrap?.querySelector('.ttt-select-trigger');
    if(!trigger)return;
    trigger.textContent=selectedLabel(select);
    trigger.disabled=!!select.disabled;
    trigger.setAttribute('aria-disabled',select.disabled?'true':'false');
  }

  function closeMenu(options={}){
    if(!openState)return;
    const {menu,backdrop,trigger}=openState;
    menu?.remove();
    backdrop?.remove();
    if(trigger){
      trigger.setAttribute('aria-expanded','false');
      if(options.restoreFocus!==false && trigger.isConnected)trigger.focus({preventScroll:true});
    }
    openState=null;
  }

  function positionMenu(menu,trigger){
    const r=trigger.getBoundingClientRect();
    const gap=5;
    const viewportH=window.innerHeight||document.documentElement.clientHeight;
    const viewportW=window.innerWidth||document.documentElement.clientWidth;
    const preferred=Math.max(r.width,180);
    const width=Math.min(preferred,Math.max(180,viewportW-20));
    menu.style.width=width+'px';
    menu.style.left=Math.max(10,Math.min(r.left,viewportW-width-10))+'px';
    menu.style.visibility='hidden';
    menu.style.display='grid';
    const menuH=Math.min(menu.scrollHeight,Math.floor(viewportH*.6));
    const roomBelow=viewportH-r.bottom-gap;
    const roomAbove=r.top-gap;
    let top;
    if(roomBelow>=Math.min(menuH,180)||roomBelow>=roomAbove){
      top=Math.min(r.bottom+gap,viewportH-menuH-10);
    }else{
      top=Math.max(10,r.top-gap-menuH);
    }
    menu.style.top=Math.max(10,top)+'px';
    menu.style.visibility='visible';
  }

  function openMenu(select,trigger){
    if(select.disabled)return;
    if(openState?.select===select){closeMenu({restoreFocus:false});return;}
    closeMenu({restoreFocus:false});

    const backdrop=document.createElement('div');
    backdrop.className='ttt-select-backdrop';
    backdrop.addEventListener('pointerdown',ev=>{ev.preventDefault();closeMenu({restoreFocus:false});});

    const menu=document.createElement('div');
    menu.className='ttt-select-menu';
    menu.setAttribute('role','listbox');
    menu.setAttribute('aria-label',select.name||'Options');
    [...select.options].forEach(option=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='ttt-select-option'+(option.selected?' selected':'');
      item.textContent=option.textContent;
      item.dataset.value=option.value;
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',option.selected?'true':'false');
      item.disabled=option.disabled;
      item.addEventListener('pointerdown',ev=>ev.stopPropagation());
      item.addEventListener('click',ev=>{
        ev.preventDefault();ev.stopPropagation();
        if(option.disabled)return;
        select.value=option.value;
        [...select.options].forEach(o=>o.selected=o===option);
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
        syncControl(select);
        closeMenu({restoreFocus:true});
      });
      menu.appendChild(item);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    trigger.setAttribute('aria-expanded','true');
    openState={select,trigger,menu,backdrop};
    positionMenu(menu,trigger);
    const current=menu.querySelector('.selected');
    if(current)current.scrollIntoView({block:'nearest'});
  }

  function enhanceSelect(select){
    if(select.dataset.tttSelectEnhanced==='1'){
      syncControl(select);return;
    }
    select.dataset.tttSelectEnhanced='1';
    select.classList.add('ttt-select-native');

    const wrap=document.createElement('div');
    wrap.className='ttt-select-wrap';
    select.parentNode.insertBefore(wrap,select);
    wrap.appendChild(select);

    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='ttt-select-trigger';
    trigger.setAttribute('aria-haspopup','listbox');
    trigger.setAttribute('aria-expanded','false');
    trigger.textContent=selectedLabel(select);
    wrap.appendChild(trigger);

    trigger.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();});
    trigger.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();openMenu(select,trigger);});
    trigger.addEventListener('keydown',ev=>{
      if(['Enter',' ','ArrowDown','ArrowUp'].includes(ev.key)){ev.preventDefault();openMenu(select,trigger);}
      if(ev.key==='Escape')closeMenu();
    });
    select.addEventListener('change',()=>syncControl(select));
    syncControl(select);
  }

  function enhance(){
    enhanceQueued=false;
    const root=document.getElementById('people');
    if(!root)return;
    root.querySelectorAll('select').forEach(enhanceSelect);
    root.querySelectorAll('select[data-ttt-select-enhanced="1"]').forEach(syncControl);
  }

  function queueEnhance(){
    if(enhanceQueued)return;
    enhanceQueued=true;
    requestAnimationFrame(enhance);
  }

  function installObserver(){
    const root=document.getElementById('people');
    if(!root){setTimeout(installObserver,80);return;}
    const observer=new MutationObserver(mutations=>{
      if(openState && !openState.select.isConnected)closeMenu({restoreFocus:false});
      let needs=false;
      for(const m of mutations){
        if(m.type==='childList'&&m.addedNodes.length){needs=true;break;}
        if(m.type==='attributes'&&m.target instanceof HTMLSelectElement){syncControl(m.target);}
      }
      if(needs)queueEnhance();
    });
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    queueEnhance();
  }

  function install(){
    addStyles();
    installObserver();
    window.addEventListener('resize',()=>closeMenu({restoreFocus:false}));
    window.addEventListener('scroll',()=>closeMenu({restoreFocus:false}),true);
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMenu();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)closeMenu({restoreFocus:false});});
    window.TTTPersonnelDropdowns={VERSION,enhance,close:closeMenu};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
