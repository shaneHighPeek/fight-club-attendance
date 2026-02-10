# Data Model

## Collections

### 1. Members
```typescript
type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

type AgeGroup = 'child' | 'adult';

type LocationId = 'ashmore';

interface Rank {
  belt: Belt;
  stripes: 0 | 1 | 2 | 3 | 4;
  awardedAt?: Timestamp;
}

interface Member {
  id: string;                   // Auto-generated ID
  memberNumber: string;         // Human-safe stable identifier, format: ASH-000123
  firstName: string;            // Member's first name
  lastName: string;             // Member's last name
  phone: string;                // Primary contact number
  email?: string;               // Optional email
  birthDate?: string;           // YYYY-MM-DD (optional for existing members until backfilled)
  ageGroup: AgeGroup;           // child/adult selector used for filtering/communications
  memberSince: Timestamp;       // Date joined
  status: 'active' | 'inactive' | 'suspended';
  membershipType: string;       // e.g., 'monthly', 'annual', 'drop-in'
  rank: Rank;                   // Current belt + stripes (default: white belt, 0 stripes)
  lastCheckIn?: Timestamp;      // Last check-in timestamp
  totalCheckIns: number;        // Total check-ins
  notes?: string;               // Staff notes
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 5. StaffUsers
```typescript
type StaffRole = 'admin' | 'manager' | 'coach';

interface StaffUser {
  id: string;                   // Firebase Auth UID
  role: StaffRole;
  displayName: string;
  pinHash: string;              // Hashed 4-digit PIN (never store raw PIN)
  pinUpdatedAt: Timestamp;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 6. KioskLockEvents
```typescript
interface KioskLockEvent {
  id: string;
  locationId: LocationId;
  type: 'locked' | 'unlocked';
  reason: 'failed_lookups' | 'manual_override';
  unlockedByStaffId?: string;   // Required when type = unlocked
  unlockedByRole?: 'admin' | 'manager' | 'coach';
  createdAt: Timestamp;
}
```

### 2. AttendanceLogs
```typescript
interface AttendanceLog {
  id: string;                   // Auto-generated ID
  memberId: string;             // Reference to Member
  checkInTime: Timestamp;       // Check-in timestamp
  checkOutTime?: Timestamp;     // Optional check-out
  type: 'member' | 'casual';    // Check-in type
  status: 'completed' | 'pending' | 'error';
  locationId: LocationId;       // Kiosk location (v1: 'ashmore')
  staffId?: string;             // Staff who processed (if any)
  memberRankAtCheckIn: {
    belt: Belt;
    stripes: 0 | 1 | 2 | 3 | 4;
  };                            // Snapshot of current rank at time of check-in
  notes?: string;               // Optional notes
  metadata: {
    deviceInfo: string;         // Device/browser info
    ipAddress: string;          // For audit
  };
  createdAt: Timestamp;
}
```

#### Rank semantics

- **Belts**: `white`, `blue`, `purple`, `brown`, `black`
- **Stripes**: `0..4` where `0` means "no stripes" and `4` means "4 stripes".
- **Default rank**: every `Member` starts at `white + 0 stripes` unless explicitly set otherwise by staff.
- **Promotion behavior**: when a student moves from `X + 4 stripes` to the next belt, their `rank` becomes `nextBelt + 0 stripes`.
- **Why we snapshot rank on attendance**: `memberRankAtCheckIn` is intentionally stored on each `AttendanceLog` so coaches can query/count sessions completed *at that rank* even after the member is promoted.

#### Age semantics

- **Child cutoff**: v1 treats `ageGroup = child` as *under 16*.
- **Storage**: we store `birthDate` when known and store `ageGroup` explicitly for easy filtering (e.g., email all children / all adults).
- **Derivation**: when `birthDate` is available, `ageGroup` can be derived at creation time and reviewed/overridden by staff.

### 3. Waivers
```typescript
interface Waiver {
  id: string;                   // Auto-generated ID
  memberId: string;             // Reference to Member (if member)
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;            // YYYY-MM-DD
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  signature: string;            // Base64 signature
  ipAddress: string;            // IP where signed
  userAgent: string;            // Browser/device info
  version: string;              // Waiver version
  signedAt: Timestamp;
  expiresAt: Timestamp;         // Typically 1 year from signedAt
  isActive: boolean;
}
```

### 4. WebhookEvents
```typescript
interface WebhookEvent {
  id: string;
  type: 'check_in' | 'member_update' | 'waiver_signed';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payload: object;              // Event-specific data
  attempts: number;
  lastAttempt?: Timestamp;
  nextAttempt?: Timestamp;
  error?: string;
  response?: {
    status: number;
    body: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Indexes

### Required Single-Field Indexes
```
// Members collection
- phone (ascending)
- lastName (ascending)
- status (ascending)
- ageGroup (ascending)
- rank.belt (ascending)
- rank.stripes (ascending)

// AttendanceLogs collection
- memberId (ascending)
- checkInTime (descending)
- type (ascending)
- memberRankAtCheckIn.belt (ascending)
- memberRankAtCheckIn.stripes (ascending)

// Waivers collection
- memberId (ascending)
- signedAt (descending)
- expiresAt (ascending)
```

### Composite Indexes
```
// For member check-in history
- Collection: AttendanceLogs
- Fields: [memberId (asc), checkInTime (desc)]

// For "sessions at rank" reporting (per member)
- Collection: AttendanceLogs
- Fields: [memberId (asc), memberRankAtCheckIn.belt (asc), memberRankAtCheckIn.stripes (asc), checkInTime (desc)]

// For daily attendance reports
- Collection: AttendanceLogs
- Fields: [locationId (asc), checkInTime (desc)]
```

## Data Retention

1. **AttendanceLogs**: 2 years
2. **Inactive Members**: Archive after 1 year of inactivity
3. **Waivers**: Retain for 7 years after expiration
4. **WebhookEvents**: 30 days for completed, 90 days for failed

## Security Rules

- Members can only view their own data
- Staff have read access to attendance logs
- Only admins can modify member records
- Waivers are immutable after creation
- All writes are audited
