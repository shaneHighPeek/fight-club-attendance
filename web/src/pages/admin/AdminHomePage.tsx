import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { auth } from '../../services/firebase';

export function AdminHomePage() {
  const { role, user } = useAuth();

  return (
    <main className="page">
      <h1>Admin Dashboard</h1>
      <p>Signed in as {user?.email ?? 'unknown'} ({role ?? 'no role'})</p>
      <div className="actions">
        <Link className="button" to="/admin/attendance">Attendance</Link>
        <Link className="button" to="/admin/members">Members</Link>
        <Link className="button" to="/admin/settings">Settings</Link>
        <button className="button button-secondary" onClick={() => signOut(auth)}>Sign Out</button>
      </div>
    </main>
  );
}
