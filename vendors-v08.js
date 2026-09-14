// TTT OS v0.8 — Vendor & Supplier directory bridge
// Google Sheet remains the source of truth so TTT does not maintain duplicate vendor data.
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
        <div class="workflow-note"><strong>Single source of truth:</strong> Vendor, rep, brand, product, pricing, document and evaluation data live in the TTT Vendor & Rep Directory on Google Sheets. TTT OS surfaces the operating workflow without creating a second vendor database.</div>
        <div class="stats">
          <div class="stat"><span>Companies</span><strong>Google Sheet</strong></div>
          <div class="stat"><span>Sales reps</span><strong>Google Sheet</strong></div>
          <div class="stat"><span>Pricing</span><strong>Linked</strong></div>
          <div class="stat"><span>Raw cards</span><strong>Drive</strong></div>
        </div>
        <div class="grid two">
          <article class="panel">
            <div class="panel-head"><h3>Vendor workflow</h3></div>
            <div class="checklist">
              <div>1. Upload original business-card photos</div>
              <div>2. Create or match the company record</div>
              <div>3. Add the sales rep / contact</div>
              <div>4. Link brands, products and service categories</div>
              <div>5. Capture dealer pricing, terms and documents</div>
              <div>6. Evaluate and approve the vendor</div>
            </div>
          </article>
          <article class="panel">
            <div class="panel-head"><h3>TTT integration</h3></div>
            <div class="checklist">
              <div>✓ Vendor status: Prospect → Active / Rejected</div>
              <div>✓ Contacts and territory ownership</div>
              <div>✓ Brands and product lines</div>
              <div>✓ Pricing and margin inputs</div>
              <div>✓ Vendor documents and catalogs</div>
              <div>✓ Future links to Inventory, Pricing Configurator and Create Job</div>
            </div>
          </article>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Google Workspace resources</h3></div>
          <div class="table-wrap"><table><thead><tr><th>Resource</th><th>Purpose</th><th></th></tr></thead><tbody>
            <tr><td><strong>TTT Vendor & Rep Directory</strong></td><td>Master companies, contacts, brands/products, pricing, documents, evaluation and opportunities.</td><td><a class="link-btn" href="${DIRECTORY_URL}" target="_blank" rel="noopener">Open</a></td></tr>
            <tr><td><strong>Business Cards — Raw / 2026</strong></td><td>Original card photos supplied by Derek. Preserve the source files unchanged.</td><td><a class="link-btn" href="${RAW_CARDS_URL}" target="_blank" rel="noopener">Open</a></td></tr>
            <tr><td><strong>Vendors & Suppliers Drive</strong></td><td>Vendor documents, brands/product lines, prospective vendors and source materials.</td><td><a class="link-btn" href="${VENDOR_ROOT_URL}" target="_blank" rel="noopener">Open</a></td></tr>
          </tbody></table></div>
        </div>`;
      const settings=document.getElementById('settings');
      main.insertBefore(section,settings||null);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injectVendorModule);
  else injectVendorModule();
})();
