# TTT CRM/ERP Google Workspace Bridge

This bridge powers the new **TTT Business Operations — CRM & ERP** workbook.

**Workbook:** https://docs.google.com/spreadsheets/d/1N67KaF8q-0FnVaYN41zI5lTVlUoj06pHNAuF1TQrJ8I/edit

## Architecture

```
Google Sheets ↔ Apps Script ↔ Supabase workspace-api ↔ TTT-OS
                 ↘ Gmail / Calendar / Drive
```

Supabase is the canonical database. Google Sheets is the human-editable Workspace operations surface.

## Authentication

No TTT password and no Supabase secret key is stored in the Sheet or Apps Script.

Apps Script sends the current Google user's OAuth access token to the Supabase `workspace-api` Edge Function. The function validates that token with Google, reads the verified email, and permits access only when that email matches an active TTT-OS profile. Database operations are restricted to a fixed table allowlist and the matched TTT organization.

## Existing Google bridge

The existing `integrations/google-workspace` project and **TTT OS — Master Database v1** remain intact during migration. They currently contain mature quote, work-order, document, inspection and approval workflows. This CRM/ERP v1 bridge does not overwrite that deployed web app.

## Install

The available Google Drive connector cannot attach Apps Script source to a Sheet, so there is one manual step:

1. Open the CRM/ERP workbook.
2. Extensions → Apps Script.
3. Replace `Code.gs` with the file in this folder.
4. Enable the manifest in Project Settings and replace `appsscript.json` with this folder's manifest.
5. Reload the workbook and choose **TTT Workspace → Verify TTT access**.

Google will request the scopes required for Sheets, Gmail send, Calendar events, Drive file creation, external requests, and the signed-in user's email.

Optional Script Property:
- `TTT_DRIVE_ROOT_FOLDER_ID` — parent folder for customer/company folders.

## Functions

- Verify TTT access with the signed-in Google identity.
- Pull all synchronized tables from Supabase.
- Pull one active sheet.
- Push the active row or active sheet.
- Send templated Gmail and log an Activity.
- Create Calendar events from Appointments and persist Google event IDs.
- Create Company/Customer Drive folders and persist folder IDs.
- Install an optional hourly **pull-only** refresh.

Start with manual push/pull until real production records have been validated.

## Migration

The legacy master workbook contains modules not yet normalized in Supabase: Work Orders, Inspections, QC, Change Orders, Warranties, Communications, Labor Rates, Pricing Rules and several operational support tables. Those are preserved as migration sources for the next schema waves.
