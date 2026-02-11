import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  endAt,
  where,
} from 'firebase/firestore';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { db } from '../../services/firebase';
import type { Member } from '../../types/member';

const MAX_RESULTS = 10;
const PHONE_SCAN_LIMIT = 250;

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function mapMember(docId: string, data: Record<string, unknown>): Member {
  const rank = data.rank as Member['rank'] | undefined;

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
    rank,
  };
}

export function MemberLookupPage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const searchHint = useMemo(
    () => (normalizePhone(term).length >= 3
      ? 'Searching phone, member number + last name...'
      : 'Searching member number + last name...'),
    [term],
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const memberCollection = collection(db, 'members');
      const input = term.trim();
      if (input.length < 3) {
        setError('Enter at least 3 characters.');
        setResults([]);
        return;
      }
      const inputLower = input.toLowerCase();

      const normalizedPhone = normalizePhone(input);
      const inputUpper = input.toUpperCase();
      const byId = new Map<string, Member>();

      const lastNameQuery = query(
        memberCollection,
        orderBy('lastNameLower'),
        startAt(inputLower),
        endAt(`${inputLower}\uf8ff`),
        limit(MAX_RESULTS),
      );

      const lastNameSnapshot = await getDocs(lastNameQuery);
      for (const docSnap of lastNameSnapshot.docs) {
        byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
      }

      if (normalizedPhone.length >= 3) {
        const exactPhoneQuery = query(memberCollection, where('phone', '==', normalizedPhone), limit(MAX_RESULTS));
        const exactPhoneSnapshot = await getDocs(exactPhoneQuery);
        for (const docSnap of exactPhoneSnapshot.docs) {
          byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
        }

        // Fallback for legacy formatted phone values (spaces, +, dashes) in Firestore.
        const phoneScanQuery = query(memberCollection, orderBy('lastNameLower'), limit(PHONE_SCAN_LIMIT));
        const phoneScanSnapshot = await getDocs(phoneScanQuery);
        for (const docSnap of phoneScanSnapshot.docs) {
          const member = mapMember(docSnap.id, docSnap.data());
          if (normalizePhone(member.phone).includes(normalizedPhone)) {
            byId.set(docSnap.id, member);
          }
        }
      }

      // Member number match (exact + partial fallback).
      const memberNumberExactQuery = query(memberCollection, where('memberNumber', '==', inputUpper), limit(MAX_RESULTS));
      const memberNumberExactSnapshot = await getDocs(memberNumberExactQuery);
      for (const docSnap of memberNumberExactSnapshot.docs) {
        byId.set(docSnap.id, mapMember(docSnap.id, docSnap.data()));
      }

      const memberNumberScanQuery = query(memberCollection, orderBy('lastNameLower'), limit(PHONE_SCAN_LIMIT));
      const memberNumberScanSnapshot = await getDocs(memberNumberScanQuery);
      for (const docSnap of memberNumberScanSnapshot.docs) {
        const member = mapMember(docSnap.id, docSnap.data());
        if (member.memberNumber.toUpperCase().includes(inputUpper)) {
          byId.set(docSnap.id, member);
        }
      }

      const merged = Array.from(byId.values());
      setResults(merged);

      if (merged.length === 1) {
        navigate('/kiosk/confirm-checkin', { state: { member: merged[0] } });
      }
    } catch (err) {
      console.error(err);
      setError('Search failed. Check Firestore permissions and indexes.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page page-kiosk">
      <h1>Member Lookup</h1>
      <p>Type your family name, phone number, or member number to find your profile.</p>
      <form className="panel" onSubmit={handleSearch}>
        <label>
          Last name, phone, or member number
          <input value={term} onChange={(event) => setTerm(event.target.value)} minLength={3} required />
        </label>
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        <p>{searchHint}</p>
        {error ? <p className="error">{error}</p> : null}
      </form>

      {results.length > 1 ? (
        <div className="panel">
          <h2>Matches</h2>
          <p>{results.length} matches found.</p>
          <button
            className="button"
            onClick={() => navigate('/kiosk/member-select', { state: { results } })}
            type="button"
          >
            Select Member
          </button>
        </div>
      ) : null}

      {results.length === 0 && !loading ? <p>No member selected yet.</p> : null}

      <Link to="/kiosk">Back</Link>
    </main>
  );
}
