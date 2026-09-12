const TTT_CONFIG = {
  MASTER_SHEET_ID: '1WJp-FC97yB35p8SGAtkOEBKtjS6-rrB5yn6igo7Ej_E',
  OPS_ROOT_FOLDER_ID: '14tX3xOze04Z-Gwt82UWSqK9__HxTbZq1',
  VEHICLES_FOLDER_ID: '1FP9DAQ1QKMU7oshjhJzWO3n1BNplvhJ2',
  WORK_ORDERS_FOLDER_ID: '1uv_ror1AdNzd-aeUQxePeqPblbNGbD31',
  QUOTE_TEMPLATE_ID: '14_fS3C6JBDQ4rwyxTBzjGcmQWEJenpthEUmqYndOijk',
  TIMEZONE: 'America/Chicago'
};

function doGet() {
  return json_({ok:true, service:'TTT Google Workspace Sync', database:'TTT OS — Master Database v1'});
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    verifyToken_(p.token);
    if (p.action === 'health') return json_({ok:true, database:'TTT OS — Master Database v1'});
    if (p.action === 'syncJob') return json_(syncJob_(p));
    if (p.action === 'sendQuote') return json_(sendQuote_(p));
    throw new Error('Unknown action: ' + p.action);
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)});
  }
}

function setupTTTSync() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TTT_SYNC_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TTT_SYNC_TOKEN', token);
  }
  console.log('TTT_SYNC_TOKEN=' + token);
  return token;
}

function verifyToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('TTT_SYNC_TOKEN');
  if (!expected) throw new Error('TTT sync token is not initialized. Run setupTTTSync() once in Apps Script.');
  if (!token || token !== expected) throw new Error('Invalid TTT sync token.');
}

function syncJob_(p) {
  const ss = SpreadsheetApp.openById(TTT_CONFIG.MASTER_SHEET_ID);
  const c = p.customer || {};
  const v = p.vehicle || {};
  const j = p.job || {};
  if (!j.id) throw new Error('Job ID is required.');

  const ids = {
    accountId: stableId_('ACC', c.id || c.email || c.name || j.customerId),
    contactId: stableId_('CON', c.id || c.email || c.name || j.customerId),
    vehicleId: stableId_('VEH', v.id || v.vin || j.vehicleId),
    jobId: normalizeJobId_(j.id)
  };

  const vehicleFolder = ensureVehicleFolder_(ids.vehicleId, v, c);
  const jobFolder = ensureJobFolder_(ids.jobId, c, v);
  const now = isoNow_();

  upsert_(ss, 'Accounts', 'Account_ID', ids.accountId, {
    Account_ID: ids.accountId,
    Account_Type: 'Individual',
    Account_Name: c.name || [c.firstName,c.middleName,c.lastName].filter(Boolean).join(' '),
    Status: 'Active',
    Primary_Contact_ID: ids.contactId,
    Phone: c.phone || '',
    Email: c.email || '',
    Billing_Address: [c.address1,c.address2].filter(Boolean).join(', '),
    City: c.city || '', State: c.state || '', ZIP: c.postalCode || '',
    Source: 'TTT OS', Notes: c.notes || '',
    Created_Date: c.createdAt || j.createdAt || now, Updated_Date: now
  });

  upsert_(ss, 'Contacts', 'Contact_ID', ids.contactId, {
    Contact_ID: ids.contactId, Account_ID: ids.accountId,
    First_Name: c.firstName || firstName_(c.name), Middle_Name: c.middleName || '', Last_Name: c.lastName || lastName_(c.name),
    Phone: c.phone || '', Email: c.email || '', Notes: c.notes || '',
    Created_Date: c.createdAt || j.createdAt || now, Updated_Date: now
  });

  upsert_(ss, 'Vehicles', 'Vehicle_ID', ids.vehicleId, {
    Vehicle_ID: ids.vehicleId, Account_ID: ids.accountId, Primary_Contact_ID: ids.contactId,
    VIN: v.vin || '', Year: v.year || '', Make: v.make || '', Model: v.model || '', Trim: v.trim || '',
    Body_Style: v.type || '', Color: v.color || '', License_Plate: plateOnly_(v.plate), State: plateState_(v.plate),
    Mileage: j.checkIn && j.checkIn.odometer || v.odometer || '', Status: vehicleStatus_(j.status),
    Drive_Folder_URL: vehicleFolder.getUrl(), Notes: [v.wrap ? 'Exterior finish: '+v.wrap : '', v.notes || ''].filter(Boolean).join(' | '),
    Created_Date: j.createdAt || now, Updated_Date: now
  });

  upsert_(ss, 'Jobs', 'Job_ID', ids.jobId, {
    Job_ID: ids.jobId, Account_ID: ids.accountId, Contact_ID: ids.contactId, Vehicle_ID: ids.vehicleId,
    Job_Status: j.status || '', Source: p.source || 'TTT OS', Customer_Request: j.requestNotes || '',
    Preferred_Appointment: j.appointment || '', Parts_Status: j.partsStatus || '', Expected_Duration: j.duration || '',
    Current_Quote_ID: j.quote && j.quote.id || j.quoteId || '', Work_Order_ID: j.workOrderId || '',
    Priority: j.priority || 'Normal', Assigned_To: j.assignedTo || j.createdBy || 'usr_derek', Drive_Folder_URL: jobFolder.getUrl(),
    Created_Date: j.createdAt || now, Updated_Date: j.updatedAt || now,
    Closed_Date: ['Closed','Declined'].indexOf(j.status) >= 0 ? (j.updatedAt || now) : '', Notes: j.equipmentNotes || ''
  });

  let links = {jobFolderUrl:jobFolder.getUrl(), vehicleFolderUrl:vehicleFolder.getUrl()};

  if (j.quote && j.quote.id) {
    ids.quoteId = j.quote.id;
    const q = j.quote;
    const snap = q.snapshot || {};
    upsert_(ss, 'Quotes', 'Quote_ID', q.id, {
      Quote_ID: q.id, Quote_Date: q.generatedAt || now, Expiration_Date: q.expiresAt || '',
      Account_ID: ids.accountId, Contact_ID: ids.contactId, Vehicle_ID: ids.vehicleId,
      Status: q.status || 'Draft', Subtotal: number_(snap.estimateTotal || j.estimateTotal), Discount: 0,
      Tax: snap.estimate && snap.estimate.tax || '', Total: number_(snap.estimateTotal || j.estimateTotal),
      Deposit_Required: number_(snap.estimate && snap.estimate.deposit || j.estimate && j.estimate.deposit),
      Deposit_Received: number_(j.depositReceived), Customer_Approval_Date: q.approval && q.approval.approvedAt || '',
      Converted_Work_Order_ID: j.workOrderId || '', Notes: j.requestNotes || '', Created_By: j.createdBy || 'usr_derek',
      Job_ID: ids.jobId, Quote_Version: q.version || 1, Approval_ID: q.approval && q.approval.id || '',
      Sent_Date: q.sentAt || '', Approval_Method: q.approval && q.approval.method || '', Updated_Date: now
    });
    replaceQuoteLines_(ss, q, j);
    const docs = ensureQuoteDocuments_(ss, jobFolder, ids, c, v, j);
    links.quoteDocUrl = docs.docUrl;
    links.quotePdfUrl = docs.pdfUrl;
    upsert_(ss, 'Quotes', 'Quote_ID', q.id, {Quote_ID:q.id, Document_ID:docs.documentId, Updated_Date:now});

    if (q.approval && q.approval.id) {
      ids.quoteApprovalId = q.approval.id;
      const markUrl = saveApprovalMark_(jobFolder, q.id, q.approval);
      upsertApproval_(ss, ids, q.approval, 'Quote', q.id, 'Quote Approval', docs.pdfUrl, markUrl);
    }
  }

  if (j.checkIn) {
    ids.inspectionId = 'INS-' + cleanId_(ids.jobId);
    const ci = j.checkIn;
    upsert_(ss, 'Inspections', 'Inspection_ID', ids.inspectionId, {
      Inspection_ID: ids.inspectionId, Work_Order_ID: j.workOrderId || '', Vehicle_ID: ids.vehicleId,
      Inspection_Type: 'Vehicle Check-In', Inspection_Date: ci.capturedAt || now,
      Mileage: ci.odometer || '', Fuel_Level: ci.fuel || '',
      Exterior_Condition: ci.groupNotes && ci.groupNotes.exterior || '', Interior_Condition: ci.groupNotes && ci.groupNotes.interior || '',
      Existing_Damage: [ci.groupNotes && ci.groupNotes.damage, ci.conditionNotes].filter(Boolean).join(' | '),
      Customer_Acknowledged: j.finalAuthorization ? 'Yes' : 'Pending', Inspector: ci.capturedBy || 'usr_derek',
      Notes: [ci.warningLights ? 'Warning lights: '+ci.warningLights : '', ci.belongings ? 'Belongings: '+ci.belongings : '', ci.groupNotes && ci.groupNotes.technical ? 'Technical: '+ci.groupNotes.technical : ''].filter(Boolean).join(' | '),
      Job_ID: ids.jobId,
      Exterior_Photo_Count: countMediaGroup_(ci.photos,'exterior'), Interior_Photo_Count: countMediaGroup_(ci.photos,'interior'),
      Technical_Photo_Count: countMediaGroup_(ci.photos,'technical'), Damage_Photo_Count: countMediaGroup_(ci.photos,'damage'), Video_Count: (ci.videos || []).length
    });
  }

  if (j.finalAuthorization && j.finalAuthorization.id) {
    ids.finalApprovalId = j.finalAuthorization.id;
    upsertApproval_(ss, ids, {id:j.finalAuthorization.id,status:'Approved',signerName:j.finalAuthorization.name,approvedAt:j.finalAuthorization.at,method:'In-person / recorded in TTT OS',termsVersion:j.finalAuthorization.termsVersion}, 'Job', ids.jobId, 'Final Work Authorization', '', '');
  }

  if (j.workOrderId) {
    ids.workOrderId = j.workOrderId;
    upsert_(ss, 'Work Orders', 'Work_Order_ID', j.workOrderId, {
      Work_Order_ID: j.workOrderId, Quote_ID: j.quote && j.quote.id || j.quoteId || '', Account_ID: ids.accountId,
      Contact_ID: ids.contactId, Vehicle_ID: ids.vehicleId, Work_Order_Type: 'Installation / Service', Status: j.status || '',
      Priority: j.priority || 'Normal', Scheduled_Start: j.appointment || '', Actual_Start: workStart_(j),
      Primary_Technician_ID: j.assignedTo || j.createdBy || 'usr_derek', Customer_Request: j.requestNotes || '',
      Internal_Notes: j.equipmentNotes || '', Drive_Folder_URL: jobFolder.getUrl(),
      Labor_Revenue: number_(j.estimate && j.estimate.labor), Parts_Revenue: number_(j.estimate && j.estimate.parts),
      QC_Status: j.status === 'QC' ? 'In QC' : (['Ready for Pickup','Delivered','Closed'].indexOf(j.status)>=0 ? 'Passed / Completed' : ''),
      Customer_Signoff: j.finalAuthorization ? 'Yes' : 'No', Created_Date: workStart_(j) || now,
      Closed_Date: ['Delivered','Closed'].indexOf(j.status)>=0 ? (j.updatedAt || now) : '',
      Job_ID: ids.jobId, Final_Authorization_ID: j.finalAuthorization && j.finalAuthorization.id || ''
    });
    replaceWorkOrderLines_(ss, j);
  }

  if (j.appointment) {
    ids.appointmentId = 'APT-' + cleanId_(ids.jobId);
    upsert_(ss, 'Appointments', 'Appointment_ID', ids.appointmentId, {
      Appointment_ID: ids.appointmentId, Work_Order_ID: j.workOrderId || '', Appointment_Type: 'Installation / Service',
      Start_DateTime: j.appointment, Status: appointmentStatus_(j.status), Customer_Confirmed: j.quote && j.quote.approval ? 'Yes' : 'Pending',
      Notes: j.duration ? 'Expected duration: '+j.duration : '', Job_ID: ids.jobId
    });
  }

  if (number_(j.depositReceived) > 0) {
    ids.depositPaymentId = 'PAY-' + cleanId_(ids.jobId) + '-DEP';
    upsert_(ss, 'Payments', 'Payment_ID', ids.depositPaymentId, {
      Payment_ID: ids.depositPaymentId, Payment_Date: j.updatedAt || now, Account_ID: ids.accountId,
      Quote_ID: j.quote && j.quote.id || j.quoteId || '', Work_Order_ID: j.workOrderId || '', Payment_Type: 'Deposit',
      Method: j.depositMethod || 'Not recorded', Amount: number_(j.depositReceived), Net_Amount: number_(j.depositReceived), Status: 'Received',
      Notes: 'Recorded in TTT OS', Job_ID: ids.jobId
    });
  }

  appendSyncLog_(ss, 'TTT OS → Google', 'Job', ids.jobId, 'upsert', 'Success', '');
  return {ok:true, ids:ids, links:links};
}

function sendQuote_(p) {
  const sync = syncJob_(p);
  const c = p.customer || {};
  const v = p.vehicle || {};
  const j = p.job || {};
  const q = j.quote || {};
  if (!q.id) throw new Error('Quotation has not been generated.');
  if (!c.email) throw new Error('Customer email is missing.');
  if (!sync.links.quotePdfUrl) throw new Error('Quotation PDF could not be generated.');

  const pdfId = fileIdFromUrl_(sync.links.quotePdfUrl);
  const pdf = DriveApp.getFileById(pdfId).getBlob();
  const vehicleName = [v.year,v.make,v.model].filter(Boolean).join(' ');
  const subject = 'TTT Quotation ' + q.id + (vehicleName ? ' — ' + vehicleName : '');
  const body = 'Hi ' + (c.firstName || firstName_(c.name) || 'there') + ',\n\n' +
    'Thank you for the opportunity to work on your ' + (vehicleName || 'vehicle') + '.\n\n' +
    'Your TTT quotation ' + q.id + ' is attached for review.\n' +
    'Estimated total: ' + moneyText_(q.snapshot && q.snapshot.estimateTotal || j.estimateTotal) + '\n' +
    'Deposit requested: ' + moneyText_(q.snapshot && q.snapshot.estimate && q.snapshot.estimate.deposit || j.estimate && j.estimate.deposit) + '\n\n' +
    'Please contact TTT with any questions. Approval will be recorded before scheduling and work begins.\n\n' +
    'Thompson Transportation Technologies';
  GmailApp.sendEmail(c.email, subject, body, {attachments:[pdf], name:'Thompson Transportation Technologies'});

  const ss = SpreadsheetApp.openById(TTT_CONFIG.MASTER_SHEET_ID);
  const now = isoNow_();
  upsert_(ss, 'Quotes', 'Quote_ID', q.id, {Quote_ID:q.id, Status:'Sent', Sent_Date:now, Updated_Date:now});
  const commId = 'COM-' + cleanId_(q.id) + '-' + Utilities.formatDate(new Date(), TTT_CONFIG.TIMEZONE, 'yyyyMMddHHmmss');
  upsert_(ss, 'Communications', 'Communication_ID', commId, {
    Communication_ID: commId, Account_ID: sync.ids.accountId, Contact_ID: sync.ids.contactId, Job_ID: sync.ids.jobId,
    Quote_ID: q.id, Work_Order_ID: j.workOrderId || '', Channel: 'Email', Direction: 'Outbound', Type: 'Quotation',
    Subject: subject, Recipient: c.email, Sent_Date: now, Status: 'Sent', Document_ID: '', Notes: 'Sent by TTT OS Google Workspace sync'
  });
  appendSyncLog_(ss, 'Google → Customer', 'Quote', q.id, 'email', 'Success', '');
  return {ok:true, sentTo:c.email, links:sync.links, ids:sync.ids};
}
