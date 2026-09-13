(function(){
  const v='20260913-approved-master';
  const favicon='/favicon-64.png?v='+v;
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach((el)=>el.remove());
  const icon=document.createElement('link');
  icon.rel='icon'; icon.type='image/png'; icon.sizes='64x64'; icon.href=favicon;
  document.head.appendChild(icon);
  const shortcut=document.createElement('link');
  shortcut.rel='shortcut icon'; shortcut.type='image/png'; shortcut.href=favicon;
  document.head.appendChild(shortcut);
  const apple='/apple-touch-icon.png?v='+v;
  document.querySelectorAll('link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"]').forEach((el)=>{el.href=apple; el.removeAttribute('sizes');});
  const brand=document.querySelector('.brand img');
  if(brand){brand.src='/ttt-logo.png?v='+v;brand.alt='Thompson Transportation Technologies';brand.style.objectFit='contain';}
  const core=document.createElement('script');
  core.src='/business-data-v07-core.js?v='+v;
  core.dataset.tttBusinessCore='1';
  document.body.appendChild(core);
})();
