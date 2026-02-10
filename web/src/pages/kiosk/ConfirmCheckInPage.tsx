import { collection, doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { db } from '../../services/firebase';
import type { Member } from '../../types/member';

interface ConfirmState {
  member?: Member;
}

export function ConfirmCheckInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmState | null;
  const member = state?.member;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckIn() {
    if (!member || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, 'members', member.id);
        const memberSnapshot = await transaction.get(memberRef);

        if (!memberSnapshot.exists()) {
          throw new Error('Member record no longer exists.');
        }

        const memberData = memberSnapshot.data() as Record<string, unknown>;
        const docRank =
          typeof memberData.rank === 'object' && memberData.rank !== null
            ? (memberData.rank as Record<string, unknown>)
            : null;
        const belt = typeof docRank?.belt === 'string' ? docRank.belt : member.rank?.belt ?? 'white';
        const stripes =
          typeof docRank?.stripes === 'number' ? docRank.stripes : (member.rank?.stripes ?? 0);
        const rankAtCheckIn = { belt, stripes };
        const rankAttendanceKey = `${belt}_${stripes}`;
        const rankAttendance =
          typeof memberData.rankAttendance === 'object' && memberData.rankAttendance !== null
            ? (memberData.rankAttendance as Record<string, unknown>)
            : {};
        const currentRankAttendance = typeof rankAttendance[rankAttendanceKey] === 'number'
          ? rankAttendance[rankAttendanceKey]
          : 0;
        const attendanceLevel = currentRankAttendance + 1;

        const attendanceRef = doc(collection(db, 'attendanceLogs'));
        const timestamp = serverTimestamp();

        transaction.set(attendanceRef, {
          memberId: member.id,
          checkInTime: timestamp,
          type: 'member',
          status: 'completed',
          locationId: 'ashmore',
          memberRankAtCheckIn: rankAtCheckIn,
          attendanceLevel,
          createdAt: timestamp,
        });

        transaction.update(memberRef, {
          lastCheckIn: timestamp,
          totalCheckIns: increment(1),
          [`rankAttendance.${rankAttendanceKey}`]: increment(1),
          updatedAt: timestamp,
        });
      });

      navigate('/kiosk/success');
    } catch (writeError) {
      console.error(writeError);
      setError('Check-in failed. Please try again or ask staff for help.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!member) {
    return (
      <main className="page page-kiosk">
        <h1>Confirm Check-in</h1>
        <p>No member selected yet.</p>
        <Link to="/kiosk/member-lookup">Back to Lookup</Link>
      </main>
    );
  }

  return (
    <main className="page page-kiosk">
      <h1>Confirm Check-in</h1>
      <div className="panel">
        <p>
          <strong>Name:</strong> {member.firstName} {member.lastName}
        </p>
        <p>
          <strong>Member #:</strong> {member.memberNumber}
        </p>
        <p>
          <strong>Status:</strong> {member.status}
        </p>
        <p>
          <strong>Membership:</strong> {member.membershipType}
        </p>
        <p>
          <strong>Rank:</strong> {member.rank ? `${member.rank.belt} (${member.rank.stripes} stripes)` : 'Not set'}
        </p>
      </div>
      <div className="actions">
        <button className="button" onClick={handleCheckIn} type="button" disabled={isSubmitting}>
          {isSubmitting ? 'Checking in...' : 'Check In'}
        </button>
        <Link to="/kiosk/member-lookup">Back</Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
