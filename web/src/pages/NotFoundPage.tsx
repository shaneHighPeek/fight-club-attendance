import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>Page Not Found</h1>
      <p>This route does not exist yet.</p>
      <Link to="/kiosk">Go to Kiosk</Link>
    </main>
  );
}
