# Sprint Checklist - February 21, 2026

## Phase 0: Setup
- [ ] Confirm today goal: belt overhaul + CSV import + live prep.
- [ ] Export/backup current Firestore data.
- [ ] Keep webhook payload contract locked (`eventVersion 1.0`, additive-only changes).

## Phase 1: Belt System Overhaul
- [ ] Confirm final rank systems from Luke for:
  - [ ] Under 8
  - [ ] 8-16
  - [ ] 16+
- [ ] Finalize Firestore rank model for age-based progression.
- [ ] Update Admin member rank editor to match age-band rules.
- [ ] Update attendance rank snapshot logic.
- [ ] Update webhook rank payload fields (no breaking changes).
- [ ] Update Google Sheet mapping if rank columns change.
- [ ] Test rank update flow for one member in each age band.

## Phase 2: CSV Import + HPP Sync
- [ ] Review CSV headers and map each field to Firestore.
- [ ] Define dedupe rules (memberNumber/email/phone priority).
- [ ] Normalize imported rank values to new schema.
- [ ] Run dry-run validation first (no writes).
- [ ] Run full import into Firestore.
- [ ] Send/verify outbound webhook events to HPP for imported records.
- [ ] Confirm ID linking on members (`memberId`, `crmContactId`, `crmMemberId`).

## Phase 3: QA Gate
- [ ] Kiosk search works for first name/last name/member number/phone.
- [ ] Check-in writes correct attendance + rank snapshot.
- [ ] Temp member flow emits expected single onboarding event.
- [ ] Duplicate inbound `eventId` is ignored.
- [ ] Failed webhook retry works from Admin dashboard.
- [ ] Kiosk lock/unlock with coach/admin PIN works.

## Phase 4: Live Readiness
- [ ] Clean test data/rows (Firestore + Google Sheet) if launching from current project.
- [ ] Verify env vars/webhook URLs are production-ready.
- [ ] Verify staff roles and rotate kiosk PINs.
- [ ] Deploy indexes/rules/functions/hosting.
- [ ] Run final smoke script with Luke.

## End of Sprint
- [ ] Update roadmap + checkpoint docs.
- [ ] Commit and push.
- [ ] Capture next-sprint follow-ups.
