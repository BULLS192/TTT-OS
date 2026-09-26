// TTT OS bootstrap: apply the approved master branding first, then load the original app and additive modules synchronously.
(function(){
  const v='20260926-core-ops-wave-v2';
  const favicon='/favicon-64.png?v='+v;
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach((el)=>el.remove());
  const icon=document.createElement('link');
  icon.rel='icon'; icon.type='image/png'; icon.sizes='64x64'; icon.href=favicon;
  document.head.appendChild(icon);
  const shortcut=document.createElement('link');
  shortcut.rel='shortcut icon'; shortcut.type='image/png'; shortcut.href=favicon;
  document.head.appendChild(shortcut);
  document.querySelectorAll('link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"]').forEach((el)=>{
    el.href='/apple-touch-icon.png?v='+v;
    el.removeAttribute('sizes');
  });
  const manifest=document.querySelector('link[rel="manifest"]');
  if(manifest) manifest.href='/site.webmanifest?v='+v;
  const brand=document.querySelector('.brand img');
  if(brand){
    brand.src='/ttt-logo.png?v='+v;
    brand.alt='Thompson Transportation Technologies';
    brand.style.objectFit='contain';
  }
  document.write('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js"></'+'script>');
  document.write('<script src="/supabase-config.js?v='+v+'"></'+'script>');
  document.write('<script src="/app-core.js?v='+v+'"></'+'script>');
  document.write('<script src="/cloud-sync.js?v='+v+'"></'+'script>');
  document.write('<script src="/avatar-service-v01.js?v='+v+'"></'+'script>');
  document.write('<script src="/core-relational-v05.js?v='+v+'"></'+'script>');
  document.write('<script src="/media-cloud-v06.js?v='+v+'"></'+'script>');
  document.write('<script src="/operator-ui.js?v='+v+'"></'+'script>');
  document.write('<script src="/vendors-v08.js?v='+v+'"></'+'script>');
  document.write('<script src="/scheduling-core-v09.js?v='+v+'"></'+'script>');
  document.write('<script src="/scheduling-v09.js?v='+v+'"></'+'script>');
  document.write('<script src="/scheduling-v10.js?v='+v+'"></'+'script>');
  document.write('<script src="/scheduling-v11.js?v='+v+'"></'+'script>');
  document.write('<script src="/ops-relational-v14.js?v='+v+'"></'+'script>');
  document.write('<script src="/expenses-cloud-v05.js?v='+v+'"></'+'script>');
  document.write('<script src="/expenses-v01.js?v='+v+'"></'+'script>');
  document.write('<script src="/expenses-v02.js?v='+v+'"></'+'script>');
  document.write('<script src="/expenses-v04.js?v='+v+'"></'+'script>');
  document.write('<script src="/personnel-v08.js?v='+v+'"></'+'script>');
  document.write('<script src="/product-catalog-v12.js?v='+v+'"></'+'script>');
  document.write('<script src="/crm-v20.js?v='+v+'"></'+'script>');
  document.write('<script src="/erp-product-master-v16.js?v='+v+'"></'+'script>');
  document.write('<script src="/finance-ops-v01.js?v='+v+'"></'+'script>');
})();