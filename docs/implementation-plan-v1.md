# Implementation Plan v1

## Scope

v1 includes:
- Kiosk member check-in
- Casual visitor flow with waiver requirement check
- Admin authentication
- Attendance logging
- Webhook enqueue boundary (delivery worker follows)

Out of scope for this first implementation pass:
- Final analytics dashboards
- Complex class scheduling
- Full CRM bi-directional sync

## Routes and Screens

### Public Kiosk
- `/kiosk` home
- `/kiosk/member-lookup`
- `/kiosk/member-select` (for shared/family phone matches)
- `/kiosk/confirm-checkin`
- `/kiosk/casual-waiver`
- `/kiosk/success`
- `/kiosk/locked` (5 failed attempts lock state)

### Staff/Admin
- `/admin/login`
- `/admin` dashboard shell
- `/admin/attendance`
- `/admin/members`
- `/admin/settings` (PIN rotation, kiosk lock policy)

## Firestore v1 Write Paths

### Kiosk
1. Member lookup:
   - Reads from `members` by `lastName` or `phone`
2. Check-in:
   - Create `attendanceLogs/{id}` with `memberRankAtCheckIn` snapshot
   - Write `attendanceLogs/{id}.attendanceLevel` (sessions at current belt+stripe)
   - Update `members/{id}.lastCheckIn` and `members/{id}.totalCheckIns`
   - Increment `members/{id}.rankAttendance.{belt}_{stripes}`
3. Casual visitor:
   - Create `waivers/{id}` when no active waiver exists
   - Create `attendanceLogs/{id}` (`type = casual`)
4. Webhook:
   - Create `webhookEvents/{id}` with `status = pending`

### Admin
- Read `attendanceLogs`, `members`, `waivers`, `webhookEvents`
- Admin-only writes to `members` rank fields and `settings`

## Security Rules Strategy (v1)

- Kiosk path is unauthenticated for check-in and waiver create only.
- Staff/admin reads require Firebase Auth.
- Admin-only writes for rank/stripe and settings.
- `webhookEvents` write access reserved to backend functions.

Note:
- Current scaffold allows public creates for `attendanceLogs` and `waivers`.
- Next step is to tighten kiosk writes with App Check and schema validation in Cloud Functions.

## Webhook Function Boundary

### Frontend/Kiosk
- Never calls external CRM directly.
- Writes or requests enqueue of a normalized `webhookEvents` record.

### Cloud Functions
- `enqueueWebhookEvent` (implemented baseline):
  - Validates basic payload shape
  - Stores pending event
- `syncAttendanceToGoogleSheet` (implemented):
  - Triggered on `attendanceLogs/{id}` create
  - Appends row to Google Sheet
  - Stores sync status/error on attendance log
- Delivery worker (next phase):
  - Pulls pending events
  - Sends POST to HighPeekPro inbound URL
  - Applies retry policy and backoff
  - Stores response/error status and attempt counters

## Phased Build Sequence

1. Build route shell + auth shell. (Done)
2. Implement member lookup and family selection. (Done)
3. Implement check-in write transaction. (Done)
4. Implement waiver creation + casual check-in. (Next)
5. Implement lock/unlock flow via PIN hash compare.
6. Implement webhook delivery worker and retries.
7. Harden rules + App Check + audit logs.

## Open Decisions Needed

1. PIN storage model:
   - Chosen: per-user hashed PIN tied to each staff account.
   - Why: allows auditable unlock logs by specific person.
2. Roles list:
   - Chosen: `admin`, `manager`, `coach`, `member`.
3. `memberNumber` generation:
   - Chosen: sequential per location, formatted like `ASH-000123`.
   - Why: human-readable, easy for staff and CRM references.
4. Kiosk write hardening approach:
   - Recommended: callable/function-gated writes for attendance + waiver creates.
   - Why: better validation, abuse protection, and auditability than direct public writes.

## Current Implementation Notes (February 10, 2026)

- Firebase auth sign-in method enabled: Email/Password.
- Firestore collection `members` tested with live lookup.
- Kiosk search now uses `lastNameLower` for case-insensitive prefix lookup.
- Temporary bootstrap admin access is enabled through `VITE_BOOTSTRAP_ADMIN_EMAIL` in `web/.env.local`.
- Current Firestore rules allow public read on `members` to support kiosk lookup in v1 baseline.
- Attendance check-in path is live from `ConfirmCheckInPage` with:
  - attendance log create
  - member counters/timestamps update
  - `attendanceLevel` calculation at current rank
- Admin attendance view is live with table layout + today/search filters.
- Google Sheets sync for attendance rows is deployed and env-configured.
- Next coding target: implement full casual waiver + casual attendance writes.
