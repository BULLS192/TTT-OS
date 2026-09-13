// Run: node tests/google-bridge.cjs (no dependencies or Google access required).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const allowed=['Retail','Dealer','Fleet','Business','Consulting'];
const headers=['Account_ID','Account_Type','Account_Name','Unmapped_Column'];
let row=['','','','Retain existing cell'];
let writes=0;
const sheet={
  getLastRow:()=>row[0]?2:1,
  getLastColumn:()=>headers.length,
  getRange:(r,c,n,width)=>({
    getValues:()=>[r===1?headers:row.slice(c-1,c-1+width)],
    setValues:values=>{
      assert.equal(r,2);
      if(!allowed.includes(values[0][1]))throw new Error('Account Type validation: '+allowed.join(', '));
      row=Array.from(values[0]);writes++;
    }
  })
};
const ss={getSheetByName:name=>{if(name==='Work Order Lines')return {name};assert.equal(name,'Accounts');return sheet;}};
const bridge=vm.createContext({SpreadsheetApp:{openById:()=>ss}});
for(const file of ['Helpers.gs','Main.gs','Documents.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../integrations/google-workspace',file),'utf8'),bridge,{filename:file});
// Exercise syncJob_ and the real header-based Accounts upsert. Other services
// are isolated so tests neither contact Google nor modify Sheet validation.
const upsert=bridge.upsert_;
let workOrder,workLines=[];
const workTypes=['Retail','Dealer','Fleet','Mobile','Warranty','Diagnostic','Consulting'];
const workStatuses=['Draft','Scheduled','Checked In','In Progress','Waiting Parts','QC Hold','Ready for Pickup','Completed','Cancelled'];
bridge.upsert_=(ss,name,...args)=>{
  if(name==='Accounts')upsert(ss,name,...args);
  if(name==='Work Orders'){
    workOrder=args[2];
    assert.ok(workTypes.includes(workOrder.Work_Order_Type),'Work Order Type must pass live Sheet validation');
    assert.ok(workStatuses.includes(workOrder.Status),'Work Order Status must pass live Sheet validation');
  }
};
bridge.ensureVehicleFolder_=bridge.ensureJobFolder_=()=>({getUrl:()=> 'https://drive.invalid/test'});
bridge.appendSyncLog_=()=>{};
bridge.deleteRowsByValue_=()=>{workLines=[];};
bridge.appendObject_=(sheet,obj)=>{assert.equal(sheet.name,'Work Order Lines');workLines.push(obj);};
const cases=[
  [{},{},'Retail'],
  [{accountType:'Individual'},{},'Retail'],
  [{accountType:'Unknown'},{},'Retail'],
  [{accountType:'  '},{},'Retail'],
  [{accountType:42},{},'Retail'],
  [{accountType:'Dealer'},{accountType:'Fleet'},'Dealer'],
  [{accountType:'Individual'},{accountType:'Consulting'},'Consulting']
];
for(const type of allowed){
  cases.push([{accountType:type},{},type]);
  cases.push([{accountType:' '+type.toLowerCase()+' '},{},type]);
  cases.push([{Account_Type:type},{},type]);
  cases.push([{}, {accountType:type},type]);
  cases.push([{}, {Account_Type:type},type]);
}
for(const [customer,job,expected] of cases){
  const payload={customer:{id:'cus_2',name:'Avery Martin',...customer},vehicle:{id:'veh_2'},job:{id:'J-260911-002',customerId:'cus_2',vehicleId:'veh_2',workOrderId:'WO-260911-001',status:'In Progress',...job}};
  const before=JSON.stringify(payload);
  const result=bridge.syncJob_(payload);
  assert.equal(result.ok,true);
  assert.equal(row[1],expected);
  assert.equal(row[3],'Retain existing cell');
  assert.equal(JSON.stringify(payload),before);
}
assert.equal(writes,cases.length);
for(const type of workTypes)assert.equal(bridge.workOrderType_({}, {workOrderType:' '+type.toLowerCase()+' '}),type);
assert.equal(bridge.workOrderType_({accountType:'Business'},{}),'Retail');
assert.equal(bridge.workOrderType_({accountType:'Fleet'},{}),'Fleet');
assert.equal(bridge.workOrderType_({}, {workOrderType:'Installation / Service'}),'Retail');
for(const status of ['Lead','Estimate','Awaiting Approval','Awaiting Deposit','Scheduled','Awaiting Parts','Ready for Check-In','Checked In','Awaiting Final Authorization','In Progress','Waiting on Customer','Waiting on Parts','QC','Ready for Pickup','Delivered','Closed','Declined']){
  assert.ok(workStatuses.includes(bridge.workOrderStatus_(status)),status);
}
assert.equal(bridge.workOrderStatus_('QC'),'QC Hold');
assert.equal(bridge.appointmentStatus_('Closed'),'Completed');
assert.equal(bridge.appointmentStatus_('Declined'),'Cancelled');
const executionPayload={customer:{id:'cus_2',name:'Avery Martin'},vehicle:{id:'veh_2'},job:{id:'J-260911-002',workOrderId:'WO-260911-001',status:'In Progress',equipment:[],workExecution:{notes:'Saved work notes',startedAt:'2026-09-13',lines:[{category:'Radar detectors',status:'In Progress',brand:'Brand',model:'Model',installedLocation:'front dash',laborHours:'0.5',serialNumber:'SN-1',technicianNotes:'Tested',completionNotes:'Retained',changeOrderId:'CO-1'}]}}};
bridge.syncJob_(executionPayload);
assert.equal(workOrder.Work_Order_Type,'Retail');
assert.equal(workOrder.Internal_Notes,'Saved work notes');
assert.equal(workOrder.Started_Date,'2026-09-13');
assert.equal(workLines.length,1);
assert.equal(workLines[0].Installed_Location,'front dash');
assert.equal(workLines[0].Labor_Hours_Actual,0.5);
assert.equal(workLines[0].Notes,'Serial number: SN-1');
assert.equal(workLines[0].Technician_Notes,'Tested');
assert.equal(workLines[0].Completion_Notes,'Retained');
assert.equal(workLines[0].Change_Order_ID,'CO-1');
assert.equal(workLines[0].Status,'In Progress');
bridge.replaceWorkOrderLines_(ss,{workOrderId:'WO-LEGACY',equipment:[{category:'Audio',note:'Legacy scope'}]});
assert.equal(workLines[0].Notes,'Legacy scope');
assert.equal(workLines[0].Status,'Authorized');
// Prove the validation harness rejects the original broken mapping.
assert.throws(()=>upsert(ss,'Accounts','Account_ID',row[0],{Account_Type:'Individual'}),/Account Type validation/);
const events=[];
bridge.verifyToken_=()=>{};
bridge.json_=value=>value;
bridge.LockService={getScriptLock:()=>({waitLock:ms=>{assert.equal(ms,30000);events.push('lock');},releaseLock:()=>events.push('release')})};
bridge.syncJob_=()=>{events.push('write');return {ok:true};};
assert.equal(bridge.doPost({postData:{contents:JSON.stringify({action:'syncJob'})}}).ok,true);
assert.deepEqual(events,['lock','write','release']);
events.length=0;
bridge.syncJob_=()=>{events.push('write');throw new Error('Validation rejected');};
assert.equal(bridge.doPost({postData:{contents:JSON.stringify({action:'syncJob'})}}).ok,false);
assert.deepEqual(events,['lock','write','release']);
console.log('PASS: validated account/work order types and statuses; execution detail export; legacy fallback; serialized writes and lock release on failure.');
