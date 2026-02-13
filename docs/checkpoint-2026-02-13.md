# Checkpoint - February 13, 2026

## What Is Working

- Payload contract is locked at `eventVersion: "1.0"` and documented.
- Webhook payloads now include stable structured blocks (`member`, `attendance`, `streak`, `totals`, `waiver`) while preserving existing mapped fields.
- Phone values in outbound payloads are normalized to E.164 for CRM compatibility.
- Temp onboarding flow sends one consolidated `member.created_temp` event to avoid CRM sequencing failures.
- New temp members default to `white` belt and `1` stripe.
- CRM link-back endpoint is live (`linkCrmContactWebhook`) and mirrors IDs into member docs.
- Member docs now mirror:
  - `memberId`
  - `crmContactId`
  - `crmMemberId`
- Inbound webhook duplicate suppression is live (`eventId` dedupe for inbound endpoints).
- Manual retry for failed webhook events is live in Admin dashboard.
- Kiosk lock/unlock is live:
  - lock after 5 failed member lookups
  - unlock via coach/admin 4-digit PIN
  - lock/unlock audit events stored
- Admin settings now include kiosk PIN management.
- Kiosk UI updates:
  - more top spacing on kiosk/admin pages
  - larger mobile buttons
  - member lookup includes first-name matching

## Pending / Next Build Items

- Add CSV import flow for existing member contacts.
- Add age-based belt table support (child/adult progression tables).
- Add waiver email receipt flow.
- Add payment gateway contract tests and production auth verification.
- Add rank-history timeline summary in Admin member profile.

## Suggested Deploy Batch

1. `firebase deploy --only functions,hosting,firestore:indexes,firestore:rules`

## Suggested Commit Message

`feat: harden webhooks, add kiosk PIN lock flow, and update UI/search polish`
