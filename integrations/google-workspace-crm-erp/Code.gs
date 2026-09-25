/**
 * TTT CRM/ERP Google Workspace Bridge
 * Workbook: TTT Business Operations — CRM & ERP
 * Supabase is canonical. The script uses the current Google OAuth identity; no TTT password or Supabase secret key is stored here.
 */
const TTT_CRM = {
  WORKBOOK_ID: '1N67KaF8q-0FnVaYN41zI5lTVlUoj06pHNAuF1TQrJ8I',
  SHEETS: {
    'Companies': ['companies','id'],
    'Contacts': ['contacts','id'],
    'Leads': ['leads','id'],
    'Opportunities': ['opportunities','id'],
    'Activities': ['activities','id'],
    'Customers': ['customers','id'],
    'Vehicles': ['vehicles','id'],
    'Jobs': ['jobs','id'],
    'Quotes': ['quotes','id'],
    'Quote Lines': ['quote_lines','id'],
    'Invoices': ['invoices','id'],
    'Invoice Lines': ['invoice_lines','id'],
    'Payments': ['payments','id'],
    'Vendors': ['vendors','company_id'],
    'Products & Services': ['products_services','id'],
    'Inventory': ['inventory_items','id'],
    'Purchase Orders': ['purchase_orders','id'],
    'PO Lines': ['purchase_order_lines','id'],
    'Expenses': ['expenses','id'],
    'Appointments': ['appointments','id'],
    'Documents': ['documents','id'],
    'Email Templates': ['email_templates','id']
  },
  CORE: new Set(['customers','vehicles','jobs']),
  ARRAYS: new Set(['tags','primary_categories','brands_represented','roles']),
  READ_ONLY: new Set(['created_at','updated_at','organization_id'])
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TTT Workspace')
    .addItem('Verify TTT access','verifyTTTWorkspaceAccess')
    .addSeparator()
    .addItem('Pull all from TTT-OS','pullTTTAll')
    .addItem('Pull active sheet','pullTTTActiveSheet')
    .addItem('Push active row','pushTTTActiveRow')
    .addItem('Push active sheet','pushTTTActiveSheet')
    .addSeparator()
    .addItem('Send templated email','sendTTTTemplatedEmail')
    .addItem('Create Calendar event','createTTTCalendarEvent')
    .addItem('Create Drive folder','createTTTDriveFolder')
    .addSeparator()
    .addItem('Install hourly pull trigger','installTTTHourlyPull')
    .addToUi();
}

function verifyTTTWorkspaceAccess() {
  const result = tttEdge_({action:'profile'});
  const p = result.profile || {};
  SpreadsheetApp.getUi().alert(
    'TTT access verified',
    (p.display_name || p.email || 'User') + (p.role ? ' — ' + p.role : ''),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function pullTTTAll() {
  const ui=SpreadsheetApp.getUi();
  const answer=ui.alert('Refresh from TTT-OS?',
    'Supabase is canonical. This replaces data rows on synchronized tabs with current Supabase values.',
    ui.ButtonSet.OK_CANCEL);
  if(answer!==ui.Button.OK)return;
  pullTTTAll_();
  tttToast_('Workbook refreshed from Supabase.');
}
function pullTTTAllScheduled(){ pullTTTAll_(); }
function pullTTTAll_(){
  let count=0;
  Object.keys(TTT_CRM.SHEETS).forEach(name=>{count+=pullTTTSheet_(name);});
  tttSyncLog_('google_sheets','pull',null,null,'success','Pulled synchronized tabs.',count);
}

function pullTTTActiveSheet(){
  const name=tttWorkbook_().getActiveSheet().getName();
  tttRequireSyncSheet_(name);
  const n=pullTTTSheet_(name);
  tttSyncLog_('google_sheets','pull',TTT_CRM.SHEETS[name][0],null,'success','Pulled active sheet.',n);
  tttToast_(name+': '+n+' rows pulled.');
}

function pullTTTSheet_(name){
  const cfg=TTT_CRM.SHEETS[name]; if(!cfg)return 0;
  const sheet=tttWorkbook_().getSheetByName(name);
  const headers=tttHeaders_(sheet);
  const response=tttEdge_({action:'pull',table:cfg[0]});
  const rows=response.data||[];
  const bodyRows=Math.max(1,sheet.getMaxRows()-1);
  sheet.getRange(2,1,bodyRows,Math.max(1,sheet.getLastColumn())).clearContent();
  if(rows.length){
    sheet.getRange(2,1,rows.length,headers.length)
      .setValues(rows.map(r=>headers.map(h=>h==='_sync_status'?'Synced':tttCell_(r[h]))));
  }
  return rows.length;
}

function pushTTTActiveRow(){
  const sheet=tttWorkbook_().getActiveSheet(); tttRequireSyncSheet_(sheet.getName());
  const row=sheet.getActiveRange().getRow(); if(row<2)throw new Error('Select a data row.');
  const out=pushTTTRow_(sheet,row); tttToast_(out.action+' '+out.id);
}
function pushTTTActiveSheet(){
  const sheet=tttWorkbook_().getActiveSheet(); tttRequireSyncSheet_(sheet.getName());
  let n=0; for(let r=2;r<=sheet.getLastRow();r++){if(tttRowBlank_(sheet,r))continue;pushTTTRow_(sheet,r);n++;}
  tttSyncLog_('google_sheets','push',TTT_CRM.SHEETS[sheet.getName()][0],null,'success','Pushed active sheet.',n);
  tttToast_(n+' rows pushed.');
}

function pushTTTRow_(sheet,rowNum){
  const cfg=TTT_CRM.SHEETS[sheet.getName()];
  const headers=tttHeaders_(sheet);
  const vals=sheet.getRange(rowNum,1,1,headers.length).getValues()[0];
  const row={};headers.forEach((h,i)=>row[h]=vals[i]);
  const payload=tttPayload_(row);
  const response=tttEdge_({action:'upsert',table:cfg[0],record:payload});
  const returned=response.data||{};
  const id=String(returned[cfg[1]]||payload[cfg[1]]||'');
  ['id','company_id','created_at','updated_at'].forEach(k=>{
    if(returned[k]!==undefined&&headers.includes(k))tttSet_(sheet,rowNum,k,tttCell_(returned[k]));
  });
  if(headers.includes('_sync_status'))tttSet_(sheet,rowNum,'_sync_status','Synced');
  return {action:response.action||'saved',id:id};
}

function tttPayload_(row){
  const out={};
  Object.keys(row).forEach(k=>{
    if(!k||k[0]==='_'||TTT_CRM.READ_ONLY.has(k))return;
    let v=row[k];
    if(v===''){out[k]=null;return;}
    if(TTT_CRM.ARRAYS.has(k)){
      if(Array.isArray(v)){out[k]=v;return;}
      const s=String(v).trim(); const parsed=s[0]==='['?tttJson_(s):null;
      out[k]=Array.isArray(parsed)?parsed:s.split(',').map(x=>x.trim()).filter(Boolean); return;
    }
    out[k]=v;
  });
  return out;
}

function sendTTTTemplatedEmail(){
  const sheet=tttWorkbook_().getActiveSheet(), rowNum=sheet.getActiveRange().getRow();
  if(rowNum<2)throw new Error('Select a record row.');
  const row=tttRowObject_(sheet,rowNum), recipient=tttRecipient_(row);
  if(!recipient.email)throw new Error('No recipient email could be resolved.');
  const ui=SpreadsheetApp.getUi(), p=ui.prompt('Email template','Template key: lead_intro, quote_followup, appointment_confirmation, invoice_send, thank_you, or review_request',ui.ButtonSet.OK_CANCEL);
  if(p.getSelectedButton()!==ui.Button.OK)return;
  const template=tttFind_('Email Templates','template_key',p.getResponseText().trim());
  if(!template)throw new Error('Template not found.');
  const vars=Object.assign({},recipient,row);
  const subject=tttRender_(template.subject_template,vars), body=tttRender_(template.body_template,vars);
  const message=GmailApp.createDraft(recipient.email,subject,body).send();
  const activity=tttActivityRefs_(sheet.getName(),row);
  Object.assign(activity,{activity_type:'email',direction:'outbound',status:'completed',subject,summary:'Email sent to '+recipient.email,occurred_at:new Date().toISOString(),gmail_message_id:message.getId(),gmail_thread_id:message.getThread().getId()});
  tttInsertActivity_(activity); tttToast_('Email sent and logged.');
}

function createTTTCalendarEvent(){
  const sheet=tttWorkbook_().getActiveSheet(); if(sheet.getName()!=='Appointments')throw new Error('Use this from Appointments.');
  const r=sheet.getActiveRange().getRow(), row=tttRowObject_(sheet,r);
  if(!row.title||!row.starts_at)throw new Error('title and starts_at are required.');
  const start=new Date(row.starts_at), end=row.ends_at?new Date(row.ends_at):new Date(start.getTime()+3600000);
  const cal=CalendarApp.getDefaultCalendar(), event=cal.createEvent(String(row.title),start,end,{location:String(row.location||''),description:String(row.notes||'')});
  tttSet_(sheet,r,'google_calendar_id',cal.getId()); tttSet_(sheet,r,'google_calendar_event_id',event.getId());
  pushTTTRow_(sheet,r);
  tttInsertActivity_(Object.assign(tttActivityRefs_('Appointments',row),{activity_type:'meeting',direction:'internal',status:'completed',subject:'Calendar event created: '+row.title,summary:'Created from TTT appointment.',occurred_at:new Date().toISOString(),calendar_event_id:event.getId()}));
  tttToast_('Calendar event created and linked.');
}

function createTTTDriveFolder(){
  const sheet=tttWorkbook_().getActiveSheet(), name=sheet.getName();
  if(!['Companies','Customers'].includes(name))throw new Error('Use this from Companies or Customers.');
  const r=sheet.getActiveRange().getRow(), row=tttRowObject_(sheet,r);
  const rootId=PropertiesService.getScriptProperties().getProperty('TTT_DRIVE_ROOT_FOLDER_ID');
  if(!rootId)throw new Error('Set TTT_DRIVE_ROOT_FOLDER_ID in Script Properties.');
  const label=name==='Companies'?(row.name||row.id):(row.display_name||[row.first_name,row.last_name].filter(Boolean).join(' ')||row.id);
  const folder=DriveApp.getFolderById(rootId).createFolder(row.id+' — '+label);
  tttSet_(sheet,r,'drive_folder_id',folder.getId()); pushTTTRow_(sheet,r); tttToast_('Drive folder created and linked.');
}

function installTTTHourlyPull(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='pullTTTAllScheduled').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pullTTTAllScheduled').timeBased().everyHours(1).create();
  tttToast_('Hourly pull installed.');
}

function tttRecipient_(row){
  if(row.email)return row;
  for(const pair of [['contact_id','Contacts','id'],['customer_id','Customers','id']]){
    if(row[pair[0]]){const x=tttFind_(pair[1],pair[2],row[pair[0]]);if(x&&x.email)return x;}
  }
  if(row.company_id){const x=tttFind_('Companies','id',row.company_id);if(x&&x.general_email)return {email:x.general_email,first_name:x.name,name:x.name};}
  return {};
}
function tttActivityRefs_(sheetName,row){
  const out={}; const direct={Companies:'company_id',Contacts:'contact_id',Leads:'lead_id',Opportunities:'opportunity_id',Customers:'customer_id',Jobs:'job_id'};
  if(direct[sheetName]&&row.id)out[direct[sheetName]]=row.id;
  ['company_id','contact_id','lead_id','opportunity_id','customer_id','job_id'].forEach(k=>{if(row[k])out[k]=row[k];});
  return out;
}
function tttInsertActivity_(obj){
  return tttEdge_({action:'upsert',table:'activities',record:obj});
}
function tttSyncLog_(source,direction,type,id,status,message,count){
  try{
    tttEdge_({
      action:'sync_log',sync_source:source,sync_direction:direction,
      entity_type:type,entity_id:id,status:status,message:message,row_count:Number(count||0)
    });
  }catch(e){}
}

function tttEdge_(payload){
  const url=String(tttSettings_().supabase_url||'').replace(/\\\/$/,'')+'/functions/v1/workspace-api';
  const res=UrlFetchApp.fetch(url,{
    method:'post',
    contentType:'application/json',
    headers:{'x-google-access-token':ScriptApp.getOAuthToken()},
    payload:JSON.stringify(payload||{}),
    muteHttpExceptions:true
  });
  const body=tttJson_(res.getContentText())||{};
  if(res.getResponseCode()>=300||body.ok===false)
    throw new Error(body.error||('TTT workspace API error '+res.getResponseCode()));
  return body;
}

function tttWorkbook_(){return SpreadsheetApp.openById(TTT_CRM.WORKBOOK_ID);}
function tttSettings_(){const s=tttWorkbook_().getSheetByName('Settings'), vals=s.getRange(2,1,Math.max(0,s.getLastRow()-1),3).getValues(), out={};vals.forEach(r=>{if(r[0])out[String(r[0])]=r[1];});return out;}
function tttHeaders_(s){return s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(v=>String(v).trim());}
function tttRowObject_(s,r){const h=tttHeaders_(s),v=s.getRange(r,1,1,h.length).getValues()[0],o={};h.forEach((x,i)=>o[x]=v[i]);return o;}
function tttSet_(s,r,k,v){const h=tttHeaders_(s),i=h.indexOf(k);if(i<0)throw new Error('Missing column '+k);s.getRange(r,i+1).setValue(v);}
function tttFind_(sheetName,key,value){const s=tttWorkbook_().getSheetByName(sheetName),h=tttHeaders_(s),idx=h.indexOf(key);if(idx<0)return null;const n=s.getLastRow()-1;if(n<=0)return null;const rows=s.getRange(2,1,n,h.length).getValues();for(const row of rows)if(String(row[idx])===String(value)){const o={};h.forEach((x,i)=>o[x]=row[i]);return o;}return null;}
function tttRender_(text,vars){return String(text||'').replace(/\{\{\s*([\w_]+)\s*\}\}/g,(m,k)=>vars[k]==null?'':String(vars[k]));}
function tttCell_(v){return v==null?'':(typeof v==='object'?JSON.stringify(v):v);}
function tttRowBlank_(s,r){const h=tttHeaders_(s),v=s.getRange(r,1,1,h.length).getValues()[0];return v.every((x,i)=>h[i][0]==='_'||x===''||x===null);}
function tttRequireSyncSheet_(name){if(!TTT_CRM.SHEETS[name])throw new Error(name+' is not a synchronized table.');}
function tttNewId_(table){const p={companies:'CMP',contacts:'CON',leads:'LEAD',opportunities:'OPP',activities:'ACT',customers:'CUS',vehicles:'VEH',jobs:'JOB',quotes:'QTE',quote_lines:'QLN',invoices:'INV',invoice_lines:'ILN',payments:'PAY',products_services:'PRD',inventory_items:'INVITEM',purchase_orders:'PO',purchase_order_lines:'POL',appointments:'APT',documents:'DOC',email_templates:'EML',expenses:'EXP'}[table]||'REC';return p+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();}
function tttJson_(s){try{return JSON.parse(s);}catch(e){return null;}}
function tttToast_(m){tttWorkbook_().toast(String(m),'TTT Workspace',5);}
