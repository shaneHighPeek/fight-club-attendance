# Pre-release Review — 16 July 2026

Firebase project: `fight-club-attendance-dev`

## Release contents

### Class attendance and scheduling

- Gold Coast-aware class time and class-name selection for member and casual attendance.
- Default Ashmore weekly timetable.
- Attendance snapshots containing scheduled and actual class details.
- Today-only extra classes and scheduled-class substitutions.
- Permanent weekly schedule management with warning and day filtering.
- Class details in the admin attendance table.
- Public kiosk reads and staff/admin schedule permissions in Firestore rules.

### Existing member-management work included in the workspace

- Nicknames and nickname lookup.
- Expanded member status support.
- Age-band rank profiles and rank-step administration.
- Staff and self-service password management.
- Inbound CRM member upsert and member-status outbound event.
- Optional nickname backfill utility (not run automatically by deployment).
- Documentation and roadmap updates.

## Webhook compatibility guarantees

The existing delivery configuration remains unchanged:

- Same `CRM_WEBHOOK_URL` environment configuration.
- Same HTTP `POST` delivery method.
- Same JSON envelope and event version.
- Same content type and optional bearer-token handling.
- Same scheduled delivery trigger, queue, retry timing, and failure handling.
- Same inbound HPP endpoints and request handling for existing endpoints.

Legacy payload fields are preserved:

- Member snapshot: `rank.belt`, `rank.stripes`.
- Attendance: `belt`, `stripes` in both the flat payload and structured attendance block.
- Rank change: `fromBelt`, `fromStripes`, `toBelt`, `toStripes`.

New fields are additive:

- Expanded rank profile and rank-at-check-in fields.
- `className`, `classStartTime`, `classEndTime`, `classDate`.
- `scheduledClassName`, `classSubstitution`, and structured `classSession`.

Legacy attendance records without class data remain supported and produce `null` class fields.

## Schedule assumptions confirmed

- All 10:00am Veterans classes end at 11:00am.
- Sunday Open Mat runs from 3:00pm to 4:00pm.
- Wednesday 9:00am is named `Invictus QPS PJ`.
- Schedule timezone is `Australia/Brisbane`.

## Verification

- Web TypeScript and production build: required before deployment.
- Functions TypeScript build: required before deployment.
- Git whitespace/diff check: required before deployment.
- Local Firebase emulator walkthrough: completed for class-schedule layout by the user.
- Automated local emulator verification: nickname prefix query, manager nickname/status permissions,
  protected-field rejection, forgot-password request, signed-in password change, and admin password
  reset callable all passed.

## Deployment scope

Deploy these together:

1. Firestore rules.
2. Cloud Functions.
3. Firebase Hosting.

No Firestore index or automatic database migration is required. The nickname backfill script must not be run unless separately reviewed and explicitly approved.

## Live smoke test

1. Sign into the live admin portal.
2. Open Class Schedule.
3. Add a temporary substitution.
4. Confirm the live kiosk displays it.
5. Complete one controlled attendance check-in.
6. Confirm class details appear in admin Attendance.
7. Confirm the outbound webhook event completes successfully.
8. Remove the temporary substitution.
