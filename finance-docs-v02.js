// TTT OS Finance Documents v2.0 — Quote/Estimate and Invoice registers linked to Drive templates.
(function(){
'use strict';
const QUOTE_TEMPLATE_ID='1Uvdz-SOnl73bgXG1rqfFeZelbPNaGYGOKXaBeQiH4Cs';
const QUOTE_TEMPLATE_URL='https://docs.google.com/document/d/'+QUOTE_TEMPLATE_ID+'/edit';
const INVOICE_TEMPLATE_ID='15k6KzGLU87B9VP6hnahTdNqUb5bE1XN5';
const INVOICE_TEMPLATE_URL='https://drive.google.com/file/d/'+INVOICE_TEMPLATE_ID+'/view';
let quotes=[],quoteLines=[],invoices=[],invoiceLines=[],customers=[],jobs=[],channel=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const date=v=>v?new Date(String(v).length===10?v+'T12:00:00':v).toLocaleDateString():'—';
function cloud(){return window.TTTCloud;}
function toastMsg(m){if(typeof toast==='function')toast(m);else console.log(m);}
function customerName(id){const c=customers.find(x=>x.id===id);return c?.display_name||c?.name||id||'—';}
function invoiceForQuote(id){return invoices.find(x=>x.quote_id===id&&!x.archived_at);}
function ensure(){
 const main=document.querySelector('main.main'),settings=document.getElementById('settings');if(!main)return;
 if(!document.getElementById('quotes-estimates')){const s=document.createElement('section');s.id='quotes-estimates';s.className='view';s.innerHTML='<div id="financeQuotesBody"></div>';main.insertBefore(s,settings||null);}
 if(!document.getElementById('invoices')){const s=document.createElement('section');s.id='invoices';s.className='view';s.innerHTML='<div id="financeInvoicesBody"></div>';main.insertBefore(s,settings||null);}
 if(!document.getElementById('financeDocsStyle')){const st=document.createElement('style');st.id='financeDocsStyle';st.textContent=
 '.fd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fd-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:12px}.fd-kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase}.fd-kpi strong{display:block;font-size:20px;margin-top:4px}.fd-template{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#eff6ff;border:1px solid #d7e8fb;border-radius:11px;padding:11px 13px;margin:12px 0}.fd-template small{display:block;color:#64748b;margin-top:2px}.fd-actions{display:flex;gap:6px;flex-wrap:wrap}.fd-modal{position:fixed;inset:0;background:#07101dcc;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:7vh 14px 24px}.fd-dialog{width:min(780px,100%);max-height:86vh;overflow:auto;background:#f8fafc;border-radius:16px;padding:18px}.fd-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fd-form label{font-size:11px;font-weight:700;color:#556579}.fd-form input,.fd-form select,.fd-form textarea{width:100%;box-sizing:border-box;margin-top:4px}.fd-span{grid-column:1/-1}.fd-lines{margin-top:14px}.fd-overdue{color:#b42318;font-weight:800}@media(max-width:700px){.fd-kpis,.fd-form{grid-template-columns:1fr 1fr}}@media(max-width:520px){.fd-kpis,.fd-form{grid-template-columns:1fr}.fd-span{grid-column:auto}}';
 document.head.appendChild(st);}
}
async function load(){
 ensure();if(!cloud()?.ready)return;
 const c=cloud().client,o=cloud().organizationId;
 const [q,ql,i,il,cu,j]=await Promise.all([
   c.from('quotes').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
   c.from('quote_lines').select('*').eq('organization_id',o).is('archived_at',null),
   c.from('invoices').select('*').eq('organization_id',o).is('archived_at',null).order('created_at',{ascending:false}),
   c.from('invoice_lines').select('*').eq('organization_id',o).is('archived_at',null),
   c.from('customers').select('id,display_name,first_name,last_name').eq('organization_id',o).is('archived_at',null),
   c.from('jobs').select('id,customer_id,vehicle_id,status,primary_invoice_id').eq('organization_id',o).is('archived_at',null)
 ]);
 const bad=[q,ql,i,il,cu,j].find(x=>x.error);if(bad){console.error('Finance documents load failed',bad.error);return;}
 quotes=q.data||[];quoteLines=ql.data||[];invoices=i.data||[];invoiceLines=il.data||[];customers=cu.data||[];jobs=j.data||[];
 renderQuotes();renderInvoices();subscribe();
}
function renderQuotes(){
 const body=document.getElementById('financeQuotesBody');if(!body)return;
 const approved=quotes.filter(q=>String(q.status).toLowerCase()==='approved'),sent=quotes.filter(q=>String(q.status).toLowerCase()==='sent'),draft=quotes.filter(q=>String(q.status).toLowerCase()==='draft');
 const approvedValue=approved.reduce((s,q)=>s+Number(q.total||0),0);
 const rows=quotes.map(q=>{const inv=invoiceForQuote(q.id),canInvoice=String(q.status).toLowerCase()==='approved'&&!inv;return '<tr><td><strong>'+esc(q.id)+'</strong></td><td>'+esc(customerName(q.customer_id))+'</td><td>'+esc(q.job_id||'—')+'</td><td><span class="badge">'+esc(q.status)+'</span></td><td>'+date(q.quote_date)+'</td><td><strong>'+money(q.total)+'</strong></td><td>'+(inv?'<button class="link-btn" data-open-invoice="'+esc(inv.id)+'">'+esc(inv.id)+'</button>':'—')+'</td><td><div class="fd-actions"><button class="btn secondary compact" data-open-crm-quote="'+esc(q.id)+'">Open</button>'+(canInvoice?'<button class="btn primary compact" data-create-invoice="'+esc(q.id)+'">Create Invoice</button>':'')+'</div></td></tr>';}).join('');
 body.innerHTML='<div class="section-head"><div><p class="eyebrow">FINANCE</p><h2>Quotes & Estimates</h2><p class="muted">Approved quotations flow directly into Invoices while preserving the Opportunity, Customer and Job relationship.</p></div><button class="btn secondary" id="fdQuoteRefresh">Refresh</button></div>'+
 '<div class="fd-template"><div><strong>TTT Quotation Template</strong><small>Approved Google Workspace template · Q-2026-0001 — TTT Quotation v1</small></div><a class="btn secondary compact" target="_blank" rel="noopener" href="'+QUOTE_TEMPLATE_URL+'">Open Template</a></div>'+
 '<div class="fd-kpis"><div class="fd-kpi"><span>Draft</span><strong>'+draft.length+'</strong></div><div class="fd-kpi"><span>Sent</span><strong>'+sent.length+'</strong></div><div class="fd-kpi"><span>Approved</span><strong>'+approved.length+'</strong></div><div class="fd-kpi"><span>Approved value</span><strong>'+money(approvedValue)+'</strong></div></div>'+
 '<article class="panel"><div class="table-wrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Job</th><th>Status</th><th>Date</th><th>Total</th><th>Invoice</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="muted">No quotations yet.</td></tr>')+'</tbody></table></div></article>';
 document.getElementById('fdQuoteRefresh')?.addEventListener('click',load);
 body.querySelectorAll('[data-create-invoice]').forEach(b=>b.onclick=()=>openCreateInvoice(b.dataset.createInvoice));
 body.querySelectorAll('[data-open-invoice]').forEach(b=>b.onclick=()=>{if(typeof show==='function')show('invoices');openInvoice(b.dataset.openInvoice);});
 body.querySelectorAll('[data-open-crm-quote]').forEach(b=>b.onclick=()=>openQuoteInCRM(b.dataset.openCrmQuote));
}
function renderInvoices(){
 const body=document.getElementById('financeInvoicesBody');if(!body)return;
 const open=invoices.filter(i=>!['paid','void'].includes(String(i.status||'').toLowerCase())),draft=invoices.filter(i=>String(i.status).toLowerCase()==='draft'),sent=invoices.filter(i=>String(i.status).toLowerCase()==='sent');
 const total=open.reduce((s,i)=>s+Number(i.total||0),0),balance=open.reduce((s,i)=>s+Number(i.balance_due||0),0);
 const today=new Date().toISOString().slice(0,10);
 const rows=invoices.map(i=>{const overdue=i.due_date&&i.due_date<today&&!['paid','void'].includes(String(i.status).toLowerCase());return '<tr><td><button class="link-btn" data-open-invoice="'+esc(i.id)+'"><strong>'+esc(i.id)+'</strong></button></td><td>'+esc(customerName(i.customer_id))+'</td><td>'+esc(i.quote_id||'—')+'</td><td>'+esc(i.job_id||'—')+'</td><td><span class="badge">'+esc(i.status)+'</span></td><td>'+date(i.invoice_date)+'</td><td class="'+(overdue?'fd-overdue':'')+'">'+date(i.due_date)+'</td><td>'+money(i.total)+'</td><td><strong>'+money(i.balance_due)+'</strong></td><td><button class="btn secondary compact" data-open-invoice="'+esc(i.id)+'">Open</button></td></tr>';}).join('');
 body.innerHTML='<div class="section-head"><div><p class="eyebrow">FINANCE</p><h2>Invoices</h2><p class="muted">Invoice register linked to Quotes, Jobs and Customers. Payment collection remains separate until the payment system is connected.</p></div><button class="btn secondary" id="fdInvoiceRefresh">Refresh</button></div>'+
 '<div class="fd-template"><div><strong>TTT Invoice Template</strong><small>Approved template · 08 — TTT Invoice — Draft v1.docx</small></div><a class="btn secondary compact" target="_blank" rel="noopener" href="'+INVOICE_TEMPLATE_URL+'">Open Template</a></div>'+
 '<div class="fd-kpis"><div class="fd-kpi"><span>Invoices</span><strong>'+invoices.length+'</strong></div><div class="fd-kpi"><span>Draft</span><strong>'+draft.length+'</strong></div><div class="fd-kpi"><span>Sent / open</span><strong>'+sent.length+'</strong></div><div class="fd-kpi"><span>Balance due</span><strong>'+money(balance)+'</strong></div></div>'+
 '<article class="panel"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Quote</th><th>Job</th><th>Status</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="10" class="muted">No invoices yet. Create one from an approved Quote.</td></tr>')+'</tbody></table></div></article>';
 document.getElementById('fdInvoiceRefresh')?.addEventListener('click',load);
 body.querySelectorAll('[data-open-invoice]').forEach(b=>b.onclick=()=>openInvoice(b.dataset.openInvoice));
}
function openQuoteInCRM(id){
 const q=quotes.find(x=>x.id===id);if(!q)return;
 if(typeof show==='function')show('crm');window.TTTCRM?.activateTab?.('opportunities');window.TTTCRM?.load?.();
 setTimeout(()=>{if(q.opportunity_id)window.TTTCRM?.openOpportunity?.(q.opportunity_id);},200);
}
function modal(html){document.getElementById('fdModal')?.remove();const m=document.createElement('div');m.id='fdModal';m.className='fd-modal';m.innerHTML='<div class="fd-dialog">'+html+'</div>';document.body.appendChild(m);m.addEventListener('mousedown',e=>{if(e.target===m)m.remove();});return m;}
function openCreateInvoice(quoteId){
 const q=quotes.find(x=>x.id===quoteId);if(!q)return;
 if(String(q.status||'').toLowerCase()!=='approved')return toastMsg('Only approved Quotes can be invoiced.');
 if(invoiceForQuote(q.id))return toastMsg('This Quote already has an Invoice.');
 const issued=new Date(),due=new Date();due.setDate(due.getDate()+14);
 const iso=d=>d.toISOString().slice(0,10),lines=quoteLines.filter(l=>l.quote_id===q.id).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
 const m=modal('<div class="panel-head"><div><p class="eyebrow">QUOTE '+esc(q.id)+'</p><h2>Create Invoice</h2><p class="muted">Copies the approved Quote lines and links the resulting Invoice to the same Customer and Job.</p></div><button class="btn secondary" id="fdClose">Close</button></div><form id="fdCreateInvoice" class="fd-form"><label>Invoice date<input name="invoice_date" type="date" value="'+iso(issued)+'" required></label><label>Due date<input name="due_date" type="date" value="'+iso(due)+'" required></label><label>Payment terms<select name="payment_terms"><option>Net 14</option><option>Due on receipt</option><option>Net 30</option><option>Custom</option></select></label><label>Quote total<input value="'+money(q.total)+'" readonly></label><label class="fd-span">Invoice notes<textarea name="notes">'+esc(q.notes||'')+'</textarea></label><div class="fd-span fd-lines"><div class="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>'+lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td>'+Number(l.quantity||1)+'</td><td>'+money(l.unit_price)+'</td><td>'+money(l.line_total)+'</td></tr>').join('')+'</tbody></table></div></div><div class="fd-span fd-actions" style="justify-content:flex-end"><button class="btn primary" type="submit">Create linked Invoice</button></div></form>');
 m.querySelector('#fdClose').onclick=()=>m.remove();m.querySelector('#fdCreateInvoice').onsubmit=e=>createInvoice(e,q,lines);
}
async function createInvoice(e,q,lines){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),meta=Object.assign({},q.metadata||{},{template_id:INVOICE_TEMPLATE_ID,template_url:INVOICE_TEMPLATE_URL,quotation_template_id:QUOTE_TEMPLATE_ID,payment_terms:String(fd.get('payment_terms')||'Net 14'),source_quote_id:q.id});
 const row={organization_id:c.organizationId,quote_id:q.id,company_id:q.company_id||null,contact_id:q.contact_id||null,customer_id:q.customer_id||null,job_id:q.job_id||null,status:'draft',invoice_date:String(fd.get('invoice_date')),due_date:String(fd.get('due_date')),subtotal:Number(q.subtotal||0),discount_total:Number(q.discount_total||0),tax_total:Number(q.tax_total||0),total:Number(q.total||0),amount_paid:0,balance_due:Number(q.total||0),notes:String(fd.get('notes')||'').trim()||null,metadata:meta,created_by:c.userId,updated_by:c.userId};
 const out=await c.client.from('invoices').insert(row).select('*').single();if(out.error)return toastMsg('Invoice creation failed: '+out.error.message);
 if(lines.length){const mapped=lines.map((l,n)=>({organization_id:c.organizationId,invoice_id:out.data.id,product_id:l.product_id||null,line_type:l.line_type||'product',description:l.description,quantity:Number(l.quantity||1),unit_price:Number(l.unit_price||0),taxable:l.taxable!==false,line_total:Number(l.line_total||0),sort_order:n+1,metadata:{quote_line_id:l.id,list_unit_price:l.list_unit_price,discount_type:l.discount_type,discount_value:l.discount_value,discount_amount:l.discount_amount}}));const li=await c.client.from('invoice_lines').insert(mapped);if(li.error)return toastMsg('Invoice created, but line copy failed: '+li.error.message);}
 if(q.job_id)await c.client.from('jobs').update({primary_invoice_id:out.data.id,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',q.job_id);
 await c.audit?.('invoice',out.data.id,'invoice_created_from_quote',{quote_id:q.id,job_id:q.job_id,total:out.data.total});
 document.getElementById('fdModal')?.remove();toastMsg('Invoice '+out.data.id+' created');await load();if(typeof show==='function')show('invoices');openInvoice(out.data.id);
}
function openInvoice(id){
 const inv=invoices.find(x=>x.id===id);if(!inv)return;const lines=invoiceLines.filter(x=>x.invoice_id===id).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
 const m=modal('<div class="panel-head"><div><p class="eyebrow">'+esc(inv.id)+'</p><h2>Invoice</h2><p class="muted">'+esc(customerName(inv.customer_id))+' · Quote '+esc(inv.quote_id||'—')+' · Job '+esc(inv.job_id||'—')+'</p></div><button class="btn secondary" id="fdClose">Close</button></div><form id="fdInvoiceForm" class="fd-form"><label>Status<select name="status">'+['draft','sent','void'].map(x=>'<option '+(inv.status===x?'selected':'')+'>'+x+'</option>').join('')+(inv.status==='paid'?'<option selected>paid</option>':'')+'</select></label><label>Invoice date<input name="invoice_date" type="date" value="'+esc(inv.invoice_date||'')+'"></label><label>Due date<input name="due_date" type="date" value="'+esc(inv.due_date||'')+'"></label><label>Total<input value="'+money(inv.total)+'" readonly></label><label>Amount paid<input value="'+money(inv.amount_paid)+'" readonly></label><label>Balance due<input value="'+money(inv.balance_due)+'" readonly></label><label class="fd-span">Notes<textarea name="notes">'+esc(inv.notes||'')+'</textarea></label><div class="fd-span fd-lines"><div class="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>'+lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td>'+Number(l.quantity||1)+'</td><td>'+money(l.unit_price)+'</td><td>'+money(l.line_total)+'</td></tr>').join('')+'</tbody></table></div></div><div class="fd-span fd-actions" style="justify-content:space-between"><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(inv.google_doc_url||INVOICE_TEMPLATE_URL)+'">'+(inv.google_doc_url?'Open Invoice Document':'Open Invoice Template')+'</a><button class="btn primary" type="submit">Save Invoice</button></div></form>');
 m.querySelector('#fdClose').onclick=()=>m.remove();m.querySelector('#fdInvoiceForm').onsubmit=e=>saveInvoice(e,inv);
}
async function saveInvoice(e,inv){
 e.preventDefault();const c=cloud(),fd=new FormData(e.currentTarget),status=String(fd.get('status')||'draft'),patch={status,invoice_date:String(fd.get('invoice_date')||'')||null,due_date:String(fd.get('due_date')||'')||null,notes:String(fd.get('notes')||'').trim()||null,updated_by:c.userId,updated_at:new Date().toISOString()};if(status==='sent'&&!inv.sent_at)patch.sent_at=new Date().toISOString();
 const {error}=await c.client.from('invoices').update(patch).eq('organization_id',c.organizationId).eq('id',inv.id);if(error)return toastMsg('Invoice save failed: '+error.message);await c.audit?.('invoice',inv.id,'invoice_updated',{status});document.getElementById('fdModal')?.remove();toastMsg('Invoice saved');await load();
}
function subscribe(){
 if(channel||!cloud()?.ready)return;channel=cloud().client.channel('ttt-finance-docs-'+cloud().organizationId);['quotes','quote_lines','invoices','invoice_lines'].forEach(t=>channel.on('postgres_changes',{event:'*',schema:'public',table:t,filter:'organization_id=eq.'+cloud().organizationId},()=>load()));channel.subscribe();
}
window.TTTFinanceDocs={reload:load,openInvoice,createFromQuote:openCreateInvoice,quoteTemplateUrl:QUOTE_TEMPLATE_URL,invoiceTemplateUrl:INVOICE_TEMPLATE_URL};
window.addEventListener('ttt:cloud-state-applied',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();