# TTT CRM + ERP + Catalog Architecture

Status: Supabase-first architecture — 2026-09-27

## System ownership
- **Supabase is the canonical operational system of record.**
- **TTT-OS is the primary operating interface.**
- Browser/local storage is a compatibility cache only where older modules still require it; it is not authoritative.
- External communication or document providers may be integrated later through provider-neutral references, but no external office suite, spreadsheet, or file service may act as a mirror database or competing source of truth.

## Shared CRM/ERP flow
Lead → Opportunity → Quote → Customer / Company / Contact → Vehicle → Job → Work Order → Invoice → Payment

Supplier → Supplier Catalog → Product Master → Inventory → Job Consumption → Actual Job Margin

## Product and supplier catalog model
Supplier catalogs are source/reference commercial records. They are not the Product Master.

### `products_services`
Canonical TTT identity for products, materials, services and labor. Each active record receives a stable TTT SKU.

### Raw Supplier Catalog
The current reference snapshot contains:
- 940 raw supplier rows
- 84 BlackVue rows
- 856 JL Audio rows
- 862 unique physical catalog items after deduplication

The canonical Product Master currently contains those 862 physical products plus 12 services and 4 labor records, for 878 total pricing records.

### `supplier_products`
Future normalized supplier relationship layer: dealer SKU, dealer cost, MAP/MSRP, MOQ, lead time, effective dates, preferred supplier and source-document reference.

### `product_price_history`
Append-only price/cost history.

### `inventory_items`
Current stock position by product/location: on hand, reserved, reorder point, reorder quantity and average cost.

### `inventory_transactions`
Movement ledger for receiving, reservation, release, consumption, adjustment, return and transfer.

## Catalog ingestion rule
1. Register the supplier source document/reference.
2. Parse supplier rows into a staging/reference layer.
3. Validate model, variant, SKU and price alignment.
4. Match or create the canonical Product Master record.
5. Assign/retain the TTT SKU.
6. Promote validated supplier pricing.
7. Record price history.
8. TTT-OS reads authenticated Supabase records for operational pricing and inventory.

## Pricing rule
Supplier cost is supplier-specific. TTT selling price belongs to the canonical TTT item. Quote lines snapshot unit cost and selling price so later catalog changes never rewrite historical quote/job profitability.

## Inventory rule
Inventory quantities should ultimately be transaction-driven. Receiving adds stock; job reservation reserves stock; cancellation releases it; work-order consumption reduces it; adjustments require an auditable inventory transaction.

## Document/reference rule
Operational records may contain provider-neutral fields such as `document_id`, `document_url`, `storage_file_id`, `storage_url`, or other external-reference IDs. Those references must never turn an external provider into a second operational database.

## Coordination rule
New CRM/ERP work must extend the shared canonical entities rather than creating parallel product, vendor, inventory, quote, purchasing, customer or job databases.
