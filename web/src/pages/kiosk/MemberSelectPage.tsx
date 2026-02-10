import { Link } from 'react-router-dom';

export function MemberSelectPage() {
  return (
    <main className="page">
      <h1>Select Member</h1>
      <p>Shared phone scenario screen (scaffold).</p>
      <div className="actions">
        <Link className="button" to="/kiosk/confirm-checkin">Continue</Link>
        <Link to="/kiosk/member-lookup">Back</Link>
      </div>
    </main>
  );
}
