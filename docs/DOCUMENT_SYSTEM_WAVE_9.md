# TTT Document System — Waves 1–9

## Authority and storage

TTT-OS / Supabase is the system of record.

- `document_templates` is the canonical Wave 1–9 template registry.
- `documents` is the canonical generated-document register.
- Google Drive stores controlled master/working templates and customer-facing reference artifacts.
- `job-media` stores private condition media and digital signature images.
- `audit_events` records document lifecycle actions.
- Finalized `documents` rows are protected by the production `documents_finalized_immutable` trigger.
- Corrections to finalized records are handled by a superseding record, never mutation.
- Document numbers use `next_ttt_document_number(organization_id, code)`.

Working Drive library:
https://drive.google.com/drive/folders/1No58OlE_yjOVg5T2WhDGcuNIEjytmxLF

Drive process map:
https://docs.google.com/document/d/10uGJanrRCejJz4vc-MYOAvbYaA8EuywCrNi8vYELT8E/edit

## Standard job lifecycle

Intake → Q → CHK + required photos → AUTH → WO → CO(s) if needed → QC → INV → RCPT → COMP → WAR

Customer Authorization is a blocking gate. TTT-OS requires these minimum condition views before authorization:

- Front
- Rear
- Driver Side / Left
- Passenger Side / Right
- Front Interior
- Dashboard / Mileage

The authorization preview displays every stored check-in image. Finalization stores the exact image IDs/storage paths in the immutable document snapshot and persists the signature image to private job media.

## SignalTrace / diagnostic lifecycle

Intake → DIA → CHK + photos → DFR → DRA when diagnostics convert to repair → WO → QC → INV → COMP → WAR

SignalTrace findings should follow SCAN → ISOLATE → TRACE → VERIFY → RESOLVE.

## Registry

| Wave | Codes | Purpose |
|---|---|---|
| 1 | Q, CHK, AUTH, WO, CO, QC, INV, PO, RCPT, COMP, WAR | Core customer job pack |
| 2 | DIA, DFR, DRA | Diagnostics / pre-repair |
| 3 | TNC, PRIV, MEDIA, CSE, TINT, REL | Customer protection / legal |
| 4 | INC, WCL, CRR, DEC, UNCL | Exceptions / claims / risk |
| 5 | GRN, RMA, IAJ, STR | Purchasing / inventory |
| 6 | AP, CM, DEP, EXP, STM | Finance / accounting |
| 7 | DEV, SEC, SUB | Connected electronics / security |
| 8 | CCA, CSI, DRO, FWA, MSA, SLA | B2B / dealer / fleet |
| 9 | DVR, JDR, SER, TRN, TSA | Governance / audit |

Production currently contains 48 active template controls. Wave assignment and codes in Supabase are authoritative when they differ from older planning notes.

## Legal-review boundary

TNC, PRIV, DIA/DRA where flagged, tint/customer-supplied-equipment clauses, MSA, CCA, SLA and any other template marked `legal_review_required` remain drafts until qualified Texas counsel approves the customer-facing language.

## Implementation

`document-system-v09.js`:
- loads templates and generated records from Supabase
- renders Documents & Compliance
- renders per-job Document Register
- evaluates required/conditional documents from template metadata
- reconciles existing Quote / Check-In / Authorization / Work Order / Invoice sources
- creates numbered document records
- displays actual check-in photos on AUTH
- captures and stores digital signature
- hashes and finalizes immutable snapshots
- intercepts existing Work Order authorization until AUTH is finalized

`document-system-v09.css` provides registry, evidence-gallery, signature, print and responsive layouts.

`tests/document-system-wave9-v01.cjs` is the static regression contract.

The authenticated Playwright test verifies check-in photo gating, exact photo rendering and the signature surface but deliberately does not finalize a test authorization because finalized production documents are immutable and test artifacts must not be left behind.
