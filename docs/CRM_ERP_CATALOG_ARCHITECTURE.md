# TTT CRM + ERP + Dealer Catalog Architecture

Status: Supabase-only operational architecture — 2026-09-27

## System ownership
- **Supabase is the authoritative operational system of record.**
- **TTT OS is the primary user interface.**
- Business documents, media and attachments are represented through provider-neutral document/storage references.
- No spreadsheet, browser cache, external document store or integration is permitted to act as a second master database.
- Browser/local state is compatibility/cache only and must never override newer authoritative relational rows.

## Shared CRM / Operations / Finance flow
Lead -> Opportunity -> Quote -> Customer / Company / Contact -> Vehicle -> Job -> Work Order -> Invoice -> Payment

Vendor / Supplier -> Supplier Catalog -> Product Master -> Inventory -> Purchase Order -> Receiving -> Job Consumption -> Actual Job Margin

## Product and supplier model
### products_services
Canonical TTT item identity. Products, materials, services and labor all receive a stable TTT SKU.

### supplier_products
Supplier-specific commercial relationship for a canonical product: dealer SKU, cost, MAP/MSRP, MOQ, lead time, effective dates and preferred supplier.

### product_price_history
Append-only history for supplier cost and TTT selling-price changes.

### inventory_items
Current stock position by product/location: on hand, reserved, reorder point/quantity and average cost.

### inventory_transactions
Movement ledger for receiving, reservation, release, consumption, adjustment, return and transfer.

### companies
Canonical business-party record used for customers, suppliers, distributors, vendors, partners and other organizations.

### documents
Provider-neutral references for source evidence and generated business documents. Storage location is an implementation detail and must not determine business ownership.

## Catalog ingestion rule
1. Retain the original supplier/dealer source document as source evidence.
2. Register the source document/reference in Supabase.
3. Parse/import source rows into staging or supplier reference data.
4. Validate model / variant / dealer SKU / price alignment.
5. Match or create the canonical Product Master record and TTT SKU.
6. Promote validated supplier relationships and prices.
7. Record price history.
8. TTT OS reads authenticated Supabase records; confidential dealer cost must never depend on a public static bundle.

## Pricing rule
Supplier cost is supplier-specific. TTT selling price belongs to the canonical TTT item. Quote lines snapshot unit cost and selling price so later catalog changes never rewrite historical quote or Job profitability.

## Inventory rule
Inventory is transaction-driven. Receiving adds stock; Job reservation reserves stock; cancellation releases it; consumption reduces it; returns and adjustments create explicit transactions and audit history.

## Current catalog reconciliation
The supplier source snapshot contains **940 raw rows**:
- BlackVue: 84 raw rows
- JL Audio: 856 raw rows

After deterministic deduplication there are **862 canonical supplier products**:
- BlackVue: 84 unique products
- JL Audio: 778 unique products

The Pricing Master contains **878 active priced records**:
- 862 products
- 12 services
- 4 labor records

These counts intentionally differ because the Pricing Master includes TTT-created service and labor records in addition to supplier products.

## Coordination rule
New CRM/ERP/Operations work must extend these canonical entities rather than create parallel customer, Job, quote, product, inventory, supplier or finance databases.
