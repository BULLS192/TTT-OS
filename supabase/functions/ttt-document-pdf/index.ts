
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

const safe=(v:unknown)=>String(v??"")
  .replace(/[–—]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
  .replace(/™/g,"").replace(/[^\x20-\x7E\n\r\t]/g," ");
const money=(v:unknown)=>"$"+Number(v||0).toFixed(2);
const date=(v:unknown)=>v?new Date(String(v)).toLocaleString("en-US",{timeZone:"America/Chicago"}):"";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")||"";
  const token=auth.replace(/^Bearer\s+/i,"");
  if(!token)return json({error:"Authentication required"},401);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await admin.auth.getUser(token);
  const user=userData?.user;
  if(userError||!user)return json({error:"Invalid authentication"},401);

  let payload:any={};
  try{payload=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  const action=String(payload.action||"generate");
  const documentId=String(payload.document_id||"");
  if(!documentId)return json({error:"document_id is required"},400);

  const {data:doc,error:docError}=await admin.from("documents").select("*").eq("id",documentId).is("archived_at",null).maybeSingle();
  if(docError||!doc)return json({error:"Document not found"},404);

  const {data:membership}=await admin.from("profiles").select("user_id,organization_id,active")
    .eq("user_id",user.id).eq("organization_id",doc.organization_id).eq("active",true).maybeSingle();
  if(!membership)return json({error:"Not authorized for this document"},403);

  const existingQ=await admin.from("document_artifacts").select("*")
    .eq("organization_id",doc.organization_id).eq("document_id",doc.id).eq("artifact_type","canonical_pdf").maybeSingle();
  const existing=existingQ.data;

  if(action==="url"){
    if(!existing)return json({error:"Canonical PDF has not been generated"},404);
    const {data:signed,error:signedError}=await admin.storage.from(existing.storage_bucket).createSignedUrl(existing.storage_path,900);
    if(signedError)return json({error:signedError.message},500);
    return json({artifact:existing,signed_url:signed.signedUrl,expires_in:900});
  }

  if(action!=="generate")return json({error:"Unsupported action"},400);
  if(existing){
    const {data:signed}=await admin.storage.from(existing.storage_bucket).createSignedUrl(existing.storage_path,900);
    return json({artifact:existing,signed_url:signed?.signedUrl||null,existing:true});
  }
  if(!doc.finalized_at)return json({error:"Only finalized documents can receive a canonical PDF"},409);

  const [customerR,vehicleR,jobR,invoiceLinesR,quoteLinesR,mediaR]=await Promise.all([
    doc.customer_id?admin.from("customers").select("*").eq("organization_id",doc.organization_id).eq("id",doc.customer_id).maybeSingle():Promise.resolve({data:null}),
    doc.vehicle_id?admin.from("vehicles").select("*").eq("organization_id",doc.organization_id).eq("id",doc.vehicle_id).maybeSingle():Promise.resolve({data:null}),
    doc.job_id?admin.from("jobs").select("*").eq("organization_id",doc.organization_id).eq("id",doc.job_id).maybeSingle():Promise.resolve({data:null}),
    doc.invoice_id?admin.from("invoice_lines").select("*").eq("organization_id",doc.organization_id).eq("invoice_id",doc.invoice_id).is("archived_at",null).order("sort_order"):Promise.resolve({data:[]}),
    doc.quote_id?admin.from("quote_lines").select("*").eq("organization_id",doc.organization_id).eq("quote_id",doc.quote_id).is("archived_at",null).order("sort_order"):Promise.resolve({data:[]}),
    doc.job_id?admin.from("job_media").select("*").eq("organization_id",doc.organization_id).eq("job_id",doc.job_id).is("archived_at",null).order("captured_at"):Promise.resolve({data:[]})
  ]);

  const customer:any=customerR.data;
  const vehicle:any=vehicleR.data;
  const job:any=jobR.data;
  const invoiceLines:any[]=invoiceLinesR.data||[];
  const quoteLines:any[]=quoteLinesR.data||[];
  const allMedia:any[]=mediaR.data||[];

  const snapshot:any=doc.snapshot||{};
  const allowedMediaIds=new Set<string>([
    ...((doc.metadata?.photo_ids||[]).map((x:any)=>String(x))),
    ...((snapshot.condition_media_ids||[]).map((x:any)=>String(x))),
    ...((snapshot.checkIn?.photos||[]).map((x:any)=>String(x.id||""))),
    ...((snapshot.check_in?.photos||[]).map((x:any)=>String(x.id||"")))
  ].filter(Boolean));
  const photos=allowedMediaIds.size?allMedia.filter(x=>allowedMediaIds.has(String(x.id))):[];

  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue=rgb(0.055,0.29,0.62);
  const dark=rgb(0.08,0.11,0.16);
  const gray=rgb(0.42,0.46,0.52);
  let page:any,x=46,y=0,width=0;

  function addPage(){
    page=pdf.addPage([612,792]); width=page.getWidth()-92; y=748;
    page.drawText("THOMPSON TRANSPORTATION TECHNOLOGIES",{x:46,y,font:bold,size:10,color:dark});
    page.drawText("Controlled TTT-OS Document",{x:46,y:y-15,font:regular,size:7,color:gray});
    page.drawRectangle({x:46,y:y-26,width,height:3,color:blue});
    y-=48;
  }
  function ensure(h=40){if(y-h<48)addPage();}
  function line(text:string,size=9,font=regular,color=dark,indent=0){
    const clean=safe(text);
    const max=Math.max(18,Math.floor((width-indent)/(size*0.54)));
    const words=clean.split(/\s+/); let cur="";
    for(const w of words){
      if((cur+" "+w).trim().length>max){ensure(size+5);page.drawText(cur,{x:x+indent,y,font,size,color});y-=size+4;cur=w;}
      else cur=(cur+" "+w).trim();
    }
    if(cur){ensure(size+5);page.drawText(cur,{x:x+indent,y,font,size,color});y-=size+4;}
  }
  function label(name:string,value:unknown){
    ensure(22);page.drawText(safe(name).toUpperCase(),{x,y,font:bold,size:6.5,color:gray});
    page.drawText(safe(value||"-"),{x:x+120,y,font:regular,size:8.5,color:dark});y-=16;
  }
  function heading(text:string){
    ensure(30);y-=5;page.drawText(safe(text).toUpperCase(),{x,y,font:bold,size:8,color:blue});y-=15;
  }
  function separator(){ensure(10);page.drawLine({start:{x,y},end:{x:x+width,y},thickness:.5,color:rgb(.84,.87,.9)});y-=10;}

  addPage();
  line(safe(doc.title),17,bold,dark);
  line(safe(doc.document_number),9,bold,blue);
  y-=4;
  label("Document status",doc.document_status);
  label("Template version",doc.template_version);
  label("Finalized",date(doc.finalized_at));
  if(doc.signer_name)label("Signed by",doc.signer_name+" | "+date(doc.signed_at));

  heading("Customer & Vehicle");
  label("Customer",customer?.display_name||[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||snapshot.customer?.name);
  label("Email",customer?.email||snapshot.customer?.email);
  label("Phone",customer?.phone||snapshot.customer?.phone);
  label("Vehicle",[vehicle?.year,vehicle?.make,vehicle?.model,vehicle?.trim].filter(Boolean).join(" ")||snapshot.vehicle?.label);
  label("VIN",vehicle?.vin||snapshot.vehicle?.vin);
  label("Plate",[vehicle?.plate,vehicle?.plate_state].filter(Boolean).join(" ")||[snapshot.vehicle?.plate,snapshot.vehicle?.plateState].filter(Boolean).join(" "));
  label("Job",doc.job_id||snapshot.job?.id);

  if(doc.document_code==="Q"||doc.document_code==="INV"){
    const core=doc.document_code==="INV"?(snapshot.invoice||snapshot.job?.invoice||{}):(snapshot.quote||{});
    const lines=doc.document_code==="INV"?invoiceLines:quoteLines;
    heading(doc.document_code==="INV"?"Invoice Detail":"Quotation Detail");
    for(const l of lines){
      ensure(30);
      line((l.description||l.line_type||"Item")+"  x"+Number(l.quantity||1).toFixed(2)+"  "+money(l.line_total),8.5,regular,dark);
    }
    separator();
    label("Subtotal",money(core.subtotal||0));
    label("Discount",money(core.discount_total||0));
    label("Tax",money(core.tax_total||0));
    label("Total",money(core.total||snapshot.job?.estimate_total||0));
    if(doc.document_code==="INV"){
      label("Amount paid",money(core.amount_paid||0));
      label("Balance due",money(core.balance_due??core.total??0));
    }
  }

  if(["AUTH","CHK","COMP"].includes(doc.document_code)){
    heading(doc.document_code==="COMP"?"Handover & Vehicle Record":"Vehicle Condition Record");
    const ci=snapshot.checkIn||snapshot.check_in||job?.check_in||{};
    label("Odometer",ci.odometer);
    label("Fuel",ci.fuel);
    label("Keys",ci.keys);
    label("Warning lights",ci.warningLights||ci.warning_lights);
    if(ci.conditionNotes||ci.condition_notes)line("Condition notes: "+(ci.conditionNotes||ci.condition_notes),8.5);
    if(ci.belongings)line("Customer belongings: "+ci.belongings,8.5);
  }

  if(["DIA","DFR","DRA"].includes(doc.document_code)){
    const d=snapshot.diagnostic_case||snapshot.diagnosticCase||{};
    heading("SignalTrace Diagnostic Record");
    for(const [k,v] of [["Reported symptom",d.reported_symptom],["SCAN",d.scan_notes],["ISOLATE",d.isolate_notes],["TRACE",d.trace_notes],["VERIFY",d.verify_notes],["RESOLVE",d.resolve_notes],["Root cause",d.root_cause_classification],["Findings",d.findings],["Recommended action",d.recommended_action],["Next authorization",d.estimate_next_authorization]]){
      if(v){line(String(k)+": "+String(v),8.5);y-=3;}
    }
  }

  if(snapshot.job?.requestNotes||snapshot.job?.request_notes||job?.request_notes){
    heading("Scope / Notes");
    line(snapshot.job?.requestNotes||snapshot.job?.request_notes||job?.request_notes,8.5);
  }

  if(photos.length){
    heading("Photographic Evidence");
    line(photos.length+" check-in / condition photograph(s) are included in this signed record.",8.5);
    for(const p of photos){
      try{
        const {data:file}=await admin.storage.from(p.storage_bucket||"job-media").download(p.storage_path);
        if(!file)continue;
        const bytes=new Uint8Array(await file.arrayBuffer());
        let image:any=null;
        const mime=String(p.mime||"").toLowerCase();
        if(mime.includes("png"))image=await pdf.embedPng(bytes);
        else if(mime.includes("jpeg")||mime.includes("jpg"))image=await pdf.embedJpg(bytes);
        if(!image)continue;
        const ratio=Math.min(width/image.width,260/image.height);
        const iw=image.width*ratio, ih=image.height*ratio;
        ensure(ih+35);
        page.drawImage(image,{x,y:y-ih,width:iw,height:ih});
        y-=ih+11;
        line((p.area||p.category||"Condition photo")+" | "+date(p.captured_at),7,regular,gray);
        y-=7;
      }catch(_e){/* unsupported/corrupt photo is omitted; manifest below still records it */}
    }
  }

  const sig=doc.metadata?.signature_image;
  if(sig&&String(sig).startsWith("data:image/png;base64,")){
    try{
      const raw=Uint8Array.from(atob(String(sig).split(",")[1]),c=>c.charCodeAt(0));
      const img=await pdf.embedPng(raw);
      const ratio=Math.min(240/img.width,80/img.height);
      heading("Authorization / Signature");
      ensure(img.height*ratio+45);
      page.drawImage(img,{x,y:y-img.height*ratio,width:img.width*ratio,height:img.height*ratio});
      y-=img.height*ratio+10;
      line((doc.signer_name||"Signer")+" | "+(doc.signature_method||"Digital signature")+" | "+date(doc.signed_at),8);
    }catch(_e){}
  }

  heading("Document Integrity");
  line("Source content SHA-256: "+safe(doc.content_hash||"not recorded"),7,regular,gray);
  line("Photographic evidence manifest: "+photos.map(p=>p.id).join(", "),7,regular,gray);

  const bytes=await pdf.save();
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const hash=[...digest].map(b=>b.toString(16).padStart(2,"0")).join("");
  const path=[doc.organization_id,doc.job_id||"general",doc.id,safe(doc.document_number||doc.id).replace(/[^A-Za-z0-9._-]/g,"_")+".pdf"].join("/");

  const upload=await admin.storage.from("document-artifacts").upload(path,bytes,{
    contentType:"application/pdf",upsert:false,cacheControl:"3600"
  });
  if(upload.error)return json({error:"PDF storage failed: "+upload.error.message},500);

  const artifactRow={
    organization_id:doc.organization_id,document_id:doc.id,artifact_type:"canonical_pdf",
    storage_bucket:"document-artifacts",storage_path:path,mime_type:"application/pdf",
    size_bytes:bytes.byteLength,sha256:hash,source_content_hash:doc.content_hash,
    generator:"ttt-document-pdf-v1",
    metadata:{document_number:doc.document_number,photo_ids:photos.map(x=>x.id),template_version:doc.template_version},
    created_by:user.id
  };
  const artifactInsert=await admin.from("document_artifacts").insert(artifactRow).select("*").single();
  if(artifactInsert.error){
    await admin.storage.from("document-artifacts").remove([path]);
    return json({error:"Artifact registration failed: "+artifactInsert.error.message},500);
  }

  const {data:signed}=await admin.storage.from("document-artifacts").createSignedUrl(path,900);
  return json({artifact:artifactInsert.data,signed_url:signed?.signedUrl||null,existing:false});
});
