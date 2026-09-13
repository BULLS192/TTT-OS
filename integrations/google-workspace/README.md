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

## Deploy to the existing Apps Script project with clasp

The project is already configured in `.clasp.json`. `deployment.json` records the
existing deployment ID, endpoint, and Web App settings:

- Script ID: `1uyHh7MH9w1Cd4YwkbALZLrDp1VSc7Y36KvLzpKUsL2KFnyxSN-blEKqC`
- Deployment ID: `AKfycbzabX-1E6UARND0SNUtWtpY8AO5NHk546PwGkCYtgnUzWLI0Xg6z2Azu6Q9sK21yN4g`
- [Existing Web App endpoint](https://script.google.com/macros/s/AKfycbzabX-1E6UARND0SNUtWtpY8AO5NHk546PwGkCYtgnUzWLI0Xg6z2Azu6Q9sK21yN4g/exec)

`appsscript.json` was copied from the existing project, verified against deployed
version 1 on 2026-09-13. It preserves `America/Chicago`, V8, `USER_DEPLOYING`,
`ANYONE_ANONYMOUS`, and the existing dependency/logging settings. The empty
`Code.gs` stub is also preserved from the remote project. `Main.gs`, `Helpers.gs`,
and `Documents.gs` remain the local source of truth.

### Prerequisites

PowerShell, Node.js, and `@google/clasp` 3.4.1 are supported. The CLI is already
installed on the configured workstation. For another workstation:

```powershell
npm install --global @google/clasp@3.4.1
clasp login
```

Use the account authorized for the existing project. The
[Apps Script API](https://script.google.com/home/usersettings) must be enabled.
Keep OAuth credentials outside Git. There is no need to create a project, run
`setupTTTSync()`, regenerate a token, or edit browser connection settings.

### Release commands

Run from the repository root, in this order, stopping if a command fails:

```powershell
# Confirm only appsscript.json and the four .gs files will be uploaded.
./integrations/google-workspace/clasp.ps1 -Action Status

# Update existing project source. This does not update the versioned Web App.
./integrations/google-workspace/clasp.ps1 -Action Push

# Snapshot the uploaded source; note the version number printed by clasp.
./integrations/google-workspace/clasp.ps1 -Action Version -Description 'Account type mapping fix'

# Replace 2 with the version number just returned, not an assumed next number.
./integrations/google-workspace/clasp.ps1 -Action Deploy -VersionNumber 2 -Description 'Account type mapping fix'
```

Add `-WhatIf` to Push, Version, or Deploy to inspect the command without changing
Google. Deploy calls `clasp redeploy <existing-id> --versionNumber <number>`;
it never calls the new-deployment command and refuses a missing version number.
The helper also rejects mismatched project IDs, endpoints, or Web App settings.
It works from any directory because it runs clasp inside this bridge directory.

Google documents that [updating the existing deployment to a new version preserves
its URL and deployment ID](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
The helper does not modify Script Properties, Sheet/Drive IDs, or deployment access.

`clasp push` replaces the entire remote source file set. `.claspignore` includes
only the existing four script files and manifest, excluding deployment helpers
and metadata. If files are later added in the online editor, bring them into the
repository and update the allowlist before pushing. Do not run `clasp pull` or
`clasp clone` in this directory over the maintained local scripts.

No remote push, version creation, or deployment update is performed by configuration
or Status. See the [clasp command reference](https://github.com/google/clasp) for
the underlying commands.

## Security note

This v0.3 bridge is appropriate for a small internal deployment, but the long-term production architecture should move the Google credential/token behind a server-side TTT OS API instead of storing the shared bridge token in the browser.

## Record model

### Account Type mapping

`Accounts.Account_Type` accepts `Retail`, `Dealer`, `Fleet`, `Business`, and
`Consulting`. The bridge uses the first recognized value from customer
`accountType`, customer `Account_Type`, job `accountType`, then job `Account_Type`.
Matching ignores case and surrounding spaces. Missing, legacy `Individual`, or
unrecognized values default to `Retail`. Sheet validation is unchanged.

Use the release commands above to push these changes, create a version, and update
the existing deployment. Keep the existing endpoint, token, Sheet, and validation
settings. A Git push alone does not update the deployed Apps Script bridge.

### Work Order sync mapping

Work Order Type preserves explicit `Retail`, `Dealer`, `Fleet`, `Mobile`,
`Warranty`, `Diagnostic`, or `Consulting` values, otherwise using a compatible
account type or `Retail`. Work Order statuses map to the existing Sheet options
(for example, `Waiting on Parts` → `Waiting Parts`, `QC` → `QC Hold`, and
`Delivered`/`Closed` → `Completed`). The Jobs record retains the application status.
Appointment closure maps to `Completed` or `Cancelled`; validation remains intact.

Work Order Lines export current execution lines, locations, labor hours, notes,
and Change Order references. Legacy records retain the equipment-line fallback.
Raw serial numbers are preserved in Notes; `Serial_ID` remains a reference field.
The bridge serializes sync requests using a script lock to prevent concurrent
line replacement from generating duplicates.

Version 4 was deployed on 2026-09-13 to the existing deployment above, after
enabling the Apps Script API with owner approval. No token, Sheet/Drive IDs,
Web App access settings, or endpoint changes were made.

### Local records on sync failure

The browser loads `ttt-os-v0.2` on refresh. Sync sends a snapshot outward; a failed
response changes only sync status/error metadata and saves the current local
database. It does not restore that snapshot or load a record from Google.
The browser regression test saves newer Work Order edits during an in-flight
request, returns an Account Type validation error, and verifies the entire newer
record and connection settings survive refresh.

Run `node tests/google-bridge.cjs` for the bridge mapping regression and
`node tests/workflow-v05.cjs` (requires Playwright) for browser persistence coverage.

`Account → Contact → Vehicle → Job → Quote → Approval → Deposit / Parts / Schedule → Check-In → Final Authorization → Work Order → QC → Invoice / Payment → Delivery → Warranty`

Approved records are not meant to be overwritten. A changed approved scope should become a new quote version or Change Order.
