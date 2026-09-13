# TTT OS Document Placeholder Standard

TTT OS documents should be formatted and functionally complete before final brand/media assets are locked. Final assets are inserted through stable slots so document layout does not need to be rebuilt.

## Global asset slots

- `BRAND_LOGO` — approved TTT logo / document lockup.
- `COMPANY_CONTACT` — final address, phone, email, website and related contact data.
- `VEHICLE_MEDIA` — document-specific vehicle, condition, installation, before/after or project media.
- `CUSTOMER_SIGNATURE` — digital or scanned customer signature / approval mark.
- `PAYMENT_INSTRUCTIONS` — accepted payment methods, remittance instructions and related payment details.
- `LEGAL_FOOTER` — final entity/legal/registration/footer information.

## Design rule

Placeholder content is intentionally visually neutral. Layout, typography, spacing, hierarchy, tables, totals, signatures, document IDs, page breaks, print/PDF behavior and workflow logic should be finalized independently of final brand/media assets.

When an asset is approved, replace the relevant slot globally rather than changing individual document layouts.

## Documents using the system

- Quotation / Estimate
- Invoice
- Vehicle Check-In & Condition Report
- Work Order
- Change Order (planned)
- QC / Completion Report (planned)
- Delivery / Handover Record (planned)
- Warranty Certificate (planned)
- Receipt / Payment Record (planned)

## Current implementation

The in-app Document Viewer uses these placeholder slots as of v0.5. Google Docs automation templates should mirror the same slot names as they are updated.
