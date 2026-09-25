# TTT Google Workspace Bridge

This Apps Script is the controlled integration layer between TTT-OS/Supabase and Google Workspace.

## Ownership
- Supabase = canonical operational database.
- TTT-OS = primary application UI.
- Google Sheets = controlled mirror, bulk-edit/import/export and analysis surface.
- Gmail = customer/vendor communication.
- Google Calendar = appointments.
- Google Drive = source and generated documents.

## Install
Create a standalone Apps Script project or attach one to the TTT CRM/ERP workbook. Copy `Code.gs`, then set these Script Properties:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TTT_SYNC_TOKEN`
- `TTT_SPREADSHEET_ID`
- `TTT_ORGANIZATION_ID`
- `TTT_DRIVE_ROOT_ID`

The Supabase service-role key must remain only in Apps Script Script Properties. Never place it in TTT-OS browser code, a Sheet cell, GitHub, or a public environment variable.

## First run
Run `setupAndInitialSync()` from the Apps Script editor and authorize Sheets, Gmail, Calendar, Drive and UrlFetch scopes.

This fills every `DB_*` mirror tab, including the 500+ row product catalog.

## Web app
Deploy as a Web App and use the deployment URL as the TTT-OS Google Workspace bridge endpoint. The caller must send the shared `TTT_SYNC_TOKEN`.

Supported actions:
- `health`
- `syncAll`
- `syncTable`
- `syncEntity`
- `sendEmail`
- `calendarUpsert`
- `driveFolderEnsure`

## Data safety
Legacy Google Sheet tabs remain untouched during v1 migration. The new `DB_*` tabs match Supabase column names exactly. Sheets edits must use controlled writeback; inventory movements and sync logs are append-only, while personnel and Workspace links remain Supabase-primary.
