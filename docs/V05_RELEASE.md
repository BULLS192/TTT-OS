# TTT OS v0.5 integration

Prepared from `TTT_OS_v05_patch.zip`. Its data contract and stylesheet now load after the existing document-preview module. The added UI uses the existing job-detail renderer and save/sync functions.

## Available workflow

- Record final authorization after quote approval and physical check-in; retains signer, method, inspection findings, final scope notes, timestamp and quoted total.
- Save execution status, serial number, installed location, labor hours, technician and completion notes per authorized line.
- Draft price/scope/schedule changes. Only explicit customer approval changes the authorized total and adds the new execution line.
- Prevent unfinished execution lines from advancing to QC or delivery.
- Include approved changes in newly generated invoice totals; retain existing invoice snapshots until explicitly regenerated.
- Show installation details and approved changes in work-order previews. All four original document types remain available.

## Compatibility

The `ttt-os-v0.2` database key and all Google connection, auto-sync and hash keys are retained. There is no automatic database reset, bulk migration, or storage rename. Legacy work orders are displayed without inventing authorization or overwriting records. New execution data is persisted only when an operator saves it. Existing quote snapshots and check-in media metadata are not modified by the v0.5 workflow.

The existing Google bridge receives the full additive job payload. A sync race is fixed so edits made during a request remain queued for the next sync instead of being marked as already synchronized. This release does not change the Apps Script deployment, credentials, Google database, or access settings. The deployed bridge's handling of v0.5 fields requires an authenticated end-to-end verification; the repository bridge source does not yet map every new field into separate sheet columns.

The separate `feat/ttt-os-auth-foundation` branch is not merged by this release. No authentication or deployment-protection change is included.

## Verification

Run `node --check` on the changed JavaScript files. The regression test requires Node.js and `jsdom` (install in a separate test environment and set NODE_PATH):

```
NODE_PATH=/path/to/test/node_modules node tests/workflow-v05.cjs
```

The test uses synthetic data and a mocked Google endpoint. It covers legacy browser-data preservation, authorization validation, execution persistence, draft and approved totals, QC gating, invoice calculations, all four previews, Google payload preservation, in-flight edits, and reloads.

Production must use the existing origin to retain browser data. Vercel project access and its current deployment/production branch must be resolved before asserting a production release. Do not replace the existing project or disable protection to work around missing access.
