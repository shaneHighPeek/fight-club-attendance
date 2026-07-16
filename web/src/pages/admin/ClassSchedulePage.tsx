import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { CLASS_SCHEDULE_TIMEZONE, DAY_NAMES } from '../../config/defaultClassSchedule';
import { getGoldCoastNow, loadClassOverrides, loadClassSchedule } from '../../services/classSchedule';
import { db } from '../../services/firebase';
import type { ClassOverride, ClassSession } from '../../types/classSchedule';

const EMPTY_SESSION: Omit<ClassSession, 'id'> = {
  dayOfWeek: 1,
  startTime: '18:30',
  endTime: '19:30',
  name: '',
  active: true,
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortSessions(sessions: ClassSession[]) {
  return [...sessions].sort((a, b) =>
    a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name),
  );
}

export function ClassSchedulePage() {
  const { role } = useAuth();
  const today = useMemo(() => getGoldCoastNow(), []);
  const canEditRecurring = role === 'admin' || role === 'manager';
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [overrides, setOverrides] = useState<ClassOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacementSessionId, setReplacementSessionId] = useState('');
  const [replacementName, setReplacementName] = useState('');
  const [replacementReason, setReplacementReason] = useState('');
  const [adHocName, setAdHocName] = useState('');
  const [adHocStart, setAdHocStart] = useState('18:30');
  const [adHocEnd, setAdHocEnd] = useState('19:30');
  const [showPermanentWarning, setShowPermanentWarning] = useState(false);
  const [showRecurringEditor, setShowRecurringEditor] = useState(false);
  const [selectedRecurringDay, setSelectedRecurringDay] = useState(today.dayOfWeek);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSessions, nextOverrides] = await Promise.all([
        loadClassSchedule(),
        loadClassOverrides(today.date),
      ]);
      setSessions(sortSessions(nextSessions));
      setOverrides(nextOverrides);
    } catch (loadError) {
      console.error(loadError);
      setError('Unable to load the class schedule.');
    } finally {
      setLoading(false);
    }
  }, [today.date]);

  useEffect(() => { void load(); }, [load]);

  const todaySessions = useMemo(
    () => sessions.filter((session) => session.active && session.dayOfWeek === today.dayOfWeek),
    [sessions, today.dayOfWeek],
  );
  const classNames = useMemo(() => Array.from(new Set(sessions.map((session) => session.name))).sort(), [sessions]);
  const selectedReplacementSession = todaySessions.find((session) => session.id === replacementSessionId);
  const selectedDaySessions = useMemo(
    () => sessions.filter((session) => session.dayOfWeek === selectedRecurringDay),
    [selectedRecurringDay, sessions],
  );

  function updateSession(id: string, patch: Partial<ClassSession>) {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch } : session));
  }

  function addSession() {
    setSessions((current) => [
      ...current,
      { id: newId('session'), ...EMPTY_SESSION, dayOfWeek: selectedRecurringDay },
    ]);
  }

  async function saveSchedule() {
    if (sessions.some((session) => !session.name.trim() || !session.startTime || !session.endTime)) {
      setError('Every class needs a name, start time, and end time.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const normalized = sortSessions(sessions.map((session) => ({ ...session, name: session.name.trim() })));
      await setDoc(doc(db, 'settings', 'classSchedule'), {
        timezone: CLASS_SCHEDULE_TIMEZONE,
        sessions: normalized,
        updatedAt: serverTimestamp(),
      });
      setSessions(normalized);
      setMessage('Recurring timetable saved.');
    } catch (saveError) {
      console.error(saveError);
      setError('Unable to save the timetable. Check your permissions.');
    } finally {
      setSaving(false);
    }
  }

  async function saveReplacement() {
    if (!selectedReplacementSession || !replacementName.trim()) {
      setError('Choose today’s scheduled class and enter its replacement.');
      return;
    }
    const overrideId = `${today.date}_${selectedReplacementSession.id}`;
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'classOverrides', overrideId), {
        date: today.date,
        scheduledSessionId: selectedReplacementSession.id,
        kind: 'replacement',
        actualName: replacementName.trim(),
        actualStartTime: selectedReplacementSession.startTime,
        actualEndTime: selectedReplacementSession.endTime,
        reason: replacementReason.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setReplacementSessionId('');
      setReplacementName('');
      setReplacementReason('');
      setMessage('Today’s substitution is now active on the kiosk.');
      await load();
    } catch (saveError) {
      console.error(saveError);
      setError('Unable to save today’s substitution.');
    } finally {
      setSaving(false);
    }
  }

  async function addAdHocClass() {
    if (!adHocName.trim() || !adHocStart || !adHocEnd) {
      setError('Enter a class name, start time, and end time.');
      return;
    }
    const overrideId = `${today.date}_${newId('adhoc')}`;
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'classOverrides', overrideId), {
        date: today.date,
        scheduledSessionId: null,
        kind: 'ad_hoc',
        actualName: adHocName.trim(),
        actualStartTime: adHocStart,
        actualEndTime: adHocEnd,
        reason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAdHocName('');
      setMessage('One-off class added for today.');
      await load();
    } catch (saveError) {
      console.error(saveError);
      setError('Unable to add the one-off class.');
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(id: string) {
    setSaving(true);
    setError(null);
    try {
      await deleteDoc(doc(db, 'classOverrides', id));
      setMessage('Today’s change was removed.');
      await load();
    } catch (removeError) {
      console.error(removeError);
      setError('Unable to remove today’s change.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page-admin">
      <h1>Class Schedule</h1>
      <p>Times use Gold Coast time ({CLASS_SCHEDULE_TIMEZONE}).</p>
      <div className="actions"><Link to="/admin">Back</Link></div>

      <div className="panel table-panel">
        <h2>One-off class today — {DAY_NAMES[today.dayOfWeek]}, {today.date}</h2>
        <p>Add an extra class for today only. It will not change the permanent weekly timetable.</p>
        <label>Class name<input list="class-name-options" value={adHocName} onChange={(event) => setAdHocName(event.target.value)} placeholder="e.g. Open Mat (All Levels)" /></label>
        <div className="schedule-time-grid">
          <label>Start<input type="time" value={adHocStart} onChange={(event) => setAdHocStart(event.target.value)} /></label>
          <label>End<input type="time" value={adHocEnd} onChange={(event) => setAdHocEnd(event.target.value)} /></label>
        </div>
        <button className="button" type="button" disabled={saving} onClick={() => void addAdHocClass()}>Add one-off class today</button>

        <div className="section-divider" />
        <h2>Substitute one of today’s classes</h2>
        <p>Replace a scheduled class for today only. Future weeks will remain unchanged.</p>
        <label>
          Scheduled class
          <select value={replacementSessionId} onChange={(event) => {
            const id = event.target.value;
            setReplacementSessionId(id);
            setReplacementName(todaySessions.find((session) => session.id === id)?.name ?? '');
          }}>
            <option value="">Select today’s class</option>
            {todaySessions.map((session) => <option key={session.id} value={session.id}>{session.startTime} — {session.name}</option>)}
          </select>
        </label>
        <label>
          Replacement class
          <input list="class-name-options" value={replacementName} onChange={(event) => setReplacementName(event.target.value)} placeholder="e.g. Open Mat (All Levels)" />
        </label>
        <label>
          Reason (optional)
          <input value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} placeholder="e.g. Instructor unavailable" />
        </label>
        <button className="button button-secondary" type="button" disabled={saving} onClick={() => void saveReplacement()}>Save today’s substitution</button>
        <datalist id="class-name-options">{classNames.map((name) => <option key={name} value={name} />)}</datalist>

        {overrides.length > 0 ? (
          <div className="table-wrap">
            <table className="attendance-table">
              <thead><tr><th>Today’s active change</th><th>Time</th><th>Reason</th><th>Action</th></tr></thead>
              <tbody>{overrides.map((override) => (
                <tr key={override.id}>
                  <td>{override.actualName}</td><td>{override.actualStartTime}–{override.actualEndTime}</td><td>{override.reason || '—'}</td>
                  <td><button className="button button-secondary" type="button" disabled={saving} onClick={() => void removeOverride(override.id)}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="panel table-panel">
        <h2>Permanent weekly schedule</h2>
        <p>Use this only when the normal timetable is changing for this week and every future week.</p>
        {!canEditRecurring ? <p>Only an administrator or manager can edit the permanent timetable.</p> : null}
        {canEditRecurring && !showPermanentWarning && !showRecurringEditor ? (
          <button className="button button-warning" type="button" onClick={() => setShowPermanentWarning(true)}>
            Edit permanent weekly schedule
          </button>
        ) : null}
        {showPermanentWarning && !showRecurringEditor ? (
          <div className="permanent-warning" role="alert">
            <h2>Permanent change warning</h2>
            <p>Changes made here affect the normal weekly schedule and all future check-ins. For a change that applies only today, use the section above.</p>
            <div className="actions">
              <button className="button button-warning" type="button" onClick={() => {
                setShowRecurringEditor(true);
                setShowPermanentWarning(false);
              }}>Continue to permanent schedule</button>
              <button className="button button-secondary" type="button" onClick={() => setShowPermanentWarning(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {showRecurringEditor ? (
          <>
            <div className="schedule-editor-header">
              <label>
                Select day
                <select value={selectedRecurringDay} onChange={(event) => setSelectedRecurringDay(Number(event.target.value))}>
                  {DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
              <button className="button button-secondary" type="button" onClick={() => setShowRecurringEditor(false)}>Close permanent editor</button>
            </div>
            <h2>{DAY_NAMES[selectedRecurringDay]} classes</h2>
            {selectedDaySessions.length === 0 ? <p>No recurring classes are scheduled for this day.</p> : null}
            {selectedDaySessions.length > 0 ? (
              <div className="table-wrap">
                <table className="attendance-table schedule-table">
                  <thead><tr><th>Start</th><th>End</th><th>Class</th><th>Active</th><th>Action</th></tr></thead>
                  <tbody>{selectedDaySessions.map((session) => (
                    <tr key={session.id}>
                      <td><input type="time" value={session.startTime} onChange={(event) => updateSession(session.id, { startTime: event.target.value })} /></td>
                      <td><input type="time" value={session.endTime} onChange={(event) => updateSession(session.id, { endTime: event.target.value })} /></td>
                      <td><input value={session.name} onChange={(event) => updateSession(session.id, { name: event.target.value })} /></td>
                      <td><input type="checkbox" checked={session.active} onChange={(event) => updateSession(session.id, { active: event.target.checked })} /></td>
                      <td><button className="button button-secondary" type="button" onClick={() => setSessions((current) => current.filter((item) => item.id !== session.id))}>Remove</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
            <div className="permanent-save-note">Changes are not applied until you save the permanent timetable.</div>
            <div className="actions"><button className="button button-secondary" type="button" onClick={addSession}>Add {DAY_NAMES[selectedRecurringDay]} class</button><button className="button button-warning" type="button" disabled={saving || loading} onClick={() => void saveSchedule()}>{saving ? 'Saving...' : 'Save permanent timetable'}</button></div>
          </>
        ) : null}
      </div>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
