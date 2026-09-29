const SUPABASE_URL='https://qvqxcjmplyjgcbxlveec.supabase.co';
const SUPABASE_KEY='sb_publishable_CwrZgPD-RJVvmdNR4YABQg_cRttvE_e';

function header(req,name){
  const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(value)?value[0]:(value||'');
}
function clean(value,max=240){return String(value||'').slice(0,max);}
function decodeGeo(value){
  try{return decodeURIComponent(String(value||''));}catch{return String(value||'');}
}
function deviceLabel(ua){
  ua=String(ua||'');
  let os='Unknown device',browser='Browser';
  if(/iPad/i.test(ua))os='iPad';
  else if(/iPhone/i.test(ua))os='iPhone';
  else if(/Windows NT/i.test(ua))os='Windows';
  else if(/Macintosh|Mac OS X/i.test(ua))os='macOS';
  else if(/Android/i.test(ua))os='Android';
  else if(/Linux/i.test(ua))os='Linux';
  let m=ua.match(/CriOS\/([\d.]+)/i); if(m)browser='Chrome '+m[1].split('.').slice(0,2).join('.');
  else if((m=ua.match(/Chrome\/([\d.]+)/i)))browser='Chrome '+m[1].split('.').slice(0,2).join('.');
  else if((m=ua.match(/Version\/([\d.]+).*Safari/i)))browser='Safari '+m[1].split('.').slice(0,3).join('.');
  else if((m=ua.match(/Firefox\/([\d.]+)/i)))browser='Firefox '+m[1].split('.').slice(0,2).join('.');
  else if((m=ua.match(/Edg\/([\d.]+)/i)))browser='Edge '+m[1].split('.').slice(0,2).join('.');
  return os+' · '+browser;
}
async function supabase(path,token,options={}){
  const headers=Object.assign({
    apikey:SUPABASE_KEY,
    Authorization:'Bearer '+token,
    Accept:'application/json'
  },options.headers||{});
  return fetch(SUPABASE_URL+path,Object.assign({},options,{headers}));
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  const auth=clean(header(req,'authorization'),10000);
  if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Missing session'});
  const token=auth.slice(7);
  try{
    const userResponse=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(!userResponse.ok)return res.status(401).json({error:'Invalid session'});
    const user=await userResponse.json();
    const profileResponse=await supabase('/rest/v1/profiles?select=organization_id,display_name,email,active&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1',token);
    if(!profileResponse.ok)return res.status(403).json({error:'Profile unavailable'});
    const profiles=await profileResponse.json();
    const profile=profiles?.[0];
    if(!profile?.active)return res.status(403).json({error:'Inactive account'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const allowed=new Set(['login','logout','session_refresh']);
    const eventType=allowed.has(body.eventType)?body.eventType:'login';
    const ua=clean(header(req,'user-agent'),1200);
    const ip=clean(header(req,'x-forwarded-for').split(',')[0].trim(),96);
    const city=clean(decodeGeo(header(req,'x-vercel-ip-city')),160);
    const region=clean(decodeGeo(header(req,'x-vercel-ip-country-region')),80);
    const country=clean(header(req,'x-vercel-ip-country'),8).toUpperCase();
    const timezone=clean(header(req,'x-vercel-ip-timezone'),80);
    const clientDeviceId=clean(body.clientDeviceId,160);

    let riskLevel='normal',riskReason='Known account login';
    if(eventType==='login'){
      const priorResponse=await supabase('/rest/v1/login_activity?select=country_code,client_device_id,device_label,occurred_at&user_id=eq.'+encodeURIComponent(user.id)+'&event_type=eq.login&order=occurred_at.desc&limit=25',token);
      if(priorResponse.ok){
        const prior=await priorResponse.json();
        if(prior.length){
          const seenCountry=!country||prior.some(x=>String(x.country_code||'').toUpperCase()===country);
          const hasDeviceBaseline=prior.some(x=>x.client_device_id);
          const seenDevice=!clientDeviceId||!hasDeviceBaseline||prior.some(x=>x.client_device_id===clientDeviceId);
          if(!seenCountry){riskLevel='review';riskReason='First login seen from country '+country;}
          else if(!seenDevice){riskLevel='review';riskReason='New browser/device identifier';}
        }else riskReason='First recorded login for this account';
      }
    }

    const payload={
      organization_id:profile.organization_id,
      user_id:user.id,
      user_email:user.email||profile.email||'',
      display_name:profile.display_name||user.email||'TTT User',
      event_type:eventType,
      result:'success',
      occurred_at:new Date().toISOString(),
      ip_address:ip||null,
      city:city||null,
      region:region||null,
      country_code:country||null,
      timezone:timezone||null,
      user_agent:ua||null,
      device_label:deviceLabel(ua),
      network:null,
      client_device_id:clientDeviceId||null,
      source:'ttt_os_vercel',
      risk_level:riskLevel,
      risk_reason:riskReason,
      metadata:{
        language:clean(body.language,40)||null,
        screen:clean(body.screen,40)||null,
        client_timezone:clean(body.clientTimeZone,80)||null
      }
    };
    const insert=await supabase('/rest/v1/login_activity',token,{
      method:'POST',
      headers:{'Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify(payload)
    });
    if(!insert.ok){
      const detail=await insert.text();
      return res.status(500).json({error:'Security event could not be stored',detail:detail.slice(0,300)});
    }
    const rows=await insert.json();
    return res.status(200).json({ok:true,event:rows?.[0]||null});
  }catch(error){
    return res.status(500).json({error:'Security event failed',detail:String(error?.message||error).slice(0,300)});
  }
}
