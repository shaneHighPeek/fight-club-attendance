export interface ClassSession {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  name: string;
  active: boolean;
}

export type ClassOverrideKind = 'replacement' | 'cancelled' | 'ad_hoc';

export interface ClassOverride {
  id: string;
  date: string;
  scheduledSessionId: string | null;
  kind: ClassOverrideKind;
  actualName: string;
  actualStartTime: string;
  actualEndTime: string;
  reason: string;
}

export interface AttendanceClassSnapshot {
  scheduledSessionId: string | null;
  scheduledClassName: string | null;
  actualClassName: string;
  startTime: string;
  endTime: string;
  classDate: string;
  dayOfWeek: number;
  timezone: 'Australia/Brisbane';
  isSubstitution: boolean;
  overrideId: string | null;
}
