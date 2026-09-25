# TTT CRM + ERP + Dealer Catalog Architecture

Status: Architecture lock — 2026-09-25

## System ownership
- Supabase is the canonical operational system of record.
- TTT OS is the primary user interface.
- Google Drive owns source documents and generated business documents.
- Google Sheets is a reporting, analysis, controlled bulk-edit/import/export surface; it is not a second master database.
- Google Workspace integrations may mirror or publish approved data, but must not create competing truth.

## Shared CRM/ERP flow
Lead -> Opportunity -> Quote -> Customer/Company/Contact -> Vehicle -> Job/Work Order -> Invoice -> Payment

Vendor -> Dealer Catalog -> Product Master -> Inventory -> Purchase Order -> Receiving -> Job Consumption -> Actual Job Margin

## Dealer catalog model
Dealer catalogs are supplier-specific commercial records, not the Product Master itself.

products_services:
Canonical TTT product/service identity. One stable TTT SKU per sellable inventory variant.

supplier_products:
Supplier/dealer relationship for a product: dealer SKU, dealer cost, MAP, MSRP, MOQ, lead time, effective/expiry dates, preferred supplier, source document.

product_price_history:
Append-only history for supplier cost, MAP/MSRP and TTT selling-price changes.

inventory_items:
Current stock position by product/location: on hand, reserved, reorder point/quantity, average cost.

inventory_transactions:
Movement ledger for receiving, reservation, release, consumption, adjustment, return and transfer.

vendors + companies:
Supplier/dealer account, terms, categories, represented brands and commercial relationship.

documents:
Google Drive references for confidential price lists, POs, invoices, contracts and other source evidence.

## Catalog ingestion rule
1. Archive original supplier/dealer document in Google Drive.
2. Register source document in Supabase.
3. Parse/import rows into staging or supplier_products as Reference status.
4. Validate model/variant/SKU/price alignment.
5. Match or create canonical Product Master record and TTT SKU.
6. Promote validated supplier relationship/prices.
7. Record price history.
8. TTT OS reads authenticated Supabase records, never confidential dealer-cost data from a public static JS bundle.

## Pricing rule
Supplier cost is vendor-specific. TTT selling price belongs to the canonical TTT product. Quote lines snapshot both unit cost and unit selling price so later catalog changes never rewrite historical quote/job profitability.

## Inventory rule
Inventory quantities must be transaction-driven. Purchase receiving adds stock; quote/job reservation reserves stock; cancellation releases it; job consumption reduces it; adjustments require an inventory transaction/audit trail.

## Google Sheets rule
Sheets can show synchronized CRM/ERP data and support controlled imports/bulk edits. Any accepted edit must write back to Supabase through the integration layer. Sheets must not independently calculate or own live inventory balances.

## Current catalog caution
The existing 940-row BlackVue/JL catalog snapshot is reference/staging data. It must be validated against source documents before becoming quote-ready Product Master data, because some PDF-extracted BlackVue rows have model/price alignment issues.

## Coordination rule
New CRM/ERP work should extend these shared canonical entities instead of creating parallel product, vendor, inventory, quote, purchasing, customer or job databases.
