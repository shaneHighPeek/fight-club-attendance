import { Link } from 'react-router-dom';

export function MemberLookupPage() {
  return (
    <main className="page">
      <h1>Member Lookup</h1>
      <p>Search by phone or last name (scaffold).</p>
      <div className="actions">
        <Link className="button" to="/kiosk/member-select">Mock Match Results</Link>
        <Link to="/kiosk">Back</Link>
      </div>
    </main>
  );
}
