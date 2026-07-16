import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { CLASS_SCHEDULE_TIMEZONE, DEFAULT_CLASS_SESSIONS } from '../config/defaultClassSchedule';
import type { AttendanceClassSnapshot, ClassOverride, ClassSession } from '../types/classSchedule';
import { db } from './firebase';

export interface GoldCoastNow {
  date: string;
  dayOfWeek: number;
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function getGoldCoastNow(date = new Date()): GoldCoastNow {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: CLASS_SCHEDULE_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    dayOfWeek: WEEKDAY_INDEX[value('weekday')] ?? date.getDay(),
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function isClassSession(value: unknown): value is ClassSession {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.dayOfWeek === 'number' &&
    typeof item.startTime === 'string' && typeof item.endTime === 'string' &&
    typeof item.name === 'string' && typeof item.active === 'boolean';
}

function toOverride(id: string, value: Record<string, unknown>): ClassOverride | null {
  const kind = value.kind;
  if (kind !== 'replacement' && kind !== 'cancelled' && kind !== 'ad_hoc') return null;
  if (typeof value.date !== 'string') return null;
  return {
    id,
    date: value.date,
    scheduledSessionId: typeof value.scheduledSessionId === 'string' ? value.scheduledSessionId : null,
    kind,
    actualName: typeof value.actualName === 'string' ? value.actualName : '',
    actualStartTime: typeof value.actualStartTime === 'string' ? value.actualStartTime : '',
    actualEndTime: typeof value.actualEndTime === 'string' ? value.actualEndTime : '',
    reason: typeof value.reason === 'string' ? value.reason : '',
  };
}

export async function loadClassSchedule() {
  const snapshot = await getDoc(doc(db, 'settings', 'classSchedule'));
  if (!snapshot.exists()) return DEFAULT_CLASS_SESSIONS.map((session) => ({ ...session }));
  const sessions = snapshot.data().sessions;
  return Array.isArray(sessions) ? sessions.filter(isClassSession) : [];
}

export async function loadClassOverrides(date: string) {
  const snapshot = await getDocs(query(collection(db, 'classOverrides'), where('date', '==', date)));
  return snapshot.docs
    .map((item) => toOverride(item.id, item.data() as Record<string, unknown>))
    .filter((item): item is ClassOverride => item !== null);
}

export function resolveSessionsForDate(
  sessions: ClassSession[],
  overrides: ClassOverride[],
  context: Pick<GoldCoastNow, 'date' | 'dayOfWeek'>,
): AttendanceClassSnapshot[] {
  const overridesBySession = new Map(
    overrides.filter((item) => item.scheduledSessionId).map((item) => [item.scheduledSessionId, item]),
  );
  const resolved: AttendanceClassSnapshot[] = [];

  for (const session of sessions) {
    if (!session.active || session.dayOfWeek !== context.dayOfWeek) continue;
    const override = overridesBySession.get(session.id);
    if (override?.kind === 'cancelled') continue;
    resolved.push({
      scheduledSessionId: session.id,
      scheduledClassName: session.name,
      actualClassName: override?.kind === 'replacement' ? override.actualName : session.name,
      startTime: override?.kind === 'replacement' ? override.actualStartTime || session.startTime : session.startTime,
      endTime: override?.kind === 'replacement' ? override.actualEndTime || session.endTime : session.endTime,
      classDate: context.date,
      dayOfWeek: context.dayOfWeek,
      timezone: CLASS_SCHEDULE_TIMEZONE,
      isSubstitution: override?.kind === 'replacement',
      overrideId: override?.id ?? null,
    });
  }

  for (const override of overrides) {
    if (override.kind !== 'ad_hoc') continue;
    resolved.push({
      scheduledSessionId: null,
      scheduledClassName: null,
      actualClassName: override.actualName,
      startTime: override.actualStartTime,
      endTime: override.actualEndTime,
      classDate: context.date,
      dayOfWeek: context.dayOfWeek,
      timezone: CLASS_SCHEDULE_TIMEZONE,
      isSubstitution: true,
      overrideId: override.id,
    });
  }

  return resolved.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.actualClassName.localeCompare(b.actualClassName));
}

export function selectLikelyClass(sessions: AttendanceClassSnapshot[], nowMinutes: number) {
  const candidates = sessions.filter((session) => {
    const start = timeToMinutes(session.startTime);
    const end = timeToMinutes(session.endTime);
    return nowMinutes >= start - 60 && nowMinutes <= end + 30;
  });
  return candidates.sort((a, b) =>
    Math.abs(timeToMinutes(a.startTime) - nowMinutes) - Math.abs(timeToMinutes(b.startTime) - nowMinutes),
  )[0] ?? null;
}
