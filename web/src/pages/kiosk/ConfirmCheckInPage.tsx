import { Timestamp, collection, doc, getDoc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ClassSessionSelect } from '../../components/ClassSessionSelect';
import { deriveAgeBandFromBirthDate, getDefaultRankStep, getRankStepById, toLegacyRank, toRankProfile } from '../../config/rankSystem';
import { WAIVER_VALIDITY_DAYS, WAIVER_VERSION } from '../../config/waiver';
import { db } from '../../services/firebase';
import type { AttendanceClassSnapshot } from '../../types/classSchedule';
import type { Member } from '../../types/member';

interface ConfirmState {
  member?: Member;
}

const COMEBACK_THRESHOLD_DAYS = 21;

interface CheckInCelebrationState {
  memberName: string;
  streakWeeks: number;
  daysAway: number;
  returningAfterBreak: boolean;
}

function getIsoWeekId(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function parseIsoWeekId(weekId: string) {
  const [yearRaw, weekRaw] = weekId.split('-');
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return null;
  }
  return { year, week };
}

function isConsecutiveIsoWeek(previousWeekId: string, currentWeekId: string) {
  const previous = parseIsoWeekId(previousWeekId);
  const current = parseIsoWeekId(currentWeekId);
  if (!previous || !current) {
    return false;
  }
  if (previous.year === current.year) {
    return current.week - previous.week === 1;
  }
  if (current.year - previous.year !== 1 || current.week !== 1) {
    return false;
  }
  return previous.week >= 52;
}

export function ConfirmCheckInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmState | null;
  const member = state?.member;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiverLoading, setWaiverLoading] = useState(false);
  const [requiresWaiverAck, setRequiresWaiverAck] = useState(false);
  const [selectedClass, setSelectedClass] = useState<AttendanceClassSnapshot | null>(null);

  useEffect(() => {
    async function loadWaiverStatus() {
      if (!member) {
        return;
      }
      setWaiverLoading(true);
      try {
        const memberSnapshot = await getDoc(doc(db, 'members', member.id));
        const memberData = memberSnapshot.data() as Record<string, unknown> | undefined;
        const waiverAcceptedAtRaw = memberData?.waiverAcceptedAt;
        const waiverVersionRaw = memberData?.waiverDisclaimerVersion;
        const waiverAcceptedAt =
          waiverAcceptedAtRaw instanceof Timestamp ? waiverAcceptedAtRaw.toDate() : null;
        const versionMismatch = waiverVersionRaw !== WAIVER_VERSION;

        if (!waiverAcceptedAt) {
          setRequiresWaiverAck(true);
          return;
        }

        const validUntil = new Date(waiverAcceptedAt);
        validUntil.setDate(validUntil.getDate() + WAIVER_VALIDITY_DAYS);
        setRequiresWaiverAck(validUntil.getTime() < Date.now() || versionMismatch);
      } catch (loadError) {
        console.error(loadError);
        setRequiresWaiverAck(true);
      } finally {
        setWaiverLoading(false);
      }
    }

    void loadWaiverStatus();
  }, [member]);

  async function handleCheckIn() {
    if (!member || isSubmitting) {
      return;
    }
    if (requiresWaiverAck) {
      setError('Please complete the waiver and signature before check-in.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    let celebrationState: CheckInCelebrationState | null = null;

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
        const memberRankProfileRaw =
          typeof memberData.rankProfile === 'object' && memberData.rankProfile !== null
            ? (memberData.rankProfile as Record<string, unknown>)
            : null;
        const ageBand =
          memberData.ageBand === 'under_8' || memberData.ageBand === 'youth_8_15' || memberData.ageBand === 'adult_16_plus'
            ? memberData.ageBand
            : deriveAgeBandFromBirthDate(typeof memberData.birthDate === 'string' ? memberData.birthDate : member.birthDate);
        const fallbackStep = getDefaultRankStep(ageBand);
        const fallbackProfile = toRankProfile(fallbackStep);
        const resolvedStep =
          typeof memberRankProfileRaw?.rankStepId === 'string'
            ? getRankStepById(memberRankProfileRaw.rankStepId)
            : null;
        const rankProfile = resolvedStep ? toRankProfile(resolvedStep) : fallbackProfile;
        const legacyRank = toLegacyRank(rankProfile);
        const belt = typeof docRank?.belt === 'string' ? docRank.belt : member.rank?.belt ?? legacyRank.belt;
        const stripes =
          typeof docRank?.stripes === 'number' ? docRank.stripes : (member.rank?.stripes ?? legacyRank.stripes);
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
        const now = new Date();
        const currentWeekId = getIsoWeekId(now);
        const previousWeekId = typeof memberData.streakLastWeekId === 'string' ? memberData.streakLastWeekId : null;
        const previousStreak =
          typeof memberData.streakCurrentWeeks === 'number' ? memberData.streakCurrentWeeks : 0;
        const previousBest =
          typeof memberData.streakBestWeeks === 'number' ? memberData.streakBestWeeks : 0;
        const lastCheckInRaw = memberData.lastCheckIn;
        const lastCheckInDate = lastCheckInRaw instanceof Timestamp ? lastCheckInRaw.toDate() : null;
        const daysAway = lastCheckInDate
          ? Math.floor((now.getTime() - lastCheckInDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0;

        let streakCurrentWeeks = previousStreak > 0 ? previousStreak : 1;
        if (!previousWeekId) {
          streakCurrentWeeks = 1;
        } else if (previousWeekId === currentWeekId) {
          streakCurrentWeeks = previousStreak > 0 ? previousStreak : 1;
        } else if (isConsecutiveIsoWeek(previousWeekId, currentWeekId)) {
          streakCurrentWeeks = (previousStreak > 0 ? previousStreak : 1) + 1;
        } else {
          // Neutral reset after a gap week.
          streakCurrentWeeks = 1;
        }
        const streakBestWeeks = Math.max(previousBest, streakCurrentWeeks);

        const attendanceRef = doc(collection(db, 'attendanceLogs'));
        const timestamp = serverTimestamp();

        transaction.set(attendanceRef, {
          memberId: member.id,
          checkInTime: timestamp,
          type: 'member',
          status: 'completed',
          locationId: 'ashmore',
          memberRankAtCheckIn: rankAtCheckIn,
          memberRankProfileAtCheckIn: rankProfile,
          attendanceLevel,
          streakWeeksAtCheckIn: streakCurrentWeeks,
          daysSinceLastCheckIn: daysAway,
          returningAfterBreak: daysAway >= COMEBACK_THRESHOLD_DAYS,
          classSession: selectedClass,
          createdAt: timestamp,
        });

        const memberUpdate: Record<string, unknown> = {
          lastCheckIn: timestamp,
          totalCheckIns: increment(1),
          [`rankAttendance.${rankAttendanceKey}`]: increment(1),
          streakCurrentWeeks,
          streakBestWeeks,
          streakLastWeekId: currentWeekId,
          updatedAt: timestamp,
        };

        if (requiresWaiverAck) {
          memberUpdate.waiverAcceptedAt = timestamp;
          memberUpdate.waiverDisclaimerVersion = WAIVER_VERSION;
        }

        transaction.update(memberRef, memberUpdate);

        celebrationState = {
          memberName: `${member.firstName} ${member.lastName}`.trim(),
          streakWeeks: streakCurrentWeeks,
          daysAway,
          returningAfterBreak: daysAway >= COMEBACK_THRESHOLD_DAYS,
        };
      });

      navigate('/kiosk/success', { state: celebrationState });
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
        {member.nickname ? (
          <p>
            <strong>Nickname:</strong> {member.nickname}
          </p>
        ) : null}
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
          <strong>Rank:</strong> {member.rankProfile ? `${member.rankProfile.beltName} (${String(member.rankProfile.degreeLevel)})` : (member.rank ? `${member.rank.belt} (${member.rank.stripes} stripes)` : 'Not set')}
        </p>
      </div>
      <ClassSessionSelect onSelectionChange={setSelectedClass} />
      <div className="actions">
        <button className="button" onClick={handleCheckIn} type="button" disabled={isSubmitting}>
          {isSubmitting ? 'Checking in...' : 'Check In'}
        </button>
        <Link to="/kiosk/member-lookup">Back</Link>
      </div>
      {waiverLoading ? <p>Checking waiver status...</p> : null}
      {requiresWaiverAck ? (
        <div className="panel">
          <p>
            Waiver signature is required every 6 months before check-in.
          </p>
          <button
            className="button"
            type="button"
            onClick={() => navigate('/kiosk/casual-waiver', { state: { member, mode: 'member-waiver' } })}
          >
            Review and Sign Waiver
          </button>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
