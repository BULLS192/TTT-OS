# TTT OS

Internal operating system for Thompson Transportation Technologies (TTT).

## Purpose
TTT OS is the internal business platform for managing customers, vehicles, estimates, work orders, vehicle intake/condition documentation, technician workflow, quality control, delivery, warranties, inventory, scheduling, and reporting.

## Initial workflow
Lead → Customer → Vehicle → Estimate → Authorization → Vehicle Check-In → Condition Photos → Work Order → Technician Work → QC → Customer Approval → Payment → Delivery → Warranty Record

## v0.1 Modules
- Dashboard
- Customers
- Vehicles
- Estimates
- Work Orders
- Vehicle Check-In & Condition Photos
- Digital Signatures
- QC & Delivery
- Warranty Records

## Planned modules
- Scheduling
- Inventory & Parts
- Purchase Orders / Vendors
- Invoicing & Payments
- Technician Assignments
- Customer Communications
- CRM / Leads
- Reporting & Analytics
- Admin / Users / Roles
- Dealer / Customer Portal

## Architecture principle
The public TTT website and TTT OS remain separate applications. The public site may create leads or service requests in TTT OS later, while internal operational data stays inside TTT OS.
