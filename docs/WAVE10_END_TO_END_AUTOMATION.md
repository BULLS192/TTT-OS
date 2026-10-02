# Wave 10 — End-to-End Job & Document Automation

## Goal

A customer should be able to move from intake through vehicle release without staff retyping the same customer, vehicle, scope, pricing, payment or document data.

## Production workflow

Intake → Quote → Check-In + condition media → Customer Authorization → Work Order → Change Orders → QC → Invoice → Payment → Handover → Warranty → Close

SignalTrace work branches through DIA → structured diagnostics → DFR → DRA when findings convert to repair work.

## Wave 10 controls

- Canonical finalized PDFs are generated server-side by `ttt-document-pdf`.
- Canonical PDFs are stored in the private `document-artifacts` bucket.
- Each PDF has its own SHA-256 hash and source-document hash reference.
- Finalized document records remain immutable.
- Customer sign-off uses a responsive review screen with an explicit acknowledgement before signature.
- Customer Authorization displays check-in condition photographs before signature.
- Invoice creation uses the approved Quote plus approved Change Orders.
- Payment records automatically recalculate invoice amount paid and balance due.
- Receipts are generated from payment source records through the controlled-document engine.
- Handover packages surface all applicable final documents and service handoffs.
- Service-specific controls cover tint, customer-supplied equipment, connected devices, security systems, and commercial/fleet work.
- Controlled workflow overrides require a reason and admin approval.
- Template releases are versioned; legal-review/draft templates cannot be sent as released customer documents.
- Compliance & Workflow v2 surfaces missing canonical PDFs, outdated document versions, overdue invoices, warranty gaps, open claims/RMAs and pending legal releases.

## Service branching

### Window tint
CHK → AUTH → TINT → WO/QC → INV → COMP → RCPT/WAR

### Connected electronics
AUTH → WO/QC → DEV + SUB → INV → COMP

### Security / immobilizer / kill switch
AUTH → WO/QC → SEC → INV → COMP

### Customer-supplied equipment
CSE must be completed before work authorization.

### Dealer / fleet
FWA and DRO are inserted when the job is commercial/fleet and reaches scheduling.

## Exception controls

Available controlled override codes:

- AUTH_OVERRIDE
- QC_OVERRIDE
- DELIVERY_OVERRIDE
- CLOSE_OVERRIDE

Creating an exception does not bypass a gate. The exception must reach `approved` status, and database triggers restrict approval to TTT owner-admin users.

## Template release states

- draft
- legal_review
- approved
- retired

Historical documents retain their original template version. New customer delivery is blocked for draft or legal-review templates.

## Delivery

Wave 10 preserves the delivery audit ledger and canonical PDF linkage. Transactional provider delivery requires an external mail-provider credential before TTT-OS can send attachments directly. Until then, opening an email draft is logged only as a draft action and never treated as proof of delivery.

## Automated simulations

CI covers:

1. Standard retail tint/audio job.
2. SignalTrace diagnostic-to-repair workflow.
3. Dealer/fleet GPS + security workflow.
4. Partial-to-full payment reconciliation.

The simulations validate the document requirements and service branching without leaving synthetic production records.
