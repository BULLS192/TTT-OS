function ensureQuoteDocuments_(ss, jobFolder, ids, c, v, j) {
  const q = j.quote;
  const existing = findDocument_(ss, q.id, 'Quotation');
  if (existing && existing.Drive_File_URL && existing.PDF_URL) {
    return {documentId:existing.Document_ID, docUrl:existing.Drive_File_URL, pdfUrl:existing.PDF_URL};
  }

  const source = DriveApp.getFileById(TTT_CONFIG.QUOTE_TEMPLATE_ID);
  const copy = source.makeCopy(q.id + ' — TTT Quotation v' + (q.version || 1), jobFolder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  const snap = q.snapshot || {};
  const est = snap.estimate || j.estimate || {};
  replaceToken_(body, 'Business_Address', '');
  replaceToken_(body, 'Business_Phone', '');
  replaceToken_(body, 'Business_Email', '');
  replaceToken_(body, 'Website', '');
  replaceToken_(body, 'Q-{{YYYY}}-{{####}}', q.id);
  replaceToken_(body, 'Quote_Date', dateText_(q.generatedAt || isoNow_()));
  replaceToken_(body, 'Quote_Status', q.status || 'Draft');
  replaceToken_(body, 'Related_Record_ID', ids.jobId);
  replaceToken_(body, 'Customer_Name', c.name || '');
  replaceToken_(body, 'Account_Name', c.name || '');
  replaceToken_(body, 'Phone', c.phone || '');
  replaceToken_(body, 'Email', c.email || '');
  replaceToken_(body, 'Year_Make_Model_Trim', [v.year,v.make,v.model,v.trim].filter(Boolean).join(' '));
  replaceToken_(body, 'VIN', v.vin || 'Not captured');
  replaceToken_(body, 'Mileage', j.checkIn && j.checkIn.odometer || '');
  replaceToken_(body, 'Prepared_By', 'Derek Thompson');

  const lines = (snap.equipment || j.equipment || []).slice(0,5);
  for (let i=1;i<=5;i++) {
    const line = lines[i-1] || {};
    replaceToken_(body, 'Item_'+i, line.category || '');
    replaceToken_(body, 'Description_'+i, [line.brand,line.model,line.note].filter(Boolean).join(' · '));
    replaceToken_(body, 'Qty_'+i, line.qty || '');
    replaceToken_(body, 'Unit_Price_'+i, line.category ? 'Included in estimate' : '');
    replaceToken_(body, 'Line_Total_'+i, '');
  }

  replaceToken_(body, 'Subtotal', moneyText_(snap.estimateTotal || j.estimateTotal));
  replaceToken_(body, 'Discount', moneyText_(0));
  replaceToken_(body, 'Tax', est.tax == null ? 'TBD if applicable' : moneyText_(est.tax));
  replaceToken_(body, 'Total', moneyText_(snap.estimateTotal || j.estimateTotal));
  replaceToken_(body, 'Deposit_Amount', moneyText_(est.deposit));
  replaceToken_(body, 'Estimated_Duration', snap.duration || j.duration || 'TBD');
  replaceToken_(body, 'Preferred_Date', snap.appointment ? dateText_(snap.appointment) : 'TBD');
  replaceToken_(body, 'Quote_Valid_Until', q.expiresAt ? dateText_(q.expiresAt) : '');
  replaceToken_(body, 'Payment_Terms', est.deposit ? 'Deposit required before scheduled work unless otherwise agreed.' : 'Due as stated on final invoice.');
  replaceToken_(body, 'Quotation_Terms_And_Conditions', 'Estimate based on the documented scope. Vehicle condition, compatibility and concealed conditions may require a revised scope or approved Change Order.');
  replaceToken_(body, 'Change_Order_Policy', 'No material scope or price change proceeds without customer approval.');
  replaceToken_(body, 'Scheduling_Cancellation_And_Warranty_Terms', 'Scheduling is confirmed after approval, required deposit and parts readiness. Warranty terms are documented at completion.');
  replaceToken_(body, 'Name', '');
  replaceToken_(body, 'Date', '');
  doc.saveAndClose();

  const pdfBlob = copy.getBlob().getAs(MimeType.PDF).setName(q.id + ' — TTT Quotation v' + (q.version || 1) + '.pdf');
  const pdfFile = jobFolder.createFile(pdfBlob);
  const documentId = 'DOC-' + cleanId_(q.id) + '-V' + (q.version || 1);
  upsert_(ss, 'Documents', 'Document_ID', documentId, {
    Document_ID: documentId, Related_Type: 'Quote', Related_ID: q.id, Document_Type: 'Quotation', Version: q.version || 1,
    Status: q.status || 'Draft', Drive_File_URL: copy.getUrl(), PDF_URL: pdfFile.getUrl(), Generated_Date: q.generatedAt || isoNow_(),
    Sent_Date: q.sentAt || '', Signed_Date: q.approval && q.approval.approvedAt || '', Created_By: j.createdBy || 'usr_derek'
  });
  return {documentId:documentId, docUrl:copy.getUrl(), pdfUrl:pdfFile.getUrl()};
}

function replaceQuoteLines_(ss, q, j) {
  deleteRowsByValue_(ss, 'Quote Lines', 'Quote_ID', q.id);
  const sheet = ss.getSheetByName('Quote Lines');
  const lines = (q.snapshot && q.snapshot.equipment || j.equipment || []);
  let n = 1;
  lines.forEach(function(line){
    appendObject_(sheet, {
      Quote_Line_ID:q.id+'-L'+String(n).padStart(3,'0'), Quote_ID:q.id, Line_Number:n++, Line_Type:'Service / Product',
      Description:[line.category,line.brand,line.model].filter(Boolean).join(' · '), Qty:number_(line.qty)||1,
      Unit_Price:'', Line_Total:'', Notes:line.note || ''
    });
  });
  const est = q.snapshot && q.snapshot.estimate || j.estimate || {};
  [['Parts total',est.parts],['Labor',est.labor],['Other / fees',est.fees]].forEach(function(pair){
    if (number_(pair[1]) === 0) return;
    appendObject_(sheet, {Quote_Line_ID:q.id+'-L'+String(n).padStart(3,'0'),Quote_ID:q.id,Line_Number:n++,Line_Type:'Summary',Description:pair[0],Qty:1,Unit_Price:number_(pair[1]),Line_Total:number_(pair[1])});
  });
}

function replaceWorkOrderLines_(ss, j) {
  deleteRowsByValue_(ss, 'Work Order Lines', 'Work_Order_ID', j.workOrderId);
  const sheet = ss.getSheetByName('Work Order Lines');
  let n = 1;
  (j.equipment || []).forEach(function(line){
    appendObject_(sheet, {WO_Line_ID:j.workOrderId+'-L'+String(n).padStart(3,'0'),Work_Order_ID:j.workOrderId,Line_Number:n++,Line_Type:'Service / Product',Description:[line.category,line.brand,line.model].filter(Boolean).join(' · '),Qty:number_(line.qty)||1,Status:'Authorized',Notes:line.note || ''});
  });
}

function upsertApproval_(ss, ids, approval, relatedType, relatedId, approvalType, snapshotUrl, markUrl) {
  upsert_(ss, 'Approvals', 'Approval_ID', approval.id, {
    Approval_ID: approval.id, Related_Type: relatedType, Related_ID: relatedId,
    Account_ID: ids.accountId, Contact_ID: ids.contactId, Vehicle_ID: ids.vehicleId,
    Approval_Type: approvalType, Approval_Status: approval.status || 'Approved', Delivery_Method: approval.method || '',
    Sent_Date: approval.sentAt || '', Approved_Date: approval.approvedAt || approval.at || '', Declined_Date: approval.declinedAt || '',
    Signer_Name: approval.signerName || approval.name || '', Signer_Email: approval.signerEmail || '',
    Signoff_Type: approval.method || 'TTT OS sign-off', Signoff_Image_URL: markUrl || '', Terms_Version: approval.termsVersion || '',
    Snapshot_Document_URL: snapshotUrl || '', Created_Date: approval.approvedAt || approval.at || isoNow_(), Notes: ''
  });
}

function saveApprovalMark_(jobFolder, quoteId, approval) {
  if (!approval.approvalMark || String(approval.approvalMark).indexOf('data:image/') !== 0) return '';
  const folder = getOrCreateFolder_(jobFolder, 'Approvals');
  const name = quoteId + ' — Customer Approval.png';
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next().getUrl();
  const parts = String(approval.approvalMark).split(',');
  const bytes = Utilities.base64Decode(parts[1] || '');
  return folder.createFile(Utilities.newBlob(bytes, 'image/png', name)).getUrl();
}

function ensureVehicleFolder_(vehicleId, v, c) {
  const root = DriveApp.getFolderById(TTT_CONFIG.VEHICLES_FOLDER_ID);
  const label = vehicleId + ' — ' + [v.year,v.make,v.model].filter(Boolean).join(' ') + (c.name ? ' — ' + c.name : '');
  return getOrCreateFolder_(root, safeName_(label));
}

function ensureJobFolder_(jobId, c, v) {
  const root = DriveApp.getFolderById(TTT_CONFIG.WORK_ORDERS_FOLDER_ID);
  const label = jobId + ' — ' + (c.name || 'Customer') + ' — ' + ([v.year,v.make,v.model].filter(Boolean).join(' ') || 'Vehicle');
  const folder = getOrCreateFolder_(root, safeName_(label));
  ['01 — Quote & Approval','02 — Check-In','03 — Work Order','04 — QC & Delivery'].forEach(function(name){getOrCreateFolder_(folder,name)});
  return folder;
}

function getOrCreateFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function findDocument_(ss, relatedId, type) {
  const sheet = ss.getSheetByName('Documents');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rel = headers.indexOf('Related_ID'), typ = headers.indexOf('Document_Type');
  for (let i=1;i<values.length;i++) {
    if (String(values[i][rel]) === String(relatedId) && String(values[i][typ]) === String(type)) return rowToObject_(headers, values[i]);
  }
  return null;
}
