/**
 * TTT Google Workspace Bridge v1
 * Supabase is canonical. Google Sheets is a controlled mirror/import/export surface.
 *
 * Script Properties required:
 *   SUPABASE_URL=https://qvqxcjmplyjgcbxlveec.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<server-side key; never put in Sheets or browser code>
 *   TTT_SYNC_TOKEN=<shared bridge token>
 *   TTT_SPREADSHEET_ID=1WJp-FC97yB35p8SGAtkOEBKtjS6-rrB5yn6igo7Ej_E
 *   TTT_ORGANIZATION_ID=f31450b1-b8b8-42a2-805c-27a564dfe61e
 *   TTT_DRIVE_ROOT_ID=14tX3xOze04Z-Gwt82UWSqK9__HxTbZq1
 */

const TTT_TABLES = {
  companies: { sheet: 'DB_Companies', key: ['organization_id','id'] },
  contacts: { sheet: 'DB_Contacts', key: ['organization_id','id'] },
  leads: { sheet: 'DB_Leads', key: ['organization_id','id'] },
  opportunities: { sheet: 'DB_Opportunities', key: ['organization_id','id'] },
  activities: { sheet: 'DB_Activities', key: ['organization_id','id'] },
  customers: { sheet: 'DB_Customers', key: ['organization_id','id'] },
  vehicles: { sheet: 'DB_Vehicles', key: ['organization_id','id'] },
  jobs: { sheet: 'DB_Jobs', key: ['organization_id','id'] },
  products_services: { sheet: 'DB_Products', key: ['organization_id','id'] },
  supplier_products: { sheet: 'DB_Supplier_Products', key: ['organization_id','id'] },
  inventory_items: { sheet: 'DB_Inventory', key: ['organization_id','id'] },
  inventory_transactions: { sheet: 'DB_Inventory_Tx', key: ['organization_id','id'], appendOnly: true },
  vendors: { sheet: 'DB_Vendors', key: ['organization_id','company_id'] },
  purchase_orders: { sheet: 'DB_Purchase_Orders', key: ['organization_id','id'] },
  purchase_order_lines: { sheet: 'DB_PO_Lines', key: ['organization_id','id'] },
  quotes: { sheet: 'DB_Quotes', key: ['organization_id','id'] },
  quote_lines: { sheet: 'DB_Quote_Lines', key: ['organization_id','id'] },
  invoices: { sheet: 'DB_Invoices', key: ['organization_id','id'] },
  invoice_lines: { sheet: 'DB_Invoice_Lines', key: ['organization_id','id'] },
  payments: { sheet: 'DB_Payments', key: ['organization_id','id'] },
  appointments: { sheet: 'DB_Appointments', key: ['organization_id','id'] },
  documents: { sheet: 'DB_Documents', key: ['organization_id','id'] },
  email_templates: { sheet: 'DB_Email_Templates', key: ['organization_id','id'] },
  personnel: { sheet: 'DB_Personnel', key: ['organization_id','id'], supabasePrimary: true },
  workspace_links: { sheet: 'DB_Workspace_Links', key: ['organization_id','id'], supabasePrimary: true },
  workspace_sync_log: { sheet: 'DB_Sync_Log', key: ['organization_id','id'], appendOnly: true }
};

function doGet() {
  return json_({ ok: true, service: 'TTT Workspace Bridge', version: '1.0.0' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertToken_(body.token);
    const action = String(body.action || '');
    if (action === 'health') return json_(health_());
    if (action === 'syncAll') return json_(syncAll_());
    if (action === 'syncTable') return json_(syncTable_(body.table));
    if (action === 'syncEntity') return json_(syncEntity_(body.table, body.record));
    if (action === 'sendEmail') return json_(sendEmail_(body));
    if (action === 'calendarUpsert') return json_(calendarUpsert_(body));
    if (action === 'driveFolderEnsure') return json_(driveFolderEnsure_(body));
    // Backward compatibility with the current google-sync-v02.js client.
    if (action === 'syncJob') return json_(legacySyncJob_(body));
    if (action === 'sendQuote') return json_(legacySendQuote_(body));
    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function legacySyncJob_(body) {
  // TTT-OS already writes canonical data to Supabase first. Refresh the
  // affected mirrors from Supabase rather than accepting browser payloads as truth.
  const result = {
    customers: syncTable_('customers'),
    vehicles: syncTable_('vehicles'),
    jobs: syncTable_('jobs')
  };
  return { ok:true, ids:{ job_id: body && body.job && body.job.id || null }, links:{}, mirror:result };
}

function legacySendQuote_(body) {
  const customer = body && body.customer || {};
  const job = body && body.job || {};
  const quote = job.quote || {};
  const to = String(customer.email || '').trim();
  if (!to) throw new Error('Customer email is required.');
  const quoteId = quote.id || job.primary_quote_id || job.estimate_id || job.id || 'TTT quote';
  const total = quote.total || job.estimateTotal || job.estimate_total || '';
  const subject = 'Thompson Transportation Technologies — ' + quoteId;
  const html = '<p>Hi ' + escapeHtml_(customer.firstName || customer.first_name || customer.name || 'there') +
    ',</p><p>Your TTT quotation <strong>' + escapeHtml_(quoteId) +
    '</strong> is ready.' + (total ? ' Total: <strong>
  const cfg = config_();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const probe = supabaseFetch_('organizations', {
    select: 'id,name,slug',
    id: 'eq.' + cfg.organizationId,
    limit: '1'
  });
  return {
    ok: true,
    database: ss.getName(),
    organization: probe[0] || null,
    version: '1.0.0',
    canonical: 'Supabase'
  };
}

/** Pull all approved CRM/ERP tables from Supabase into DB_* tabs. */
function syncAll_() {
  const started = new Date();
  const results = [];
  Object.keys(TTT_TABLES).forEach(function(table) {
    if (table === 'workspace_sync_log') return;
    try {
      results.push(syncTable_(table));
    } catch (err) {
      results.push({ table: table, ok: false, error: String(err) });
    }
  });
  logSync_('google_apps_script','supabase_to_sheets',null,null,
           results.every(r => r.ok) ? 'success' : 'partial',
           'Full Workspace mirror refresh', results.reduce((n,r)=>n+(r.row_count||0),0),
           { results: results, duration_ms: new Date() - started });
  return { ok: results.every(r => r.ok), results: results };
}

/** Pull one table. Handles the 500+ row dealer catalog repeatably. */
function syncTable_(table) {
  const def = tableDef_(table);
  const cfg = config_();
  let rows = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const page = supabaseFetch_(table, {
      select: '*',
      organization_id: 'eq.' + cfg.organizationId,
      limit: String(pageSize),
      offset: String(offset)
    });
    rows = rows.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  writeMirror_(def.sheet, rows);
  return { ok: true, table: table, sheet: def.sheet, row_count: rows.length };
}

/**
 * Controlled single-record writeback. The record is upserted to Supabase first;
 * the Sheet is then refreshed from the canonical returned record.
 */
function syncEntity_(table, record) {
  const def = tableDef_(table);
  if (def.appendOnly) throw new Error(table + ' is append-only.');
  if (def.supabasePrimary) throw new Error(table + ' is Supabase-primary and cannot be edited from Sheets.');
  const cfg = config_();
  const clean = Object.assign({}, record || {}, { organization_id: cfg.organizationId });
  const saved = supabaseUpsert_(table, clean, def.key);
  syncTable_(table);
  logSync_('google_apps_script','sheets_to_supabase',table,
           clean.id || clean.company_id || null,'success','Controlled record upsert',1,{});
  return { ok: true, record: saved[0] || clean };
}

/** Gmail send + CRM activity log. */
function sendEmail_(body) {
  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const htmlBody = String(body.htmlBody || body.body || '');
  if (!to || !subject) throw new Error('to and subject are required.');
  GmailApp.sendEmail(to, subject, stripHtml_(htmlBody), { htmlBody: htmlBody });

  const activity = {
    organization_id: config_().organizationId,
    activity_type: 'email',
    direction: 'outbound',
    status: 'completed',
    subject: subject,
    summary: String(body.summary || 'Email sent from TTT Workspace bridge'),
    company_id: body.company_id || null,
    contact_id: body.contact_id || null,
    lead_id: body.lead_id || null,
    opportunity_id: body.opportunity_id || null,
    customer_id: body.customer_id || null,
    job_id: body.job_id || null,
    owner_person_id: body.owner_person_id || null,
    occurred_at: new Date().toISOString(),
    metadata: { recipient: to, source: 'google_apps_script' }
  };
  const saved = supabaseInsert_('activities', activity);
  syncTable_('activities');
  return { ok: true, activity: saved[0] || null };
}

/** Create/update an appointment in Google Calendar and persist external IDs in Supabase. */
function calendarUpsert_(body) {
  const id = String(body.appointment_id || '');
  if (!id) throw new Error('appointment_id is required.');
  const cfg = config_();
  const rows = supabaseFetch_('appointments', {
    select: '*', organization_id: 'eq.' + cfg.organizationId, id: 'eq.' + id, limit: '1'
  });
  const appt = rows[0];
  if (!appt) throw new Error('Appointment not found: ' + id);

  const cal = appt.google_calendar_id
    ? CalendarApp.getCalendarById(appt.google_calendar_id)
    : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Google Calendar not available.');

  let event = null;
  if (appt.google_calendar_event_id) {
    try { event = cal.getEventById(appt.google_calendar_event_id); } catch (e) {}
  }
  const start = new Date(appt.starts_at);
  const end = new Date(appt.ends_at || new Date(start.getTime() + 60*60*1000));
  if (event) {
    event.setTitle(appt.title).setTime(start,end);
    if (appt.location) event.setLocation(appt.location);
    if (appt.notes) event.setDescription(appt.notes);
  } else {
    event = cal.createEvent(appt.title,start,end,{
      location: appt.location || '',
      description: appt.notes || ''
    });
  }
  const patch = {
    organization_id: cfg.organizationId,
    id: id,
    google_calendar_id: cal.getId(),
    google_calendar_event_id: event.getId(),
    updated_at: new Date().toISOString()
  };
  supabaseUpsert_('appointments', patch, ['organization_id','id']);
  syncTable_('appointments');
  return { ok:true, appointment_id:id, calendar_id:cal.getId(), event_id:event.getId() };
}

/** Ensure a Drive folder for a company/customer/job and persist its link. */
function driveFolderEnsure_(body) {
  const entityType = String(body.entity_type || '');
  const entityId = String(body.entity_id || '');
  const folderName = String(body.folder_name || entityType + ' - ' + entityId);
  if (!entityType || !entityId) throw new Error('entity_type and entity_id are required.');
  const root = DriveApp.getFolderById(config_().driveRootId);
  const found = root.getFoldersByName(folderName);
  const folder = found.hasNext() ? found.next() : root.createFolder(folderName);
  const url = folder.getUrl();

  if (entityType === 'company') {
    supabaseUpsert_('companies',{organization_id:config_().organizationId,id:entityId,drive_folder_id:folder.getId()},['organization_id','id']);
  } else if (entityType === 'customer') {
    supabaseUpsert_('customers',{organization_id:config_().organizationId,id:entityId,drive_folder_id:folder.getId()},['organization_id','id']);
  }
  supabaseInsert_('workspace_links',{
    organization_id:config_().organizationId,
    entity_type:entityType, entity_id:entityId, provider:'google_drive',
    external_id:folder.getId(), external_url:url, last_synced_at:new Date().toISOString(),
    metadata:{folder_name:folderName}
  });
  return { ok:true, folder_id:folder.getId(), url:url };
}

function writeMirror_(sheetName, rows) {
  const ss = SpreadsheetApp.openById(config_().spreadsheetId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet: ' + sheetName);
  const lastCol = sh.getLastColumn();
  if (!lastCol) throw new Error('Missing header row in ' + sheetName);
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].filter(String);
  const existingRows = Math.max(sh.getLastRow()-1,0);
  if (existingRows) sh.getRange(2,1,existingRows,headers.length).clearContent();
  if (!rows.length) return;
  const values = rows.map(function(r) {
    return headers.map(function(h) {
      const v = r[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });
  sh.getRange(2,1,values.length,headers.length).setValues(values);
}

function supabaseFetch_(table, params) {
  tableDef_(table);
  const cfg = config_();
  const query = Object.keys(params || {}).map(function(k){
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  const res = UrlFetchApp.fetch(cfg.supabaseUrl + '/rest/v1/' + table + '?' + query, {
    method:'get', headers:supabaseHeaders_(), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function supabaseInsert_(table, record) {
  tableDef_(table);
  const res = UrlFetchApp.fetch(config_().supabaseUrl + '/rest/v1/' + table, {
    method:'post', contentType:'application/json',
    headers:Object.assign(supabaseHeaders_(), {'Prefer':'return=representation'}),
    payload:JSON.stringify(record), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function supabaseUpsert_(table, record, keyColumns) {
  tableDef_(table);
  const onConflict = (keyColumns || []).join(',');
  const url = config_().supabaseUrl + '/rest/v1/' + table +
    (onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '');
  const res = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json',
    headers:Object.assign(supabaseHeaders_(), {'Prefer':'resolution=merge-duplicates,return=representation'}),
    payload:JSON.stringify(record), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function logSync_(source,direction,entityType,entityId,status,message,rowCount,metadata) {
  try {
    supabaseInsert_('workspace_sync_log',{
      organization_id:config_().organizationId,
      sync_source:source, sync_direction:direction,
      entity_type:entityType, entity_id:entityId, status:status,
      message:message, row_count:rowCount || 0, metadata:metadata || {},
      completed_at:new Date().toISOString()
    });
  } catch(e) {}
}
function supabaseHeaders_() {
  const key = config_().serviceKey;
  return { apikey:key, Authorization:'Bearer ' + key, Accept:'application/json' };
}
function parseResponse_(res) {
  const code = res.getResponseCode();
  const text = res.getContentText() || '[]';
  if (code < 200 || code >= 300) throw new Error('Supabase ' + code + ': ' + text);
  return text ? JSON.parse(text) : [];
}
function tableDef_(table) {
  const def = TTT_TABLES[String(table || '')];
  if (!def) throw new Error('Table is not permitted: ' + table);
  return def;
}
function assertToken_(token) {
  const expected = config_().syncToken;
  if (!expected || String(token || '') !== expected) throw new Error('Unauthorized');
}
function config_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    supabaseUrl:p.getProperty('SUPABASE_URL'),
    serviceKey:p.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    syncToken:p.getProperty('TTT_SYNC_TOKEN'),
    spreadsheetId:p.getProperty('TTT_SPREADSHEET_ID'),
    organizationId:p.getProperty('TTT_ORGANIZATION_ID'),
    driveRootId:p.getProperty('TTT_DRIVE_ROOT_ID')
  };
  Object.keys(cfg).forEach(k => { if (!cfg[k]) throw new Error('Missing Script Property: ' + k); });
  return cfg;
}
function stripHtml_(html) { return String(html || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run from Apps Script editor after setting Script Properties. */
function setupAndInitialSync() {
  const result = syncAll_();
  Logger.log(JSON.stringify(result));
  return result;
}
 + escapeHtml_(total) + '</strong>.' : '') +
    '</p><p>Please reply to this email with any questions or to schedule the work.</p><p>Thompson Transportation Technologies</p>';
  const sent = sendEmail_({
    to:to, subject:subject, htmlBody:html,
    customer_id:customer.id || null, job_id:job.id || null,
    summary:'Legacy TTT-OS quotation email'
  });
  return { ok:true, links:quote.google || {}, activity:sent.activity || null };
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function health_() {
  const cfg = config_();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const probe = supabaseFetch_('organizations', {
    select: 'id,name,slug',
    id: 'eq.' + cfg.organizationId,
    limit: '1'
  });
  return {
    ok: true,
    database: ss.getName(),
    organization: probe[0] || null,
    version: '1.0.0',
    canonical: 'Supabase'
  };
}

/** Pull all approved CRM/ERP tables from Supabase into DB_* tabs. */
function syncAll_() {
  const started = new Date();
  const results = [];
  Object.keys(TTT_TABLES).forEach(function(table) {
    if (table === 'workspace_sync_log') return;
    try {
      results.push(syncTable_(table));
    } catch (err) {
      results.push({ table: table, ok: false, error: String(err) });
    }
  });
  logSync_('google_apps_script','supabase_to_sheets',null,null,
           results.every(r => r.ok) ? 'success' : 'partial',
           'Full Workspace mirror refresh', results.reduce((n,r)=>n+(r.row_count||0),0),
           { results: results, duration_ms: new Date() - started });
  return { ok: results.every(r => r.ok), results: results };
}

/** Pull one table. Handles the 500+ row dealer catalog repeatably. */
function syncTable_(table) {
  const def = tableDef_(table);
  const cfg = config_();
  let rows = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const page = supabaseFetch_(table, {
      select: '*',
      organization_id: 'eq.' + cfg.organizationId,
      limit: String(pageSize),
      offset: String(offset)
    });
    rows = rows.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  writeMirror_(def.sheet, rows);
  return { ok: true, table: table, sheet: def.sheet, row_count: rows.length };
}

/**
 * Controlled single-record writeback. The record is upserted to Supabase first;
 * the Sheet is then refreshed from the canonical returned record.
 */
function syncEntity_(table, record) {
  const def = tableDef_(table);
  if (def.appendOnly) throw new Error(table + ' is append-only.');
  if (def.supabasePrimary) throw new Error(table + ' is Supabase-primary and cannot be edited from Sheets.');
  const cfg = config_();
  const clean = Object.assign({}, record || {}, { organization_id: cfg.organizationId });
  const saved = supabaseUpsert_(table, clean, def.key);
  syncTable_(table);
  logSync_('google_apps_script','sheets_to_supabase',table,
           clean.id || clean.company_id || null,'success','Controlled record upsert',1,{});
  return { ok: true, record: saved[0] || clean };
}

/** Gmail send + CRM activity log. */
function sendEmail_(body) {
  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const htmlBody = String(body.htmlBody || body.body || '');
  if (!to || !subject) throw new Error('to and subject are required.');
  GmailApp.sendEmail(to, subject, stripHtml_(htmlBody), { htmlBody: htmlBody });

  const activity = {
    organization_id: config_().organizationId,
    activity_type: 'email',
    direction: 'outbound',
    status: 'completed',
    subject: subject,
    summary: String(body.summary || 'Email sent from TTT Workspace bridge'),
    company_id: body.company_id || null,
    contact_id: body.contact_id || null,
    lead_id: body.lead_id || null,
    opportunity_id: body.opportunity_id || null,
    customer_id: body.customer_id || null,
    job_id: body.job_id || null,
    owner_person_id: body.owner_person_id || null,
    occurred_at: new Date().toISOString(),
    metadata: { recipient: to, source: 'google_apps_script' }
  };
  const saved = supabaseInsert_('activities', activity);
  syncTable_('activities');
  return { ok: true, activity: saved[0] || null };
}

/** Create/update an appointment in Google Calendar and persist external IDs in Supabase. */
function calendarUpsert_(body) {
  const id = String(body.appointment_id || '');
  if (!id) throw new Error('appointment_id is required.');
  const cfg = config_();
  const rows = supabaseFetch_('appointments', {
    select: '*', organization_id: 'eq.' + cfg.organizationId, id: 'eq.' + id, limit: '1'
  });
  const appt = rows[0];
  if (!appt) throw new Error('Appointment not found: ' + id);

  const cal = appt.google_calendar_id
    ? CalendarApp.getCalendarById(appt.google_calendar_id)
    : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Google Calendar not available.');

  let event = null;
  if (appt.google_calendar_event_id) {
    try { event = cal.getEventById(appt.google_calendar_event_id); } catch (e) {}
  }
  const start = new Date(appt.starts_at);
  const end = new Date(appt.ends_at || new Date(start.getTime() + 60*60*1000));
  if (event) {
    event.setTitle(appt.title).setTime(start,end);
    if (appt.location) event.setLocation(appt.location);
    if (appt.notes) event.setDescription(appt.notes);
  } else {
    event = cal.createEvent(appt.title,start,end,{
      location: appt.location || '',
      description: appt.notes || ''
    });
  }
  const patch = {
    organization_id: cfg.organizationId,
    id: id,
    google_calendar_id: cal.getId(),
    google_calendar_event_id: event.getId(),
    updated_at: new Date().toISOString()
  };
  supabaseUpsert_('appointments', patch, ['organization_id','id']);
  syncTable_('appointments');
  return { ok:true, appointment_id:id, calendar_id:cal.getId(), event_id:event.getId() };
}

/** Ensure a Drive folder for a company/customer/job and persist its link. */
function driveFolderEnsure_(body) {
  const entityType = String(body.entity_type || '');
  const entityId = String(body.entity_id || '');
  const folderName = String(body.folder_name || entityType + ' - ' + entityId);
  if (!entityType || !entityId) throw new Error('entity_type and entity_id are required.');
  const root = DriveApp.getFolderById(config_().driveRootId);
  const found = root.getFoldersByName(folderName);
  const folder = found.hasNext() ? found.next() : root.createFolder(folderName);
  const url = folder.getUrl();

  if (entityType === 'company') {
    supabaseUpsert_('companies',{organization_id:config_().organizationId,id:entityId,drive_folder_id:folder.getId()},['organization_id','id']);
  } else if (entityType === 'customer') {
    supabaseUpsert_('customers',{organization_id:config_().organizationId,id:entityId,drive_folder_id:folder.getId()},['organization_id','id']);
  }
  supabaseInsert_('workspace_links',{
    organization_id:config_().organizationId,
    entity_type:entityType, entity_id:entityId, provider:'google_drive',
    external_id:folder.getId(), external_url:url, last_synced_at:new Date().toISOString(),
    metadata:{folder_name:folderName}
  });
  return { ok:true, folder_id:folder.getId(), url:url };
}

function writeMirror_(sheetName, rows) {
  const ss = SpreadsheetApp.openById(config_().spreadsheetId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet: ' + sheetName);
  const lastCol = sh.getLastColumn();
  if (!lastCol) throw new Error('Missing header row in ' + sheetName);
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].filter(String);
  const existingRows = Math.max(sh.getLastRow()-1,0);
  if (existingRows) sh.getRange(2,1,existingRows,headers.length).clearContent();
  if (!rows.length) return;
  const values = rows.map(function(r) {
    return headers.map(function(h) {
      const v = r[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });
  sh.getRange(2,1,values.length,headers.length).setValues(values);
}

function supabaseFetch_(table, params) {
  tableDef_(table);
  const cfg = config_();
  const query = Object.keys(params || {}).map(function(k){
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  const res = UrlFetchApp.fetch(cfg.supabaseUrl + '/rest/v1/' + table + '?' + query, {
    method:'get', headers:supabaseHeaders_(), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function supabaseInsert_(table, record) {
  tableDef_(table);
  const res = UrlFetchApp.fetch(config_().supabaseUrl + '/rest/v1/' + table, {
    method:'post', contentType:'application/json',
    headers:Object.assign(supabaseHeaders_(), {'Prefer':'return=representation'}),
    payload:JSON.stringify(record), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function supabaseUpsert_(table, record, keyColumns) {
  tableDef_(table);
  const onConflict = (keyColumns || []).join(',');
  const url = config_().supabaseUrl + '/rest/v1/' + table +
    (onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '');
  const res = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json',
    headers:Object.assign(supabaseHeaders_(), {'Prefer':'resolution=merge-duplicates,return=representation'}),
    payload:JSON.stringify(record), muteHttpExceptions:true
  });
  return parseResponse_(res);
}
function logSync_(source,direction,entityType,entityId,status,message,rowCount,metadata) {
  try {
    supabaseInsert_('workspace_sync_log',{
      organization_id:config_().organizationId,
      sync_source:source, sync_direction:direction,
      entity_type:entityType, entity_id:entityId, status:status,
      message:message, row_count:rowCount || 0, metadata:metadata || {},
      completed_at:new Date().toISOString()
    });
  } catch(e) {}
}
function supabaseHeaders_() {
  const key = config_().serviceKey;
  return { apikey:key, Authorization:'Bearer ' + key, Accept:'application/json' };
}
function parseResponse_(res) {
  const code = res.getResponseCode();
  const text = res.getContentText() || '[]';
  if (code < 200 || code >= 300) throw new Error('Supabase ' + code + ': ' + text);
  return text ? JSON.parse(text) : [];
}
function tableDef_(table) {
  const def = TTT_TABLES[String(table || '')];
  if (!def) throw new Error('Table is not permitted: ' + table);
  return def;
}
function assertToken_(token) {
  const expected = config_().syncToken;
  if (!expected || String(token || '') !== expected) throw new Error('Unauthorized');
}
function config_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    supabaseUrl:p.getProperty('SUPABASE_URL'),
    serviceKey:p.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    syncToken:p.getProperty('TTT_SYNC_TOKEN'),
    spreadsheetId:p.getProperty('TTT_SPREADSHEET_ID'),
    organizationId:p.getProperty('TTT_ORGANIZATION_ID'),
    driveRootId:p.getProperty('TTT_DRIVE_ROOT_ID')
  };
  Object.keys(cfg).forEach(k => { if (!cfg[k]) throw new Error('Missing Script Property: ' + k); });
  return cfg;
}
function stripHtml_(html) { return String(html || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run from Apps Script editor after setting Script Properties. */
function setupAndInitialSync() {
  const result = syncAll_();
  Logger.log(JSON.stringify(result));
  return result;
}
