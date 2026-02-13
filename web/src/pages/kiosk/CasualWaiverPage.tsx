import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { MEDIA_OPTOUT_EMAIL, WAIVER_DISCLAIMER_URL, WAIVER_TEXT, WAIVER_VALIDITY_DAYS, WAIVER_VERSION } from '../../config/waiver';
import { db } from '../../services/firebase';
import type { Member } from '../../types/member';

interface WaiverState {
  member?: Member;
  mode?: 'casual' | 'member-waiver';
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export function CasualWaiverPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as WaiverState | null;
  const member = state?.member;
  const mode = state?.mode === 'member-waiver' && member ? 'member-waiver' : 'casual';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [participantType, setParticipantType] = useState<'adult' | 'child'>('adult');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function hydrateMemberDefaults() {
      if (!member) {
        return;
      }

      setFirstName(member.firstName);
      setLastName(member.lastName);
      setPhone(member.phone);
      if (member.email) {
        setEmail(member.email);
      }

      // Source-of-truth refresh: ensures renewal form always uses latest member email.
      try {
        const snapshot = await getDoc(doc(db, 'members', member.id));
        if (!snapshot.exists()) {
          return;
        }
        const data = snapshot.data() as Record<string, unknown>;
        const freshFirstName = typeof data.firstName === 'string' ? data.firstName : member.firstName;
        const freshLastName = typeof data.lastName === 'string' ? data.lastName : member.lastName;
        const freshPhone = typeof data.phone === 'string' ? data.phone : member.phone;
        const freshEmail =
          typeof data.email === 'string'
            ? data.email
            : (typeof data.emailAddress === 'string' ? data.emailAddress : member.email);

        setFirstName(freshFirstName);
        setLastName(freshLastName);
        setPhone(freshPhone);
        if (freshEmail) {
          setEmail(freshEmail);
        }
      } catch (loadError) {
        console.error(loadError);
      }
    }

    void hydrateMemberDefaults();
  }, [member]);

  function getCanvasPosition(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    isDrawingRef.current = true;
    const { x, y } = getCanvasPosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { x, y } = getCanvasPosition(event);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    isDrawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas || saving) {
      return;
    }

    setError(null);
    if (!agreeDisclaimer) {
      setError('You must accept the disclaimer before submitting.');
      return;
    }
    if (participantType === 'child' && (!guardianName.trim() || !guardianPhone.trim() || !guardianEmail.trim())) {
      setError('Guardian name, email, and phone are required for child participants.');
      return;
    }
    const signature = canvas.toDataURL('image/png');
    if (!signature || signature.length < 1000) {
      setError(participantType === 'child'
        ? 'Please provide guardian finger signature before submitting.'
        : 'Please provide a finger signature before submitting.');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const expiresAt = Timestamp.fromDate(new Date(now + WAIVER_VALIDITY_DAYS * 24 * 60 * 60 * 1000));
      const normalizedPhone = normalizePhone(phone);
      const normalizedEmail = email.trim().toLowerCase();
      let memberIdForWaiver: string | null = mode === 'member-waiver' ? member?.id ?? null : null;

      if (mode === 'casual') {
        const membersRef = collection(db, 'members');
        const existingByPhone = normalizedPhone
          ? await getDocs(query(membersRef, where('phone', '==', normalizedPhone), limit(1)))
          : null;
        const existingByEmail = normalizedEmail
          ? await getDocs(query(membersRef, where('email', '==', normalizedEmail), limit(1)))
          : null;

        const existingMember = existingByPhone?.docs[0] ?? existingByEmail?.docs[0] ?? null;
        if (existingMember) {
          memberIdForWaiver = existingMember.id;
          await updateDoc(doc(db, 'members', existingMember.id), {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            lastNameLower: lastName.trim().toLowerCase(),
            email: normalizedEmail,
            phone: normalizedPhone,
            membershipType: 'temp',
            updatedAt: serverTimestamp(),
          });
        } else {
          const memberNumber = `TMP-${String(now).slice(-8)}`;
          const memberRef = await addDoc(membersRef, {
            memberNumber,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            lastNameLower: lastName.trim().toLowerCase(),
            phone: normalizedPhone,
            email: normalizedEmail,
            status: 'active',
            membershipType: 'temp',
            rank: {
              belt: 'white',
              stripes: 1,
            },
            totalCheckIns: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await updateDoc(memberRef, {
            memberId: memberRef.id,
            updatedAt: serverTimestamp(),
          });
          memberIdForWaiver = memberRef.id;
        }
      }

      const waiverRef = await addDoc(collection(db, 'waivers'), {
        memberId: memberIdForWaiver,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        birthDate: birthDate.trim(),
        participantType,
        guardian: participantType === 'child'
          ? {
              name: guardianName.trim(),
              email: guardianEmail.trim().toLowerCase(),
              phone: guardianPhone.trim(),
            }
          : null,
        emergencyContact: {
          name: emergencyName.trim(),
          phone: emergencyPhone.trim(),
          relationship: emergencyRelationship.trim(),
        },
        signature,
        version: WAIVER_VERSION,
        mediaConsent: true,
        mediaOptOutByEmail: MEDIA_OPTOUT_EMAIL,
        signedAt: serverTimestamp(),
        expiresAt,
        isActive: true,
      });

      if (mode === 'casual' && memberIdForWaiver) {
        await updateDoc(doc(db, 'members', memberIdForWaiver), {
          waiverAcceptedAt: serverTimestamp(),
          waiverDisclaimerVersion: WAIVER_VERSION,
          lastCheckIn: serverTimestamp(),
          totalCheckIns: increment(1),
          updatedAt: serverTimestamp(),
        });
      }

      if (mode === 'member-waiver' && member) {
        await updateDoc(doc(db, 'members', member.id), {
          waiverAcceptedAt: serverTimestamp(),
          waiverDisclaimerVersion: WAIVER_VERSION,
          updatedAt: serverTimestamp(),
        });

        navigate('/kiosk/confirm-checkin', { state: { member } });
        return;
      }

      await addDoc(collection(db, 'attendanceLogs'), {
        memberId: memberIdForWaiver ?? `casual:${waiverRef.id}`,
        type: 'casual',
        status: 'completed',
        locationId: 'ashmore',
        checkInTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        casualProfile: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          participantType,
        },
      });

      navigate('/kiosk/success');
    } catch (submitError) {
      console.error(submitError);
      setError('Unable to submit waiver right now. Please ask staff for help.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page-kiosk">
      <h1>{mode === 'member-waiver' ? 'Member Waiver Renewal' : 'Casual Visitor Waiver'}</h1>
      <p>
        {mode === 'member-waiver'
          ? 'Please review and sign the waiver before check-in.'
          : 'Complete all required details and sign below.'}
      </p>
      <div className="panel">
        <div className="waiver-copy">
          <p>
            <strong>Waiver & Participation Terms</strong>
          </p>
          <p>{WAIVER_TEXT}</p>
          <p>
            Media consent is included by default. If you do not consent to media use, email{' '}
            <a href={`mailto:${MEDIA_OPTOUT_EMAIL}`}>{MEDIA_OPTOUT_EMAIL}</a>.
          </p>
          {WAIVER_DISCLAIMER_URL ? (
            <p>
              Full disclaimer URL:{' '}
              <a href={WAIVER_DISCLAIMER_URL} target="_blank" rel="noreferrer">
                {WAIVER_DISCLAIMER_URL}
              </a>
            </p>
          ) : null}
        </div>

        <label>
          First name
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
        {mode === 'casual' ? (
          <label>
            Date of birth
            <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required />
          </label>
        ) : null}
        <label>
          Participant type
          <select
            value={participantType}
            onChange={(event) => setParticipantType(event.target.value as 'adult' | 'child')}
          >
            <option value="adult">Adult (self-sign)</option>
            <option value="child">Child (guardian sign)</option>
          </select>
        </label>
        {participantType === 'child' ? (
          <>
            <label>
              Guardian full name
              <input value={guardianName} onChange={(event) => setGuardianName(event.target.value)} required />
            </label>
            <label>
              Guardian email
              <input type="email" value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} required />
            </label>
            <label>
              Guardian phone
              <input value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} required />
            </label>
          </>
        ) : null}
        {mode === 'casual' ? (
          <>
            <label>
              Emergency contact name
              <input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} required />
            </label>
            <label>
              Emergency contact phone
              <input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} required />
            </label>
            <label>
              Emergency contact relationship
              <input value={emergencyRelationship} onChange={(event) => setEmergencyRelationship(event.target.value)} required />
            </label>
          </>
        ) : null}

        <p>{participantType === 'child' ? 'Guardian signature (finger sign):' : 'Signature (finger sign):'}</p>
        <canvas
          ref={canvasRef}
          width={560}
          height={180}
          className="signature-pad"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <div className="actions">
          <button className="button button-secondary" type="button" onClick={clearSignature}>
            Clear Signature
          </button>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={agreeDisclaimer}
            onChange={(event) => setAgreeDisclaimer(event.target.checked)}
          />
          {participantType === 'child'
            ? 'I am the legal guardian and I accept this waiver for the child participant.'
            : 'I agree to the waiver and safety disclaimer.'}
        </label>
      </div>
      <div className="actions">
        <button className="button" type="button" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Submitting...' : mode === 'member-waiver' ? 'Submit Waiver Renewal' : 'Submit Waiver'}
        </button>
        <Link to="/kiosk">Back</Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
