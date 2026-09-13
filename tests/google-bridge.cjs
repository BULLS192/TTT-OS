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
const ss={getSheetByName:name=>{assert.equal(name,'Accounts');return sheet;}};
const bridge=vm.createContext({SpreadsheetApp:{openById:()=>ss}});
for(const file of ['Helpers.gs','Main.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../integrations/google-workspace',file),'utf8'),bridge,{filename:file});
// Exercise syncJob_ and the real header-based Accounts upsert. Other services
// are isolated so tests neither contact Google nor modify Sheet validation.
const upsert=bridge.upsert_;
bridge.upsert_=(ss,name,...args)=>{if(name==='Accounts')upsert(ss,name,...args);};
bridge.ensureVehicleFolder_=bridge.ensureJobFolder_=()=>({getUrl:()=> 'https://drive.invalid/test'});
bridge.replaceWorkOrderLines_=bridge.appendSyncLog_=()=>{};
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
// Prove the validation harness rejects the original broken mapping.
assert.throws(()=>upsert(ss,'Accounts','Account_ID',row[0],{Account_Type:'Individual'}),/Account Type validation/);
console.log('PASS: Accounts header mapping; J-260911-002 consumer default; all explicit types; normalization; unchanged payload, unrelated cells, and validation.');
