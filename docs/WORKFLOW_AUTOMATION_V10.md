# TTT-OS Workflow Automation v1.0

## Purpose

This module turns the Waves 1-9 controlled document registry into an operational workflow engine. Supabase remains the system of record; Google Drive remains the controlled master-template library.

## Automated source mappings

| Operational source | Controlled document |
|---|---|
| Approved / active Quote | Q — Quotation / Estimate |
| Completed check-in / job media | CHK — Vehicle Check-In & Condition Report |
| Check-in ready for customer sign-off | AUTH — Customer Authorization |
| Work Order | WO — Work Order |
| Change Order | CO — Change Order |
| QC stage | QC — QC & Final Inspection |
| Invoice | INV — Invoice |
| Payment | RCPT — Payment Receipt |
| Deposit payment metadata | DEP — Deposit Receipt |
| Ready for Pickup | COMP — Job Completion & Handover |
| Warranty record | WAR — Warranty Certificate |
| Diagnostic job | DIA — Inspection & Diagnostic Authorization |
| Diagnostic findings ready | DFR — Diagnostic Findings Report |
| Diagnostic conversion to repair | DRA — Diagnostic-to-Repair Authorization |
| Purchase Order | PO — Purchase Order |
| PO receiving activity | GRN — Goods Receiving Report |
| Inventory adjustment transaction | IAJ — Inventory Adjustment Record |
| Stock-transfer transaction | STR — Stock Transfer Record |
| Expense ledger record | EXP — Expense Report |
| Any controlled Job documents | JDR — Job Audit & Document Register |

Documents are keyed to their source record through `source_entity_type` and `source_entity_id`. A partial unique index prevents duplicate controlled records from being generated for the same source event.

## Core workflow gates

1. A Work Order cannot begin until the Customer Authorization is finalized.
2. Customer Authorization is created only after check-in evidence exists.
3. SignalTrace diagnostic execution requires a finalized DIA.
4. A vehicle cannot leave QC until QC is finalized.
5. Vehicle delivery requires an Invoice and finalized Handover acceptance.
6. Job closure requires finalized Handover.
7. Finalized document records remain immutable; corrections use superseding records.

## SignalTrace

Diagnostic cases are structured as:

SCAN → ISOLATE → TRACE → VERIFY → RESOLVE

The diagnostic case is operational data. DIA, DFR and DRA are controlled evidence generated from that case.

## Delivery log

Document delivery events are stored independently from the immutable document itself. Current channels support email-draft logging, sent confirmation, download/PDF logging, SMS/portal/vendor-email placeholders and future provider integrations.

Opening a mail client is not treated as proof of delivery. The event is recorded as `draft_opened` until a user or future provider confirms `sent` / `delivered`.

## Compliance dashboard

The Compliance & Workflow view surfaces:

- blocking Job controls;
- pending signatures;
- open workflow exceptions;
- open diagnostics;
- POs pending receipt;
- legal-review draft templates;
- draft/finalized document counts; and
- logged document-delivery activity.

## Data protection

New public-schema tables have explicit authenticated grants, RLS, organization-membership policies, and anonymous access revoked. This also prepares TTT-OS for Supabase's 2026 Data API default-exposure change.

## Source files

- `workflow-automation-v10.js`
- `workflow-automation-v10.css`
- `document-system-v09.js`
- `supabase/migrations/20261002073620_workflow_automation_depth_v1.sql`
- `supabase/migrations/20261002073902_document_source_uniqueness_v1.sql`
