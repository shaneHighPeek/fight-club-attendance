import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function KioskSuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      navigate('/kiosk', { replace: true });
    }, 2000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [navigate]);

  return (
    <main className="page page-kiosk">
      <h1>You&apos;re Checked In</h1>
      <p>Awesome work. Have a great class. Returning to home in 2 seconds...</p>
      <Link className="button" to="/kiosk">Return Home</Link>
    </main>
  );
}
