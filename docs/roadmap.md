# Development Roadmap

## Phase 1: Core Kiosk Check-in (MVP)
**Goal**: Basic member check-in functionality
- [x] Set up Firebase project and hosting baseline
- [x] Implement member search by first name/last name/member number/phone (Firestore read + selection flow)
- [x] Create check-in logging system
- [x] Design and implement basic kiosk UI shell
- [x] Set up basic security rules (deployed)
- [x] Kiosk success return timer (3.5s)
- [x] Streak + celebration UX baseline (confetti/message)
- [x] Kiosk lock flow after repeated failed lookups
- [x] Kiosk unlock via coach/admin 4-digit PIN

**Success Criteria**:
- Members can check in with phone/last name
- Check-ins are logged with timestamp
- Basic error handling in place
- Responsive kiosk interface

## Phase 2: Casual Drop-in & Waiver Flow
**Goal**: Support casual visitors with digital waivers
- [x] Digital waiver form implementation
- [x] Visitor profile creation flow
- [x] Waiver storage and management (`waivers` collection)
- [x] Check-in flow for casual visitors
- [x] Casual-to-member onboarding path (`membershipType = temp` until subscription activation)
- [x] Existing-member waiver renewal prompt and tracking
- [ ] Email receipt for waivers

**Success Criteria**:
- Casual visitors can complete waiver and check-in
- Waivers are stored securely
- Coaches can verify waiver status
- Email confirmation sent to visitors

## Phase 3: Admin Portal
**Goal**: Basic admin functionality
- [x] Admin authentication baseline (email/password + route guard)
- [x] Attendance dashboard shell
- [x] Member management shell + rank update workflow
- [x] Basic reporting (attendance table + search + today filter)
- [x] Google Sheets reporting sync for owner access (replace CSV-first approach)
- [x] Staff management: create staff user + role assignment
- [x] Attendance row format: `Name | Date | membershipType | belt stripes | attendanceLevel`

**Success Criteria**:
- Staff can view attendance records
- Basic filtering and search functionality
- Owner can review attendance in Google Sheets without direct DB access
- Role-based access control

## Phase 4: Webhook Integration
**Goal**: Connect to external CRM
- [x] Design webhook payload structure (shared envelope with `eventType`)
- [x] Implement retry mechanism + backoff queue
- [x] Error handling and logging in `webhookEvents`
- [x] Status dashboard for syncs (Admin queue counts)
- [x] Optional webhook security (Bearer token support)
- [x] Outbound CRM webhook for member/attendance/waiver/rank events
- [x] Inbound subscription webhook (`subscription.started`, `subscription.stopped`)
- [x] Idempotency key + dedupe guard for inbound events
- [x] Manual retry control for failed webhook events (Admin)
- [ ] Hard idempotency enforcement for all inbound webhook endpoints (any future endpoints)

**Success Criteria**:
- Reliable data sync to CRM
- Failed syncs are retried
- Clear error reporting
- Secure webhook implementation

## Phase 5: Analytics & Reporting
**Goal**: Enhanced insights
- [ ] Class attendance trends dashboard
- [ ] Member engagement metrics dashboard
- [ ] Custom report builder
- [ ] Email digests
- [x] Streak tracking baseline (kiosk milestone messaging)

**Success Criteria**:
- Actionable attendance insights
- Custom report generation
- Automated email reports
- Member engagement scoring


## Luke Business Ops Roadmap

- [ ] Subscription integration hardening:
  - Ensure member `status` and `membershipType` are always driven by live subscription state.
  - Confirm payment/subscription events update app records in near real-time.
- [ ] Member nurture campaign flow:
  - Define and launch automated nurture path from lead/temp member to active member.
- [ ] Self-serve order form:
  - Add order form flow for prospects/members to self-enroll and trigger onboarding automations.
- [ ] Merch store integration:
  - Add online merch storefront flow and connect purchases to CRM contact records.
- [ ] Phone answering options:
  - Define and implement call handling options (routing, voicemail, after-hours, and missed-call follow-up automation).

## Future Considerations
- Mobile app for check-in
- Class scheduling integration
- Automated marketing triggers
- Advanced analytics dashboard
- Membership management
- Payment gateway source-of-truth sync for subscription status changes
- Belt/stripe history timeline + CRM automation hooks
- CSV import flow for existing member contacts (with dedupe and dry-run preview)
- Belt table rules by age group (child/adult progression table support)

## Dependencies
- Firebase project setup
- Design system components
- CRM API documentation
- Legal review of waiver process
- Kiosk hardware decisions

## Status Snapshot (February 13, 2026)

- Firebase project `fight-club-attendance-dev` is created and connected.
- Firestore database is created and Firestore rules/indexes are deployed.
- Web app is connected to Firebase via `web/.env.local`.
- Admin login works for bootstrap admin email.
- Kiosk lookup works against Firestore members (first name/last name/phone/member number).
- Check-in write transaction is implemented (`attendanceLogs` + member counters).
- Check-in writes now include `attendanceLevel` (sessions at current belt+stripe) and per-rank counters on member docs.
- Kiosk success page now auto-returns to home after ~3.5 seconds.
- Admin attendance page reads live `attendanceLogs` with table formatting, today-only filter, and member search.
- Google Sheets auto-sync is deployed for attendance rows:
  `Name | Date | membershipType | belt stripes | attendanceLevel`.
- Waiver flow is live for casual and renewal paths, with waiver version/expiry tracking.
- Outbound webhook queue + scheduled delivery worker are implemented.
- Inbound subscription webhook is implemented for membership status sync.
- Inbound webhook duplicate suppression is implemented using `eventId`.
- Failed webhook manual retry is implemented in Admin.
- Kiosk lock/unlock is implemented with configurable coach/admin PINs.
- CRM linkage is mirrored on member docs (`memberId`, `crmContactId`, `crmMemberId`).

## Next Delivery Path

1. Demo pass with live dev URL and collect stakeholder feedback.
2. Add CSV import workflow for existing member contacts.
3. Add age-based belt table support (child/adult progression logic).
4. Add payment gateway integration spec + endpoint contract tests.
5. Add rank-history timeline reporting in Admin member profile (date range + count per belt/stripe period).
