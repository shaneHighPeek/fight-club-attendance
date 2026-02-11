# Checkpoint - February 11, 2026

## What Is Working

- Kiosk lookup supports name, phone, and member number.
- Member check-in writes `attendanceLogs` and updates member attendance counters.
- Kiosk success screen shows celebration UX and auto-returns after ~3.5 seconds.
- Admin attendance page shows formatted table with filters/search:
  - `Name | Date | membershipType | belt stripes | attendanceLevel`
- Google Sheets sync is live for attendance logs.
- Casual waiver flow is live:
  - New visitor waiver submit
  - Existing member waiver renewal tracking
  - Waiver version/expiry checks
- Member rank/stripe updates are live in Admin.
- Staff account + role assignment flow is live in Admin settings.
- Outbound CRM webhook queue is implemented (`webhookEvents`).
- Webhook delivery worker with retry/backoff is implemented.
- Inbound `subscriptionWebhook` is implemented for membership sync.
- Admin dashboard shows webhook queue counts (`pending/completed/failed`).

## Pending / Next Hardening

- Add inbound idempotency/dedupe key handling for subscription webhooks.
- Add manual retry action for failed webhook events in Admin.
- Add waiver email receipt flow.
- Add payment gateway contract tests and production auth verification.
- Add member rank history timeline summary (date-range counts by belt/stripe period).

## Deployment Batch (When Ready)

1. `firebase deploy --only functions`
2. `firebase deploy --only hosting`
3. `firebase deploy --only firestore:rules`

## Suggested Next Commit Message

`docs: refresh roadmap and architecture after waiver + webhook queue rollout`
