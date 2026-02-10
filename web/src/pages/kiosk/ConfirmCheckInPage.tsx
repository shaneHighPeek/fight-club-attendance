import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { Member } from '../../types/member';

interface ConfirmState {
  member?: Member;
}

export function ConfirmCheckInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmState | null;
  const member = state?.member;

  if (!member) {
    return (
      <main className="page">
        <h1>Confirm Check-in</h1>
        <p>No member selected yet.</p>
        <Link to="/kiosk/member-lookup">Back to Lookup</Link>
      </main>
    );
  }

  return (
    <main className="page">
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
        <button className="button" onClick={() => navigate('/kiosk/success')} type="button">
          Check In
        </button>
        <Link to="/kiosk/member-lookup">Back</Link>
      </div>
    </main>
  );
}
