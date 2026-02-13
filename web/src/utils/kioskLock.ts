const FAILED_LOOKUPS_KEY = 'kiosk_failed_lookups';
const LOCKED_KEY = 'kiosk_locked';
export const KIOSK_LOCK_THRESHOLD = 5;

function readInt(key: string): number {
  const raw = localStorage.getItem(key);
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isKioskLocked(): boolean {
  return localStorage.getItem(LOCKED_KEY) === '1';
}

export function setKioskLocked(locked: boolean) {
  if (locked) {
    localStorage.setItem(LOCKED_KEY, '1');
  } else {
    localStorage.removeItem(LOCKED_KEY);
  }
}

export function resetFailedLookups() {
  localStorage.removeItem(FAILED_LOOKUPS_KEY);
}

export function registerFailedLookupAndCheckLock(): { failedLookups: number; locked: boolean } {
  const next = readInt(FAILED_LOOKUPS_KEY) + 1;
  localStorage.setItem(FAILED_LOOKUPS_KEY, String(next));
  const locked = next >= KIOSK_LOCK_THRESHOLD;
  if (locked) {
    setKioskLocked(true);
  }
  return { failedLookups: next, locked };
}
