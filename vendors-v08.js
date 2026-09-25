// TTT OS v0.8.1 — Vendor & Supplier directory bridge
// Supabase is the live vendor/CRM source of truth; Google Workspace is retained for document/reference workflows.
(function(){
  const DIRECTORY_URL='https://docs.google.com/spreadsheets/d/1crOoPQirn3TS1anibJN67lZN7CWf1uqCLEg6rxd4g5g/edit';
  const RAW_CARDS_URL='https://drive.google.com/drive/folders/1K9O7TE0rDePXSaokwwfGGxnvLqL0NPcc';
  const VENDOR_ROOT_URL='https://drive.google.com/drive/folders/1QOnSrSiK-3AwPPnBPcxe6FYHVBJjsccW';

  function injectVendorModule(){
    const nav=document.querySelector('.sidebar nav');
    if(nav && !nav.querySelector('[data-view="vendors"]')){
      const btn=document.createElement('button');
      btn.className='nav-item';
      btn.dataset.view='vendors';
      btn.textContent='Vendors';
      const settings=nav.querySelector('[data-view="settings"]');
      nav.insertBefore(btn,settings||null);
      btn.addEventListener('click',()=>show('vendors'));
    }

    const main=document.querySelector('main.main');
    if(main && !document.getElementById('vendors')){
      const section=document.createElement('section');
      section.id='vendors';
      section.className='view';
      section.innerHTML=`
        <div class="section-head">
          <div><p class="eyebrow">SUPPLIER INTELLIGENCE</p><h2>Vendors & Sales Reps</h2></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a class="btn secondary" href="${RAW_CARDS_URL}" target="_blank" rel="noopener">Upload business cards</a>
            <a class="btn primary" href="${DIRECTORY_URL}" target="_blank" rel="noopener">Open vendor directory</a>
          </div>
        </div>
        <div class="workflow-note"><strong>Relational operating model:</strong> Create a company once. Contacts, brands/products, pricing, documents, evaluations, opportunities and interactions link back to that company instead of repeating company data. Vendor IDs and contact names are resolved automatically in the Google Sheet.</div>
        <div class="stats">
          <div class="stat"><span>Company master</span><strong>1× entry</strong></div>
          <div class="stat"><span>Contacts</span><strong>Linked</strong></div>
          <div class="stat"><span>Products & pricing</span><strong>Linked</strong></div>
          <div class="stat"><span>Raw cards</span><strong>Drive</strong></div>
        </div>
        <div class="grid two">
          <article class="panel">
            <div class="panel-head"><h3>Linked data model</h3></div>
            <div class="checklist">
              <div><strong>Companies</strong> — master Vendor ID + company-level details</div>
              <div>↳ <strong>Contacts</strong> — select company; Vendor ID fills automatically</div>
              <div>↳ <strong>Brands & Products</strong> — linked to company</div>
              <div>↳ <strong>Pricing & Documents</strong> — linked to company</div>
              <div>↳ <strong>Evaluation & Opportunities</strong> — linked to company</div>
              <div>↳ <strong>Interactions</strong> — linked to company + contact</div>
            </div>
          </article>
          <article class="panel">
            <div class="panel-head"><h3>Vendor workflow</h3></div>
            <div class="checklist">
              <div>1. Upload original business-card photo</div>
              <div>2. Create or match the company once</div>
              <div>3. Add the rep and select the company from the dropdown</div>
              <div>4. Add brands/products and commercial information</div>
              <div>5. Capture pricing, terms, documents and follow-ups</div>
              <div>6. Evaluate → approve → activate the vendor</div>
            </div>
          </article>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Data-entry rule</h3></div>
          <div class="workflow-note"><strong>Do not retype company data in child tabs.</strong> Use the Company Name dropdown. Gray “Auto” columns are lookup fields and should not be edited. Contacts have their own Contact ID so interactions and opportunities can reference the person without copying their phone/email details.</div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Google Workspace resources</h3></div>
          <div class="table-wrap"><table><thead><tr><th>Resource</th><th>Purpose</th><th></th></tr></thead><tbody>
            <tr><td><strong>TTT Vendor & Rep Directory</strong></td><td>Relational master for companies, contacts, brands/products, pricing, documents, evaluation, opportunities and interactions.</td><td><a class="link-btn" href="${DIRECTORY_URL}" target="_blank" rel="noopener">Open</a></td></tr>
            <tr><td><strong>Business Cards — Raw / 2026</strong></td><td>Original business-card source images. Each contact record links back to its card.</td><td><a class="link-btn" href="${RAW_CARDS_URL}" target="_blank" rel="noopener">Open</a></td></tr>
            <tr><td><strong>Vendors & Suppliers Drive</strong></td><td>Vendor documents, catalogs, product lines, pricing sources and prospective-vendor materials.</td><td><a class="link-btn" href="${VENDOR_ROOT_URL}" target="_blank" rel="noopener">Open</a></td></tr>
          </tbody></table></div>
        </div>`;
      const settings=document.getElementById('settings');
      main.insertBefore(section,settings||null);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injectVendorModule);
  else injectVendorModule();
})();
