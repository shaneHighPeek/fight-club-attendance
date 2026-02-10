import { Link } from 'react-router-dom';

export function SettingsPage() {
  return (
    <main className="page">
      <h1>Settings</h1>
      <p>PIN policy, role config, and kiosk lock configuration scaffold.</p>
      <Link to="/admin">Back</Link>
    </main>
  );
}
