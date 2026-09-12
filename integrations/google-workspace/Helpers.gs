function upsert_(ss, sheetName, keyHeader, keyValue, obj) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  const headers = headers_(sheet);
  const keyCol = headers.indexOf(keyHeader);
  if (keyCol < 0) throw new Error('Missing key column '+keyHeader+' on '+sheetName);
  let row = 0;
  if (sheet.getLastRow() >= 2) {
    const vals = sheet.getRange(2,keyCol+1,sheet.getLastRow()-1,1).getValues();
    for (let i=0;i<vals.length;i++) if (String(vals[i][0]) === String(keyValue)) {row=i+2;break;}
  }
  if (!row) {row = Math.max(sheet.getLastRow()+1,2);}
  const existing = sheet.getRange(row,1,1,headers.length).getValues()[0];
  const out = existing.slice();
  headers.forEach(function(h,i){if (Object.prototype.hasOwnProperty.call(obj,h)) out[i]=obj[h];});
  sheet.getRange(row,1,1,headers.length).setValues([out]);
}

function appendObject_(sheet, obj) {
  const headers = headers_(sheet);
  sheet.appendRow(headers.map(function(h){return Object.prototype.hasOwnProperty.call(obj,h) ? obj[h] : '';}));
}

function deleteRowsByValue_(ss, sheetName, header, value) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = headers_(sheet), col=headers.indexOf(header);
  if (col < 0) return;
  const vals=sheet.getRange(2,col+1,sheet.getLastRow()-1,1).getValues();
  for (let i=vals.length-1;i>=0;i--) if (String(vals[i][0])===String(value)) sheet.deleteRow(i+2);
}

function headers_(sheet) {return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);}
function rowToObject_(headers,row){const o={};headers.forEach(function(h,i){o[h]=row[i];});return o;}
function appendSyncLog_(ss,direction,type,id,operation,status,error){appendObject_(ss.getSheetByName('Sync Log'),{Sync_ID:'SYNC-'+Utilities.getUuid().slice(0,8).toUpperCase(),Direction:direction,Object_Type:type,Object_ID:id,Operation:operation,Status:status,Timestamp:isoNow_(),Source_Version:'TTT OS v0.3',Error:error||''});}
function replaceToken_(body, token, value){body.replaceText(escapeRegex_('{{'+token+'}}'), String(value == null ? '' : value)); if(token.indexOf('{{')>=0) body.replaceText(escapeRegex_(token), String(value == null ? '' : value));}
function escapeRegex_(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function stableId_(prefix,source){return prefix+'-'+cleanId_(source||Utilities.getUuid()).slice(0,40);}
function cleanId_(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');}
function normalizeJobId_(v){const s=String(v||'');return s.indexOf('JOB-')===0?s:(s.indexOf('J-')===0?'JOB-'+s.slice(2):'JOB-'+cleanId_(s));}
function safeName_(v){return String(v||'').replace(/[\\/:*?"<>|]/g,'-').slice(0,150);}
function firstName_(name){return String(name||'').trim().split(/\s+/)[0]||'';}
function lastName_(name){const a=String(name||'').trim().split(/\s+/);return a.length>1?a[a.length-1]:'';}
function plateOnly_(plate){return String(plate||'').split('/')[0].trim();}
function plateState_(plate){return String(plate||'').split('/')[1]?.trim()||'';}
function number_(v){const n=Number(v||0);return isFinite(n)?n:0;}
function countMediaGroup_(items,g){return (items||[]).filter(function(x){return x.group===g;}).length;}
function isoNow_(){return new Date().toISOString();}
function dateText_(v){if(!v)return'';return Utilities.formatDate(new Date(v),TTT_CONFIG.TIMEZONE,'MMM d, yyyy');}
function moneyText_(v){return '$'+number_(v).toFixed(2);}
function vehicleStatus_(s){return ['Checked In','Awaiting Final Authorization','In Progress','Waiting on Customer','Waiting on Parts','QC','Ready for Pickup'].indexOf(s)>=0?'In Shop':'Active';}
function appointmentStatus_(s){if(['Closed','Declined'].indexOf(s)>=0)return 'Closed';if(['Delivered'].indexOf(s)>=0)return 'Completed';return 'Scheduled';}
function workStart_(j){const a=(j.audit||[]).find(function(x){return x.action==='final_authorization_and_work_order_created';});return a && a.at || '';}
function fileIdFromUrl_(url){const m=String(url||'').match(/[-\w]{25,}/);if(!m)throw new Error('Could not read Drive file ID.');return m[0];}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
