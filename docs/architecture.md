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
