import { Link } from 'react-router-dom';

export function KioskLockedPage() {
  return (
    <main className="page">
      <h1>Kiosk Locked</h1>
      <p>Unlocked by staff PIN flow will be implemented next.</p>
      <Link to="/kiosk">Back to Kiosk</Link>
    </main>
  );
}
