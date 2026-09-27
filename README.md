# TTT OS

Internal operating system for Thompson Transportation Technologies (TTT).

## Current architecture

TTT OS is a multi-user operational web application backed by Supabase.

- **Supabase** is the authoritative operational system of record.
- **TTT OS** is the primary user interface.
- Browser storage is compatibility/cache only for legacy modules and must not act as a competing database.
- Business documents and attachments use provider-neutral references; storage/document tooling is not part of the data-ownership model.

## Core workflow

Lead → Opportunity → Quote → Customer → Vehicle → Job → Work Order → Operations / Scheduling → Change Order → QC → Delivery → Invoice → Job Costing

## Active areas

- Sales & CRM
- Customers and vehicle history
- Jobs and work orders
- Configurable scheduling bays/resources and service-time templates
- Check-in, condition documentation, authorization, QC and delivery
- ERP Inventory and Pricing
- Supplier Catalog
- Expenses and multi-Job / Work-Order allocation
- Quotes and Invoices
- Job Costing
- Personnel, skills, availability and time off
- Service & Warranty
- Supabase authentication, organization isolation, realtime synchronization and audit history

## Catalog model

The raw supplier source snapshot currently contains 940 rows:
- BlackVue: 84
- JL Audio: 856

These deduplicate to 862 canonical supplier products:
- BlackVue: 84
- JL Audio: 778

The Pricing Master currently contains 878 active priced records:
- 862 products
- 12 services
- 4 labor records

The counts differ intentionally because Pricing includes TTT-created services and labor in addition to physical supplier products.

## Development principle

Extend the canonical Supabase entities rather than creating parallel data stores. New work should preserve the single-source-of-truth model and be covered by regression tests as the application is hardened for daily operations.
