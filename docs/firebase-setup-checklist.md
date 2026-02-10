# Firebase Setup Checklist

## Project Layout Recommendation

Use separate Firebase projects:
- `fight-club-attendance-dev`
- `fight-club-attendance-staging`
- `fight-club-attendance-prod`

Map aliases with:
- `firebase use --add`

## Console Setup Steps

1. Create project(s) in Firebase Console.
2. Enable Firestore (native mode, choose region close to gym operations).
3. Enable Authentication:
   - Email/password for admin/staff accounts.
4. Register Web app and copy config values into `.env`.
5. Configure Firestore indexes from `firestore.indexes.json`.
6. Deploy rules from `firestore.rules`.
7. Set Functions secrets/config:
   - HighPeekPro webhook URL
   - Bearer token
   - webhook signing secret
8. Enable App Check for Hosting/Firestore (recommended before production launch).
9. Configure Hosting custom domain and SSL.
10. Create service account for CI deploys with least privilege.

## CLI Setup

1. Install Firebase CLI globally.
2. `firebase login`
3. `firebase use <alias>`
4. `firebase emulators:start`
5. `firebase deploy --only hosting,functions,firestore`

## Required Config in This Repo

- `firebase.json` (present)
- `.firebaserc` (present, update project ids as needed)
- `firestore.rules` (present)
- `firestore.indexes.json` (present)
- `functions/` TypeScript scaffold (present)
- `web/` Vite frontend scaffold (present)

## Pre-Launch Security Review

1. Remove/replace any broad public-write rules.
2. Enforce role-based claims for staff/admin.
3. Validate all kiosk payloads server-side.
4. Confirm PII logging redaction.
5. Confirm waiver retention and deletion policy compliance.

