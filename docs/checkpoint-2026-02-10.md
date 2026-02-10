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

## What Is Not Done Yet

- Confirm check-in button does not yet write attendance logs.
- Member counters (`lastCheckIn`, `totalCheckIns`) are not updated yet.
- Casual waiver flow still scaffold-only.
- PIN unlock and audit events are not implemented yet.
- Webhook delivery worker is not implemented yet.

## Current Temporary/Dev Exceptions

- `firestore.rules` currently allows public read on `members` for kiosk search.
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
   - check-in write transaction in `web/src/pages/kiosk/ConfirmCheckInPage.tsx`
   - Firestore write to `attendanceLogs`
   - Firestore update to `members/{id}` counters/timestamp

## Suggested Next Commit Message

`docs: add checkpoint and update roadmap after firebase + lookup integration`
