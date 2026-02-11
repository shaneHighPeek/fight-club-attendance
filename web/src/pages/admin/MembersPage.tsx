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
import type { Belt, Member } from '../../types/member';

const MAX_RESULTS = 15;
const BELTS: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];
const STRIPES: Array<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];

interface MemberRankHistory {
  id: string;
  fromBelt: Belt;
  fromStripes: 0 | 1 | 2 | 3 | 4;
  toBelt: Belt;
  toStripes: 0 | 1 | 2 | 3 | 4;
  effectiveAt: Date;
  note?: string;
}

interface AttendanceLogSnapshot {
  checkInTime: Date;
  belt: Belt;
  stripes: 0 | 1 | 2 | 3 | 4;
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
    phone: typeof data.phone === 'string' ? data.phone : '',
    email: typeof data.email === 'string' ? data.email : undefined,
    status:
      data.status === 'active' || data.status === 'inactive' || data.status === 'suspended'
        ? data.status
        : 'active',
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
  return value === 'white' || value === 'blue' || value === 'purple' || value === 'brown' || value === 'black';
}

function isStripes(value: unknown): value is 0 | 1 | 2 | 3 | 4 {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
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
  const [newBelt, setNewBelt] = useState<Belt>('white');
  const [newStripes, setNewStripes] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [changeNote, setChangeNote] = useState('');
  const [staffEmailToLink, setStaffEmailToLink] = useState('');
  const [linkingStaff, setLinkingStaff] = useState(false);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [waiverCandidates, setWaiverCandidates] = useState<WaiverCandidate[]>([]);
  const [linkingWaiverId, setLinkingWaiverId] = useState<string | null>(null);

  const canEditRank = role === 'admin' || role === 'manager';

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

      const normalizedPhone = normalizePhone(input);
      if (normalizedPhone.length >= 3) {
        const phoneQuery = query(membersCollection, where('phone', '==', normalizedPhone), limit(MAX_RESULTS));
        const phoneSnapshot = await getDocs(phoneQuery);
        for (const docSnap of phoneSnapshot.docs) {
          byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
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
      const currentBelt = effectiveMember.rank?.belt ?? 'white';
      const currentStripes = effectiveMember.rank?.stripes ?? 0;
      setNewBelt(currentBelt);
      setNewStripes(currentStripes);
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
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function handleSaveRank() {
    if (!selectedMember || savingRank || !canEditRank) {
      return;
    }

    const currentBelt = selectedMember.rank?.belt ?? 'white';
    const currentStripes = selectedMember.rank?.stripes ?? 0;
    if (currentBelt === newBelt && currentStripes === newStripes) {
      setSaveMessage('No rank change to save.');
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
        const rank = memberData.rank as Record<string, unknown> | undefined;
        const fromBelt = isBelt(rank?.belt) ? rank.belt : 'white';
        const fromStripes = isStripes(rank?.stripes) ? rank.stripes : 0;
        const now = Timestamp.now();
        const historyRef = doc(collection(db, 'memberRankHistory'));

        transaction.update(memberRef, {
          rank: {
            belt: newBelt,
            stripes: newStripes,
          },
          updatedAt: now,
        });

        transaction.set(historyRef, {
          memberId: selectedMember.id,
          fromBelt,
          fromStripes,
          toBelt: newBelt,
          toStripes: newStripes,
          effectiveAt: now,
          note: changeNote.trim(),
          changedByUid: user?.uid ?? null,
          changedByEmail: user?.email ?? null,
          createdAt: now,
        });
      });

      const updatedMember: Member = {
        ...selectedMember,
        rank: {
          belt: newBelt,
          stripes: newStripes,
        },
      };
      setSelectedMember(updatedMember);
      setMembers((previous) => previous.map((entry) => (entry.id === updatedMember.id ? updatedMember : entry)));
      await loadMemberTimeline(updatedMember);
      setSaveMessage('Rank updated and history recorded.');
    } catch (saveError) {
      console.error(saveError);
      setError('Failed to save rank change.');
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
      <p>Search a member, update belt/stripes, and review rank progression attendance.</p>

      <div className="actions">
        <Link to="/admin">Back</Link>
      </div>

      <form className="panel" onSubmit={handleSearch}>
        <label>
          Search by last name or phone
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="e.g. Anderson or 0400123456"
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
                {member.firstName} {member.lastName} ({member.memberNumber})
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
            Current rank: {selectedMember.rank?.belt ?? 'white'} {selectedMember.rank?.stripes ?? 0} stripes
          </p>
          {!canEditRank ? <p>Rank edits require admin or manager role.</p> : null}
          <div className="actions">
            <label>
              Belt
              <select value={newBelt} onChange={(event) => setNewBelt(event.target.value as Belt)} disabled={!canEditRank || savingRank}>
                {BELTS.map((belt) => (
                  <option key={belt} value={belt}>
                    {belt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stripes
              <select
                value={newStripes}
                onChange={(event) => setNewStripes(Number(event.target.value) as 0 | 1 | 2 | 3 | 4)}
                disabled={!canEditRank || savingRank}
              >
                {STRIPES.map((stripes) => (
                  <option key={stripes} value={stripes}>
                    {stripes}
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
              {savingRank ? 'Saving...' : 'Save Rank Change'}
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
