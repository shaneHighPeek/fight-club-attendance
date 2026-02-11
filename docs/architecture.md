# System Architecture

## High-Level Overview

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────┐
│                 │     │                │     │                 │
│  Kiosk         │────▶│  Firebase      │────▶│  External CRM   │
│  (React)       │     │  (Firestore,   │     │  (via Webhooks) │
│                 │     │   Functions)   │     │                 │
└─────────────────┘     └────────────────┘     └─────────────────┘
        ▲                        ▲
        │                        │
        │                ┌───────┴───────┐
        │                │               │
        └────────────────┤  Admin Portal │
                         │  (React)      │
                         │               │
                         └───────────────┘
```

## Component Responsibilities

### Frontend (React)
- **Kiosk Interface**
  - Member check-in flow
  - Casual visitor waiver flow
  - Touch-optimized UI
  - Offline support

- **Admin Portal**
  - Authentication
  - Dashboard and reporting
  - Member management
  - System configuration

### Backend (Firebase)
- **Firestore Database**
  - Member profiles
  - Attendance records
  - Waiver storage
  - System settings
  - Webhook event queue/status (`webhookEvents`)

- **Cloud Functions**
  - Webhook processing
  - Data validation
  - Background jobs
  - Report generation

### Integration Layer
- **Webhook System**
  - Event-driven architecture
  - Retry mechanism
  - Status tracking
  - Error handling
  - Inbound subscription sync from payment/CRM systems

## Outbound Webhook Contract (App -> CRM)

All outbound events use a shared envelope so CRM can route by `eventType`.

### Envelope (v1)

```json
{
  "eventId": "evt_...",
  "eventType": "attendance.checked_in",
  "eventVersion": "1.0",
  "occurredAt": "2026-02-12T09:15:00.000Z",
  "source": "fight-club-app",
  "memberId": "mbr_...",
  "crmContactId": null,
  "hasCrmContactId": false,
  "payload": {}
}
```

### Event Types

- `member.created_temp`
- `member.updated`
- `member.rank_changed`
- `member.streak_milestone`
- `attendance.checked_in`
- `waiver.signed`
- `subscription.started`
- `subscription.stopped`

### Delivery Model

- App writes envelope rows to `webhookEvents` with `status = pending`.
- Scheduled function (`deliverPendingWebhooks`) delivers pending rows every minute.
- Retry backoff applies automatically for transient failures.
- Terminal states:
  - `completed`: CRM accepted payload
  - `failed`: max attempts reached
- Admin dashboard shows queue counts (`pending/completed/failed`).

### Security Model

- Destination URL from `CRM_WEBHOOK_URL`.
- Optional bearer auth from `CRM_WEBHOOK_BEARER_TOKEN`.
- If bearer env var is unset, request is sent without Authorization header.

### Inbound Contract (CRM/Payment -> App)

- HTTP endpoint: `subscriptionWebhook`
- Supported `eventType` values:
  - `subscription.started`
  - `subscription.stopped`
- Identity resolution priority:
  1. `memberId`
  2. `crmContactId`
- Member fields updated:
  - `membershipType`
  - `status`
  - `crmContactId` (if supplied)
  - `subscriptionUpdatedAt`

### Contact Linking Fields

- `memberId`: Firestore member ID (primary app identity)
- `crmContactId`: CRM internal contact ID (if known)
- `hasCrmContactId`: boolean convenience flag

Recommended matching order in CRM:
1. `memberId`
2. `crmContactId`
3. fallback email/phone for first-time linkage only

### Full Mapping Example (`attendance.checked_in`)

```json
{
  "eventId": "evt_01JXYZFULLMAP001",
  "eventType": "attendance.checked_in",
  "eventVersion": "1.0",
  "occurredAt": "2026-02-12T09:15:00.000Z",
  "source": "fight-club-app",
  "memberId": "mbr_9f3c2a1b",
  "crmContactId": null,
  "hasCrmContactId": false,
  "payload": {
    "attendanceLogId": "att_fullmap_001",
    "checkInTime": "2026-02-12T09:14:42.000Z",
    "type": "member",
    "locationId": "ashmore",
    "status": "completed",
    "attendanceLevel": 12,
    "belt": "white",
    "stripes": 2,
    "streakWeeksAtCheckIn": 4,
    "returningAfterBreak": false,
    "daysSinceLastCheckIn": 3,
    "member": {
      "id": "mbr_9f3c2a1b",
      "crmContactId": null,
      "hasCrmContactId": false,
      "memberNumber": "ASH-000123",
      "firstName": "Shane",
      "lastName": "Anderson",
      "fullName": "Shane Anderson",
      "email": "shane@example.com",
      "phone": "0400123456",
      "status": "active",
      "membershipType": "monthly",
      "rank": {
        "belt": "white",
        "stripes": 2
      },
      "streak": {
        "currentWeeks": 4,
        "bestWeeks": 8,
        "lastWeekId": "2026-07"
      },
      "waiver": {
        "acceptedAt": "2026-02-11T04:22:00.000Z",
        "version": "2026-02",
        "expiresAt": "2026-08-13T04:22:00.000Z"
      },
      "totals": {
        "totalCheckIns": 57
      }
    },
    "debug": {
      "schema": "outbound-event-envelope-v1",
      "sentBy": "manual-test",
      "notes": "full field mapping test payload"
    }
  }
}
```

## Data Flow

1. **Member Check-in**
   - Member enters phone/last name
   - System verifies identity
   - Attendance record created
   - Webhook triggered to CRM
   - Confirmation displayed

2. **Casual Check-in**
   - Visitor completes waiver
   - Waiver stored securely
   - Visitor record created
   - Check-in processed
   - Receipt emailed

3. **Admin Operations**
   - View attendance reports
   - Manage members
   - Monitor system health
   - Handle exceptions

## Security Considerations

- Role-based access control
- Data encryption at rest/transit
- Rate limiting
- Audit logging
- Regular security reviews
- Inbound webhook dedupe/idempotency key (next hardening step)

### Kiosk lock/unlock model (v1)

- **Lock trigger**: the kiosk locks after repeated failed lookups (see `user-flows.md`).
- **Unlock**: a 4-digit **Coach PIN** or **Admin PIN** unlocks the kiosk.
- **Storage**: store PIN hashes (not raw PINs) in a Firestore `Settings` document that is readable only by authenticated staff.
- **Scope**: v1 uses shared coach/admin PINs for reliability. Future: per-user PIN can be added by mapping PINs to staff accounts.

## Scaling Strategy

- Firestore sharding for high-volume locations
- Caching for frequently accessed data
- Queue-based processing for webhooks
- Read replicas for reporting
- Horizontal scaling of cloud functions
