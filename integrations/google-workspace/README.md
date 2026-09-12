# TTT OS ↔ Google Workspace Bridge

This bridge keeps **TTT OS as the operator-facing application** while using the existing **TTT OS — Master Database v1** Google Sheet and TTT Operations Drive as the shared record layer.

## What the bridge currently supports

- Upsert customer/account and contact records
- Upsert vehicle records and create vehicle folders
- Upsert Jobs
- Upsert Quotes and Quote Lines
- Copy the native Google Docs quotation template into the job folder
- Populate quotation fields and create a PDF copy
- Record quote approvals and customer sign-off images
- Record deposits in Payments
- Record appointments
- Record grouped Check-In / Inspection counts and notes
- Upsert Work Orders and Work Order Lines after final authorization
- Email the generated quotation PDF through Gmail
- Record outbound quote email in Communications
- Record sync events in Sync Log

## One-time Google Apps Script deployment

1. Open **script.google.com** while signed into the Google account that owns or can edit the TTT Operations Drive.
2. Create a new Apps Script project named `TTT OS Google Workspace Bridge`.
3. Add three script files and copy the matching repository contents into them:
   - `Main.gs`
   - `Documents.gs`
   - `Helpers.gs`
4. In **Project Settings**, set the time zone to `America/Chicago`.
5. Run `setupTTTSync()` once from the Apps Script editor. Approve the requested Google Sheets, Drive, Docs, and Gmail permissions. The execution log will display a generated `TTT_SYNC_TOKEN`. Keep this token private.
6. Choose **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (the bridge still requires the private sync token on every POST request)
7. Copy the deployed `/exec` web-app URL.
8. In **TTT OS → Settings → Google Workspace**, paste:
   - Apps Script web app endpoint
   - Sync token
9. Click **Test Connection**, then **Sync All Jobs**.

## Security note

This v0.3 bridge is appropriate for a small internal deployment, but the long-term production architecture should move the Google credential/token behind a server-side TTT OS API instead of storing the shared bridge token in the browser.

## Record model

`Account → Contact → Vehicle → Job → Quote → Approval → Deposit / Parts / Schedule → Check-In → Final Authorization → Work Order → QC → Invoice / Payment → Delivery → Warranty`

Approved records are not meant to be overwritten. A changed approved scope should become a new quote version or Change Order.
