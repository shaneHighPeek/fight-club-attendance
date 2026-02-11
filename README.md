# Fight Club Attendance System

Web-based attendance and check-in system for Fight Club martial arts gym.

## Current Repository Structure

```text
windsurf-project/
├── docs/
├── web/                     # React + Vite frontend
├── functions/               # Firebase Functions (TypeScript)
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── package.json             # root orchestration scripts
```

## Local Setup

1. Install web dependencies:
   - `npm --prefix web install`
2. Install functions dependencies:
   - `npm --prefix functions install`
3. Copy `.env.example` values into local env files as needed.
4. Build everything:
   - `npm run build`
5. Run emulators:
   - `npm run emulators`

## Key Docs

- `docs/implementation-plan-v1.md`
- `docs/checkpoint-2026-02-11.md`
- `docs/firebase-setup-checklist.md`
- `docs/data-model.md`
- `docs/integration-spec.md`
- `docs/user-flows.md`

## Notes

- Kiosk member check-in flow is implemented and writing live attendance logs.
- Admin attendance view is implemented (table + search + today filter).
- Google Sheets sync is implemented for new attendance records.
- Casual waiver flow is implemented (new + renewal path).
- Outbound webhook queue and delivery worker are implemented.
- Inbound subscription webhook is implemented.
- Admin dashboard includes webhook queue status counts.

## Google Sheets Attendance Sync

Attendance logs can be mirrored into Google Sheets through the Cloud Function
`syncAttendanceToGoogleSheet` (triggered on `attendanceLogs/{logId}` create).

### Required Environment Variables (Functions runtime)

- `GOOGLE_SHEETS_SPREADSHEET_ID` (required)
- `GOOGLE_SHEETS_TAB_NAME` (optional, defaults to `Attendance`)

### Setup Steps

1. Create/open the target Google Sheet.
2. Share the sheet with your Firebase Functions service account email:
   - `{project-id}@appspot.gserviceaccount.com`
   - Grant `Editor` access.
3. Set runtime env vars for functions deployment:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_TAB_NAME` (optional)
4. Deploy functions:
   - `firebase deploy --only functions`

### Synced Row Format

Each new attendance log appends one row:

- `Name | Date | membershipType | belt stripes | attendanceLevel`

## Waiver Versioning (Legal Updates)

Waiver settings are centralized in:

- `web/src/config/waiver.ts`

When legal counsel provides updated waiver wording:

1. Update `WAIVER_TEXT`.
2. Bump `WAIVER_VERSION` (e.g. `2026-03`).
3. Optionally set `WAIVER_DISCLAIMER_URL` if publishing a hosted legal page.

Behavior:

- Existing members are prompted to re-acknowledge if:
  - waiver is older than validity window (`WAIVER_VALIDITY_DAYS`), or
  - stored `waiverDisclaimerVersion` does not match current `WAIVER_VERSION`.

## CRM Webhook Configuration

Set in `functions/.env`:

- `CRM_WEBHOOK_URL` (required for delivery)
- `CRM_WEBHOOK_BEARER_TOKEN` (optional; only if destination requires auth)

Deploy:

- `firebase deploy --only functions`

If also publishing frontend updates:

- `firebase deploy --only hosting`
