import {
  documentId,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { db } from '../../services/firebase';

interface AttendanceLogRow {
  id: string;
  memberId: string;
  memberName: string;
  memberNickname: string;
  membershipType: string;
  belt: string;
  stripes: number | null;
  attendanceLevel: number | null;
  className: string;
  classTime: string;
  isSubstitution: boolean;
  checkInTime: Date | null;
}

const ATTENDANCE_LIMIT = 50;

function formatCheckInTime(value: Date | null) {
  if (!value) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function chunk<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function AttendancePage() {
  const [logs, setLogs] = useState<AttendanceLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const constraints: QueryConstraint[] = [orderBy('checkInTime', 'desc'), limit(ATTENDANCE_LIMIT)];
      if (todayOnly) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        constraints.unshift(where('checkInTime', '>=', Timestamp.fromDate(startOfToday)));
      }

      const attendanceQuery = query(collection(db, 'attendanceLogs'), ...constraints);
      const attendanceSnapshot = await getDocs(attendanceQuery);

      const rawLogs = attendanceSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const checkInTime = data.checkInTime instanceof Timestamp ? data.checkInTime.toDate() : null;
        const classSession = typeof data.classSession === 'object' && data.classSession !== null
          ? data.classSession as Record<string, unknown>
          : null;
        return {
          id: docSnap.id,
          memberId: typeof data.memberId === 'string' ? data.memberId : 'unknown',
          membershipType: 'unknown',
          belt:
            typeof data.memberRankAtCheckIn === 'object' &&
            data.memberRankAtCheckIn !== null &&
            'belt' in data.memberRankAtCheckIn &&
            typeof data.memberRankAtCheckIn.belt === 'string'
              ? data.memberRankAtCheckIn.belt
              : 'unknown',
          stripes:
            typeof data.memberRankAtCheckIn === 'object' &&
            data.memberRankAtCheckIn !== null &&
            'stripes' in data.memberRankAtCheckIn &&
            typeof data.memberRankAtCheckIn.stripes === 'number'
              ? data.memberRankAtCheckIn.stripes
              : null,
          attendanceLevel: typeof data.attendanceLevel === 'number' ? data.attendanceLevel : null,
          className: typeof classSession?.actualClassName === 'string' ? classSession.actualClassName : 'Not recorded',
          classTime: typeof classSession?.startTime === 'string' ? classSession.startTime : '—',
          isSubstitution: classSession?.isSubstitution === true,
          checkInTime,
        };
      });

      const uniqueMemberIds = Array.from(
        new Set(rawLogs.map((entry) => entry.memberId).filter((memberId) => memberId !== 'unknown')),
      );
      const memberInfoById = new Map<string, { name: string; nickname: string; membershipType: string }>();

      for (const memberIdChunk of chunk(uniqueMemberIds, 10)) {
        const membersSnapshot = await getDocs(
          query(collection(db, 'members'), where(documentId(), 'in', memberIdChunk)),
        );
        for (const memberDoc of membersSnapshot.docs) {
          const data = memberDoc.data();
          const firstName = typeof data.firstName === 'string' ? data.firstName : '';
          const lastName = typeof data.lastName === 'string' ? data.lastName : '';
          const nickname = typeof data.nickname === 'string' ? data.nickname : '';
          const fullName = `${firstName} ${lastName}`.trim();
          const membershipType = typeof data.membershipType === 'string' ? data.membershipType : 'unknown';
          memberInfoById.set(memberDoc.id, {
            name: fullName || memberDoc.id,
            nickname,
            membershipType,
          });
        }
      }

      setLogs(
        rawLogs.map((entry) => ({
          ...entry,
          memberName: memberInfoById.get(entry.memberId)?.name ?? entry.memberId,
          memberNickname: memberInfoById.get(entry.memberId)?.nickname ?? '',
          membershipType: memberInfoById.get(entry.memberId)?.membershipType ?? 'unknown',
        })),
      );
    } catch (loadError) {
      console.error(loadError);
      setError('Unable to load attendance right now.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [todayOnly]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  const filteredLogs = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase();
    if (!searchValue) {
      return logs;
    }

    return logs.filter((entry) => {
      const byName = entry.memberName.toLowerCase().includes(searchValue);
      const byNickname = entry.memberNickname.toLowerCase().includes(searchValue);
      const byId = entry.memberId.toLowerCase().includes(searchValue);
      const byClass = entry.className.toLowerCase().includes(searchValue);
      return byName || byNickname || byId || byClass;
    });
  }, [logs, searchTerm]);

  return (
    <main className="page page-admin">
      <h1>Attendance</h1>
      <p>Recent check-ins (latest {ATTENDANCE_LIMIT}{todayOnly ? ', today only' : ''}).</p>

      <div className="actions">
        <button className="button" onClick={() => void loadAttendance()} disabled={loading} type="button">
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <Link to="/admin">Back</Link>
      </div>

      <div className="panel">
        <label>
          Search by member name, nickname, ID, or class
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="e.g. shane or ASH-000001"
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={todayOnly}
            onChange={(event) => setTodayOnly(event.target.checked)}
          />
          Today only
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {filteredLogs.length === 0 && !loading ? <p>No attendance logs found for this filter.</p> : null}

      {filteredLogs.length > 0 ? (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Check-in Date</th>
                  <th>Membership</th>
                  <th>Class</th>
                  <th>Class Time</th>
                  <th>Belt</th>
                  <th>Stripes</th>
                  <th>Sessions at Current Stripe</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.memberName}{entry.memberNickname ? ` (${entry.memberNickname})` : ''}</td>
                    <td>{formatCheckInTime(entry.checkInTime)}</td>
                    <td>{entry.membershipType}</td>
                    <td>{entry.className}{entry.isSubstitution ? ' (substitute)' : ''}</td>
                    <td>{entry.classTime}</td>
                    <td>{entry.belt}</td>
                    <td>{entry.stripes ?? '?'}</td>
                    <td>{entry.attendanceLevel ?? '?'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </main>
  );
}
