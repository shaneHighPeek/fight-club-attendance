# Development Roadmap

## Phase 1: Core Kiosk Check-in (MVP)
**Goal**: Basic member check-in functionality
- [x] Set up Firebase project and hosting baseline
- [x] Implement member search by phone/last name (Firestore read + selection flow)
- [x] Create check-in logging system
- [x] Design and implement basic kiosk UI shell
- [x] Set up basic security rules (deployed)

**Success Criteria**:
- Members can check in with phone/last name
- Check-ins are logged with timestamp
- Basic error handling in place
- Responsive kiosk interface

## Phase 2: Casual Drop-in & Waiver Flow
**Goal**: Support casual visitors with digital waivers
- [ ] Digital waiver form implementation
- [ ] Visitor profile creation flow
- [ ] Waiver storage and management
- [ ] Email receipt for waivers
- [ ] Check-in flow for casual visitors

**Success Criteria**:
- Casual visitors can complete waiver and check-in
- Waivers are stored securely
- Coaches can verify waiver status
- Email confirmation sent to visitors

## Phase 3: Admin Portal
**Goal**: Basic admin functionality
- [x] Admin authentication baseline (email/password + route guard)
- [x] Attendance dashboard shell
- [x] Member management shell
- [x] Basic reporting (attendance table + search + today filter)
- [x] Google Sheets reporting sync for owner access (replace CSV-first approach)

**Success Criteria**:
- Staff can view attendance records
- Basic filtering and search functionality
- Owner can review attendance in Google Sheets without direct DB access
- Role-based access control

## Phase 4: Webhook Integration
**Goal**: Connect to external CRM
- [ ] Design webhook payload structure
- [ ] Implement retry mechanism
- [ ] Error handling and logging
- [ ] Status dashboard for syncs
- [ ] Webhook security implementation

**Success Criteria**:
- Reliable data sync to CRM
- Failed syncs are retried
- Clear error reporting
- Secure webhook implementation

## Phase 5: Analytics & Reporting
**Goal**: Enhanced insights
- [ ] Class attendance trends
- [ ] Member engagement metrics
- [ ] Custom report builder
- [ ] Email digests
- [ ] Streak tracking

**Success Criteria**:
- Actionable attendance insights
- Custom report generation
- Automated email reports
- Member engagement scoring

## Future Considerations
- Mobile app for check-in
- Class scheduling integration
- Automated marketing triggers
- Advanced analytics dashboard
- Membership management

## Dependencies
- Firebase project setup
- Design system components
- CRM API documentation
- Legal review of waiver process
- Kiosk hardware decisions

## Status Snapshot (February 10, 2026)

- Firebase project `fight-club-attendance-dev` is created and connected.
- Firestore database is created and Firestore rules/indexes are deployed.
- Web app is connected to Firebase via `web/.env.local`.
- Admin login works for bootstrap admin email.
- Kiosk lookup works against Firestore members.
- Check-in write transaction is implemented (`attendanceLogs` + member counters).
- Check-in writes now include `attendanceLevel` (sessions at current belt+stripe) and per-rank counters on member docs.
- Kiosk success page now auto-returns to home after ~2 seconds.
- Admin attendance page reads live `attendanceLogs` with table formatting, today-only filter, and member search.
- Google Sheets auto-sync is deployed for attendance rows:
  `Name | Date | membershipType | belt | stripes | attendanceLevel`.
