import { useEffect, useMemo, useState } from 'react';

import { DAY_NAMES } from '../config/defaultClassSchedule';
import { getGoldCoastNow, loadClassOverrides, loadClassSchedule, resolveSessionsForDate, selectLikelyClass } from '../services/classSchedule';
import type { AttendanceClassSnapshot } from '../types/classSchedule';

interface Props {
  onSelectionChange: (selection: AttendanceClassSnapshot | null) => void;
}

function displayTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hour, minute));
}

export function ClassSessionSelect({ onSelectionChange }: Props) {
  const [sessions, setSessions] = useState<AttendanceClassSnapshot[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const context = useMemo(() => getGoldCoastNow(), []);

  useEffect(() => {
    async function load() {
      try {
        const [schedule, overrides] = await Promise.all([
          loadClassSchedule(),
          loadClassOverrides(context.date),
        ]);
        const resolved = resolveSessionsForDate(schedule, overrides, context);
        const likely = selectLikelyClass(resolved, context.minutes);
        setSessions(resolved);
        setSelectedTime(likely?.startTime ?? '');
        setSelectedKey(likely ? `${likely.scheduledSessionId ?? 'adhoc'}:${likely.overrideId ?? 'standard'}:${likely.actualClassName}` : '');
      } catch (loadError) {
        console.error(loadError);
        setError('Class schedule is temporarily unavailable. Ask staff for help.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [context]);

  const timeOptions = useMemo(() => Array.from(new Set(sessions.map((session) => session.startTime))), [sessions]);
  const classOptions = useMemo(() => sessions.filter((session) => session.startTime === selectedTime), [sessions, selectedTime]);
  const selected = classOptions.find((session) =>
    `${session.scheduledSessionId ?? 'adhoc'}:${session.overrideId ?? 'standard'}:${session.actualClassName}` === selectedKey,
  ) ?? null;

  useEffect(() => {
    onSelectionChange(selected);
  }, [onSelectionChange, selected]);

  function handleTimeChange(nextTime: string) {
    setSelectedTime(nextTime);
    const first = sessions.find((session) => session.startTime === nextTime);
    setSelectedKey(first ? `${first.scheduledSessionId ?? 'adhoc'}:${first.overrideId ?? 'standard'}:${first.actualClassName}` : '');
  }

  return (
    <div className="panel class-selector">
      <h2>Class</h2>
      <p>{DAY_NAMES[context.dayOfWeek]}, {context.date} (Gold Coast time)</p>
      <label>
        Class time
        <select value={selectedTime} onChange={(event) => handleTimeChange(event.target.value)} disabled={loading} required>
          <option value="">Select class time</option>
          {timeOptions.map((time) => <option key={time} value={time}>{displayTime(time)}</option>)}
        </select>
      </label>
      <label>
        Class name
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={!selectedTime || loading} required>
          <option value="">Select class</option>
          {classOptions.map((session) => {
            const key = `${session.scheduledSessionId ?? 'adhoc'}:${session.overrideId ?? 'standard'}:${session.actualClassName}`;
            return <option key={key} value={key}>{session.actualClassName}{session.isSubstitution ? ' (today only)' : ''}</option>;
          })}
        </select>
      </label>
      {!loading && sessions.length === 0 ? <p>No classes are scheduled today.</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
