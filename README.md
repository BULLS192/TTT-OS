# TTT OS

Internal operating system for Thompson Transportation Technologies (TTT).

## Current status — v0.1 foundation

TTT OS is now a working browser prototype, designed **single-operator-first for Derek** while keeping user IDs, roles, assignments and audit records in the data model so additional technicians/employees can be added later without a rewrite.

### Working now
- Operations dashboard
- Customer records
- Vehicle records
- Work-order list and statuses
- Protected new-work-order intake
- Vehicle type, VIN, mileage, keys received and personal-item notes
- Multiple photo capture/upload fields per vehicle view
- Damage/condition notes
- TTT service categories
- Equipment and scope documentation
- Estimate and lead-time capture
- Versioned Terms & Conditions acknowledgement
- Customer + TTT representative signatures
- Default assignment to Derek
- Audit-event creation
- Local browser persistence

> Photo binaries are previewed in the current prototype; production photo storage will move to hosted object storage.

## Open the prototype

This version has no build step.

1. Clone/download the repository.
2. Open `index.html` in a modern browser.
3. Use **Reset demo** to restore the sample records.

## Purpose

TTT OS is the internal business platform for managing customers, vehicles, estimates, work orders, vehicle intake/condition documentation, technician workflow, quality control, delivery, warranties, inventory, scheduling, and reporting.

## Core workflow

Lead → Customer → Vehicle → Estimate → Authorization → Vehicle Check-In → Condition Photos → Work Order → Work → QC → Customer Approval → Payment → Delivery → Warranty Record

## v0.1 Modules

- Dashboard
- Customers
- Vehicles
- Work Orders
- Vehicle Check-In & Condition Photos
- Estimates / authorization
- Digital signatures
- Warranty scaffold

## Planned modules

- Work-order detail view
- Photo annotation / damage markup
- QC & delivery workflow
- Scheduling
- Inventory & parts
- Purchase orders / vendors
- Invoicing & payments
- Customer communications
- CRM / leads
- Reporting & analytics
- Admin / users / roles
- Dealer / customer portal

## Scalability principle

Derek is the default v0.1 operator. The system is intentionally not hard-coded as a permanent single-user app. Work orders already reference `createdBy` and `assignedTo` users, and audit/media records reference the acting user. See `docs/DATA_MODEL.md`.

## Architecture principle

The public TTT website and TTT OS remain separate applications. The public site may create leads or service requests in TTT OS later, while internal operational data stays inside TTT OS.
