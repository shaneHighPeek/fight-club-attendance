import type { ClassSession } from '../types/classSchedule';

export const CLASS_SCHEDULE_TIMEZONE = 'Australia/Brisbane' as const;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_CLASS_SESSIONS: ClassSession[] = [
  { id: 'mon-0530-gi-all', dayOfWeek: 1, startTime: '05:30', endTime: '07:00', name: 'Gi BJJ (All Levels)', active: true },
  { id: 'mon-1000-veterans-nogi', dayOfWeek: 1, startTime: '10:00', endTime: '11:00', name: 'Invictus Veterans No Gi BJJ', active: true },
  { id: 'mon-1200-gi-all', dayOfWeek: 1, startTime: '12:00', endTime: '13:00', name: 'Gi BJJ (All Levels)', active: true },
  { id: 'mon-1530-mini', dayOfWeek: 1, startTime: '15:30', endTime: '16:00', name: 'Mini Martial Arts (3-5 yrs)', active: true },
  { id: 'mon-1600-bullyproof', dayOfWeek: 1, startTime: '16:00', endTime: '16:45', name: 'Bullyproof BJJ (5-8 yrs)', active: true },
  { id: 'mon-1645-junior', dayOfWeek: 1, startTime: '16:45', endTime: '17:30', name: 'Junior Jiu Jitsu (8-16 yrs)', active: true },
  { id: 'mon-1730-nogi-fund', dayOfWeek: 1, startTime: '17:30', endTime: '18:30', name: 'No Gi BJJ Fundamentals', active: true },
  { id: 'mon-1830-mma', dayOfWeek: 1, startTime: '18:30', endTime: '19:30', name: 'MMA (All Levels)', active: true },
  { id: 'tue-0530-nogi-all', dayOfWeek: 2, startTime: '05:30', endTime: '07:00', name: 'No Gi BJJ (All Levels)', active: true },
  { id: 'tue-1000-veterans-gi', dayOfWeek: 2, startTime: '10:00', endTime: '11:00', name: 'Invictus Veterans Gi BJJ', active: true },
  { id: 'tue-1600-bullyproof', dayOfWeek: 2, startTime: '16:00', endTime: '16:45', name: 'Bullyproof BJJ (5-8 yrs)', active: true },
  { id: 'tue-1645-junior', dayOfWeek: 2, startTime: '16:45', endTime: '17:30', name: 'Junior Jiu Jitsu (8-16 yrs)', active: true },
  { id: 'tue-1730-gi-fund', dayOfWeek: 2, startTime: '17:30', endTime: '18:30', name: 'Gi BJJ Fundamentals', active: true },
  { id: 'tue-1830-gi-advanced', dayOfWeek: 2, startTime: '18:30', endTime: '19:30', name: 'Gi BJJ Advanced', active: true },
  { id: 'wed-0530-gi-all', dayOfWeek: 3, startTime: '05:30', endTime: '07:00', name: 'Gi BJJ (All Levels)', active: true },
  { id: 'wed-0900-qps', dayOfWeek: 3, startTime: '09:00', endTime: '10:00', name: 'Invictus QPS PJ', active: true },
  { id: 'wed-1000-veterans-mma', dayOfWeek: 3, startTime: '10:00', endTime: '11:00', name: 'Invictus Veterans MMA', active: true },
  { id: 'wed-1200-nogi-all', dayOfWeek: 3, startTime: '12:00', endTime: '13:00', name: 'No Gi BJJ (All Levels)', active: true },
  { id: 'wed-1530-mini', dayOfWeek: 3, startTime: '15:30', endTime: '16:00', name: 'Mini Martial Arts (3-5 yrs)', active: true },
  { id: 'wed-1600-bullyproof', dayOfWeek: 3, startTime: '16:00', endTime: '16:45', name: 'Bullyproof BJJ (5-8 yrs)', active: true },
  { id: 'wed-1645-junior', dayOfWeek: 3, startTime: '16:45', endTime: '17:30', name: 'Junior Jiu Jitsu (8-16 yrs)', active: true },
  { id: 'wed-1730-gi-fund', dayOfWeek: 3, startTime: '17:30', endTime: '18:30', name: 'Gi BJJ Fundamentals', active: true },
  { id: 'wed-1830-mma', dayOfWeek: 3, startTime: '18:30', endTime: '19:30', name: 'MMA (All Levels)', active: true },
  { id: 'thu-0530-nogi-all', dayOfWeek: 4, startTime: '05:30', endTime: '07:00', name: 'No Gi BJJ (All Levels)', active: true },
  { id: 'thu-1000-veterans-nogi', dayOfWeek: 4, startTime: '10:00', endTime: '11:00', name: 'Invictus Veterans No Gi BJJ', active: true },
  { id: 'thu-1600-bullyproof', dayOfWeek: 4, startTime: '16:00', endTime: '16:45', name: 'Bullyproof BJJ (5-8 yrs)', active: true },
  { id: 'thu-1645-junior', dayOfWeek: 4, startTime: '16:45', endTime: '17:30', name: 'Junior Jiu Jitsu (8-16 yrs)', active: true },
  { id: 'thu-1730-nogi-fund', dayOfWeek: 4, startTime: '17:30', endTime: '18:30', name: 'No Gi BJJ Fundamentals', active: true },
  { id: 'thu-1830-nogi-advanced', dayOfWeek: 4, startTime: '18:30', endTime: '19:30', name: 'No Gi BJJ Advanced', active: true },
  { id: 'fri-0530-open', dayOfWeek: 5, startTime: '05:30', endTime: '07:00', name: 'Open Mat (All Levels)', active: true },
  { id: 'fri-1000-veterans-gi', dayOfWeek: 5, startTime: '10:00', endTime: '11:00', name: 'Invictus Veterans Gi BJJ', active: true },
  { id: 'fri-1200-gi-all', dayOfWeek: 5, startTime: '12:00', endTime: '13:00', name: 'Gi BJJ (All Levels)', active: true },
  { id: 'sat-0900-nogi-all', dayOfWeek: 6, startTime: '09:00', endTime: '11:00', name: 'No Gi BJJ (All Levels)', active: true },
  { id: 'sun-1500-open', dayOfWeek: 0, startTime: '15:00', endTime: '16:00', name: 'Open Mat (All Levels)', active: true },
];
