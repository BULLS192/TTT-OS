(function(){
  'use strict';

  const BUCKET='avatars';
  const MAX_BYTES=2*1024*1024;
  const OUTPUT_SIZE=512;

  function cloud(){return window.TTTCloud;}
  function people(){return typeof db!=='undefined'&&Array.isArray(db?.personnel)?db.personnel:[];}
  function currentPerson(){
    const id=cloud()?.profile?.person_id;
    return id?people().find(p=>p.id===id)||null:null;
  }
  function initials(name){
    return (String(name||'TTT User').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'TT');
  }
  function fallback(name){
    return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="80" fill="#1557c0"/><text x="80" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="white">'+initials(name)+'</text></svg>');
  }
  async function signedUrl(path){
    if(!path||!cloud()?.client)return '';
    const {data,error}=await cloud().client.storage.from(BUCKET).createSignedUrl(path,3600);
    return error?'':(data?.signedUrl||'');
  }
  async function resolve(person,name){
    if(person?.avatarPath){
      const url=await signedUrl(person.avatarPath);
      if(url)return url;
    }
    if(person?.profilePhotoData)return person.profilePhotoData;
    const own=currentPerson();
    if(person?.id&&own?.id===person.id){
      const legacy=cloud()?.user?.user_metadata?.avatar_path;
      if(legacy){
        const url=await signedUrl(legacy);
        if(url)return url;
      }
    }
    return fallback(name||person?.displayName);
  }
  async function targetUserId(personId){
    const c=cloud(); if(!c?.client||!c?.organizationId||!personId)return null;
    const {data,error}=await c.client.from('profiles')
      .select('user_id')
      .eq('organization_id',c.organizationId)
      .eq('person_id',personId)
      .eq('active',true)
      .maybeSingle();
    if(error){console.warn('TTT avatar profile lookup failed',error);return null;}
    return data?.user_id||null;
  }
  function dataUrlToBlob(dataUrl){
    const [head,body]=String(dataUrl||'').split(',');
    const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
    const bytes=atob(body||'');
    const arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }
  function compressFile(file){
    return new Promise((resolve,reject)=>{
      if(!file||!String(file.type||'').startsWith('image/')){reject(new Error('Choose an image file.'));return;}
      if(file.size>MAX_BYTES*4){reject(new Error('Profile image is too large. Choose an image under 8 MB.'));return;}
      const reader=new FileReader(),img=new Image();
      reader.onerror=()=>reject(new Error('Could not read the image.'));
      img.onerror=()=>reject(new Error('Could not process the image.'));
      reader.onload=()=>{img.src=String(reader.result);};
      img.onload=()=>{
        const canvas=document.createElement('canvas');canvas.width=OUTPUT_SIZE;canvas.height=OUTPUT_SIZE;
        const ctx=canvas.getContext('2d');
        const scale=Math.max(OUTPUT_SIZE/img.width,OUTPUT_SIZE/img.height);
        const w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(OUTPUT_SIZE-w)/2,(OUTPUT_SIZE-h)/2,w,h);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create profile image.')),'image/jpeg',.86);
      };
      reader.readAsDataURL(file);
    });
  }
  async function uploadBlobForPerson(person,blob){
    const c=cloud(); if(!c?.client||!person?.id)throw new Error('TTT account connection is unavailable.');
    const userId=await targetUserId(person.id);
    if(!userId)throw new Error('This personnel record is not linked to a TTT OS login yet.');
    const path=userId+'/avatar.jpg';
    const {error}=await c.client.storage.from(BUCKET).upload(path,blob,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'});
    if(error)throw error;

    person.avatarPath=path;
    delete person.profilePhotoData;

    if(typeof save==='function')save();
    if(window.TTTCoreRelational?.syncNow)window.TTTCoreRelational.syncNow();

    if(c.profile?.person_id===person.id&&c.user){
      const metadata=Object.assign({},c.user.user_metadata||{},{avatar_path:path});
      const {error:metaError}=await c.client.auth.updateUser({data:metadata});
      if(metaError)console.warn('TTT avatar legacy metadata sync failed',metaError);
    }
    window.dispatchEvent(new CustomEvent('ttt:avatar-updated',{detail:{personId:person.id,path}}));
    return path;
  }
  async function uploadForPerson(person,file){
    const blob=await compressFile(file);
    if(blob.size>MAX_BYTES)throw new Error('Optimized profile image is still too large.');
    return uploadBlobForPerson(person,blob);
  }
  async function migrateEmbedded(){
    const c=cloud();
    if(!c?.ready||c.profile?.role!=='owner_admin')return;
    const candidates=people().filter(p=>p.profilePhotoData&&!p.avatarPath);
    if(!candidates.length)return;
    let changed=false;
    for(const person of candidates){
      try{
        const blob=dataUrlToBlob(person.profilePhotoData);
        if(blob.size>MAX_BYTES)continue;
        await uploadBlobForPerson(person,blob);
        changed=true;
      }catch(err){console.warn('TTT avatar migration skipped for',person.id,err);}
    }
    if(changed)window.dispatchEvent(new CustomEvent('ttt:avatars-migrated'));
  }
  async function reconcileCurrent(){
    const c=cloud(),person=currentPerson();
    if(!c?.ready||!person||person.avatarPath)return;
    const legacy=c.user?.user_metadata?.avatar_path;
    if(!legacy)return;
    person.avatarPath=legacy;
    if(typeof save==='function')save();
    if(window.TTTCoreRelational?.syncNow)window.TTTCoreRelational.syncNow();
    window.dispatchEvent(new CustomEvent('ttt:avatar-updated',{detail:{personId:person.id,path:legacy}}));
  }
  async function boot(){
    let tries=0;
    const timer=setInterval(async()=>{
      tries++;
      if(cloud()?.ready&&typeof db!=='undefined'){
        clearInterval(timer);
        await reconcileCurrent();
        await migrateEmbedded();
      }else if(tries>120)clearInterval(timer);
    },250);
  }

  window.TTTAvatar={resolve,signedUrl,currentPerson,targetUserId,uploadForPerson,migrateEmbedded,reconcileCurrent,fallback};
  window.addEventListener('ttt:cloud-state-applied',()=>{reconcileCurrent();migrateEmbedded();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();