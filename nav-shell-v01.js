(function(){
  function initNavShell(){
    document.querySelectorAll('.nav-group-toggle').forEach(function(btn){
      btn.addEventListener('click',function(){
        var group=btn.closest('.nav-group');
        if(group) group.classList.toggle('open');
      });
    });
    var create=document.querySelector('.nav-create');
    if(create) create.addEventListener('click',function(){
      var target=document.querySelector('.nav-item[data-view="jobs"]');
      if(target && typeof target.click==='function'){
        var direct=document.querySelector('[data-go="newjob"]');
        if(direct) direct.click();
      }
    });
    var search=document.getElementById('globalSearchBtn');
    if(search) search.addEventListener('click',function(){
      var q=window.prompt('Search TTT OS — customer, vehicle, VIN, job or contact');
      if(!q) return;
      q=q.trim().toLowerCase();
      var jobs=Array.from(document.querySelectorAll('#jobsBody tr'));
      var customers=Array.from(document.querySelectorAll('#customersBody tr'));
      var vehicles=Array.from(document.querySelectorAll('#vehiclesBody tr'));
      var matches=jobs.concat(customers,vehicles).filter(function(row){return row.textContent.toLowerCase().includes(q);});
      if(matches.length){
        var parent=matches[0].closest('.view');
        var nav=document.querySelector('.nav-item[data-view="'+parent.id+'"]');
        if(nav) nav.click();
        setTimeout(function(){matches[0].scrollIntoView({behavior:'smooth',block:'center'});matches[0].style.outline='2px solid #1557c0';setTimeout(function(){matches[0].style.outline='';},1800);},50);
      }else{
        window.alert('No current TTT OS records matched “'+q+'”.');
      }
    });
    document.querySelectorAll('.nav-item[data-view]').forEach(function(item){
      item.addEventListener('click',function(){
        var group=item.closest('.nav-group');
        if(group) group.classList.add('open');
      });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initNavShell); else initNavShell();
})();