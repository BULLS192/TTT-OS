(function(){
'use strict';

const AUDIT_DATE='2026-10-02';
const LEVELS={
  1:{name:'Essential',target:'Launch requirement',framework:'CIS IG1 + Texas baseline + PCI scope minimization'},
  2:{name:'Protected',target:'Normal operating target',framework:'CIS IG2 + NIST CSF 2.0'},
  3:{name:'Assured',target:'Enterprise / auditable target',framework:'ISO/IEC 27001 + selected CIS IG3'}
};
const controls=[
{id:'TTT-GOV-001',level:1,domain:'Govern',title:'Assign cybersecurity owner',status:'review',evidence:'Formal owner/backup owner must be documented.',milestone:'L1-M1'},
{id:'TTT-GOV-002',level:1,domain:'Govern',title:'Approve Information Security Policy',status:'fail',evidence:'Policy not yet approved.',milestone:'L1-M1'},
{id:'TTT-AST-001',level:1,domain:'Identify',title:'Maintain asset and system inventory',status:'review',evidence:'Core systems are known; controlled inventory still required.',milestone:'L1-M1'},
{id:'TTT-DAT-001',level:1,domain:'Identify',title:'Inventory and classify customer data',status:'review',evidence:'Use Public / Internal / Confidential / Restricted.',milestone:'L1-M1'},
{id:'TTT-IAM-001',level:1,domain:'Protect',title:'Unique named accounts for every user',status:'pass',evidence:'TTT-OS has individual profiles/accounts.',milestone:'L1-M2'},
{id:'TTT-IAM-002',level:1,domain:'Protect',title:'MFA enrolled for every TTT-OS user',status:'auto-mfa',evidence:'Live Supabase MFA evidence.',milestone:'L1-M2'},
{id:'TTT-IAM-003',level:1,domain:'Protect',title:'Compromised-password protection enabled',status:'fail',evidence:'Supabase Security Advisor: leaked password protection disabled on '+AUDIT_DATE+'.',milestone:'L1-M2'},
{id:'TTT-IAM-004',level:1,domain:'Protect',title:'Joiner / mover / leaver access procedure',status:'review',evidence:'Document immediate offboarding and role-change process.',milestone:'L1-M2'},
{id:'TTT-APP-001',level:1,domain:'Protect',title:'RLS enabled on exposed application tables',status:'auto-rls',evidence:'Live Supabase RLS evidence.',milestone:'L1-M2'},
{id:'TTT-APP-002',level:1,domain:'Protect',title:'Customer file storage private by default',status:'auto-storage',evidence:'Live Supabase Storage evidence.',milestone:'L1-M2'},
{id:'TTT-APP-003',level:1,domain:'Protect',title:'Privileged database functions restricted',status:'fail',evidence:'Security Advisor flags next_ttt_document_number SECURITY DEFINER RPC executable by authenticated users.',milestone:'L1-M2'},
{id:'TTT-APP-004',level:1,domain:'Protect',title:'Public edge endpoints reviewed and rate-limited',status:'pass',evidence:'ttt-public-api and auth-audit use bounded actions/rate limits; review remains part of change control.',milestone:'L1-M2'},
{id:'TTT-SEC-001',level:1,domain:'Protect',title:'No server secret/service role in browser code',status:'pass',evidence:'Browser config uses Supabase publishable key only.',milestone:'L1-M2'},
{id:'TTT-PAY-001',level:1,domain:'Protect',title:'Do not store full card number or CVV',status:'review',evidence:'Architecture rule; confirm POS/payment integrations remain tokenized.',milestone:'L1-M3'},
{id:'TTT-LOG-001',level:1,domain:'Detect',title:'Authentication and admin activity logged',status:'pass',evidence:'login_activity + Security Center are active.',milestone:'L1-M3'},
{id:'TTT-DEV-001',level:1,domain:'Protect',title:'Protect production branch and require controlled changes',status:'fail',evidence:'GitHub repository currently has no repository rulesets.',milestone:'L1-M3'},
{id:'TTT-BCK-001',level:1,domain:'Recover',title:'Automated critical-data backups',status:'review',evidence:'Backup configuration/evidence must be attached.',milestone:'L1-M4'},
{id:'TTT-BCK-002',level:1,domain:'Recover',title:'Perform and record restore test',status:'fail',evidence:'No current restore-test evidence recorded in Compliance.',milestone:'L1-M4'},
{id:'TTT-INC-001',level:1,domain:'Respond',title:'Incident response and Texas breach playbook',status:'fail',evidence:'Document roles, containment, evidence, counsel/insurer escalation and notification workflow.',milestone:'L1-M4'},
{id:'TTT-TRN-001',level:1,domain:'Protect',title:'Annual security awareness training',status:'fail',evidence:'Training completion evidence required for all personnel.',milestone:'L1-M4'},
{id:'TTT-END-001',level:1,domain:'Protect',title:'Company devices patched, locked and encrypted',status:'review',evidence:'Manual device evidence required.',milestone:'L1-M4'},
{id:'TTT-NET-001',level:1,domain:'Protect',title:'Separate business and guest Wi-Fi',status:'review',evidence:'Shop network evidence required when facility network is live.',milestone:'L1-M4'},
{id:'TTT-RET-001',level:1,domain:'Govern',title:'Data retention and secure destruction schedule',status:'fail',evidence:'Retention matrix and deletion procedure not yet approved.',milestone:'L1-M4'},
{id:'TTT-VEN-001',level:1,domain:'Govern',title:'Maintain critical vendor register',status:'review',evidence:'Include productivity/email, database, hosting, source-control, POS/payment, messaging and backup providers.',milestone:'L1-M4'},

{id:'TTT-IAM-101',level:2,domain:'Protect',title:'Phishing-resistant MFA/passkeys where supported',status:'planned',evidence:'Level 2 target.',milestone:'L2-M1'},
{id:'TTT-IAM-102',level:2,domain:'Govern',title:'Quarterly access and privilege reviews',status:'planned',evidence:'Level 2 target.',milestone:'L2-M1'},
{id:'TTT-END-101',level:2,domain:'Protect',title:'Managed device fleet with MDM + EDR',status:'planned',evidence:'Level 2 target.',milestone:'L2-M1'},
{id:'TTT-VUL-101',level:2,domain:'Identify',title:'Continuous vulnerability/dependency/secret scanning',status:'planned',evidence:'Level 2 target.',milestone:'L2-M1'},
{id:'TTT-PAT-101',level:2,domain:'Protect',title:'Defined patch SLAs by severity',status:'planned',evidence:'Level 2 target.',milestone:'L2-M1'},
{id:'TTT-LOG-101',level:2,domain:'Detect',title:'Central security monitoring and alerting',status:'planned',evidence:'Level 2 target.',milestone:'L2-M2'},
{id:'TTT-DAT-101',level:2,domain:'Protect',title:'Restricted-data vault for GPS/security data',status:'planned',evidence:'Separate permissions and audited access.',milestone:'L2-M2'},
{id:'TTT-DR-101',level:2,domain:'Recover',title:'3-2-1 resilient backup design + immutable copy',status:'planned',evidence:'Level 2 target.',milestone:'L2-M2'},
{id:'TTT-IR-101',level:2,domain:'Respond',title:'Annual incident-response tabletop exercise',status:'planned',evidence:'Level 2 target.',milestone:'L2-M2'},
{id:'TTT-VEN-101',level:2,domain:'Govern',title:'Tiered vendor security assessments',status:'planned',evidence:'Level 2 target.',milestone:'L2-M3'},
{id:'TTT-PRI-101',level:2,domain:'Govern',title:'Customer privacy access/delete/export workflow',status:'planned',evidence:'Level 2 target.',milestone:'L2-M3'},
{id:'TTT-PEN-101',level:2,domain:'Identify',title:'Independent penetration test',status:'planned',evidence:'Level 2 target.',milestone:'L2-M3'},
{id:'TTT-TRN-101',level:2,domain:'Protect',title:'Phishing simulations + role-specific training',status:'planned',evidence:'Level 2 target.',milestone:'L2-M3'},
{id:'TTT-MET-101',level:2,domain:'Govern',title:'Security KPI/KRI dashboard and risk register',status:'planned',evidence:'Level 2 target.',milestone:'L2-M3'},

{id:'TTT-ISMS-201',level:3,domain:'Govern',title:'Formal Information Security Management System',status:'planned',evidence:'ISO/IEC 27001-aligned ISMS.',milestone:'L3-M1'},
{id:'TTT-ISO-201',level:3,domain:'Govern',title:'ISO/IEC 27001 gap assessment + Statement of Applicability',status:'planned',evidence:'Level 3 target.',milestone:'L3-M1'},
{id:'TTT-SDLC-201',level:3,domain:'Protect',title:'Formal secure SDLC and threat modeling',status:'planned',evidence:'Level 3 target.',milestone:'L3-M1'},
{id:'TTT-PAM-201',level:3,domain:'Protect',title:'Privileged Access Management',status:'planned',evidence:'Level 3 target.',milestone:'L3-M2'},
{id:'TTT-DLP-201',level:3,domain:'Protect',title:'Data Loss Prevention for restricted information',status:'planned',evidence:'Level 3 target.',milestone:'L3-M2'},
{id:'TTT-SIEM-201',level:3,domain:'Detect',title:'SIEM + custom detection engineering',status:'planned',evidence:'Level 3 target.',milestone:'L3-M2'},
{id:'TTT-KEY-201',level:3,domain:'Protect',title:'Managed encryption-key lifecycle and rotation',status:'planned',evidence:'Level 3 target.',milestone:'L3-M2'},
{id:'TTT-SBOM-201',level:3,domain:'Identify',title:'Software bill of materials and supply-chain governance',status:'planned',evidence:'Level 3 target.',milestone:'L3-M3'},
{id:'TTT-RED-201',level:3,domain:'Detect',title:'Periodic red/purple-team exercises where justified',status:'planned',evidence:'Level 3 target.',milestone:'L3-M3'},
{id:'TTT-CCM-201',level:3,domain:'Govern',title:'Continuous control monitoring',status:'planned',evidence:'Level 3 target.',milestone:'L3-M3'},
{id:'TTT-AUD-201',level:3,domain:'Govern',title:'Independent audit / certification readiness',status:'planned',evidence:'Level 3 target.',milestone:'L3-M4'},
{id:'TTT-BCP-201',level:3,domain:'Recover',title:'Enterprise business-continuity program with tested RTO/RPO',status:'planned',evidence:'Level 3 target.',milestone:'L3-M4'}
];

const milestones=[
{id:'L1-M1',level:1,title:'Governance & inventory',target:'Week 1',exit:'Owner, policies, systems and data classes documented.'},
{id:'L1-M2',level:1,title:'Identity & application hardening',target:'Weeks 1–2',exit:'MFA complete; password protection on; privileged RPC fixed; RLS/storage green.'},
{id:'L1-M3',level:1,title:'Payments, logging & change control',target:'Week 2',exit:'Payment scope minimized; audit trail confirmed; main branch protected.'},
{id:'L1-M4',level:1,title:'Resilience & operating procedures',target:'Weeks 2–4',exit:'Backup/restore test, incident playbook, training, endpoint/network and retention evidence complete.'},
{id:'L1-GATE',level:1,title:'Level 1 internal assurance gate',target:'End of Week 4',exit:'No Level 1 FAIL; all REVIEW items supported by evidence and management sign-off.'},
{id:'L2-M1',level:2,title:'Managed identity, endpoint & vulnerability controls',target:'Months 2–4',exit:'Managed endpoints, stronger MFA, quarterly access review and automated security scanning.'},
{id:'L2-M2',level:2,title:'Detection, restricted data & recovery',target:'Months 4–6',exit:'Central monitoring, GPS/security vault, resilient backup and tabletop exercise.'},
{id:'L2-M3',level:2,title:'Vendor, privacy, testing & metrics',target:'Months 6–9',exit:'Vendor assessments, privacy workflows, independent pen test and risk dashboard.'},
{id:'L2-GATE',level:2,title:'Level 2 assurance gate',target:'Month 9',exit:'No unresolved critical/high findings; annual exercise and external test evidence recorded.'},
{id:'L3-M1',level:3,title:'ISMS & secure engineering',target:'Months 9–12',exit:'ISMS scope, risk method, SoA draft, secure SDLC and threat modeling active.'},
{id:'L3-M2',level:3,title:'Advanced protection & detection',target:'Months 12–18',exit:'PAM, DLP, key management and SIEM/detection engineering operational.'},
{id:'L3-M3',level:3,title:'Supply chain & assurance engineering',target:'Months 18–24',exit:'SBOM, continuous controls and advanced testing operational.'},
{id:'L3-M4',level:3,title:'Independent assurance',target:'24+ months',exit:'Independent readiness audit; certification decision based on customer/commercial need.'}
];

let activeLevel=1, live=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function ensureView(){
 const main=document.querySelector('main.main'),settings=document.getElementById('settings');
 if(!main||document.getElementById('compliance'))return;
 const s=document.createElement('section');s.id='compliance';s.className='view';
 s.innerHTML='<div id="tttComplianceRoot"></div>';
 main.insertBefore(s,settings||null);
}
function styles(){
 if(document.getElementById('tttComplianceStyles'))return;
 const s=document.createElement('style');s.id='tttComplianceStyles';s.textContent=`
 .cmp-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.cmp-levels{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.cmp-level{border:1px solid #dfe6ef;background:#fff;border-radius:12px;padding:14px;text-align:left;cursor:pointer}.cmp-level.active{border-color:#2375db;box-shadow:0 0 0 2px rgba(35,117,219,.08)}.cmp-level small,.cmp-muted{color:#718198}.cmp-level strong{display:block;font-size:18px;margin:4px 0}.cmp-score{font-size:30px;font-weight:850}.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.cmp-status{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:850}.cmp-status.pass{background:#ecfdf3;color:#027a48}.cmp-status.fail{background:#fef2f2;color:#b42318}.cmp-status.review{background:#fff7ed;color:#c2410c}.cmp-status.planned{background:#eff4fa;color:#58708f}.cmp-controls{display:grid;gap:8px}.cmp-control{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:12px;align-items:start;border:1px solid #e1e8f0;border-radius:10px;padding:11px}.cmp-control code{font-size:10px}.cmp-control strong,.cmp-control small{display:block}.cmp-control small{margin-top:4px;color:#718198}.cmp-domain{font-size:10px;font-weight:800;color:#5f7390;text-transform:uppercase}.cmp-milestones{display:grid;gap:8px}.cmp-ms{border-left:3px solid #d7e2f0;padding:8px 10px;background:#fafcff;border-radius:0 9px 9px 0}.cmp-ms strong,.cmp-ms span,.cmp-ms small{display:block}.cmp-live{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cmp-live>div{border:1px solid #e1e8f0;border-radius:10px;padding:11px}.cmp-live strong{display:block;font-size:20px}.cmp-note{padding:11px 12px;border-radius:10px;background:#f6f9fd;border:1px solid #dde7f4;font-size:12px}.cmp-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:900px){.cmp-grid{grid-template-columns:1fr}.cmp-live{grid-template-columns:1fr}.cmp-levels{grid-template-columns:1fr}.cmp-control{grid-template-columns:1fr}.cmp-hero{display:block}}
 `;document.head.appendChild(s);
}
function resolvedStatus(c){
 if(c.status==='auto-mfa'){
   if(!live)return 'review';
   const m=live.mfa||[]; return m.length&&m.every(x=>Number(x.verified_factors||0)>0)?'pass':'fail';
 }
 if(c.status==='auto-rls'){
   if(!live)return 'review'; return Number(live.rls?.rls_disabled||0)===0?'pass':'fail';
 }
 if(c.status==='auto-storage'){
   if(!live)return 'review'; return Number(live.storage?.public_bucket_count||0)===0?'pass':'fail';
 }
 return c.status;
}
function score(level){
 const rows=controls.filter(c=>c.level===level); if(!rows.length)return {pass:0,fail:0,review:0,planned:0,pct:0};
 const s={pass:0,fail:0,review:0,planned:0};rows.forEach(c=>s[resolvedStatus(c)]++);
 s.pct=Math.round((s.pass/rows.length)*100);return s;
}
async function loadLive(){
 const c=window.TTTCloud,cfg=window.TTTSupabaseConfig;if(!c?.client||!cfg?.url)return;
 try{
   const ses=(await c.client.auth.getSession()).data?.session;if(!ses)return;
   const r=await fetch(cfg.url+'/functions/v1/ttt-security-admin',{method:'POST',headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+ses.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'snapshot'})});
   const j=await r.json().catch(()=>null);if(r.ok&&j?.ok){live=j.data;render();}
 }catch{}
}
function render(){
 ensureView();styles();const root=document.getElementById('tttComplianceRoot');if(!root)return;
 const l=LEVELS[activeLevel],s=score(activeLevel);
 root.innerHTML=`
 <div class="cmp-hero"><div><p class="eyebrow">GOVERNANCE • CYBERSECURITY</p><h2>TTT Compliance</h2><p class="muted">Internal cybersecurity maturity roadmap and evidence tracker. Current audit baseline: ${AUDIT_DATE}.</p></div><div class="cmp-note"><strong>Current priority:</strong> Level 1 must be closed before TTT materially scales customer data.</div></div>
 <div class="cmp-levels">${Object.entries(LEVELS).map(([k,v])=>{const x=score(Number(k));return '<button class="cmp-level '+(Number(k)===activeLevel?'active':'')+'" data-cmp-level="'+k+'"><small>LEVEL '+k+'</small><strong>'+esc(v.name)+'</strong><span class="cmp-score">'+x.pct+'%</span><small>'+x.pass+' pass · '+x.fail+' fail · '+x.review+' review'+(x.planned?' · '+x.planned+' planned':'')+'</small></button>'}).join('')}</div>
 <div class="cmp-grid">
  <article class="panel"><div class="panel-head"><div><h3>Level ${activeLevel} — ${esc(l.name)}</h3><p class="muted">${esc(l.framework)} · ${esc(l.target)}</p></div></div>
   <div class="cmp-summary"><span class="cmp-status pass">${s.pass} PASS</span><span class="cmp-status fail">${s.fail} FAIL</span><span class="cmp-status review">${s.review} REVIEW</span>${s.planned?'<span class="cmp-status planned">'+s.planned+' PLANNED</span>':''}</div>
   <div class="cmp-controls" style="margin-top:12px">${controls.filter(c=>c.level===activeLevel).map(c=>{const st=resolvedStatus(c);return '<div class="cmp-control"><div><code>'+esc(c.id)+'</code><div class="cmp-domain">'+esc(c.domain)+'</div></div><div><strong>'+esc(c.title)+'</strong><small>'+esc(c.evidence)+'</small><small>Milestone: '+esc(c.milestone)+'</small></div><span class="cmp-status '+st+'">'+st.toUpperCase()+'</span></div>'}).join('')}</div>
  </article>
  <div>
   <article class="panel"><div class="panel-head"><div><h3>Milestones</h3><p class="muted">Exit criteria must be evidenced, not merely checked off.</p></div></div><div class="cmp-milestones">${milestones.filter(m=>m.level===activeLevel).map(m=>'<div class="cmp-ms"><strong>'+esc(m.id)+' · '+esc(m.title)+'</strong><span>'+esc(m.target)+'</span><small>'+esc(m.exit)+'</small></div>').join('')}</div></article>
   <article class="panel" style="margin-top:14px"><div class="panel-head"><div><h3>Live security evidence</h3><p class="muted">Pulled from the existing TTT Security Center.</p></div></div>${live?'<div class="cmp-live"><div><span class="cmp-muted">RLS</span><strong>'+esc(live.rls?.rls_enabled)+' / '+esc(live.rls?.total_tables)+'</strong><small>'+esc(live.rls?.rls_disabled)+' disabled</small></div><div><span class="cmp-muted">Public buckets</span><strong>'+esc(live.storage?.public_bucket_count)+'</strong><small>Target: 0</small></div><div><span class="cmp-muted">MFA enrolled</span><strong>'+((live.mfa||[]).filter(x=>Number(x.verified_factors||0)>0).length)+' / '+(live.mfa||[]).length+'</strong><small>Target: 100%</small></div></div>':'<div class="cmp-note">Live evidence is available to the owner/admin after authentication.</div>'}</article>
  </div>
 </div>`;
 root.querySelectorAll('[data-cmp-level]').forEach(b=>b.onclick=()=>{activeLevel=Number(b.dataset.cmpLevel);render();});
}
function showCompliance(){ensureView();if(typeof show==='function')show('compliance');render();loadLive();const h=document.getElementById('pageTitle');if(h)h.textContent='Compliance';}
function init(){ensureView();styles();render();loadLive();window.addEventListener('ttt:cloud-state-applied',()=>loadLive());window.TTTCompliance={show:showCompliance,render,loadLive,controls,milestones};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();