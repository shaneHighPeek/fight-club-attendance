import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { Member } from '../../types/member';

interface MemberSelectState {
  results?: Member[];
}

export function MemberSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as MemberSelectState | null;
  const results = state?.results ?? [];

  if (!results.length) {
    return (
      <main className="page page-kiosk">
        <h1>Select Member</h1>
        <p>No matches loaded. Start from member lookup.</p>
        <Link to="/kiosk/member-lookup">Back to Lookup</Link>
      </main>
    );
  }

  return (
    <main className="page page-kiosk">
      <h1>Select Member</h1>
      <p>Choose the correct student.</p>
      <div className="panel">
        {results.map((member) => (
          <button
            key={member.id}
            className="button"
            onClick={() => navigate('/kiosk/confirm-checkin', { state: { member } })}
            type="button"
          >
            {member.firstName} {member.lastName}{member.nickname ? ` (${member.nickname})` : ''} - {member.memberNumber}
          </button>
        ))}
      </div>
      <Link to="/kiosk/member-lookup">Back</Link>
    </main>
  );
}
