import { Link } from 'react-router-dom';

export function KioskHomePage() {
  return (
    <main className="page">
      <h1>Kiosk Home</h1>
      <p>Choose check-in type.</p>
      <div className="actions">
        <Link className="button" to="/kiosk/member-lookup">Check-in as Member</Link>
        <Link className="button button-secondary" to="/kiosk/casual-waiver">First Time Visitor</Link>
      </div>
    </main>
  );
}
