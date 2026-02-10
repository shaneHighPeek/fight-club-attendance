import { Link } from 'react-router-dom';

export function ConfirmCheckInPage() {
  return (
    <main className="page">
      <h1>Confirm Check-in</h1>
      <p>Member details and rank snapshot screen (scaffold).</p>
      <div className="actions">
        <Link className="button" to="/kiosk/success">Check In</Link>
        <Link to="/kiosk/member-select">Back</Link>
      </div>
    </main>
  );
}
