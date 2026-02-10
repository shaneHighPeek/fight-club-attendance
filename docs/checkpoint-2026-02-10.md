# Checkpoint - February 10, 2026

## What Is Working

- GitHub repository connected and first commit pushed to `main`.
- Frontend route shell implemented for kiosk and admin.
- Firebase project `fight-club-attendance-dev` created and selected in CLI (`dev` alias).
- Firestore database created, rules and indexes deployed.
- Firebase Authentication enabled with Email/Password.
- Admin login flow works.
- Admin route access works using bootstrap email fallback (`VITE_BOOTSTRAP_ADMIN_EMAIL`).
- Kiosk member lookup is live against Firestore `members`.
- Case-insensitive last-name search works via `lastNameLower`.
- Confirm check-in writes to Firestore:
  - `attendanceLogs` create
  - `members.lastCheckIn`, `members.totalCheckIns` update
  - `members.rankAttendance.{belt}_{stripes}` increment
  - `attendanceLogs.attendanceLevel` write
- Kiosk success page auto-returns to home after ~2 seconds.
- Admin attendance page reads live logs with:
  - table view
  - today-only filter
  - member search
- Google Sheets sync is live from `attendanceLogs` create trigger.
  - Row format: `Name | Date | membershipType | belt | stripes | attendanceLevel`

## What Is Not Done Yet

- Casual waiver flow still scaffold-only.
- PIN unlock and audit events are not implemented yet.
- Webhook delivery worker is not implemented yet.

## Current Temporary/Dev Exceptions

- `firestore.rules` currently allows public read on `members` for kiosk search.
- `firestore.rules` currently allows signed-in reads on `attendanceLogs` in dev.
- Bootstrap admin email override is enabled in app code.
  - Source: `web/src/auth/AuthContext.tsx`
  - Env var: `VITE_BOOTSTRAP_ADMIN_EMAIL` in `web/.env.local`

These are acceptable for current dev progress, but should be tightened before production.

## Resume Checklist

1. Start frontend:
   - `npm --prefix web run dev`
2. Open:
   - Kiosk: `http://localhost:5173/kiosk`
   - Admin: `http://localhost:5173/admin`
3. Implement next:
   - implement real casual waiver form writes in `web/src/pages/kiosk/CasualWaiverPage.tsx`
   - create `waivers` documents and casual attendance logs
   - tighten kiosk write path (App Check / callable boundary) for production hardening

## Suggested Next Commit Message

`docs: refresh checkpoint after attendance + sheets integration`
