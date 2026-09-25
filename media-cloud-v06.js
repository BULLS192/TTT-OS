// TTT OS job/check-in media storage.
(function(){
  'use strict';

  const BUCKET='job-media';
  const MAX_BYTES=50*1024*1024;
  let client=null;
  let orgId=null;
  let userId=null;
  let ready=false;

  function mediaId(){
    return 'med_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  }
  function safeName(name){
    return String(name||'media').replace(/[^a-zA-Z0-9._,'!*$@=;:+?()& -]+/g,'_').slice(-140)||'media';
  }
  function setStatus(message,state){
    const el=document.getElementById('checkInUploadStatus');
    if(!el)return;
    el.textContent=message||'';
    el.dataset.state=state||'';
  }
  function classifyMime(file){
    if(file.type)return file.type;
    const ext=String(file.name||'').split('.').pop().toLowerCase();
    if(['jpg','jpeg'].includes(ext))return 'image/jpeg';
    if(ext==='png')return 'image/png';
    if(ext==='webp')return 'image/webp';
    if(ext==='heic')return 'image/heic';
    if(ext==='heif')return 'image/heif';
    if(ext==='mp4'||ext==='m4v')return 'video/mp4';
    if(ext==='mov')return 'video/quicktime';
    if(ext==='webm')return 'video/webm';
    return 'application/octet-stream';
  }

  async function uploadOne(job,file,meta,capturedAt,index,total){
    if(file.size>MAX_BYTES){
      throw new Error(file.name+' exceeds the 50 MB per-file limit of the current Supabase Free plan.');
    }
    const id=mediaId();
    const path=orgId+'/jobs/'+encodeURIComponent(String(job.id))+'/checkin/'+Date.now()+'-'+id+'-'+safeName(file.name);
    setStatus('Uploading '+index+' of '+total+': '+file.name,'busy');

    const mime=classifyMime(file);
    const {error:uploadError}=await client.storage.from(BUCKET).upload(path,file,{
      contentType:mime,
      cacheControl:'3600',
      upsert:false
    });
    if(uploadError)throw new Error('Upload failed for '+file.name+': '+uploadError.message);

    const record={
      organization_id:orgId,
      id,
      job_id:String(job.id),
      vehicle_id:job.vehicleId||null,
      media_type:meta.mediaType,
      category:meta.category||meta.group||null,
      area:meta.area||null,
      file_name:file.name,
      mime,
      size_bytes:file.size,
      captured_at:capturedAt,
      captured_by_user_id:userId,
      storage_bucket:BUCKET,
      storage_path:path,
      storage_status:'uploaded',
      metadata:meta
    };
    return {record,clientMeta:{
      id,
      mediaType:meta.mediaType,
      group:meta.group,
      area:meta.area,
      category:meta.category,
      fileName:file.name,
      mime,
      size:file.size,
      capturedAt,
      storageStatus:'uploaded',
      storageBucket:BUCKET,
      storagePath:path
    }};
  }

  async function uploadCheckInFiles(job,form,capturedAt){
    if(!ready||!client||!orgId)throw new Error('TTT cloud media storage is not ready. Please wait a moment and try again.');

    const queue=[];
    form.querySelectorAll('[data-checkin-photo]').forEach(input=>{
      const parts=String(input.dataset.checkinPhoto||'').split('::');
      [...(input.files||[])].forEach(file=>queue.push({
        file,
        meta:{mediaType:'photo',group:parts[0]||'',area:parts.slice(1).join('::')||''}
      }));
    });
    form.querySelectorAll('[data-checkin-video]').forEach(input=>{
      [...(input.files||[])].forEach(file=>queue.push({
        file,
        meta:{mediaType:'video',category:input.dataset.checkinVideo||'Video'}
      }));
    });

    if(!queue.length){
      setStatus('No media selected. Check-in details will still be saved.','');
      return {photos:[],videos:[]};
    }

    const uploaded=[];
    try{
      for(let i=0;i<queue.length;i++){
        uploaded.push(await uploadOne(job,queue[i].file,queue[i].meta,capturedAt,i+1,queue.length));
      }
      const {error:rowError}=await client.from('job_media').insert(uploaded.map(x=>x.record));
      if(rowError)throw new Error('Media metadata could not be saved: '+rowError.message);
    }catch(error){
      if(uploaded.length){
        await client.storage.from(BUCKET).remove(uploaded.map(x=>x.record.storage_path)).catch(()=>{});
      }
      setStatus(error.message||'Media upload failed.','error');
      throw error;
    }

    setStatus(queue.length+' media file'+(queue.length===1?'':'s')+' stored securely in Supabase.','ok');
    const metas=uploaded.map(x=>x.clientMeta);
    return {
      photos:metas.filter(x=>x.mediaType==='photo'),
      videos:metas.filter(x=>x.mediaType==='video')
    };
  }

  async function openStoredMedia(path){
    if(!ready||!path)return;
    const popup=window.open('about:blank','_blank');
    const {data,error}=await client.storage.from(BUCKET).createSignedUrl(path,900);
    if(error||!data?.signedUrl){
      if(popup)popup.close();
      if(typeof toast==='function')toast('Could not open stored media');
      return;
    }
    if(popup)popup.location=data.signedUrl;
    else window.location.href=data.signedUrl;
  }

  function bindClicks(){
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-job-media-path]');
      if(!button)return;
      event.preventDefault();
      openStoredMedia(button.dataset.jobMediaPath);
    });
  }

  async function init(){
    bindClicks();
    let attempts=0;
    while(attempts++<160){
      if(window.TTTCloud?.ready&&window.TTTCloud?.client&&window.TTTCloud?.organizationId){
        client=window.TTTCloud.client;
        orgId=window.TTTCloud.organizationId;
        userId=window.TTTCloud.userId;
        ready=true;
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,125));
    }
    console.error('TTT media storage did not initialize.');
  }

  window.TTTMedia={
    get ready(){return ready;},
    uploadCheckInFiles,
    openStoredMedia
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
