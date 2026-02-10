import { Link } from 'react-router-dom';

export function KioskHomePage() {
  return (
    <main className="page page-kiosk">
      <h1>Ready to Train?</h1>
      <p>Welcome to Fight Club. Choose how you want to check in.</p>
      <div className="actions">
        <Link className="button" to="/kiosk/member-lookup">I&apos;m a Member</Link>
        <Link className="button button-secondary" to="/kiosk/casual-waiver">First Time Visitor</Link>
      </div>
    </main>
  );
}
