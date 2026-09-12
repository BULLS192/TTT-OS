# TTT OS Architecture

## Product boundaries

TTT OS is the internal operations platform for Thompson Transportation Technologies. The public TTT marketing website remains a separate repository/application.

### Public TTT website
- Marketing and service pages
- Testimonials
- Lead capture
- Future customer/dealer portal entry points
- Future e-commerce

### TTT OS
- Customers and CRM
- Vehicles
- Estimates and authorizations
- Vehicle intake / condition documentation
- Work orders
- Technician workflow
- Quality control
- Delivery
- Warranty records
- Inventory / parts / vendors
- Scheduling
- Invoicing and operational reporting
- Users, roles and audit trail

## Core workflow

1. Lead / service request
2. Customer record
3. Vehicle record
4. Estimate
5. Customer authorization
6. Vehicle check-in
7. Condition inspection and photos
8. Work order
9. Technician assignment and installation
10. Quality control
11. Customer approval / completion
12. Payment
13. Vehicle delivery
14. Warranty record / future service history

## Core entities

### Customer
One customer may own multiple vehicles and have multiple work orders.

### Vehicle
One vehicle belongs to a customer and may have many estimates, inspections, work orders and warranty records.

### Estimate
Contains proposed services, products/equipment, labor, taxes/fees, notes, estimated completion and authorization status.

### Inspection
Captures vehicle condition at check-in, mileage, fuel/charge level, keys received, belongings, photos, existing damage, technician/customer notes and signatures.

### Work Order
The central operational record. Links customer, vehicle, estimate, services, equipment, technicians, inspection, photos, status, timing, costs and approvals.

### Work Order Line
A service/product/labor line attached to a work order. Supports multiple services and multiple equipment items per job.

### Media / Photo
Photos and other evidence tied to inspection, work-order stages, QC, incidents and delivery. Each image should retain timestamp, uploader, category/view and annotations where supported.

### Signature / Authorization
Records what was agreed to, signer role, timestamp, terms version and associated estimate/work order/inspection.

### Warranty
Tracks workmanship and equipment warranties, start/end dates, exclusions, claims and resolution.

### Incident
Documents unexpected damage, failures, customer property issues or other events, including evidence, timeline and resolution.

## Protection / audit principles

TTT OS should preserve an auditable record that protects both the customer and TTT:

- Timestamp all important events.
- Never silently overwrite signed/authorized terms.
- Store the exact terms/disclaimer version accepted by a signer.
- Keep before/during/after photos linked to the job.
- Record who performed important actions.
- Separate customer-reported condition from technician-observed condition where useful.
- Record estimate changes and customer approvals.
- Record added work/change orders separately.
- Preserve delivery/QC evidence.
- Provide printable/PDF snapshots of signed records.

## Initial release target (v0.1)

Build a usable shop workflow around:

Dashboard → Customers → Vehicles → Estimates → Check-In → Work Orders → QC → Delivery / Warranty

The existing work-order prototype is treated as UX/requirements input for this release, not as the final architecture.
