const DB_KEY="ttt-os-v0.1";
const SERVICES=["Car stereo installation","Car alarms","Radar detectors","Dash cams","Paint protection","Marine audio","Window tint","GPS trackers","Interior lighting","Exterior lighting","Truck accessories","Other"];
const STATUS=["Draft","Authorized","Checked In","In Progress","Waiting on Customer","Ready for Pickup","Completed"];
const EQUIPMENT_CATALOG={
 "Alpine":["Custom / Other","iLX-F511 Halo11","iLX-507","R2-A60F"],
 "JL Audio":["Custom / Other","VX1000/5i","XD600/1v2","C3-650"],
 "Kicker":["Custom / Other","KEY 200.4","CXA800.1","KS Series"],
 "Kenwood":["Custom / Other","DMX958XR","DMX1057XR","Excelon amplifier"],
 "Pioneer":["Custom / Other","DMH-WT7600NEX","DMH-WT8600NEX","GM-D Series"],
 "Sony":["Custom / Other","XAV-9500ES","XM-GS4","Mobile ES speakers"],
 "Rockford Fosgate":["Custom / Other","T1000-1bdCP","P3D4-12","Power speakers"],
 "Viper":["Custom / Other","DS4+","5706V","SmartStart"],
 "Compustar":["Custom / Other","CM-X","T13","DroneMobile"],
 "Escort":["Custom / Other","MAX 360c MKII","MAXcam 360c","Redline Ci 360c"],
 "Uniden":["Custom / Other","R8","R7","R4"],
 "Thinkware":["Custom / Other","U3000","Q1000","F200 Pro"],
 "BlackVue":["Custom / Other","DR970X","DR770X","Cloud LTE module"],
 "XPEL":["Custom / Other","ULTIMATE PLUS","STEALTH","PRIME XR PLUS"],
 "3M":["Custom / Other","Crystalline","Ceramic IR","Scotchgard PPF"],
 "LLumar":["Custom / Other","IRX","CTX","Platinum PPF"],
 "Garmin":["Custom / Other","dēzl OTR","Dash Cam X310","inReach Mini 2"],
 "Other / Customer supplied":["Custom / Other"]
};

const seed={
 users:[{id:"usr_derek",name:"Derek Thompson",role:"owner_admin_technician",active:true}],
 customers:[
  {id:"cus_001",firstName:"Jordan",middleName:"",lastName:"Lee",name:"Jordan Lee",phone:"713-555-0184",email:"jordan@example.com",address1:"",address2:"",city:"Houston",state:"TX",postalCode:"",country:"US",createdAt:"2026-09-10T14:30:00-05:00"},
  {id:"cus_002",firstName:"Avery",middleName:"",lastName:"Martin",name:"Avery Martin",phone:"832-555-0117",email:"avery@example.com",address1:"",address2:"",city:"Houston",state:"TX",postalCode:"",country:"US",createdAt:"2026-09-11T09:15:00-05:00"}
 ],
 vehicles:[
  {id:"veh_001",customerId:"cus_001",year:"2024",make:"Ford",model:"F-150",trim:"Lariat",color:"Black",wrap:"None",type:"Truck",fuelLevel:"3/4",vin:"1FTFW1E50RFA00001"},
  {id:"veh_002",customerId:"cus_002",year:"2023",make:"BMW",model:"M4",trim:"Competition",color:"Blue",wrap:"None",type:"Coupe",fuelLevel:"1/2",vin:"WBS43AZ09PCL00002"}
 ],
 workOrders:[
  {id:"WO-260912-001",customerId:"cus_001",vehicleId:"veh_001",services:["Car stereo installation","Interior lighting"],status:"In Progress",assignedTo:"usr_derek",estimateTotal:2450,createdBy:"usr_derek",createdAt:"2026-09-12T09:20:00-05:00",termsVersion:"0.1"},
  {id:"WO-260911-002",customerId:"cus_002",vehicleId:"veh_002",services:["Radar detectors","Dash cams"],status:"Ready for Pickup",assignedTo:"usr_derek",estimateTotal:1325,createdBy:"usr_derek",createdAt:"2026-09-11T11:40:00-05:00",termsVersion:"0.1"}
 ],
 media:[],audit:[]
};

let db=load();
let filter="All";

function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){try{return JSON.parse(localStorage.getItem(DB_KEY))||clone(seed)}catch{return clone(seed)}}
function save(){localStorage.setItem(DB_KEY,JSON.stringify(db))}
function uid(prefix){return prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function money(n){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0))}
function customer(id){return db.customers.find(x=>x.id===id)}
function vehicle(id){return db.vehicles.find(x=>x.id===id)}
function user(id){return db.users.find(x=>x.id===id)}

document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.go)));
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
function show(id){
 document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
 document.querySelectorAll(".nav-item").forEach(v=>v.classList.toggle("active",v.dataset.view===id));
 const btn=document.querySelector('.nav-item[data-view="'+id+'"]');
 document.getElementById("pageTitle").textContent=btn?btn.textContent:(id==="intake"?"New Intake":"TTT OS");
 window.scrollTo({top:0,behavior:"smooth"});
 render();
}

function render(){
 renderStats();renderActive();renderCustomers();renderVehicles();renderWorkOrders();
}
function renderStats(){
 const active=db.workOrders.filter(w=>!["Completed","Draft"].includes(w.status));
 const ready=db.workOrders.filter(w=>w.status==="Ready for Pickup");
 document.getElementById("stats").innerHTML=[
  ["Active work orders",active.length],["Ready for pickup",ready.length],["Customers",db.customers.length],["Vehicles",db.vehicles.length]
 ].map(([l,n])=>'<div class="stat"><span>'+l+'</span><strong>'+n+'</strong></div>').join("");
}
function renderActive(){
 const rows=db.workOrders.filter(w=>!["Completed","Draft"].includes(w.status)).slice(0,5);
 document.getElementById("activeWork").innerHTML=rows.length?rows.map(w=>{
  const c=customer(w.customerId),v=vehicle(w.vehicleId);
  return '<div class="work-row"><div><strong>'+esc(w.id)+'</strong><small>'+esc(c?.name)+' · '+esc(v?.year+" "+v?.make+" "+v?.model)+'</small></div><span class="badge">'+esc(w.status)+'</span></div>'
 }).join(""):'<p class="muted">No active work.</p>';
}
function renderCustomers(){
 document.getElementById("customersBody").innerHTML=db.customers.map(c=>{
  const vs=db.vehicles.filter(v=>v.customerId===c.id);
  const last=db.workOrders.filter(w=>w.customerId===c.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  return '<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.phone)+'</td><td>'+esc(c.email)+'</td><td>'+vs.length+'</td><td>'+(last?new Date(last.createdAt).toLocaleDateString():"—")+'</td></tr>'
 }).join("");
}
function renderVehicles(){
 document.getElementById("vehiclesBody").innerHTML=db.vehicles.map(v=>{
  const c=customer(v.customerId),n=db.workOrders.filter(w=>w.vehicleId===v.id).length;
  return '<tr><td><strong>'+esc(v.year+" "+v.make+" "+v.model)+'</strong><br><small>'+esc(v.color)+'</small></td><td>'+esc(v.type)+'</td><td>'+esc(v.vin)+'</td><td>'+esc(c?.name)+'</td><td>'+n+'</td></tr>'
 }).join("");
}
function renderWorkOrders(){
 const filters=["All",...STATUS];
 document.getElementById("statusFilters").innerHTML=filters.map(s=>'<button class="filter '+(filter===s?"active":"")+'" data-filter="'+s+'">'+s+'</button>').join("");
 document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderWorkOrders()});
 const rows=db.workOrders.filter(w=>filter==="All"||w.status===filter).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 document.getElementById("workordersBody").innerHTML=rows.map(w=>{
  const c=customer(w.customerId),v=vehicle(w.vehicleId),u=user(w.assignedTo);
  return '<tr><td><strong>'+esc(w.id)+'</strong></td><td>'+esc(c?.name)+'</td><td>'+esc(v?.year+" "+v?.make+" "+v?.model)+'</td><td>'+esc(w.services.join(", "))+'</td><td><span class="badge">'+esc(w.status)+'</span></td><td>'+esc(u?.name||"Unassigned")+'</td><td>'+money(w.estimateTotal)+'</td></tr>'
 }).join("");
}

document.getElementById("serviceGrid").innerHTML=SERVICES.map(s=>'<label class="service-option"><input type="checkbox" name="services" value="'+s+'"> '+s+'</label>').join("");

const equipmentRows=document.getElementById("equipmentRows");
function addEquipmentRow(values={}){
 const row=document.createElement("div");
 row.className="equipment-row";
 const brandOptions=['<option value="">Select brand</option>',...Object.keys(EQUIPMENT_CATALOG).map(b=>'<option '+(values.brand===b?'selected':'')+'>'+b+'</option>')].join("");
 row.innerHTML='<label>Service / category<select data-eq="category"><option value="">Select service</option>'+SERVICES.map(s=>'<option '+(values.category===s?'selected':'')+'>'+s+'</option>').join("")+'</select></label>'+
 '<label>Brand<select data-eq="brand">'+brandOptions+'</select></label>'+
 '<label>Model<select data-eq="model"><option value="">Select model</option></select></label>'+
 '<label>Qty<input type="number" min="1" step="1" value="'+(values.qty||1)+'" data-eq="qty"></label>'+
 '<label class="equipment-note">Line notes<input placeholder="Color, size, serial/SKU, mounting location..." value="'+esc(values.note||"")+'" data-eq="note"></label>'+
 '<button type="button" class="remove-equipment" aria-label="Remove equipment">×</button>';
 equipmentRows.appendChild(row);
 const brand=row.querySelector('[data-eq="brand"]'),model=row.querySelector('[data-eq="model"]');
 const refresh=()=>{const models=EQUIPMENT_CATALOG[brand.value]||["Custom / Other"];model.innerHTML='<option value="">Select model</option>'+models.map(m=>'<option '+(values.model===m?'selected':'')+'>'+m+'</option>').join("")};
 brand.addEventListener("change",()=>{values.model="";refresh()});refresh();
 row.querySelector(".remove-equipment").onclick=()=>row.remove();
}
document.getElementById("addEquipmentBtn").onclick=()=>addEquipmentRow();
addEquipmentRow();

document.querySelectorAll('input[type="file"][data-photo]').forEach(input=>{
 input.addEventListener("change",()=>{
  const box=document.querySelector('[data-preview="'+input.dataset.photo+'"]');box.innerHTML="";
  [...input.files].forEach(file=>{const img=document.createElement("img");img.src=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(img.src);box.appendChild(img)})
 })
});
document.querySelectorAll('input[type="file"][data-video]').forEach(input=>{
 input.addEventListener("change",()=>{
  const box=document.querySelector('[data-video-preview="'+input.dataset.video+'"]');box.innerHTML="";
  const file=input.files[0]; if(!file)return;
  const video=document.createElement("video");video.controls=true;video.muted=true;video.playsInline=true;video.src=URL.createObjectURL(file);
  box.appendChild(video);
 })
});

["parts","labor","fees"].forEach(n=>document.querySelector('[name="'+n+'"]').addEventListener("input",updateTotal));
function updateTotal(){
 const f=document.getElementById("intakeForm");
 const total=["parts","labor","fees"].reduce((s,n)=>s+Number(f.elements[n].value||0),0);
 document.getElementById("estimateTotal").textContent=money(total);
}

document.getElementById("intakeForm").addEventListener("submit",e=>{
 e.preventDefault();
 const f=e.currentTarget,fd=new FormData(f),now=new Date().toISOString();
 const fullName=[fd.get("firstName"),fd.get("middleName"),fd.get("lastName")].filter(Boolean).join(" ");
 let c=db.customers.find(x=>x.email&&x.email.toLowerCase()===(fd.get("email")||"").toLowerCase());
 if(!c){c={id:uid("cus"),firstName:fd.get("firstName"),middleName:fd.get("middleName"),lastName:fd.get("lastName"),name:fullName,phone:fd.get("phone"),email:fd.get("email"),address1:fd.get("address1"),address2:fd.get("address2"),city:fd.get("city"),state:fd.get("state"),postalCode:fd.get("postalCode"),country:fd.get("country"),notes:fd.get("customerNotes"),createdAt:now};db.customers.push(c)}
 let v=db.vehicles.find(x=>x.vin.toLowerCase()===String(fd.get("vin")).toLowerCase());
 if(!v){v={id:uid("veh"),customerId:c.id,vin:fd.get("vin"),year:fd.get("year"),make:fd.get("make"),model:fd.get("model"),trim:fd.get("trim"),color:fd.get("color"),wrap:fd.get("wrap"),type:fd.get("vehicleType"),fuelLevel:fd.get("fuelLevel"),keysReceived:fd.get("keysReceived"),odometer:fd.get("odometer"),notes:fd.get("vehicleNotes")};db.vehicles.push(v)}
 const equipment=[...document.querySelectorAll(".equipment-row")].map(row=>({category:row.querySelector('[data-eq="category"]').value,brand:row.querySelector('[data-eq="brand"]').value,model:row.querySelector('[data-eq="model"]').value,qty:Number(row.querySelector('[data-eq="qty"]').value||1),note:row.querySelector('[data-eq="note"]').value})).filter(x=>x.category||x.brand||x.model||x.note);
 const parts=Number(fd.get("parts")||0),labor=Number(fd.get("labor")||0),fees=Number(fd.get("fees")||0);
 const wo={id:"WO-"+new Date().toISOString().slice(2,10).replaceAll("-","")+"-"+String(db.workOrders.length+1).padStart(3,"0"),customerId:c.id,vehicleId:v.id,services:fd.getAll("services"),equipment,equipmentNotes:fd.get("equipmentNotes"),workDetails:fd.get("workDetails"),damageNotes:fd.get("damageNotes"),keysReceived:fd.get("keysReceived"),vehicleNotes:fd.get("vehicleNotes"),fuelLevel:fd.get("fuelLevel"),estimate:{parts,labor,fees,deposit:Number(fd.get("deposit")||0),pricingMode:"manual"},estimateTotal:parts+labor+fees,estimatedCompletion:fd.get("estimatedCompletion"),handoff:fd.get("handoff"),status:"Authorized",assignedTo:"usr_derek",createdBy:"usr_derek",createdAt:now,updatedAt:now,termsVersion:"0.1",termsAccepted:true,signatures:[{role:"customer",name:fd.get("customerSignature"),signedAt:now},{role:"ttt",name:fd.get("staffSignature"),signedAt:now}]};
 db.workOrders.push(wo);
 db.audit.push({id:uid("aud"),entityType:"work_order",entityId:wo.id,action:"created_and_authorized",actorId:"usr_derek",timestamp:now});
 [...document.querySelectorAll('input[type="file"][data-photo]')].forEach(input=>[...input.files].forEach(file=>db.media.push({id:uid("med"),workOrderId:wo.id,mediaType:"photo",category:input.dataset.photo,fileName:file.name,mime:file.type,capturedAt:now,createdBy:"usr_derek",storageStatus:"local-metadata-only"})));
 [...document.querySelectorAll('input[type="file"][data-video]')].forEach(input=>[...input.files].forEach(file=>db.media.push({id:uid("med"),workOrderId:wo.id,mediaType:"video",category:input.dataset.video,fileName:file.name,mime:file.type,capturedAt:now,createdBy:"usr_derek",storageStatus:"local-metadata-only"})));
 save();f.reset();document.querySelector('[name="staffSignature"]').value="Derek Thompson";updateTotal();document.querySelectorAll(".photo-preview,.video-preview").forEach(x=>x.innerHTML="");equipmentRows.innerHTML="";addEquipmentRow();toast(wo.id+" created");show("workorders");
});

document.getElementById("seedBtn").onclick=()=>{db=clone(seed);save();render();toast("Demo data reset")};
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
render();