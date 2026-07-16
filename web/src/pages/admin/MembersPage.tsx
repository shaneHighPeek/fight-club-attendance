import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAt,
  where,
  endAt,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { db, functions } from '../../services/firebase';
import {
  deriveAgeBandFromBirthDate,
  getDefaultRankStep,
  getRankStepById,
  getRankStepsForAgeBand,
  toLegacyRank,
  toRankProfile,
  type AgeBand,
} from '../../config/rankSystem';
import type { Belt, Member } from '../../types/member';

const MAX_RESULTS = 15;
const STATUS_OPTIONS: Array<{ value: Member['status']; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'temp', label: 'Temp' },
  { value: 'null', label: 'NULL' },
];

const AGE_BANDS: Array<{ value: AgeBand; label: string }> = [
  { value: 'under_8', label: 'Under 8' },
  { value: 'youth_8_15', label: '8-15 (Youth)' },
  { value: 'adult_16_plus', label: '16+ (Adult)' },
];

interface MemberRankHistory {
  id: string;
  fromBelt: Belt;
  fromStripes: number;
  toBelt: Belt;
  toStripes: number;
  effectiveAt: Date;
  note?: string;
}

interface AttendanceLogSnapshot {
  checkInTime: Date;
  belt: Belt;
  stripes: number;
}

interface RankPeriodRow {
  id: string;
  rankLabel: string;
  periodLabel: string;
  sessionCount: number;
  note: string;
}

interface LinkedStaffRow {
  uid: string;
  email: string;
  role: string;
}

interface WaiverCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  version: string;
  signedAt: Date | null;
  memberId?: string;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function mapMember(docId: string, data: Record<string, unknown>): Member {
  const rank = data.rank as Member['rank'] | undefined;
  const waiverAcceptedAt = data.waiverAcceptedAt instanceof Timestamp ? data.waiverAcceptedAt.toDate() : null;
  return {
    id: docId,
    memberNumber: typeof data.memberNumber === 'string' ? data.memberNumber : docId,
    firstName: typeof data.firstName === 'string' ? data.firstName : 'Unknown',
    lastName: typeof data.lastName === 'string' ? data.lastName : 'Member',
    nickname: typeof data.nickname === 'string' ? data.nickname : undefined,
    phone: typeof data.phone === 'string' ? data.phone : '',
    email: typeof data.email === 'string' ? data.email : undefined,
    birthDate: typeof data.birthDate === 'string' ? data.birthDate : undefined,
    ageBand:
      data.ageBand === 'under_8' || data.ageBand === 'youth_8_15' || data.ageBand === 'adult_16_plus'
        ? data.ageBand
        : undefined,
    rankProfile:
      typeof data.rankProfile === 'object' && data.rankProfile !== null
        ? (data.rankProfile as Member['rankProfile'])
        : undefined,
    status:
      data.status === 'active' ||
      data.status === 'pending' ||
      data.status === 'failed' ||
      data.status === 'stopped' ||
      data.status === 'temp' ||
      data.status === 'null' ||
      data.status === 'inactive' ||
      data.status === 'suspended'
        ? data.status
        : 'null',
    membershipType: typeof data.membershipType === 'string' ? data.membershipType : 'unknown',
    waiverAcceptedAt,
    waiverDisclaimerVersion: typeof data.waiverDisclaimerVersion === 'string' ? data.waiverDisclaimerVersion : undefined,
    rank,
  };
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
}

function formatPeriod(start: Date, end?: Date | null) {
  if (!end) {
    return `${formatDate(start)} -> Present`;
  }
  return `${formatDate(start)} -> ${formatDate(end)}`;
}

function isBelt(value: unknown): value is Belt {
  return typeof value === 'string' && value.length > 0;
}

function isStripes(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeColour(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
}

function deriveRankStepId(member: Member, ageBand: AgeBand): string {
  if (member.rankProfile?.rankStepId && getRankStepById(member.rankProfile.rankStepId)) {
    return member.rankProfile.rankStepId;
  }

  const rank = member.rank;
  const steps = getRankStepsForAgeBand(ageBand);
  if (!rank) {
    return getDefaultRankStep(ageBand).id;
  }

  const desiredBelt = normalizeColour(rank.belt);
  const desiredDegree = typeof rank.stripes === 'number' ? rank.stripes : 0;

  const exact = steps.find((step) => normalizeColour(step.baseColour) === desiredBelt && step.degreeLevel === desiredDegree);
  if (exact) {
    return exact.id;
  }

  const byBase = steps.find((step) => normalizeColour(step.baseColour) === desiredBelt);
  if (byBase) {
    return byBase.id;
  }

  return getDefaultRankStep(ageBand).id;
}

export function MembersPage() {
  const { role, user } = useAuth();
  const [term, setTerm] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [history, setHistory] = useState<MemberRankHistory[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogSnapshot[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [savingRank, setSavingRank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedAgeBand, setSelectedAgeBand] = useState<AgeBand>('adult_16_plus');
  const [selectedRankStepId, setSelectedRankStepId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<Member['status']>('active');
  const [selectedNickname, setSelectedNickname] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [staffEmailToLink, setStaffEmailToLink] = useState('');
  const [linkingStaff, setLinkingStaff] = useState(false);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [waiverCandidates, setWaiverCandidates] = useState<WaiverCandidate[]>([]);
  const [linkingWaiverId, setLinkingWaiverId] = useState<string | null>(null);

  const canEditRank = role === 'admin' || role === 'manager';
  const rankOptions = useMemo(() => getRankStepsForAgeBand(selectedAgeBand), [selectedAgeBand]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingMembers(true);
    setError(null);
    setSaveMessage(null);

    try {
      const input = term.trim();
      if (input.length < 2) {
        setError('Enter at least 2 characters to search.');
        setMembers([]);
        setSelectedMember(null);
        return;
      }

      const membersCollection = collection(db, 'members');
      const byId = new Map<string, Member>();
      const inputLower = input.toLowerCase();
      const inputUpper = input.toUpperCase();

      const lastNameQuery = query(
        membersCollection,
        orderBy('lastNameLower'),
        startAt(inputLower),
        endAt(`${inputLower}\uf8ff`),
        limit(MAX_RESULTS),
      );

      const lastNameSnapshot = await getDocs(lastNameQuery);
      for (const docSnap of lastNameSnapshot.docs) {
        byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
      }

      const nicknameQuery = query(
        membersCollection,
        orderBy('nicknameLower'),
        startAt(inputLower),
        endAt(`${inputLower}\uf8ff`),
        limit(MAX_RESULTS),
      );
      const nicknameSnapshot = await getDocs(nicknameQuery);
      for (const docSnap of nicknameSnapshot.docs) {
        byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
      }

      const memberNumberQuery = query(membersCollection, where('memberNumber', '==', inputUpper), limit(MAX_RESULTS));
      const memberNumberSnapshot = await getDocs(memberNumberQuery);
      for (const docSnap of memberNumberSnapshot.docs) {
        byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
      }

      const normalizedPhone = normalizePhone(input);
      if (normalizedPhone.length >= 3) {
        const phoneQuery = query(membersCollection, where('phone', '==', input), limit(MAX_RESULTS));
        const phoneSnapshot = await getDocs(phoneQuery);
        for (const docSnap of phoneSnapshot.docs) {
          byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
        }
      }

      // Fallback scan for imported records missing lastNameLower / firstNameLower fields.
      const fallbackScan = await getDocs(query(membersCollection, limit(500)));
      for (const docSnap of fallbackScan.docs) {
        const mapped = mapMember(docSnap.id, docSnap.data());
        const firstNameMatches = mapped.firstName.toLowerCase().includes(inputLower);
        const lastNameMatches = mapped.lastName.toLowerCase().includes(inputLower);
        const nicknameMatches = (mapped.nickname ?? '').toLowerCase().includes(inputLower);
        const memberNumberMatches = mapped.memberNumber.toUpperCase().includes(inputUpper);
        const phoneMatches = normalizedPhone.length >= 3 && normalizePhone(mapped.phone).includes(normalizedPhone);
        if (firstNameMatches || lastNameMatches || nicknameMatches || memberNumberMatches || phoneMatches) {
          byId.set(docSnap.id, mapped);
        }
      }

      const nextMembers = Array.from(byId.values());
      setMembers(nextMembers);
      setSelectedMember(null);
      setHistory([]);
      setAttendanceLogs([]);
    } catch (searchError) {
      console.error(searchError);
      setError('Member search failed.');
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function loadMemberTimeline(member: Member) {
    setLoadingTimeline(true);
    setError(null);
    setSaveMessage(null);
    try {
      const latestMemberSnapshot = await getDoc(doc(db, 'members', member.id));
      const effectiveMember = latestMemberSnapshot.exists()
        ? mapMember(member.id, latestMemberSnapshot.data() as Record<string, unknown>)
        : member;

      const historySnapshot = await getDocs(query(collection(db, 'memberRankHistory'), where('memberId', '==', member.id)));
      const nextHistory: MemberRankHistory[] = [];
      for (const docSnap of historySnapshot.docs) {
        const data = docSnap.data();
        const fromBelt = data.fromBelt;
        const fromStripes = data.fromStripes;
        const toBelt = data.toBelt;
        const toStripes = data.toStripes;
        const effectiveAt = data.effectiveAt;

        if (
          !isBelt(fromBelt) ||
          !isStripes(fromStripes) ||
          !isBelt(toBelt) ||
          !isStripes(toStripes) ||
          !(effectiveAt instanceof Timestamp)
        ) {
          continue;
        }

        nextHistory.push({
          id: docSnap.id,
          fromBelt,
          fromStripes,
          toBelt,
          toStripes,
          effectiveAt: effectiveAt.toDate(),
          note: typeof data.note === 'string' ? data.note : '',
        });
      }
      nextHistory.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());

      const attendanceSnapshot = await getDocs(query(collection(db, 'attendanceLogs'), where('memberId', '==', member.id)));
      const nextLogs: AttendanceLogSnapshot[] = [];
      for (const docSnap of attendanceSnapshot.docs) {
        const data = docSnap.data();
        if (!(data.checkInTime instanceof Timestamp)) {
          continue;
        }
        const rank = data.memberRankAtCheckIn;
        if (
          typeof rank === 'object' &&
          rank !== null &&
          isBelt(rank.belt) &&
          isStripes(rank.stripes)
        ) {
          nextLogs.push({
            checkInTime: data.checkInTime.toDate(),
            belt: rank.belt,
            stripes: rank.stripes,
          });
        }
      }

      const linkedStaffSnapshot = await getDocs(query(collection(db, 'staffUsers'), where('memberId', '==', member.id)));
      const nextLinkedStaff: LinkedStaffRow[] = linkedStaffSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          uid: docSnap.id,
          email: typeof data.email === 'string' ? data.email : 'unknown',
          role: typeof data.role === 'string' ? data.role : 'member',
        };
      });
      nextLinkedStaff.sort((a, b) => a.email.localeCompare(b.email));

      const waiverById = new Map<string, WaiverCandidate>();
      const waiverQueries = [];
      if (effectiveMember.phone) {
        waiverQueries.push(getDocs(query(collection(db, 'waivers'), where('phone', '==', effectiveMember.phone))));
      }
      if (effectiveMember.email) {
        waiverQueries.push(
          getDocs(query(collection(db, 'waivers'), where('email', '==', effectiveMember.email.toLowerCase()))),
        );
      }
      waiverQueries.push(getDocs(query(collection(db, 'waivers'), where('memberId', '==', member.id))));
      const waiverSnapshots = await Promise.all(waiverQueries);

      for (const snapshot of waiverSnapshots) {
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          waiverById.set(docSnap.id, {
            id: docSnap.id,
            firstName: typeof data.firstName === 'string' ? data.firstName : 'Unknown',
            lastName: typeof data.lastName === 'string' ? data.lastName : 'Waiver',
            email: typeof data.email === 'string' ? data.email : '',
            phone: typeof data.phone === 'string' ? data.phone : '',
            version: typeof data.version === 'string' ? data.version : 'unknown',
            signedAt: data.signedAt instanceof Timestamp ? data.signedAt.toDate() : null,
            memberId: typeof data.memberId === 'string' ? data.memberId : undefined,
          });
        }
      }
      const nextWaiverCandidates = Array.from(waiverById.values()).sort((a, b) => {
        const aTime = a.signedAt ? a.signedAt.getTime() : 0;
        const bTime = b.signedAt ? b.signedAt.getTime() : 0;
        return bTime - aTime;
      });

      setHistory(nextHistory);
      setAttendanceLogs(nextLogs);
      setLinkedStaff(nextLinkedStaff);
      setWaiverCandidates(nextWaiverCandidates);
      setSelectedMember(effectiveMember);
      const ageBand = effectiveMember.rankProfile?.ageBand ?? effectiveMember.ageBand ?? deriveAgeBandFromBirthDate(effectiveMember.birthDate);
      const stepId = deriveRankStepId(effectiveMember, ageBand);
      const step = getRankStepById(stepId) ?? getDefaultRankStep(ageBand);
      setSelectedAgeBand(ageBand);
      setSelectedRankStepId(step.id);
      setSelectedStatus(effectiveMember.status);
      setSelectedNickname(effectiveMember.nickname ?? '');
      setChangeNote('');
      setStaffEmailToLink('');
    } catch (timelineError) {
      console.error(timelineError);
      setError('Failed to load member timeline.');
      setHistory([]);
      setAttendanceLogs([]);
      setLinkedStaff([]);
      setWaiverCandidates([]);
      setSelectedMember(member);
      setSelectedNickname(member.nickname ?? '');
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function handleSaveRank() {
    if (!selectedMember || savingRank || !canEditRank) {
      return;
    }

    const currentAgeBand = selectedMember.rankProfile?.ageBand ?? selectedMember.ageBand ?? deriveAgeBandFromBirthDate(selectedMember.birthDate);
    const currentStepId = selectedMember.rankProfile?.rankStepId ?? deriveRankStepId(selectedMember, currentAgeBand);
    const rankChanged = !(currentAgeBand === selectedAgeBand && currentStepId === selectedRankStepId);
    const statusChanged = selectedMember.status !== selectedStatus;
    const normalizedNickname = selectedNickname.trim();
    const nicknameChanged = (selectedMember.nickname ?? '') !== normalizedNickname;

    if (!rankChanged && !statusChanged && !nicknameChanged) {
      setSaveMessage('No member changes to save.');
      return;
    }

    setSavingRank(true);
    setError(null);
    setSaveMessage(null);
    try {
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, 'members', selectedMember.id);
        const memberSnapshot = await transaction.get(memberRef);
        if (!memberSnapshot.exists()) {
          throw new Error('Member no longer exists.');
        }

        const memberData = memberSnapshot.data() as Record<string, unknown>;
        const now = Timestamp.now();
        const updates: Record<string, unknown> = {
          status: selectedStatus,
          nickname: normalizedNickname || null,
          nicknameLower: normalizedNickname ? normalizedNickname.toLowerCase() : null,
          updatedAt: now,
        };

        if (rankChanged) {
          const rank = memberData.rank as Record<string, unknown> | undefined;
          const fromBelt = isBelt(rank?.belt) ? rank.belt : 'white';
          const fromStripes = isStripes(rank?.stripes) ? rank.stripes : 0;
          const fromAgeBand =
            memberData.ageBand === 'under_8' || memberData.ageBand === 'youth_8_15' || memberData.ageBand === 'adult_16_plus'
              ? (memberData.ageBand as AgeBand)
              : deriveAgeBandFromBirthDate(typeof memberData.birthDate === 'string' ? memberData.birthDate : selectedMember.birthDate);

          const fromRankProfile =
            typeof memberData.rankProfile === 'object' && memberData.rankProfile !== null
              ? (memberData.rankProfile as Member['rankProfile'])
              : null;

          const targetStep = getRankStepById(selectedRankStepId) ?? getDefaultRankStep(selectedAgeBand);
          const targetRankProfile = toRankProfile(targetStep);
          const targetLegacyRank = toLegacyRank(targetRankProfile);
          const historyRef = doc(collection(db, 'memberRankHistory'));

          updates.ageBand = selectedAgeBand;
          updates.rankProfile = targetRankProfile;
          updates.rank = {
            belt: targetLegacyRank.belt,
            stripes: targetLegacyRank.stripes,
          };

          transaction.set(historyRef, {
            memberId: selectedMember.id,
            fromBelt,
            fromStripes,
            toBelt: targetLegacyRank.belt,
            toStripes: targetLegacyRank.stripes,
            fromAgeBand,
            toAgeBand: selectedAgeBand,
            fromRankStepId: fromRankProfile?.rankStepId ?? null,
            toRankStepId: targetRankProfile.rankStepId,
            fromBeltName: fromRankProfile?.beltName ?? fromBelt,
            toBeltName: targetRankProfile.beltName,
            toDegreeLevel: targetRankProfile.degreeLevel,
            effectiveAt: now,
            note: changeNote.trim(),
            changedByUid: user?.uid ?? null,
            changedByEmail: user?.email ?? null,
            createdAt: now,
          });
        }

        transaction.update(memberRef, updates);
      });

      let updatedMember: Member = {
        ...selectedMember,
        status: selectedStatus,
        nickname: normalizedNickname || undefined,
      };

      if (rankChanged) {
        const targetStep = getRankStepById(selectedRankStepId) ?? getDefaultRankStep(selectedAgeBand);
        const targetRankProfile = toRankProfile(targetStep);
        const targetLegacyRank = toLegacyRank(targetRankProfile);
        updatedMember = {
          ...updatedMember,
          ageBand: selectedAgeBand,
          rankProfile: targetRankProfile,
          rank: {
            belt: targetLegacyRank.belt,
            stripes: targetLegacyRank.stripes,
          },
        };
      }

      setSelectedMember(updatedMember);
      setMembers((previous) => previous.map((entry) => (entry.id === updatedMember.id ? updatedMember : entry)));
      await loadMemberTimeline(updatedMember);
      if (rankChanged) {
        setSaveMessage('Member status, nickname, and rank changes saved.');
      } else if (statusChanged || nicknameChanged) {
        setSaveMessage('Member status and nickname updated.');
      } else {
        setSaveMessage('Member updated.');
      }
    } catch (saveError) {
      console.error(saveError);
      setError('Failed to save member changes.');
    } finally {
      setSavingRank(false);
    }
  }


  async function handleLinkStaffUser() {
    if (!selectedMember || !staffEmailToLink.trim() || linkingStaff) {
      return;
    }

    setLinkingStaff(true);
    setError(null);
    setSaveMessage(null);
    try {
      const callable = httpsCallable<{ email: string; memberId: string }, { ok: boolean }>(
        functions,
        'linkStaffUserToMember',
      );
      await callable({
        email: staffEmailToLink.trim().toLowerCase(),
        memberId: selectedMember.id,
      });

      await loadMemberTimeline(selectedMember);
      setSaveMessage('Staff user linked to member successfully.');
    } catch (linkError) {
      console.error(linkError);
      setError('Failed to link staff user. Confirm email exists in Firebase Auth.');
    } finally {
      setLinkingStaff(false);
    }
  }

  async function handleLinkWaiverToMember(waiverId: string) {
    if (!selectedMember || linkingWaiverId) {
      return;
    }

    setLinkingWaiverId(waiverId);
    setError(null);
    setSaveMessage(null);
    try {
      const callable = httpsCallable<{ memberId: string; waiverId: string }, { ok: boolean }>(
        functions,
        'linkWaiverToMember',
      );
      await callable({
        memberId: selectedMember.id,
        waiverId,
      });

      await loadMemberTimeline(selectedMember);
      setSaveMessage('Waiver linked to member and waiver status updated.');
    } catch (linkError) {
      console.error(linkError);
      setError('Failed to link waiver to member.');
    } finally {
      setLinkingWaiverId(null);
    }
  }

  const periodRows = useMemo<RankPeriodRow[]>(() => {
    if (!history.length) {
      return [];
    }

    return history.map((entry, index) => {
      const periodStart = entry.effectiveAt;
      const periodEnd = history[index + 1]?.effectiveAt ?? null;
      const count = attendanceLogs.filter((log) => {
        const inRank = log.belt === entry.toBelt && log.stripes === entry.toStripes;
        const onOrAfterStart = log.checkInTime.getTime() >= periodStart.getTime();
        const beforeEnd = !periodEnd || log.checkInTime.getTime() < periodEnd.getTime();
        return inRank && onOrAfterStart && beforeEnd;
      }).length;

      return {
        id: entry.id,
        rankLabel: `${entry.toBelt} ${entry.toStripes}`,
        periodLabel: formatPeriod(periodStart, periodEnd),
        sessionCount: count,
        note: entry.note ?? '',
      };
    });
  }, [attendanceLogs, history]);

  return (
    <main className="page page-admin">
      <h1>Members</h1>
      <p>Search a member, update age-band rank step, and review rank progression attendance.</p>

      <div className="actions">
        <Link to="/admin">Back</Link>
      </div>

      <form className="panel" onSubmit={handleSearch}>
        <label>
          Search by last name, first name, nickname, or phone
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="e.g. Anderson / Shane / Rocky / 0400123456"
            minLength={2}
            required
          />
        </label>
        <button className="button" type="submit" disabled={loadingMembers}>
          {loadingMembers ? 'Searching...' : 'Search Members'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {saveMessage ? <p>{saveMessage}</p> : null}

      {members.length > 0 ? (
        <div className="panel">
          <h2>Search Results</h2>
          <div className="actions">
            {members.map((member) => (
              <button key={member.id} className="button button-secondary" type="button" onClick={() => void loadMemberTimeline(member)}>
                {member.firstName} {member.lastName}{member.nickname ? ` (${member.nickname})` : ''} ({member.memberNumber})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedMember ? (
        <div className="panel">
          <h2>
            {selectedMember.firstName} {selectedMember.lastName}
          </h2>
          <p>
            Nickname: {selectedMember.nickname ? selectedMember.nickname : 'None set'}
          </p>
          <p>
            Current rank: {selectedMember.rankProfile?.beltName ?? selectedMember.rank?.belt ?? 'white'}
            {' '}({String(selectedMember.rankProfile?.degreeLevel ?? selectedMember.rank?.stripes ?? 0)})
            {' '}| Age band: {selectedMember.rankProfile?.ageBand ?? selectedMember.ageBand ?? 'adult_16_plus'}
          </p>
          {!canEditRank ? <p>Rank edits require admin or manager role.</p> : null}
          <div className="actions">
            <label>
              Nickname
              <input
                value={selectedNickname}
                onChange={(event) => setSelectedNickname(event.target.value)}
                disabled={!canEditRank || savingRank}
                placeholder="Optional"
              />
            </label>
            <label>
              Member status
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value as Member['status'])}
                disabled={!canEditRank || savingRank}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Age band
              <select
                value={selectedAgeBand}
                onChange={(event) => {
                  const nextAgeBand = event.target.value as AgeBand;
                  const nextDefault = getDefaultRankStep(nextAgeBand);
                  setSelectedAgeBand(nextAgeBand);
                  setSelectedRankStepId(nextDefault.id);
                }}
                disabled={!canEditRank || savingRank}
              >
                {AGE_BANDS.map((band) => (
                  <option key={band.value} value={band.value}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rank step
              <select
                value={selectedRankStepId}
                onChange={(event) => {
                  const nextStep = getRankStepById(event.target.value);
                  if (!nextStep) {
                    return;
                  }
                  setSelectedRankStepId(nextStep.id);
                }}
                disabled={!canEditRank || savingRank}
              >
                {rankOptions.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.rankOrder}. {step.beltName} ({String(step.degreeLevel)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Change note (optional)
            <textarea
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              rows={2}
              placeholder="Promotion note, grading event, etc."
              disabled={!canEditRank || savingRank}
            />
          </label>
          <div className="actions">
            <button className="button" type="button" onClick={() => void handleSaveRank()} disabled={!canEditRank || savingRank}>
              {savingRank ? 'Saving...' : 'Save Member Changes'}
            </button>
          </div>
        </div>
      ) : null}

      {selectedMember ? (
        <div className="panel table-panel">
          <h2>Waiver Status</h2>
          <p>
            Current member waiver: {selectedMember.waiverAcceptedAt ? formatDate(selectedMember.waiverAcceptedAt) : 'Not linked'}{' '}
            {selectedMember.waiverDisclaimerVersion ? `(v${selectedMember.waiverDisclaimerVersion})` : ''}
          </p>
          {waiverCandidates.length > 0 ? (
            <div className="table-wrap">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Signed</th>
                    <th>Version</th>
                    <th>Linked</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {waiverCandidates.map((waiver) => (
                    <tr key={waiver.id}>
                      <td>{waiver.firstName} {waiver.lastName}</td>
                      <td>{waiver.signedAt ? formatDate(waiver.signedAt) : 'Unknown'}</td>
                      <td>{waiver.version}</td>
                      <td>{waiver.memberId === selectedMember.id ? 'Yes' : waiver.memberId ? 'Other member' : 'No'}</td>
                      <td>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={linkingWaiverId !== null}
                          onClick={() => void handleLinkWaiverToMember(waiver.id)}
                        >
                          {linkingWaiverId === waiver.id ? 'Linking...' : 'Link'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No waiver candidates found by phone/email for this member yet.</p>
          )}
        </div>
      ) : null}

      {selectedMember ? (
        <div className="panel">
          <h2>Link Staff User</h2>
          <p>Use this when a coach is also a member profile.</p>
          <label>
            Staff email
            <input
              type="email"
              value={staffEmailToLink}
              onChange={(event) => setStaffEmailToLink(event.target.value)}
              placeholder="coach@example.com"
            />
          </label>
          <div className="actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleLinkStaffUser()}
              disabled={linkingStaff || !staffEmailToLink.trim()}
            >
              {linkingStaff ? 'Linking...' : 'Link Staff to This Member'}
            </button>
          </div>

          {linkedStaff.length > 0 ? (
            <div className="table-wrap">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Linked Staff Email</th>
                    <th>Role</th>
                    <th>UID</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedStaff.map((row) => (
                    <tr key={row.uid}>
                      <td>{row.email}</td>
                      <td>{row.role}</td>
                      <td>{row.uid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No staff users linked to this member yet.</p>
          )}
        </div>
      ) : null}

      {loadingTimeline ? <p>Loading timeline...</p> : null}

      {selectedMember && !loadingTimeline ? (
        <div className="panel table-panel">
          <h2>Rank Progression Timeline</h2>
          {periodRows.length === 0 ? (
            <p>No rank change history yet. Save a rank update to start tracking periods.</p>
          ) : (
            <div className="table-wrap">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Period</th>
                    <th>Sessions During Period</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.rankLabel}</td>
                      <td>{row.periodLabel}</td>
                      <td>{row.sessionCount}</td>
                      <td>{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
