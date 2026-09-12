# TTT OS v0.1 Data Model

TTT OS is single-operator-first, not single-user-only.

## Design rule

Derek is the default operator in v0.1. Records still store user IDs for creators, assignees, signers and audit actors. This allows TTT to add employees or technicians later without restructuring customer, vehicle or work-order records.

## Entities

### users
- id
- name
- email
- role
- active
- created_at

Initial user: Derek Thompson.

Planned roles:
- owner_admin
- manager
- technician
- service_advisor
- office
- read_only

A single person may eventually hold multiple permissions.

### customers
- id
- first_name
- middle_name
- last_name
- display_name
- phone
- email
- address_line_1
- address_line_2
- city
- state/province
- postal_code
- country
- notes
- created_at
- updated_at
- created_by

### vehicles
- id
- customer_id
- VIN
- year
- make
- model
- trim
- color
- wrap / PPF / exterior finish
- vehicle_type
- plate/state
- mileage
- fuel_or_charge_level
- keys_received
- customer_notes
- created_at
- updated_at

### work_orders
- id
- customer_id
- vehicle_id
- status
- assigned_to_user_id
- created_by_user_id
- estimate_total
- deposit
- estimated_completion
- pickup/delivery method
- scope
- equipment
- terms_version
- created_at
- updated_at
- completed_at

### work_order_lines
Allows unlimited service, labor, equipment and fee lines rather than hard-coded fields.
- id
- work_order_id
- line_type
- service_category
- description
- manufacturer
- model
- SKU/serial
- quantity
- unit_price
- labor_hours
- taxable

### inspections
Separate inspection records preserve check-in and delivery condition.
- id
- work_order_id
- inspection_type (check_in / pre_work / QC / delivery)
- mileage
- fuel_or_charge
- keys_received
- belongings
- condition_notes
- inspected_by_user_id
- timestamp

### media
- id
- work_order_id
- inspection_id
- media_type (photo / video)
- category/view
- file/storage URL
- captured_at
- uploaded_by_user_id
- annotation data
- caption
- checksum (future)

Multiple media records may use the same category, so multiple front/rear/side/interior/engine-bay/trunk/damage photos are supported. Video records are also supported for walkarounds, interior condition and functional/damage evidence.

### signatures
- id
- work_order_id
- signer_type
- signer_name
- signature asset
- signed_at
- terms_version
- authorization_type

### terms_versions
Signed terms must not silently change.
- id/version
- title
- full text
- effective_at
- retired_at

### warranties
- id
- work_order_id
- work_order_line_id
- warranty_type
- provider
- start_at
- end_at
- terms
- status

### incidents
- id
- work_order_id
- reported_at
- reported_by_user_id
- description
- severity
- resolution
- closed_at

### audit_events
Append-only operational history.
- id
- entity_type
- entity_id
- action
- actor_user_id
- timestamp
- before/after metadata where appropriate

## v0.1 local persistence

The current browser build uses localStorage for fast prototyping. Photo binaries are previewed in-browser while only photo metadata is stored. This is intentionally not the production storage model.

## Production migration

When TTT OS moves to hosted production, replace the local adapter with:
1. PostgreSQL/Supabase relational tables.
2. Object storage for photos and signed PDFs.
3. Authentication and role-based access.
4. Row-level authorization.
5. Append-only audit events.
6. Backups and retention policy.

The UI/business workflow can remain substantially the same because records already use stable entity IDs and user references.
