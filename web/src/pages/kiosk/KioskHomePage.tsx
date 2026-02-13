import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import { isKioskLocked } from '../../utils/kioskLock';

export function KioskHomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isKioskLocked()) {
      navigate('/kiosk/locked', { replace: true });
    }
  }, [navigate]);

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
