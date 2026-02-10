import { Link } from 'react-router-dom';

export function KioskSuccessPage() {
  return (
    <main className="page">
      <h1>Check-in Success</h1>
      <p>Auto-reset after 2 seconds will be implemented in flow logic.</p>
      <Link className="button" to="/kiosk">Return Home</Link>
    </main>
  );
}
